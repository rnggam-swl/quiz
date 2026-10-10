# 12 · Tipe Soal Susun Flow

Peserta menyusun **user flow**: menyeret node dari palet ke kanvas, lalu menyambungkannya dengan panah. Contohnya alur memesan ruang belajar, dari Beranda sampai Pesanan berhasil, lengkap dengan keputusan ("Slot tersedia?") dan jalan keluar kalau terjadi galat. Nilainya dihitung dari **rubrik**: kondisi atas graf yang disusun peserta, bukan kecocokan persis dengan satu kunci jawaban. Jadi susunan lain yang sama benarnya tetap mendapat nilai penuh.

📋 **Rencana P10** ([spec/task/phase-10-flow.md](../spec/task/phase-10-flow.md)). Mekanisme node builder diambil dari aplikasi terpisah **User Flow Quest** (`C:\Users\meina\Desktop\quest`, workshop UX). Kedua aplikasi tetap terpisah. Yang dipindahkan hanya mesin rubrik, perhitungan tata letak, dan kanvasnya. Tidak ada impor konten atau data dari aplikasi itu.

## Istilah

| Istilah           | Arti                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| **Kamus node**    | Node yang tersedia di satu soal: kunci, label, tipe, ikon. Disimpan **per soal**, dan sekaligus menjadi palet |
| **Tipe node**     | `start`, `action`, `screen`, `system`, `decision`, `outcome`, `error`                                         |
| **Panah**         | `default` (alur biasa), `yes` dan `no` (cabang dari node keputusan), `recovery` (jalur pemulihan)             |
| **Kunci jawaban** | Flow contoh yang digambar guru. Dipakai untuk mengusulkan rubrik dan ditampilkan saat review. Tidak menilai   |
| **Rubrik**        | Cek bernama, skor per kategori, tier dan pesannya. Inilah yang menilai                                        |
| **Tier**          | Tingkat hasil: Perlu Dicoba Lagi, Path Finder, Flow Builder, Flow Master                                      |

## Config dan jawaban

```ts
config: {
  nodes: { key: string; label: string; type: NodeType; icon: string }[]; // kamus node = palet, urutan palet
  orientation: 'vertical' | 'horizontal';  // arah awal kanvas; peserta boleh mengganti
  answerKey: { nodes: { id: string; key: string; x: number; y: number }[];
               edges: { from: string; to: string; kind: EdgeKind }[] } | null;
  rubric: FlowRubric;                      // lihat "Rubrik" di bawah
}
answer: {
  nodes: { id: string; key: string; x: number; y: number }[];  // satu kunci boleh dipakai lebih dari sekali
  edges: { from: string; to: string; kind: EdgeKind }[];
  orientation: 'vertical' | 'horizontal';
}
```

- **Kamus per soal.** Soal tidak bergantung pada kamus di luar dirinya, jadi bank soal, library, salin quiz, dan impor/ekspor langsung berfungsi. Kamus boleh berisi **node pengecoh** yang tidak ada di kunci jawaban.
- Jawaban hanya menyimpan **kunci** node, bukan label. Peserta tidak bisa mengetik label sendiri, jadi tidak ada teks bebas yang perlu disaring.
- **Batas:** kamus 2–30 node, label 1–60 karakter dan unik, kunci `[a-z0-9]{1,30}` dan unik. Jawaban maks. 40 node dan 80 panah, tanpa panah ke diri sendiri, tanpa panah ganda dengan jenis yang sama, dan cabang `yes`/`no` hanya keluar dari node `decision`.

## Rubrik

Diambil dari `quest` (`src/lib/content/rubric.ts`) tanpa mengubah perilakunya.

**Kondisi** (node dirujuk lewat kuncinya di kamus):

