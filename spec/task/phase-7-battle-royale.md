# P7 · Battle Royale

**Tujuan:** mode eliminasi dengan nyawa, zona menyempit, penonton, dan penanganan semua kasus khusus.
**Referensi:** [10-mode-battle § Battle Royale](../../docs/10-mode-battle.md#battle-royale)

## Server

- [ ] **P7-01** Policy `royale`: `lives`, `eliminateSlowest`, `shrinkTimerPct`, `suddenDeath`. Tambahkan `lateJoin: 'spectator'` sebagai default.
- [ ] **P7-02** Inisialisasi `participants.lives` saat sesi dimulai.
- [ ] **P7-03** RPC `resolve_round` dijalankan saat putaran terkunci: kurangi nyawa untuk yang salah atau tidak menjawab, `eliminateSlowest`, set `eliminated_round` dan `is_spectator`.
- [ ] **P7-04** Kasus khusus: semua tersingkir di putaran yang sama → batalkan eliminasi (nyawa = 1). Sisa 1 peserta → podium.
- [ ] **P7-05** Soal habis dengan > 1 peserta: sudden death (soal tambahan dari bank, timer 5 detik, satu kesalahan tersingkir) atau ranking nyawa → total `reaction_ms`.
- [ ] **P7-06** Zona menyempit: hitung `closes_at` putaran berikutnya dengan batas bawah 5 detik.
- [ ] **P7-07** Jawaban penonton disimpan sebagai poin bayangan (tidak memengaruhi nyawa atau peringkat utama).
- [ ] **P7-08** Broadcast `eliminated` dan `lives`.

## Layar host

- [ ] **P7-09** Grid avatar peserta: aktif vs tersingkir (abu-abu + dicoret, animasi), penghitung besar "12 / 40 tersisa".
- [ ] **P7-10** Indikator zona menyempit (timer berubah warna, label "Zona menyempit!").
- [ ] **P7-11** Podium royale: pemenang terakhir + "bertahan sampai putaran ke-N" + penonton terbaik.

## Layar peserta

- [ ] **P7-12** HUD nyawa ❤️❤️🤍 dengan animasi kehilangan nyawa.
- [ ] **P7-13** Layar tersingkir yang ramah ("Kamu bertahan sampai putaran 7! Tetap main untuk poin bayangan"), lalu masuk mode penonton.
- [ ] **P7-14** Peserta yang masuk setelah mulai langsung jadi penonton, dengan penjelasan.

## Test

- [ ] **P7-15** Unit/integrasi `resolve_round`: setiap kasus khusus di tabel dokumen punya test.
- [ ] **P7-16** Simulasi 100 peserta bot dengan akurasi acak sampai selesai: selalu tepat 1 pemenang, dan tidak ada state yang tersangkut.

## Definition of Done

- Semua kasus khusus teruji.
- Uji coba nyata 20+ peserta berjalan sampai podium.
- Peserta yang tersingkir tetap bisa bermain sebagai penonton.
