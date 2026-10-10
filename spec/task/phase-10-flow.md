# P10 · Tipe Soal Susun Flow

**Tujuan:** tipe soal baru **Susun Flow** (`flow`). Peserta menyusun user flow dari palet node di kanvas, lalu dinilai dengan rubrik atas grafnya. Guru menggambar kunci jawaban, rubrik diusulkan dari kunci itu, lalu disesuaikan.
**Referensi:** [12-soal-flow](../../docs/12-soal-flow.md). Sumber mekanisme node builder: aplikasi User Flow Quest (`C:\Users\meina\Desktop\quest`). Aplikasi itu tetap terpisah, dan tidak ada impor konten atau data.
**Bergantung pada:** P3 (pola tipe soal lanjutan), P4 (laporan butir soal), P8-12/P8-13 (bank soal, impor/ekspor)

## Inti dan penilaian

- [ ] **P10-01** Pindahkan mesin rubrik dari `quest`: kondisi, skor enam kategori, tier, notes, `findRubricProblems` → `src/questions/flow/rubric.ts`, beserta test-nya. Perilaku tidak berubah: kasus-kasus test `quest` menghasilkan nilai, tier, dan pesan yang sama.
- [ ] **P10-02** Pindahkan `suggestRubric` → `src/questions/flow/suggest.ts`, disesuaikan untuk kamus per soal. Test: kunci jawaban selalu mendapat nilai penuh dan tier tertinggi, kategori kosong dihilangkan dan totalnya tetap 100.
- [ ] **P10-03** Pindahkan geometri (`flowLayout.ts`, `flowGraph.ts`) beserta test-nya: tata letak otomatis vertikal/horizontal, panah siku, port Ya/Tidak, dan `flowGraphToSvg` dengan label di-escape.
- [ ] **P10-04** `src/questions/flow/definition.ts`:
  - **Skema:** `configSchema` (kamus node, orientasi, kunci jawaban, rubrik) dan `answerSchema` (node, panah, orientasi), dengan batas dari docs/12.
  - **`validate`:** kamus, rubrik, dan kunci jawaban wajib nilai penuh.
  - **`score`:** `scoreFlow` → `ScoreResult` dengan nilai parsial.
  - **`stripAnswers`:** tanpa `rubric` dan `answerKey`, palet boleh diacak dengan seed.
  - **Lainnya:** `isAnswered` (minimal satu node), `defaults` (kamus contoh: Mulai, Halaman, Keputusan, Berhasil, Galat), dan `capabilities` (latihan dan ujian ✅, lainnya ❌ dengan alasan, `avgSeconds` 300, `partialCredit`).