| Kondisi                                          | Benar jika                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `{ has: k }`                                     | Ada node dengan kunci `k` di kanvas                                                                                |
| `{ reach: { from, to, skipRecovery?, avoid? } }` | `from` sampai ke `to` lewat panah; `skipRecovery` mengabaikan jalur pemulihan, `avoid` melarang melewati satu node |
| `{ branch: { from, side, reaches } }`            | Cabang Ya/Tidak dari `from` (lalu panah selanjutnya) sampai ke `reaches`                                           |
| `{ edge: { from?, to?, kind? } }`                | Ada panah langsung; ujung atau jenis yang kosong cocok dengan apa saja                                             |
| `{ terminal: k }`                                | Tidak ada panah yang keluar dari `k`                                                                               |
| `{ twoSides: k }`                                | `k` punya cabang Ya dan Tidak                                                                                      |
| `{ failBranch: k }`                              | `k` dimasuki lewat panah biasa, bukan langsung dari node hasil                                                     |
| `{ connected: true }`                            | Semua node di kanvas punya minimal satu panah                                                                      |
| `{ check: nama }`                                | Memakai cek bernama dari `checks`                                                                                  |
| `all`, `any`, `not`, `{ atLeast: n, of }`        | Penggabung                                                                                                         |

**Skor:** enam kategori tetap, yaitu `goal`, `flow`, `logic`, `constraint`, `edgeCase`, `simplicity`, supaya laporan antarsoal bisa dibandingkan. Setiap kategori punya `max`, lalu salah satu dari dua cara menilai:

- `cases`: kasus pertama yang cocok memberi poinnya; jika tidak ada yang cocok, `otherwise`.
- `orphans`: `max` dikurangi 1 per node yang tidak tersambung, minimal `floor`.

**Tier:** aturan pertama di `tiers` yang cocok menentukan tier dan pesan, atau `otherwise`. Setiap `notes` yang cocok ditambahkan ke pesan. Cek bernama punya `label` ("Ada Beranda"), yang dipakai di umpan balik dan laporan.

**Usulan rubrik** (`suggestRubric`, dari `quest`): dari kunci jawaban, editor menyusun cek untuk tiap kategori.

| Kategori     | Isi                                                                           |
| ------------ | ----------------------------------------------------------------------------- |
| `goal`       | Flow mulai dari awal kunci dan sampai ke hasilnya                             |
| `flow`       | Tiap langkah jalur utama bisa dicapai dari langkah sebelumnya                 |
| `logic`      | Cabang Ya dan Tidak tiap keputusan menuju ke tempat yang sama dengan di kunci |
| `constraint` | Hasil tidak bisa dicapai dengan melewati keputusan di jalur utama             |
| `edgeCase`   | Setiap galat adalah cabang sungguhan, dan setiap panah pemulihan ada          |
| `simplicity` | Poin berkurang untuk tiap node yang tidak tersambung                          |

Kategori yang tidak punya isi untuk dicek (misalnya tanpa keputusan atau galat) dihilangkan, dan bobotnya dibagi ke kategori lain, sehingga totalnya tetap 100. Guru lalu bisa mengubah label, poin, dan pesan tier, atau menyunting JSON-nya.

## Penilaian

- `score()` = `scoreFlow(rubric, graph)`: `correct` = total poin kategori, `total` = jumlah `max`, `ratio` = keduanya dibagi. **Nilai parsial** didukung, dan poin soal = `round(points × ratio)` seperti tipe lain.
- Graf dibentuk dari jawaban yang sudah lolos skema. Node dengan kunci yang tidak ada di kamus tidak mungkin ada, karena skema menolaknya.
- **Umpan balik setelah dikirim** (bagian baru `outcome.detail`, khusus tipe ini, dihitung di server):
  - Tier dan pesan selalu tampil, kecuali `feedback = 'none'`.
  - Daftar cek bernama (✓/✗ dengan label) hanya tampil jika `showCorrectAnswer`. Label cek memberi petunjuk isi rubrik, jadi diperlakukan seperti kunci jawaban.
  - Kunci jawaban ditampilkan sebagai diagram hanya jika `showCorrectAnswer`, sama seperti `reveal.config` tipe lain.

## Strip

