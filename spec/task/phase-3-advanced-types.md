# P3 · Tipe Soal Lanjutan

**Tujuan:** memindahkan tipe soal khas dari prototipe ke registry, sekaligus memperbaiki kelemahan penilaiannya.
**Referensi:** [04-question-types](../../docs/04-question-types.md), prototipe `spec/reference-html/formulir-builder-quiz-mode.html`

Setiap task tipe soal mencakup: `schema`, `score`, `validate`, `stripAnswers`, `Editor`, `Player`, unit test, dan baris di matriks kapabilitas. Player wajib bisa dipakai dengan sentuhan dan keyboard.

## Task

- [ ] **P3-01** `slider`: nilai target + toleransi + nilai parsial opsional. Prototipe: `renderRangeEditor`, yang belum punya kunci jawaban.
- [ ] **P3-02** `odd_one_out`: `oddId` + `reason`. Prototipe: `renderOddOneEditor`, `renderPvOddInner`.
- [ ] **P3-03** `sequencing`: opsi penilaian `position` / `adjacent`, acak ≠ urutan benar, drag + tombol ▲▼. Prototipe: `renderSequencingEditor`, `renderPvSeqInner`.
- [ ] **P3-04** `grouping`: drag ke bucket + tap item lalu tap bucket. Prototipe: `renderGroupEditor`, `renderPvGroupInner`, `groupDrag*`.
- [ ] **P3-05** `word_blank`: mode huruf/kata, strip tanpa huruf yang di-blank, input per kotak dengan auto-advance. Prototipe: `renderWbEditor`, `renderPvWbInner`, `wbHandleKeydown`.
- [ ] **P3-06** `hotspot`: koordinat persen, radius, **`maxClicks` dan penalti klik meleset** (memperbaiki bug prototipe yang membolehkan klik tanpa batas), strip tanpa `spots`. Prototipe: `renderHotspotEditor`, `hotspotClick`.
- [ ] **P3-07** `branching`, editor: flowchart dengan node yang bisa digeser, koneksi klik-ke-klik, garis bezier, penanda node awal dan ending. Prototipe: `renderBranchingEditor`, `flow*`. Pertimbangkan React Flow untuk menggantikan implementasi manual.
- [ ] **P3-08** `branching`, penilaian: berdasarkan `ending.score` (default) atau per pilihan. Server memvalidasi keabsahan `path`. Validasi publish dipindahkan dari prototipe (node awal, ending, jalan buntu, node tak terjangkau).
- [ ] **P3-09** `branching`, player: latihan mengirim graf penuh, ujian mengirim node bertahap lewat Server Action `nextStoryNode`.
- [ ] **P3-10** Lampiran media per item (gambar/audio) untuk semua tipe berbasis item, seperti `optionAttachments` di prototipe.
- [ ] **P3-11** Editor: filter tipe soal berdasarkan mode target (jika quiz ditandai untuk mode tertentu) + peringatan ⚠️ dari matriks kapabilitas.

## Definition of Done

- 7 tipe baru tersedia di editor, preview, dan mode latihan.
- Setiap tipe punya test untuk jawaban benar, salah, parsial, kosong, dan tidak valid, serta test strip.
- Bug hotspot (klik tanpa batas) dan penilaian sequencing per posisi sudah ditangani sesuai dokumen.
