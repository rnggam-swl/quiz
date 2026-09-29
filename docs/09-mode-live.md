# 09 · Mode Live (klasik)

Host (guru) memandu soal satu per satu dari layar proyektor. Peserta menjawab di HP. Poin diberikan berdasarkan ketepatan dan kecepatan, lalu leaderboard ditampilkan di antara soal. Mode ini membangun infrastruktur realtime yang nanti dipakai mode Battle.

## Default policy

```ts
{
  feedback: 'instant',
  showCorrectAnswer: true,
  gamification: true,
  scoring: 'speed',
  timer: { perQuestionS: 20 },
  shuffleQuestions: false,
  shuffleOptions: false,        // semua peserta melihat urutan yang sama dengan proyektor
  autoAdvance: false,
  lateJoin: 'allow',            // atau 'spectator' (hanya menonton) / 'deny'
}
```

Semua bisa diubah di dialog **Mulai live**. Kalau acak dinyalakan, seed-nya satu untuk seluruh sesi, jadi proyektor dan HP tetap sama urutannya.

## Dua layar

| Layar                | Route               | Isi                                                                                                                                    |
| -------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Host / proyektor** | `/host/{sessionId}` | Soal besar, opsi dengan warna dan bentuk, timer lingkaran, jumlah yang sudah menjawab, distribusi jawaban, leaderboard, kontrol host   |
| **Peserta (HP)**     | `/play/{code}`      | Mode controller: tombol besar berwarna dan berbentuk. Teks soal bisa ditampilkan atau disembunyikan ("Tampilkan soal", default tampil) |

Sesi dibuat dari `/quizzes/{id}/live` (tombol **Live** di editor atau menu kartu quiz). Soal yang tidak bisa dimainkan live (Esai, Cerita Bercabang) dilewati dan disebutkan di dialog.

## State machine sesi

```
lobby ──start──▶ countdown (3 dtk) ──▶ open ──timer habis / semua menjawab / host──▶
      reveal (jawaban benar + distribusi) ──▶ leaderboard ──next──▶ countdown … ──▶ podium ──▶ ended
```

- Perpindahan tahap memanggil RPC `advance_live(session, version, action)`. RPC memvalidasi transisi, menyimpan `phase` dan `phase_closes_at`, lalu Server Action mem-broadcast versi state yang baru.
- `version` harus sama dengan `state_version` saat ini. Klik ganda atau dua tab host tidak bisa melompati tahap.
- Countdown dan soal selalu berakhir sendiri. Reveal dan papan skor berlanjut sendiri (5 detik) hanya jika **Lanjut otomatis** menyala.
- Timer habis: layar host memanggil `advance_live(…, 'auto')`. Server memeriksa `now() ≥ phase_closes_at`. Jika layar host tertutup, sesi berhenti di tahap itu sampai host kembali.
- **Semua menjawab** (P5-08): layar host menutup soal lebih awal begitu `answered ≥ players`.
- **Jeda**: timer tahap berhenti; waktu jeda tidak mengurangi poin kecepatan (`opened_at` digeser saat dilanjutkan). Jawaban saat jeda dihitung dengan waktu saat jeda dimulai.
- **Akhiri**: dari tengah permainan langsung ke podium (skor saat ini); dari lobby atau podium menutup sesi. Sesi `ended` menutup semua attempt.

## Lobby

- Kode 6 digit besar + QR ke `/join?code=…`.
- Daftar peserta diambil dari server; Presence menandai siapa yang sedang online dan memicu refresh daftar saat ada yang masuk.
- Host bisa mengeluarkan peserta (klik namanya) dan mengunci lobby. Peserta yang dikeluarkan tidak bisa menjawab dan hilang dari hitungan serta papan skor.
- Nickname disaring dari kata terlarang, maks. 24 karakter, dan dibuat unik ("Budi 2").
- Musik latar sintetis (Web Audio), mulai setelah host menyalakannya dan mengikuti setelan bisu.