- [ ] **P10-05** Daftarkan di `registry.ts` dan `ui.tsx`. Tambah `flow: ["rubric", "answerKey"]` ke `ANSWER_KEYS`, lalu perbarui `modes.test.ts` dan baris matriks kapabilitas di [docs/04](../../docs/04-question-types.md#matriks-kapabilitas), plus ringkasan tipe dengan tautan ke docs/12.
- [ ] **P10-06** Umpan balik setelah dikirim: `AnswerOutcome.detail` untuk tipe flow, dihitung di server:
  - **Selalu:** tier dan pesan, kecuali `feedback = 'none'`.
  - **Jika `showCorrectAnswer`:** cek ✓/✗ dengan labelnya.
  - **Ujian:** mengikuti `releaseResults`, sama seperti hasil lain.
  - **Test kebocoran:** label cek dan kunci jawaban tidak ada di respons sebelum diizinkan.

## Kanvas

- [ ] **P10-07** `src/questions/flow/Canvas.tsx` dari `FlowBuilderCanvas` `quest`. Persistensinya diganti state lokal (`onChange` mengembalikan JSON jawaban), dan file besarnya dipecah (interaksi pointer, render node/panah, perhitungan port). Fiturnya:
  - seret node dari palet;
  - tarik panah dari port, dengan Ya/Tidak dari node keputusan;
  - geser belokan panah;
  - snap dan garis bantu;
  - hapus node dan panah;
  - **Rapikan** dan ganti orientasi;
  - **Batal (undo)** dengan tombol dan Ctrl/⌘+Z, riwayat maks. 50 langkah (tambah/pindah/hapus node, tambah/ubah/hapus panah, belokan, Rapikan);
  - node yang sama boleh ditaruh lebih dari sekali, dan ikonnya emoji dari kamus.
  - Mode **penulis** (untuk kunci jawaban) memakai komponen yang sama, termasuk undo.
- [ ] **P10-08** Kanvas di HP: palet di baris bawah, zoom dua jari, geser kanvas, orientasi vertikal sebagai default, dan target sentuh minimal 44 px. Diuji di viewport 375 px.
- [ ] **P10-09** Mode **Daftar** sebagai alternatif aksesibel: tambah node, pilih "lanjut ke …" dan jenis panah lewat formulir, dengan hasil JSON yang identik. Bisa dipakai penuh dengan keyboard, label ARIA untuk node dan panah, kontras WCAG AA memakai token `src/app/globals.css`.
- [ ] **P10-10** `Diagram.tsx` (hanya baca, dari `FlowGraphView`) untuk hasil peserta, kunci jawaban, dan laporan guru, dengan pilihan orientasi.

## Editor guru

- [ ] **P10-11** Editor kamus node: tambah, ubah, hapus, dan urutkan, dengan ikon emoji, label, dan tipe. Kunci dibuat otomatis dari label. Mengganti kunci ikut mengganti semua rujukannya di rubrik dan kunci jawaban. Node yang masih dirujuk tidak bisa dihapus.
- [ ] **P10-12** Kunci jawaban di kanvas mode penulis, lalu **Usulkan rubrik**. Pesan yang jelas kalau kunci belum punya jalur dari `start` ke `outcome`.
- [ ] **P10-13** Editor rubrik:
  - daftar cek (label + kondisi yang bisa dibaca manusia), poin per kategori, pesan per tier, dan catatan;
  - **JSON lanjutan** yang divalidasi langsung;
  - **kanvas uji** yang menampilkan poin per kategori, tier, dan cek ✓/✗;
  - mode layar penuh.
- [ ] **P10-14** Playground `/playground/editor` dan pratinjau editor memuat contoh soal flow (studi kasus pemesanan ruang belajar) yang dinilai di browser.

## Player, hasil, dan laporan

- [ ] **P10-15** Player:
  - kanvas atau mode Daftar;
  - draf di `localStorage` per attempt dan soal, supaya refresh tidak menghapus pekerjaan;
  - tombol kirim aktif setelah ada node;
  - di ujian, ikut autosave per soal.
- [ ] **P10-16** Layar hasil dan review: diagram jawaban, lencana tier, pesan, cek (sesuai P10-06), dan kunci jawaban sebagai diagram jika `showCorrectAnswer`.
- [ ] **P10-17** Laporan guru: diagram jawaban per peserta di halaman respons ujian dan laporan latihan, ekspor SVG, dan analisis butir khusus flow (sebaran tier, persentase per cek).
- [ ] **P10-18** Bank soal, library, salin quiz, serta impor/ekspor spreadsheet (kolom Data lanjutan) berfungsi untuk soal flow. "Buat dengan AI" tetap tidak membuat soal flow.

## Test

- [ ] **P10-19** `definition.test.ts`: benar penuh, parsial, kosong, jawaban tidak sah (kunci tak dikenal, cabang Ya dari node bukan keputusan, melebihi batas), `stripAnswers`, dan `validate` (kunci jawaban tidak penuh ditolak, rujukan node hilang ditolak).
- [ ] **P10-20** Test komponen atau unit untuk konversi kanvas ↔ JSON jawaban, kesetaraan mode Daftar dengan kanvas, dan undo (setiap langkah yang dibatalkan mengembalikan JSON yang persis sama, batas 50 langkah).
- [ ] **P10-21** E2E:
  - guru membuat soal flow (kamus, kunci, usulkan rubrik, publish);
  - peserta latihan menyusun flow di desktop dan di viewport HP, lalu melihat tier;
  - satu soal flow di ujian, termasuk review guru.

## Definition of Done

- Soal flow bisa dibuat, dipublish, dimainkan di latihan dan ujian, dan dinilai di server dengan hasil yang sama seperti penilaian di browser.
- Rubrik dan kunci jawaban tidak pernah sampai ke peserta sebelum diizinkan (test kontrak dan test kebocoran lulus).
- Kanvas nyaman dipakai di HP 375 px, dan mode Daftar memungkinkan menjawab hanya dengan keyboard.
- Uji coba kelas: satu soal user flow dengan 6–8 node dan satu keputusan, dikerjakan 10 peserta tanpa bantuan teknis. Sebaran tier masuk akal menurut guru.
- `docs/12` dan `docs/04` diperbarui sesuai implementasi.

## Fase berikutnya

Varian ringan (Perbaiki flow, Lengkapi flow, Temukan kesalahan) memakai mesin dan kanvas P10. Lihat [docs/12](../../docs/12-soal-flow.md#fase-berikutnya-di-luar-p10).
