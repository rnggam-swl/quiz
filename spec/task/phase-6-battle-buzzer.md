# P6 · Battle: Rebutan (Tercepat Benar)

**Tujuan:** mode rebutan. Jawaban benar pertama yang diterima server menang, lalu soal terkunci untuk semua peserta.
**Referensi:** [10-mode-battle § Rebutan](../../docs/10-mode-battle.md#rebutan), [10-mode-battle § Menentukan pemenang](../../docs/10-mode-battle.md#menentukan-pemenang-secara-adil)

## Database & server

- [x] **P6-01** Migrasi: `battle_answers` (unique per putaran-peserta), `round_winners`, status `resolving` di enum putaran.
- [x] **P6-02** RPC `record_battle_answer` (lihat sketsa di dokumen): `for update` pada putaran, cek status dan waktu, insert jawaban, insert pemenang `on conflict do nothing`, kunci putaran, tambah skor. Hanya `service_role` yang boleh menjalankannya.
- [x] **P6-03** Server Action `submitBattleAnswer`: parse → score → RPC → broadcast `round_locked` jika menang. _(`answerLiveAction`; kemenangan di-broadcast sebagai `state` bertanda tangan yang membawa pemenang.)_
- [x] **P6-04** Policy `buzzer`: `variant: 'first_correct'`, `wrongPenalty`. Default dan validasi di `engine/policy.ts`.
- [x] **P6-05** Filter tipe soal: saat membuat sesi rebutan, soal yang tidak kompatibel dilewati dengan konfirmasi.

## Layar host

- [x] **P6-06** Pilih mode "Rebutan" saat membuat sesi + pengaturan penalti.
- [x] **P6-07** Saat ada pemenang: banner "⚡ {nickname} tercepat!" + suara buzzer, lalu reveal.
- [x] **P6-08** Leaderboard rebutan: jumlah soal dimenangkan + skor.

## Layar peserta

- [x] **P6-09** Salah menjawab: kunci 🔒 "Coba di soal berikutnya" + getaran (`navigator.vibrate` jika tersedia).
- [x] **P6-10** Keduluan: "Keduluan {nickname}!" + tampilkan jawaban benar.
- [x] **P6-11** Menang: animasi kemenangan + poin.

## Test

- [ ] **P6-12** Test konkurensi: 50 jawaban benar dikirim bersamaan ke satu putaran → tepat 1 pemenang, dan 49 peserta lain menerima `round_closed` atau `won: false`. _(Aturan di `supabase/tests/battle.test.ts`; konkurensi sungguhan 20× di `e2e/battle.spec.ts`, menunggu dijalankan CI.)_
- [x] **P6-13** Test: jawaban kedua dari peserta yang sama ditolak. Jawaban setelah `closes_at` ditolak. Peserta tidak bisa memanggil RPC langsung.

## Definition of Done

- Test konkurensi lulus secara konsisten (dijalankan 20×).
- Uji coba 20 peserta nyata: pemenang tampil di proyektor dalam < 1 detik setelah jawaban.