- `stripAnswers` mengirim `nodes` (kamus) dan `orientation`, tanpa `rubric` dan `answerKey`. Kalau `shuffle` aktif, urutan palet diacak dengan seed attempt.
- Kunci jawaban yang dijaga test kontrak (`ANSWER_KEYS` di `registry.test.ts`): `rubric`, `answerKey`.

## Validasi (sebelum publish)

- Kamus: minimal 2 node, minimal 1 `start` dan 1 `outcome`, kunci dan label unik, batas panjang dipenuhi.
- Rubrik: lolos skema, semua `check` yang dirujuk ada dan tidak saling berputar, semua kunci node yang dirujuk ada di kamus (`findRubricProblems`), dan total `max` > 0.
- Kunci jawaban: wajib ada, hanya memakai node dari kamus, dan **mendapat nilai penuh dan tier tertinggi**. Kalau tidak, editor menunjukkan kategori dan cek yang gagal.

## Editor guru

Tiga bagian dalam satu panel soal, ditambah mode layar penuh seperti editor Branching:

1. **Kamus node:** tambah, ubah, hapus, dan urutkan. Tiap node punya ikon (emoji), label, dan tipe. Kunci dibuat otomatis dari label dan bisa diubah. Mengganti kunci ikut mengganti semua rujukannya di rubrik dan kunci jawaban. Node yang masih dirujuk tidak bisa dihapus.
2. **Kunci jawaban:** digambar di kanvas yang sama dengan milik peserta (mode penulis, tersimpan di draf soal), lalu tekan **Usulkan rubrik**.
3. **Rubrik:** daftar cek (label dan kondisi yang bisa dibaca), poin per kategori, pesan per tier, catatan, dan **JSON lanjutan** untuk kondisi yang lebih rumit. **Kanvas uji** di sebelahnya menilai flow apa pun secara langsung: poin per kategori, tier, dan cek ✓/✗.

Pratinjau editor dan `/playground/editor` memakai komponen dan penilaian yang sama, dijalankan di browser.

## Player peserta

- **Kanvas** dari `quest` (`FlowBuilderCanvas`):
  - Seret node dari palet ke kanvas, tarik panah dari port, hapus node atau panah.
  - Node keputusan berbentuk belah ketupat dengan port Ya/Tidak yang posisinya tetap.
  - Panah siku otomatis menghindari node, dan belokannya bisa digeser.
  - Snap dan garis bantu perataan.
  - Tombol **Rapikan** untuk tata letak otomatis vertikal atau horizontal.
  - Tombol **Batal (undo)** dan Ctrl/⌘+Z: membatalkan langkah terakhir (tambah, pindah, atau hapus node; tambah, ubah, atau hapus panah; geser belokan; Rapikan), sampai 50 langkah. Berlaku juga di mode Daftar dan di kanvas penulis.
  - Bisa dipakai dengan mouse dan sentuh (Pointer Events).
- **HP:**
  - Palet menjadi baris bawah yang bisa digeser.
  - Kanvas bisa di-zoom dengan dua jari dan digeser.
  - Orientasi vertikal menjadi default.
- **Aksesibilitas:** mode **Daftar** sebagai alternatif kanvas. Peserta menambah node dari palet, lalu memilih "lanjut ke …" dan jenis panahnya lewat formulir. Mode ini bisa dipakai dengan keyboard dan screen reader, dan menghasilkan jawaban yang sama persis.
- **Penyimpanan:**
  - Draf disimpan di `localStorage` per attempt dan soal, supaya refresh tidak menghapus pekerjaan.
  - Jawaban terkirim lewat alur submit biasa, sebagai satu JSON.
  - Di ujian, autosave yang sudah ada menyimpan jawaban per soal.

## Hasil dan laporan

- **Peserta:** diagram jawabannya (hanya baca), lencana tier, pesan, dan daftar cek (sesuai aturan di "Penilaian"). Kunci jawaban ditampilkan sebagai diagram jika diizinkan.
- **Guru:** diagram jawaban tiap peserta di halaman respons (ujian dan laporan latihan), dengan pilihan orientasi. Ekspor SVG (`flowGraphToSvg`, label di-escape).
- **Analisis butir:** selain rata-rata nilai, ditampilkan sebaran tier dan persentase peserta yang memenuhi tiap cek, supaya terlihat bagian flow mana yang paling sering terlewat.
- **Spreadsheet:** soal flow diekspor dan diimpor lewat kolom "Data lanjutan (JSON)" (P8-13). Tidak ada kolom khusus.

