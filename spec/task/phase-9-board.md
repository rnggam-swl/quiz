# P9 · Papan Soal (giliran memilih soal)

**Tujuan:** mode papan soal. Peserta atau tim bergiliran memilih soal dari papan dan menjawabnya. Soal yang dijawab benar tertutup; jawaban salah membuat soal bisa direbut atau langsung hangus.
**Referensi:** [11-mode-board](../../docs/11-mode-board.md), prototipe [`spec/reference-html/papan-soal.html`](../reference-html/papan-soal.html)
**Bergantung pada:** P5 (live), P6 (rebutan), P8-01 (`buzzer_holds`), P8-02 (mode tim), P8-03 (buka serentak)

## Database & server

- [ ] **P9-01** Migrasi: `session_mode` + `board`, `live_phase` + `pick`/`pass`/`buzz`, enum `board_tile_status`, tabel `board_state`, `board_tiles`, dan `board_adjustments`, kolom `battle_answers.source`, RLS (host `select`, peserta tanpa akses langsung).
- [ ] **P9-02** Policy `board` (Zod, default, batas nilai: poin −10000…10000, waktu 3–300 detik, `pickS` 0–300, `buzzS` 1–60, `maxSteals` 0–20, `maxPlayers` 0 atau 2–50) + default policy mode `board` di `src/engine/policy.ts`. Validasi `tiles` hanya untuk soal yang ada di sesi.
- [ ] **P9-03** Mulai papan di `advance_live`: urutan giliran (urutan masuk atau acak; unit = peserta atau tim), isi `board_tiles` dari `question_ids` + override policy, lalu masuk `pick`. Peserta yang masuk terlambat ditambahkan di akhir urutan selama batas belum penuh. Batas yang ikut: individu dibatasi `maxPlayers` (peserta setelah batas penuh masuk sebagai penonton, tanpa giliran dan BUZZ); tim dibatasi `teams.count`.
- [ ] **P9-04** RPC `board_pick`: validasi pemilih (pemilik giliran, atau penjawab benar terakhir jika `picker = 'last_winner'`; anggota tim mana pun untuk unit tim), soal masih tersedia, buat putaran baru, masuk `countdown`. `advance_live('auto')` dari `pick` memilih soal acak setelah `pickS`.
- [ ] **P9-05** RPC `record_board_answer` dalam satu transaksi: validasi penjawab dan tenggat (+1 detik toleransi), satu percobaan per unit per soal, poin (boleh negatif) atau penalti (skor boleh minus), aturan salah (host → soal → sesi), kandidat perebut dan `maxSteals`, lalu pindah ke `reveal` atau `pass`.
- [ ] **P9-06** Rebutan di papan: `pass` → `open` (dilempar ke kandidat berikutnya setelah penjawab terakhir) atau `pass` → `buzz`; RPC `board_buzz_in` memakai `buzzer_holds` dengan waktu soal; jendela `buzzS` habis → tak terjawab.
- [ ] **P9-07** RPC `board_host`: `skip`, `burn` (soal yang sedang dimainkan), `burn_tile`, `reopen`, `judge_correct`/`judge_wrong` (dicatat `source = 'host'`), `adjust_score` (unit, selisih +/−, catatan; disimpan di `board_adjustments`), dan `set_playing` di lobby (ikut/menonton, tidak melewati batas), semua dengan `state_version`. Jeda dan akhiri memakai aksi live yang ada.
- [ ] **P9-08** `live_game_state` membawa bagian `board` (papan tanpa teks soal, giliran, percobaan, hold). Kunci jawaban hanya saat `reveal`; kunci tipe Lisan hanya di state host; jawaban percobaan hanya jika `showWrongAnswers`.
- [ ] **P9-09** Server Action: pilih soal, jawab (parse → `score()` → RPC), BUZZ, aksi host, masing-masing diikuti broadcast `state` bertanda tangan.

## Membuat sesi