## Poin kecepatan

```
poin = round(question.points × ratio × (1 − (waktu_jawab / batas_waktu) / 2))
```

- Menjawab benar seketika = 100% poin, menjawab benar di detik terakhir = 50%. Mirip formula Kahoot.
- `waktu_jawab = now() − battle_rounds.opened_at`, keduanya jam database (`record_live_answer`). Batas waktu: batas soal sendiri, lalu timer sesi, lalu 20 detik.
- Bonus streak: jawaban benar penuh ke-2 berturut-turut +100, ke-3 +200, dan seterusnya, maksimal +500. Jawaban kurang tepat atau tidak menjawab memutus streak. Soal tanpa nilai tidak mengubah streak.
- Satu jawaban per soal (tidak bisa diganti).
- Selama soal terbuka, HP hanya tahu "jawaban terkirim": skor, peringkat, dan streak baru baru terlihat saat reveal, supaya peserta tidak tahu benar/salah lebih dulu.

## Realtime (`session:{id}`)

Satu channel Supabase Realtime per sesi, publik (peserta tidak punya akun Supabase). Siapa pun bisa mengirim pesan ke channel publik, jadi **tidak ada isi event yang dipercaya tanpa tanda tangan server**:

| Event   | Payload                  | Arti                                                                                                  |
| ------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `state` | `{ version, data, sig }` | State sesi berubah. `data` = state bersama (JSON), `sig` = tanda tangan server atas `data` persis itu |

- **State bersama** (tahap, timer, soal versi aman, kunci jawaban saat reveal, jumlah peserta/menjawab, 5 besar) sama untuk semua HP. Server Action host menandatanganinya dengan ECDSA P-256 lalu mem-broadcast-nya (`src/engine/live/signed.ts`, `src/engine/transport/signing.ts`).
- HP memverifikasi tanda tangan dengan kunci publik (diberikan oleh halaman `/play/{code}`), memastikan `sessionId` dan `version` cocok, lalu langsung memakai state itu **tanpa mengambil ulang ke server**. Event yang tidak lolos verifikasi (atau tanpa `data`) dianggap petunjuk: HP mengambil state lewat Server Action. Event palsu paling banyak menyebabkan satu fetch tambahan.
- **Data pribadi** (poin, skor, peringkat, streak) hanya berubah saat reveal dan di akhir. Saat itu HP mengambil `live_state` miliknya sendiri, dengan jeda acak 0–1 detik agar 200 HP tidak meminta bersamaan. Benar/salah sudah tampil lebih dulu: HP menilai jawabannya sendiri dengan kunci yang ikut di reveal; poinnya menyusul dari server.
- Kunci tanda tangan diturunkan dari `PARTICIPANT_TOKEN_SECRET` (HKDF dengan label sendiri), jadi semua instance server punya kunci yang sama tanpa secret tambahan (`src/engine/transport/keys.ts`).
- Host tetap mengambil state-nya sendiri (lewat RLS), plus polling 1 detik selama soal terbuka untuk jumlah yang menjawab. Distribusi jawaban hanya untuk host.
- Presence: `{ key, nickname, role }`. Hanya dipakai untuk tanda online; daftar peserta tetap dari server.
- Broadcast dikirim dari Server Action lewat REST (`/realtime/v1/api/broadcast`) setelah transaksi berhasil, sebelum host mengambil data tambahannya (`src/engine/transport/broadcast.ts`).

## Reconnect

- Token peserta ada di `localStorage`; reload membawa peserta ke tahap yang benar.
- Klien mengambil ulang state saat: terhubung kembali, tab aktif lagi, 2,5–4,5 detik setelah timer tahap habis (jaga-jaga event hilang; acak agar tidak serentak), dan polling (3 detik saat terputus, 20 detik saat tersambung).
- Peserta yang terputus saat soal terbuka masih bisa menjawab jika `now() < closes_at + 1 detik`.

## Sinkronisasi jam