## Kapabilitas mode

| Latihan | Ujian | Live | Rebutan | Royale | Papan | Nilai parsial |
| :-----: | :---: | :--: | :-----: | :----: | :---: | :-----------: |
|   ✅    |  ✅   |  ❌  |   ❌    |   ❌   |  ❌   |      ✅       |

`avgSeconds` = 300. Menyusun flow butuh beberapa menit dan layar yang lega, jadi tidak cocok untuk mode berwaktu pendek. Varian ringan untuk live ada di "Fase berikutnya".

## Yang diambil dari `quest`

| Di `quest`                                             | Di quiz                                    | Catatan                                                           |
| ------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------- |
| `src/lib/content/rubric.ts` + test                     | `src/questions/flow/rubric.ts`             | Tanpa perubahan perilaku                                          |
| `src/lib/content/rubricSuggest.ts` + test              | `src/questions/flow/suggest.ts`            | Kamus per soal menggantikan kamus kasus                           |
| `src/lib/flowLayout.ts`, `src/lib/flowGraph.ts` + test | `src/questions/flow/layout.ts`, `graph.ts` | Geometri murni                                                    |
| `src/components/FlowBuilderCanvas.tsx`                 | `src/questions/flow/Canvas.tsx`            | State lokal, bukan API per aksi. Dipecah: interaksi, render, port |
| `src/components/FlowGraphView.tsx`                     | `src/questions/flow/Diagram.tsx`           | Untuk hasil, review, dan laporan                                  |
| `src/components/builder/FlowQuestionEditor.tsx`        | `src/questions/flow/Editor.tsx`            | Mengikuti pola Editor quiz dan design token                       |
| `src/lib/content/analytics.ts` (bagian flow)           | Analisis butir di laporan                  | Sebaran tier, persentase per cek                                  |

**Tidak diambil:**

- Tabel `FlowNode`/`FlowConnection`/`FlowSubmission` dan API `/api/quest2/*`: di quiz, jawaban adalah satu JSON.
- Label node yang diketik peserta.
- Refleksi tertulis yang dinilai dari panjangnya: guru bisa menambah soal Esai setelahnya.
- Flow per tim.
- Modul Latihan dan fixer.

Kanvas Branching Story memakai React Flow. Soal flow sengaja memakai kanvas dari `quest`, karena port Ya/Tidak, panah siku, dan interaksi sentuhnya sudah teruji di workshop, dan player tidak perlu memuat React Flow.

## Keputusan

Disetujui pemilik produk (2026-10).

| Hal                     | Keputusan                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| Target                  | User flow UX, seperti workshop di `quest`                                                      |
| Kamus node              | Per soal                                                                                       |
| Hubungan dengan `quest` | Aplikasi tetap terpisah; hanya mekanisme node builder diambil                                  |
| Varian ringan           | Fase berikutnya, bukan P10                                                                     |
| Node dipakai berulang   | Boleh. Rubrik memperlakukan "node mana pun dengan kunci ini" sebagai cocok, seperti di `quest` |
| Ikon node               | Emoji, dipilih guru per node di kamus                                                          |
| Undo                    | Ada tombol **Batal** di kanvas (peserta dan penulis), juga Ctrl/⌘+Z                            |

## Fase berikutnya (di luar P10)

Varian ringan yang memakai mesin rubrik dan kanvas yang sama, cukup cepat untuk HP dan mode live:

- **Perbaiki flow:** diagram sudah jadi, peserta menyalakan atau mematikan panah sampai semua aturan terpenuhi (fixer dari Modul Latihan `quest`).
- **Lengkapi flow:** diagram dengan slot kosong yang diisi dari palet.
- **Temukan kesalahan:** peserta mengetuk panah atau node yang salah.
