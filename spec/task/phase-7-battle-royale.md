# P7 · Battle Royale

**Tujuan:** mode eliminasi dengan nyawa, zona menyempit, penonton, dan penanganan semua kasus khusus.
**Referensi:** [10-mode-battle § Battle Royale](../../docs/10-mode-battle.md#battle-royale)

## Server

- [x] **P7-01** Policy `royale`: `lives`, `eliminateSlowest`, `shrinkTimerPct`, `suddenDeath`. Tambahkan `lateJoin: 'spectator'` sebagai default.
- [x] **P7-02** Inisialisasi `participants.lives` saat sesi dimulai.
- [x] **P7-03** RPC `resolve_round` _(`resolve_royale_round`)_ dijalankan saat putaran terkunci: kurangi nyawa untuk yang salah atau tidak menjawab, `eliminateSlowest`, set `eliminated_round` dan `is_spectator`.
- [x] **P7-04** Kasus khusus: semua tersingkir di putaran yang sama → batalkan eliminasi (nyawa = 1). Sisa 1 peserta → podium.
- [x] **P7-05** Soal habis dengan > 1 peserta: sudden death (soal tambahan dari bank, timer 5 detik, satu kesalahan tersingkir) atau ranking nyawa → total `reaction_ms`.
- [x] **P7-06** Zona menyempit: hitung `closes_at` putaran berikutnya dengan batas bawah 5 detik.
- [x] **P7-07** Jawaban penonton disimpan sebagai poin bayangan (tidak memengaruhi nyawa atau peringkat utama).
- [x] **P7-08** Broadcast `eliminated` dan `lives`. _(Lewat `state` bertanda tangan: `royale.eliminated`, tersisa, zona; nyawa pribadi diambil saat reveal.)_

## Layar host

- [x] **P7-09** Grid avatar peserta: aktif vs tersingkir (abu-abu + dicoret, animasi), penghitung besar "12 / 40 tersisa".
- [x] **P7-10** Indikator zona menyempit (timer berubah warna, label "Zona menyempit!").
- [x] **P7-11** Podium royale: pemenang terakhir + "bertahan sampai putaran ke-N" + penonton terbaik.

## Layar peserta

- [x] **P7-12** HUD nyawa ❤️❤️🤍 dengan animasi kehilangan nyawa.
- [x] **P7-13** Layar tersingkir yang ramah ("Kamu bertahan sampai putaran 7! Tetap main untuk poin bayangan"), lalu masuk mode penonton.
- [x] **P7-14** Peserta yang masuk setelah mulai langsung jadi penonton, dengan penjelasan.

## Test

- [x] **P7-15** Unit/integrasi `resolve_round`: setiap kasus khusus di tabel dokumen punya test.
- [x] **P7-16** Simulasi 100 peserta bot dengan akurasi acak sampai selesai: selalu tepat 1 pemenang, dan tidak ada state yang tersangkut.

## Definition of Done

- Semua kasus khusus teruji.
- Uji coba nyata 20+ peserta berjalan sampai podium.
- Peserta yang tersingkir tetap bisa bermain sebagai penonton.