- `GET /api/time` mengembalikan jam server. Klien melakukan 5 ping, menghitung `serverNow − (kirim + terima) / 2`, lalu mengambil median dari ping tercepat (`src/engine/transport/clock.ts`).
- Timer di layar dihitung dari `phase_closes_at` (jam DB) dikurangi jam klien yang sudah dikoreksi.

## Laporan

`/quizzes/{id}/live/{sessionId}`: klasemen akhir (skor, benar, ketepatan, rata-rata waktu), replay papan skor per soal, analisis butir soal (sama dengan ujian), dan ekspor CSV (`?kind=standings` / `?kind=items`).

## Implementasi

| Bagian        | Lokasi                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------- |
| Migrasi & RPC | `supabase/migrations/20260928000000_live.sql`, test `supabase/tests/live.test.ts`           |
| Transport     | `src/engine/transport/` (antarmuka `SessionChannel`, Supabase, in-memory, broadcast, clock) |
| Engine        | `src/engine/live/` (poin, tampilan per layar, form, laporan, engine lokal untuk playground) |
| Server Action | `src/app/play/live-actions.ts` (peserta), `src/app/host/actions.ts` (host)                  |
| Layar         | `src/components/live/` (`HostScreen`, `HostStages`, `LivePlayer`)                           |
| Playground    | `/playground/live`: proyektor + dua HP + bot, bisa memutus realtime untuk menguji reconnect |

## Batas skala MVP

- Target 200 peserta per sesi.
- Satu broadcast bertanda tangan per perubahan tahap; peserta hanya melakukan RPC `live_state` sendiri saat reveal dan di akhir (tersebar 1 detik).
- Leaderboard hanya mengirim 5 besar, sedangkan peringkat pribadi dihitung per peserta.

## Uji beban

Skrip `scripts/load-live.mjs` mensimulasikan peserta pada sesi live yang masih di lobby: join, mendengarkan channel, memverifikasi state bertanda tangan, menjawab setiap soal, dan mengambil data pribadi saat reveal/akhir, lewat RPC yang sama dengan Server Action. Host dijalankan dengan akun host sungguhan; skrip menandatangani broadcast dengan kunci yang sama dengan server (butuh `PARTICIPANT_TOKEN_SECRET` di `.env.local`).

```bash
LOAD_HOST_EMAIL=… LOAD_HOST_PASSWORD=… pnpm load:live --session <id> --players 200 --rounds 5
```

Yang diukur: aksi host → event diterima HP, aksi host → state baru tampil di HP (target p95 < 1 detik), aksi host → poin pribadi setelah reveal, dan latensi jawaban. Pengukuran pertama (di bawah) memakai protokol lama: setiap event membuat semua HP mengambil state.

| Tanggal    | Lingkungan                                                                                  | Peserta | Aksi host → event (p50 / p95) | Aksi host → state (p50 / p95) | Poin pribadi setelah reveal (p50 / p95) | Jawaban (p50 / p95) |
| ---------- | ------------------------------------------------------------------------------------------- | ------- | ----------------------------- | ----------------------------- | --------------------------------------- | ------------------- |
| 2026-09-28 | Supabase cloud (ap-northeast-2, Seoul); generator: satu proses Node di PC lokal (Indonesia) | 200     | 499 ms / 1245 ms              | 1516 ms / 2785 ms             | – (protokol lama)                       | 164 ms / 255 ms     |
| 2026-09-28 | Sama, protokol baru (state bersama bertanda tangan)                                         | 200     | 665 ms / 952 ms               | 671 ms / 1070 ms              | 1455 ms / 2368 ms                       | 164 ms / 280 ms     |

Catatan (5 soal, 21 perpindahan tahap, 4.200 sampel per metrik):

