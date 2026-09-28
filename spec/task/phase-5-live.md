# P5 · Mode Live (klasik)

**Tujuan:** host memandu soal dari proyektor, peserta menjawab di HP, dengan poin kecepatan dan leaderboard realtime. Fase ini membangun infrastruktur yang dipakai ulang oleh battle.
**Referensi:** [09-mode-live](../../docs/09-mode-live.md), [02-architecture § Realtime](../../docs/02-architecture.md#realtime)

## Infrastruktur realtime

- [x] **P5-01** `engine/transport/`: antarmuka `SessionChannel` (subscribe, onEvent, presence) + implementasi Supabase Realtime.
- [x] **P5-02** Broadcast dari server: helper `broadcast(sessionId, event, payload)` yang dipanggil Server Action setelah transaksi berhasil.
- [x] **P5-03** Sinkronisasi jam: ukur selisih jam klien dan server saat join (beberapa sampel ping, ambil median). Hook `useServerNow()`. _(`useServerOffset()` + `GET /api/time`.)_
- [x] **P5-04** RPC `get_session_state` + hook `useSessionState()` _(`live_state` + `useLiveState()`)_ yang mengambil ulang state setiap kali reconnect atau tab kembali aktif.

## Engine live

- [x] **P5-05** Migrasi: kolom `phase`, `current_round`, `phase_opened_at`, `phase_closes_at` di `sessions`. Pakai `battle_rounds` sebagai tabel putaran umum, termasuk untuk live, supaya tabelnya sama dengan battle.
- [x] **P5-06** `advance_round` _(`advance_live`)_: state machine `lobby → countdown → open → reveal → leaderboard → … → podium → ended`, validasi transisi, dan `now() ≥ closes_at` untuk transisi karena waktu habis.
- [x] **P5-07** Poin kecepatan + bonus streak di server. Update `participants.score` dan `streak`.
- [x] **P5-08** Otomatis kunci putaran saat semua peserta aktif sudah menjawab.

## Layar host

- [x] **P5-09** Membuat sesi live dari dashboard, lalu masuk ke lobby.
- [x] **P5-10** Lobby: kode besar, QR, avatar peserta (Presence), keluarkan peserta, kunci lobby, tombol mulai, musik latar (bisa dimatikan).
- [x] **P5-11** Layar soal: soal besar, grid opsi dengan warna dan bentuk, timer lingkaran, penghitung "23/30 sudah menjawab".
- [x] **P5-12** Reveal: jawaban benar, bar distribusi per opsi, penjelasan.
- [x] **P5-13** Leaderboard 5 besar dengan animasi perpindahan peringkat. Podium akhir + confetti.
- [x] **P5-14** Kontrol host: lanjut, lewati, jeda, akhiri, toggle auto-advance. Keyboard: `Space` untuk lanjut. _(Lewati = "Tutup soal" saat soal terbuka.)_

## Layar peserta

- [x] **P5-15** Menunggu di lobby ("Kamu masuk! Lihat layar depan"), avatar dan nickname.
- [x] **P5-16** Mode controller: tombol besar berwarna dan berbentuk, opsi tampilkan soal di HP.
- [x] **P5-17** Setelah menjawab: "Jawaban terkirim, menunggu yang lain…". Setelah reveal: benar/salah, +poin, peringkat pribadi, streak.

## Laporan & skala

- [x] **P5-18** Laporan sesi live memakai halaman laporan yang sama + replay leaderboard per soal.
- [ ] **P5-19** Uji beban: skrip (k6 atau Node) yang mensimulasikan 200 peserta join dan menjawab. Ukur latensi aksi host → layar peserta dan catat hasilnya di `docs/09-mode-live.md`. _(Skrip `pnpm load:live` sudah ada; belum dijalankan terhadap Supabase sungguhan.)_

## Definition of Done

- Sesi 30 peserta nyata (uji coba di kelas atau internal) berjalan dari lobby sampai podium tanpa error.
- Peserta yang refresh atau terputus kembali ke tahap yang benar.
- Uji beban 200 peserta: p95 latensi broadcast < 1 detik.