- [ ] **P9-10** Dialog "Mulai live" → pilihan **Papan Soal**: pengaturan peserta dan giliran, kalau jawaban salah, waktu, poin, dan tabel soal di papan (kategori dari tag pertama, poin default 100, waktu, "Jika salah" per soal). Urutan giliran bisa digeser di lobby sebelum mulai.
- [ ] **P9-11** Kapabilitas tipe: tambah mode `board` di `capabilities.modes` semua tipe yang bisa live (⚠️ Benar/Salah jika boleh direbut; ⚠️ tipe bertahap dengan waktu ≤ 10 detik), test di `modes.test.ts`, dan kolom **Papan** di [docs/04](../../docs/04-question-types.md#matriks-kapabilitas). Soal yang tidak kompatibel dilewati dan disebutkan di dialog.

## Layar host / proyektor

- [ ] **P9-12** Papan: kolom per kategori (2–6 kategori, semua soal berkategori) atau grid bernomor. Status soal: tersedia (poin), dimenangkan (warna + nama unit), hangus (host/aturan), tak terjawab. Banner giliran + timer.
- [ ] **P9-13** Soal yang sedang dimainkan: opsi berwarna dan berbentuk, percobaan sebelumnya (dicoret jika `showWrongAnswers`), banner "dilempar ke …" atau "Rebutan!", reveal dengan jawaban benar.
- [ ] **P9-14** Panel host: kunci jawaban, Benar/Salah manual, hanguskan atau buka lagi per soal, lewati giliran, koreksi skor (+/− per unit dengan catatan), jeda, riwayat kejadian. Lobby menampilkan "N / batas ikut · M menonton" dan tombol ikut/menonton per peserta.
- [ ] **P9-15** Skor semua unit di bawah papan dengan penanda giliran dan unit yang sudah mencoba; podium dengan pemecah seri (soal dimenangkan, lalu rata-rata waktu).

## Layar peserta

- [ ] **P9-16** HP pemilih: daftar soal tersedia (nomor, kategori, poin, tipe, waktu, "hangus jika salah"), dengan judul "Pilih soal" atau "Pilihkan soal untuk {nama}".
- [ ] **P9-17** HP penjawab: input sesuai tipe, opsi yang sudah dijawab salah dinonaktifkan jika `showWrongAnswers`. HP lain: "Menunggu …", "Siap merebut", atau tombol BUZZ.
- [ ] **P9-18** Umpan balik: benar (+poin), salah (−penalti), "Soal dilempar ke kamu!", tak terjawab; mode tim menampilkan chip tim dan siapa yang mewakili.

## Laporan & playground

- [ ] **P9-19** Laporan sesi papan: klasemen (skor, soal dimenangkan, benar/salah, rata-rata waktu, total koreksi) + daftar koreksi skor + per soal (pemilih, untuk siapa, percobaan berurutan, hasil) + CSV + analisis butir.
- [ ] **P9-20** Playground `/playground/live?mode=papan`: engine lokal dengan aturan yang sama + bot yang memilih, menjawab, dan menekan BUZZ.

## Tipe soal baru

- [ ] **P9-21** Tipe soal **Lisan** (`oral`), hanya untuk mode Papan: editor (pertanyaan + kunci untuk host), tanpa isian di HP, `score()` = dinilai host, `stripAnswers()` menghapus kunci, `capabilities.modes = { board: "ok" }`, unit test `score()` dan `stripAnswers()`, dan baris baru di [docs/04](../../docs/04-question-types.md#matriks-kapabilitas).

## Test

- [ ] **P9-22** Test DB `supabase/tests/board.test.ts` untuk setiap kombinasi aturan: pemilih (`owner`/`last_winner` + fallback), rebut (`next`/`buzz`), hangus (sesi, per soal, host), `maxSteals`, penalti, poin negatif, waktu habis saat memilih (acak) dan menjawab, buka lagi (kembali ke papan, bisa dipilih siapa saja), lewati giliran, peserta terlambat, batas yang ikut (penonton tidak bisa memilih, menjawab, atau BUZZ), koreksi skor (termasuk skor minus), mode tim (satu perwakilan per tim).
- [ ] **P9-23** Test izin dan konkurensi: jawaban atau pilihan dari unit yang bukan gilirannya ditolak; dua BUZZ serentak → tepat satu pemegang; klik ganda host tidak melompati tahap; peserta tidak bisa memanggil RPC langsung.
- [ ] **P9-24** Test kebocoran: teks soal tidak ada di state sebelum dipilih, kunci jawaban tidak ada di state peserta sebelum `reveal`, kunci tipe Lisan tidak pernah ada di state peserta.
- [ ] **P9-25** E2E: satu sesi lengkap (host + 3 HP) dari lobby sampai podium, mencakup satu soal direbut, satu hangus, dan satu dihanguskan host.

## Definition of Done

- Semua kombinasi aturan di [docs/11](../../docs/11-mode-board.md) lulus test DB, dan test kebocoran lulus.
- Uji coba kelas: 4–6 unit, satu sesi 15 soal dengan dua kombinasi aturan, tanpa intervensi teknis. Host bisa menghanguskan dan membuka lagi soal tanpa reload.
- `docs/11` diperbarui sesuai implementasi.