- **Protokol lama:** setelah setiap event, 200 HP mengambil state bersamaan (`live_state`) dan antre di pool koneksi database, sehingga state baru tampil p95 2,8 detik.
- **Protokol baru:** state bersama ikut dalam broadcast bertanda tangan, jadi HP tidak perlu mengambilnya. State baru tampil p95 **1,07 detik** (p50 0,67 detik); verifikasi tanda tangan hanya menambah ~6 ms dibanding saat event diterima.
- Target p95 < 1 detik hampir tercapai di pengukuran ini, dan angkanya masih pesimistis: "aksi host" di skrip berjalan dari PC di Indonesia dan memanggil dua RPC ke Seoul (`advance_live` + `live_state`) sebelum broadcast, sedangkan di produksi Server Action berjalan di Vercel region Seoul (`icn1`) sehingga dua RPC itu hanya beberapa milidetik. Selain itu 200 socket berbagi satu proses Node, sehingga pesan yang diproses belakangan ikut tercatat lebih lambat.
- Skrip sekarang juga mencatat **broadcast → event di HP** (waktu Realtime saja, tanpa RPC dari PC) supaya pengukuran berikutnya bisa memisahkan keduanya.
- Poin pribadi setelah reveal sengaja menyusul (jeda acak 0–1 detik + satu fetch); tulisan benar/salah sudah tampil bersama state.

Jangan menjalankan skrip ini pada sesi yang sedang dipakai kelas: skrip menambahkan peserta palsu.

## Evaluasi server game khusus (P8-14)

**Keputusan (2026-09-29): tetap di Supabase Realtime.** Uji beban di atas tidak menunjukkan batas Realtime di bawah kebutuhan. Dengan 200 peserta, state bersama tampil p95 1,07 detik, dan angka itu masih termasuk dua RPC dari PC generator di Indonesia ke Seoul. Jawaban tetap cepat (p95 280 ms) karena tidak melewati Realtime sama sekali.

Evaluasi diulang jika salah satu hal ini terjadi:

| Pemicu                                                                                              | Cara mengukur                                                          |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| p95 **broadcast → event di HP** > 1 detik pada 200 peserta, diukur dari region yang sama dengan app | `pnpm load:live` (kolom baru di skrip), generator di cloud Seoul       |
| Kebutuhan > 500 peserta per sesi, atau total koneksi serentak mendekati kuota paket Supabase        | Dashboard Supabase → Realtime (peak connections)                       |
| Biaya pesan Realtime tidak wajar                                                                    | Setiap broadcast dihitung per penerima; presence di lobby tumbuh O(n²) |

**Langkah murah sebelum ganti server:** saat ini semua HP ikut menerima diff presence semua peserta lain. Pada lobby 200 orang, itu sekitar 40 ribu pesan hanya untuk tanda online. HP tidak butuh data ini (hanya host yang menampilkan tanda online), jadi presence bisa dipindah ke channel terpisah atau diganti heartbeat `last_seen_at`.

Pilihan jika pemicu tercapai:

| Pilihan                                   | Cocok karena                                                                                                                    | Kekurangan                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Cloudflare Durable Objects / PartyKit** | Satu objek per sesi berfungsi sebagai relay WebSocket di edge, dengan hibernasi (murah saat diam) dan tanpa server yang dirawat | Vendor tambahan dan deploy terpisah dari Vercel                                  |
| Colyseus (self-hosted)                    | Room per sesi, kontrol penuh                                                                                                    | Harus merawat server Node, sticky session, dan scaling sendiri                   |
| Ably / Pusher                             | Pub/sub terkelola dengan kuota besar                                                                                            | Modelnya sama dengan Supabase Realtime; hanya memindahkan batas, biaya per pesan |

Rekomendasi: **Durable Objects/PartyKit sebagai relay saja.** Database tetap menjadi sumber kebenaran (RPC, `state_version`, pemenang rebutan), dan state tetap ditandatangani server, sehingga relay tidak perlu dipercaya. Yang berubah hanya `src/engine/transport/`: `broadcast.ts` mengirim ke relay, dan `ChannelFactory` baru (misalnya `partykit.ts`) menggantikan `openSupabaseChannel`. Presence dan protokol event tidak berubah.
