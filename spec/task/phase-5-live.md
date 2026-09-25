# P5 · Mode Live (klasik)

**Tujuan:** host memandu soal dari proyektor, peserta menjawab di HP, dengan poin kecepatan dan leaderboard realtime. Fase ini membangun infrastruktur yang dipakai ulang oleh battle.
**Referensi:** [09-mode-live](../../docs/09-mode-live.md), [02-architecture § Realtime](../../docs/02-architecture.md#realtime)

## Infrastruktur realtime

- [ ] **P5-01** `engine/transport/`: antarmuka `SessionChannel` (subscribe, onEvent, presence) + implementasi Supabase Realtime.
- [ ] **P5-02** Broadcast dari server: helper `broadcast(sessionId, event, payload)` yang dipanggil Server Action setelah transaksi berhasil.
- [ ] **P5-03** Sinkronisasi jam: ukur selisih jam klien dan server saat join (beberapa sampel ping, ambil median). Hook `useServerNow()`.
- [ ] **P5-04** RPC `get_session_state` + hook `useSessionState()` yang mengambil ulang state setiap kali reconnect atau tab kembali aktif.

## Engine live

- [ ] **P5-05** Migrasi: kolom `phase`, `current_round`, `phase_opened_at`, `phase_closes_at` di `sessions`. Pakai `battle_rounds` sebagai tabel putaran umum, termasuk untuk live, supaya tabelnya sama dengan battle.
- [ ] **P5-06** `advance_round`: state machine `lobby → countdown → open → reveal → leaderboard → … → podium → ended`, validasi transisi, dan `now() ≥ closes_at` untuk transisi karena waktu habis.
- [ ] **P5-07** Poin kecepatan + bonus streak di server. Update `participants.score` dan `streak`.
- [ ] **P5-08** Otomatis kunci putaran saat semua peserta aktif sudah menjawab.

## Layar host

- [ ] **P5-09** Membuat sesi live dari dashboard, lalu masuk ke lobby.
- [ ] **P5-10** Lobby: kode besar, QR, avatar peserta (Presence), keluarkan peserta, kunci lobby, tombol mulai, musik latar (bisa dimatikan).
- [ ] **P5-11** Layar soal: soal besar, grid opsi dengan warna dan bentuk, timer lingkaran, penghitung "23/30 sudah menjawab".
- [ ] **P5-12** Reveal: jawaban benar, bar distribusi per opsi, penjelasan.
- [ ] **P5-13** Leaderboard 5 besar dengan animasi perpindahan peringkat. Podium akhir + confetti.
- [ ] **P5-14** Kontrol host: lanjut, lewati, jeda, akhiri, toggle auto-advance. Keyboard: `Space` untuk lanjut.

## Layar peserta

- [ ] **P5-15** Menunggu di lobby ("Kamu masuk! Lihat layar depan"), avatar dan nickname.
- [ ] **P5-16** Mode controller: tombol besar berwarna dan berbentuk, opsi tampilkan soal di HP.
- [ ] **P5-17** Setelah menjawab: "Jawaban terkirim, menunggu yang lain…". Setelah reveal: benar/salah, +poin, peringkat pribadi, streak.

## Laporan & skala

- [ ] **P5-18** Laporan sesi live memakai halaman laporan yang sama + replay leaderboard per soal.
- [ ] **P5-19** Uji beban: skrip (k6 atau Node) yang mensimulasikan 200 peserta join dan menjawab. Ukur latensi aksi host → layar peserta dan catat hasilnya di `docs/09-mode-live.md`.

## Definition of Done

- Sesi 30 peserta nyata (uji coba di kelas atau internal) berjalan dari lobby sampai podium tanpa error.
- Peserta yang refresh atau terputus kembali ke tahap yang benar.
- Uji beban 200 peserta: p95 latensi broadcast < 1 detik.
