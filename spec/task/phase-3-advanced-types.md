# P3 · Tipe Soal Lanjutan

**Tujuan:** memindahkan tipe soal khas dari prototipe ke registry, sekaligus memperbaiki kelemahan penilaiannya.
**Referensi:** [04-question-types](../../docs/04-question-types.md), prototipe `spec/reference-html/formulir-builder-quiz-mode.html`

Setiap task tipe soal mencakup: `schema`, `score`, `validate`, `stripAnswers`, `Editor`, `Player`, unit test, dan baris di matriks kapabilitas. Player wajib bisa dipakai dengan sentuhan dan keyboard.

> **Status verifikasi.** Ketujuh tipe punya unit test (benar, salah, parsial, kosong/tidak valid, strip) dan sudah dimainkan di browser lewat `/playground/play?set=advanced` (desktop dan HP, mode gelap) serta diedit di `/playground/editor`. E2E baru di [`e2e/playground.spec.ts`](../../e2e/playground.spec.ts) memainkan ketujuh tipe, termasuk jalur keyboard, dan lolos di project desktop dan Pixel 7. Test itu hanya jalan di dev server (playground tidak ada di build produksi). Penyimpanan ke Supabase memakai jalur yang sama dengan tipe P1, dan `checkDraft` kini juga memeriksa media di dalam `config`.

## Perubahan desain

- **Hotspot menyimpan `aspect`** (tinggi/lebar gambar) dan radius dalam persen lebar. Prototipe mengukur jarak vertikal dalam persen tinggi, sehingga lingkaran jadi lonjong di gambar yang tidak persegi.
- **Sequencing default `adjacent`**, Branching default `ending`. Opsi lama tetap bisa dipilih.
- **Lampiran item hanya gambar.** Item dirender sebagai tombol, dan kontrol audio tidak boleh berada di dalam tombol. Audio tetap bisa dipasang di level soal.
- **Node Branching di ujian dikirim bertahap** dipindah ke P4 ([P4-07b](phase-4-exam.md)), karena mode ujian baru dibangun di sana.

## Task

- [x] **P3-01** `slider`: nilai target + toleransi + nilai parsial opsional. Prototipe: `renderRangeEditor`, yang belum punya kunci jawaban.
  - Nilai parsial dihitung dari jarak di luar toleransi. Validasi memastikan jawaban bisa dicapai dengan kelipatan langkah. Thumb mulai di tengah, tapi baru dihitung setelah digeser.
- [x] **P3-02** `odd_one_out`: `oddId` + `reason`. Prototipe: `renderOddOneEditor`, `renderPvOddInner`.
- [x] **P3-03** `sequencing`: opsi penilaian `position` / `adjacent`, acak ≠ urutan benar, drag + tombol ▲▼. Prototipe: `renderSequencingEditor`, `renderPvSeqInner`.
  - `SortableList` bersama (dnd-kit) untuk editor dan player, dengan seret keyboard dan pengumuman berbahasa Indonesia.
- [x] **P3-04** `grouping`: drag ke bucket + tap item lalu tap bucket. Prototipe: `renderGroupEditor`, `renderPvGroupInner`, `groupDrag*`.
- [x] **P3-05** `word_blank`: mode huruf/kata, strip tanpa huruf yang di-blank, input per kotak dengan auto-advance. Prototipe: `renderWbEditor`, `renderPvWbInner`, `wbHandleKeydown`.
  - Ditemukan saat uji di HP: kata 12 huruf keluar layar. Sekarang kotak lebih kecil di HP dan kata panjang boleh berlanjut ke baris berikutnya.
- [x] **P3-06** `hotspot`: koordinat persen, radius, **`maxClicks` dan penalti klik meleset** (memperbaiki bug prototipe yang membolehkan klik tanpa batas), strip tanpa `spots`. Prototipe: `renderHotspotEditor`, `hotspotClick`.
  - Keyboard: penanda silang yang digerakkan dengan panah (player), titik yang digeser dengan panah (editor).
- [x] **P3-07** `branching`, editor: flowchart dengan node yang bisa digeser, koneksi klik-ke-klik, garis bezier, penanda node awal dan ending. Prototipe: `renderBranchingEditor`, `flow*`. Pertimbangkan React Flow untuk menggantikan implementasi manual.
  - Memakai React Flow (`@xyflow/react`), dimuat terpisah dari player. Koneksi dengan menyeret titik pilihan ke node mana pun ("easy connect"). Ada mode layar penuh, dan formulir di bawah kanvas mencakup semua aksi untuk pengguna keyboard.
- [x] **P3-08** `branching`, penilaian: berdasarkan `ending.score` (default) atau per pilihan. Server memvalidasi keabsahan `path`. Validasi publish dipindahkan dari prototipe (node awal, ending, jalan buntu, node tak terjangkau).
  - Ditambah: cerita yang bisa terjebak di putaran tanpa akhir ditolak, dan penilaian per pilihan menghitung setiap pilihan sekali (berputar tidak menaikkan nilai).
- [ ] 🚧 **P3-09** `branching`, player: latihan mengirim graf penuh ✅, ujian mengirim node bertahap lewat Server Action `nextStoryNode` ↪️ dipindah ke P4-07b.
- [x] **P3-10** Lampiran media per item (gambar/audio) untuk semua tipe berbasis item, seperti `optionAttachments` di prototipe.
  - Gambar per item di Pilihan Ganda, Matching (kiri dan kanan), Odd One Out, Sequencing, dan Grouping, plus gambar per node cerita. Audio hanya di level soal (lihat "Perubahan desain").
- [ ] 🚧 **P3-11** Editor: filter tipe soal berdasarkan mode target (jika quiz ditandai untuk mode tertentu) + peringatan ⚠️ dari matriks kapabilitas.
  - ✅ Chip mode + alasan di panel properti, "Tidak untuk: …" di menu tambah soal, dan `capabilities.notes` untuk setiap mode ⚠️.
  - ⏳ Filter per mode sudah tersedia (`AddQuestionMenu mode`, `typesForMode()`), tapi quiz belum bisa ditandai untuk satu mode. Akan dipakai saat wizard sesi ujian/live/battle dibangun (P4–P7).

## Temuan di luar P3 (sudah diperbaiki)

- **Player tidak terbaca di HP mode gelap.** Latar tema quiz selalu terang, sedangkan teks mengikuti mode gelap perangkat. Sekarang player memasang `data-scheme` sesuai kecerahan latar (lihat [05-design-system](../../docs/05-design-system.md)).
- **URL media di dalam `config` belum dicek server.** Sekarang `checkDraft` memeriksa semua media, termasuk gambar item dan gambar hotspot.
- **Nilai pecahan tampil "0.5/1".** Sekarang tampil sebagai persen ("50%") di feedback, ringkasan, dan halaman hasil guru.

## Definition of Done

- [x] 7 tipe baru tersedia di editor, preview, dan mode latihan.
- [x] Setiap tipe punya test untuk jawaban benar, salah, parsial, kosong, dan tidak valid, serta test strip.
- [x] Bug hotspot (klik tanpa batas) dan penilaian sequencing per posisi sudah ditangani sesuai dokumen.
