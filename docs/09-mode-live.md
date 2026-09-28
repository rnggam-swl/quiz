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

Satu channel Supabase Realtime per sesi, publik (peserta tidak punya akun Supabase). Karena siapa pun bisa mengirim pesan ke channel publik, **event hanya petunjuk**:

| Event   | Payload       | Arti                                                                                     |
| ------- | ------------- | ---------------------------------------------------------------------------------------- |
| `state` | `{ version }` | State sesi berubah (tahap, kunci lobby, peserta dikeluarkan). Klien mengambil state baru |

- State selalu diambil dari server: peserta lewat Server Action `liveStateAction` (RPC `live_state`), host lewat `hostLiveStateAction` (RLS). Event palsu paling banyak menyebabkan satu fetch tambahan.
- `live_state` berisi tahap, timer, jumlah peserta dan yang sudah menjawab, 5 besar (dengan poin putaran terakhir dan peringkat sebelumnya untuk animasi), dan data peserta (skor, peringkat, streak, jawabannya sendiri).
- Jumlah yang menjawab diambil host dengan polling 1 detik selama soal terbuka (tidak di-broadcast ke semua peserta).
- Presence: `{ key, nickname, role }`. Hanya dipakai untuk tanda online; daftar peserta tetap dari server.
- Broadcast dikirim dari Server Action lewat REST (`/realtime/v1/api/broadcast`) setelah transaksi berhasil (`src/engine/transport/broadcast.ts`).

## Reconnect

- Token peserta ada di `localStorage`; reload membawa peserta ke tahap yang benar.
- Klien mengambil ulang state saat: terhubung kembali, tab aktif lagi, 2,5 detik setelah timer tahap habis (jaga-jaga event hilang), dan polling (3 detik saat terputus, 20 detik saat tersambung).
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
- Satu broadcast per perubahan tahap; setiap peserta lalu melakukan satu RPC `live_state`.
- Leaderboard hanya mengirim 5 besar, sedangkan peringkat pribadi dihitung per peserta.

## Uji beban

Skrip `scripts/load-live.mjs` mensimulasikan peserta pada sesi live yang masih di lobby: join, mendengarkan channel, menjawab setiap soal, dan mengambil state setelah setiap event, lewat RPC yang sama dengan Server Action. Host dijalankan dengan akun host sungguhan.

```bash
LOAD_HOST_EMAIL=… LOAD_HOST_PASSWORD=… pnpm load:live --session <id> --players 200 --rounds 5
```

Yang diukur: aksi host → event diterima HP, aksi host → HP selesai mengambil state baru (target p95 < 1 detik), dan latensi jawaban.

| Tanggal | Lingkungan | Peserta | Aksi host → event (p95) | Aksi host → state (p95) | Jawaban (p95) |
| ------- | ---------- | ------- | ----------------------- | ----------------------- | ------------- |
| –       | –          | –       | belum dijalankan        | –                       | –             |

Jangan menjalankan skrip ini pada sesi yang sedang dipakai kelas: skrip menambahkan peserta palsu.
