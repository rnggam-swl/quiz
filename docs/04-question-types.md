# 04 · Tipe Soal

Setiap tipe soal adalah modul di `src/questions/<tipe>/` yang mengikuti kontrak `QuestionType` (lihat [02-architecture](02-architecture.md#question-type-registry)).

## Matriks kapabilitas

| Tipe                           | Kunci             | Latihan | Ujian | Live | Rebutan | Royale | Nilai parsial | Fase |
| ------------------------------ | ----------------- | :-----: | :---: | :--: | :-----: | :----: | :-----------: | :--: |
| Pilihan Ganda (tunggal/banyak) | `multiple_choice` |   ✅    |  ✅   |  ✅  |   ✅    |   ✅   |  banyak: ✅   |  P1  |
| Benar / Salah                  | `true_false`      |   ✅    |  ✅   |  ✅  |   ✅    |   ✅   |       –       |  P1  |
| Isian Singkat                  | `short_answer`    |   ✅    |  ✅   |  ✅  |   ⚠️    |   ✅   |       –       |  P1  |
| Angka                          | `number`          |   ✅    |  ✅   |  ✅  |   ⚠️    |   ✅   |       –       |  P1  |
| Matching                       | `matching`        |   ✅    |  ✅   |  ✅  |   ❌    |   ❌   |      ✅       |  P1  |
| Slider                         | `slider`          |   ✅    |  ✅   |  ✅  |   ❌    |   ✅   |   opsional    |  P3  |
| Odd One Out                    | `odd_one_out`     |   ✅    |  ✅   |  ✅  |   ✅    |   ✅   |       –       |  P3  |
| Sequencing                     | `sequencing`      |   ✅    |  ✅   |  ✅  |   ❌    |   ✅   |      ✅       |  P3  |
| Grouping                       | `grouping`        |   ✅    |  ✅   |  ✅  |   ❌    |   ✅   |      ✅       |  P3  |
| Guess the Blank                | `word_blank`      |   ✅    |  ✅   |  ✅  |   ❌    |   ✅   |      ✅       |  P3  |
| Hotspot                        | `hotspot`         |   ✅    |  ✅   |  ✅  |   ❌    |   ❌   |      ✅       |  P3  |
| Branching Story                | `branching`       |   ✅    |  ⚠️   |  ❌  |   ❌    |   ❌   |      ✅       |  P3  |
| Esai                           | `essay`           |   ✅    |  ✅   |  ❌  |   ❌    |   ❌   |    manual     |  P4  |

⚠️ = boleh dipakai, tapi editor menampilkan peringatan. Contohnya isian di rebutan: kecepatan mengetik ikut menentukan hasil.

Matriks ini ada di kode sebagai `capabilities.modes` tiap tipe, dan alasannya di `capabilities.notes` (wajib untuk mode ⚠️, dijaga test `modes.test.ts`). Di editor:

- Panel properti menampilkan chip mode (✓ / ⚠️ / coret) di bawah pilihan tipe, lengkap dengan alasannya.
- Menu "Tambah soal" menulis "Tidak untuk: Rebutan, Royale" di bawah tipe yang terbatas. Menu ini juga bisa difilter per mode (`mode` di `AddQuestionMenu`, dari `typesForMode()`), untuk quiz yang dibuat khusus satu mode (P4+).
- Saat membuat sesi ujian/live/battle, soal yang tidak kompatibel dilaporkan (form "Buat ujian" sudah menampilkannya, P4) dan bisa dilewati (P5–P7).

## Konvensi umum

- Setiap item atau opsi punya `id` stabil (`nanoid`), **bukan indeks**. Ini memungkinkan pengacakan tanpa kehilangan pemetaan jawaban. Prototipe masih memakai indeks dan perlu diubah.
- Item atau opsi boleh punya `media?: MediaRef`, seperti lampiran di prototipe. Untuk item, editor hanya menawarkan **gambar**: item dirender sebagai tombol, dan kontrol audio tidak boleh berada di dalam tombol. Audio tetap bisa dipasang di level soal.
- Semua URL media, termasuk yang ada di dalam `config` (gambar item, gambar hotspot), harus berasal dari bucket `quiz-media`. Server menolak draf yang melanggar (`configMediaUrls()` di `src/lib/quiz-data.ts`).
- `ScoreResult.ratio = correct / total`, dengan `total = 0` → soal tidak dinilai.
- Poin akhir = `question.points × ratio × pengali mode`. Pengali mode contohnya bonus kecepatan di live.

```ts
type MediaRef = { kind: "image" | "audio" | "video"; url: string; alt?: string };
type Item = { id: string; text: string; media?: MediaRef };
```

---

## Pilihan Ganda — `multiple_choice`

```ts
config: { options: Item[]; correctIds: string[]; multiple: boolean }
answer: { selectedIds: string[] }
```

- **Tunggal:** benar jika `selectedIds` sama persis dengan `correctIds`.
- **Banyak:** nilai parsial = `max(0, benarDipilih − salahDipilih) / jumlahBenar`, supaya memilih semua opsi tidak menguntungkan.
- **Validasi:** minimal 2 dan maksimal 5 opsi (satu per warna + bentuk di player), minimal 1 jawaban benar (tepat 1 untuk mode tunggal), tidak ada opsi kosong, dan tidak ada opsi kembar.
- **Player:** pilihan tunggal langsung terjawab saat diketuk (`answersOnTap`), sedangkan pilihan banyak memakai tombol “Kirim”.
- **Strip:** hapus `correctIds`, acak `options`.
- **Catatan prototipe:** `singlechoice`/`multiselect` belum punya kunci jawaban (`scoreField` mengembalikan `null`). Ini celah terbesar yang harus ditutup di P1.

## Benar / Salah — `true_false`

```ts
config: {
  correct: boolean;
}
answer: {
  value: boolean;
}
```

## Isian Singkat — `short_answer`

```ts
config: { accepted: string[]; caseSensitive: boolean; fuzzy: 0 | 1 | 2 }
answer: { text: string }
```

- Normalisasi: NFKC → trim → rapikan spasi ganda → lowercase (kecuali `caseSensitive`).
- `fuzzy` adalah jarak Levenshtein maksimum yang masih diterima, untuk toleransi salah ketik. Hanya berlaku untuk jawaban minimal 4 huruf, supaya “cat” tidak menerima “car”.

## Angka — `number`

```ts
config: { value: number; tolerance: number; unit?: string }
answer: { value: number }
```

Benar jika `|answer − value| ≤ tolerance`.

## Slider — `slider`

```ts
config: { min: number; max: number; step: number; value: number; tolerance: number; partial: boolean; unit?: string }
answer: { value: number }
```

- Benar penuh jika `|jawaban − value| ≤ tolerance`.
- Jika `partial`: `ratio = max(0, 1 − (|selisih| − tolerance) / (max − min) × 2)`. Toleransi dikurangi dulu supaya nilai tidak melompat turun tepat di luar toleransi; nilai habis di setengah rentang.
- **Validasi:** `max > min`, langkah tidak lebih besar dari rentang dan maksimal 1000 titik, jawaban di dalam rentang, dan jawaban bisa dicapai dengan kelipatan langkah (dengan memperhitungkan toleransi).
- **Player:** `<input type="range">` besar dengan tombol −/+. Posisi awal di tengah, tapi baru dihitung sebagai jawaban setelah digeser. Satuan `%` dan `°C` ditulis rapat ("52%").
- **Strip:** hanya `min`, `max`, `step`, `unit`.

## Matching — `matching`

```ts
config: { left: Item[]; right: Item[]; pairs: { leftId: string; rightId: string }[] }  // bisa one-to-many
answer: { pairs: { leftId: string; rightId: string }[] }
```

- `correct` = jumlah pasangan jawaban yang ada di `pairs`, dikurangi pasangan salah, dengan batas bawah 0. `total = pairs.length`.
- **Strip:** hapus `pairs`. Kolom kanan **selalu** diacak (tidak pernah sama dengan urutan penulisan), walaupun `shuffle` mati.
- **Player:** ketuk item di kiri lalu pasangannya di kanan. Pasangan ditandai dengan bentuk + warna item yang sama, tanpa garis, supaya sama nyamannya di HP dan proyektor.
- **Prototipe:** interaksi klik kiri → kanan dengan garis bezier berwarna (`matchDrawLines`) dipertahankan. Model datanya diubah dari `items[].pairs[]` menjadi `left`/`right`/`pairs` agar kolom kanan bisa diacak tanpa membocorkan pasangan.

## Odd One Out — `odd_one_out`

```ts
config: { items: Item[]; oddId: string; reason?: string }
answer: { selectedId: string }
```

- **Validasi:** 3–5 item (satu warna + bentuk per item), tidak ada item kosong atau kembar, dan satu item ditandai.
- **Player:** seperti pilihan tunggal, langsung terjawab saat diketuk. `reason` ditampilkan saat reveal.
- **Strip:** hapus `oddId` dan `reason`, acak `items` jika diizinkan.

## Sequencing — `sequencing`

```ts
config: { items: Item[]; scoring: 'adjacent' | 'position' }   // urutan di config = urutan benar
answer: { orderedIds: string[] }
```

- Prototipe menilai per posisi persis, sehingga satu item yang tergeser bisa membuat hampir semua posisi salah. Default sekarang **`adjacent`**: nilai = pasangan berurutan yang benar (`A→B`, `B→C`, …) / `(n−1)`. `position` tetap tersedia sebagai opsi.
- Id yang tidak dikenal atau berulang di jawaban diabaikan, jadi jawaban buatan tidak bisa menghitung satu item dua kali.
- **Validasi:** minimal 3 item, tidak kosong, dan tidak kembar (item kembar membuat urutan ambigu).
- **Strip:** selalu diacak dengan seed, dan hasil acak dijamin ≠ urutan benar, walaupun acak opsi dimatikan.
- **Player:** seret (mouse, sentuhan, atau keyboard: spasi → panah → spasi, dengan pengumuman berbahasa Indonesia) atau tombol ▲▼. Reveal menandai item yang salah posisi dengan "seharusnya #k".

## Grouping — `grouping`

```ts
config: { groups: { id: string; name: string }[]; items: (Item & { groupId: string })[] }
answer: { placement: Record<string /*itemId*/, string /*groupId*/> }
```

- `correct` = item di kelompok yang benar, `total` = jumlah item. Satu item hanya bisa berada di satu kelompok, jadi tidak perlu penalti tambahan. Kunci warisan (`__proto__`) diabaikan.
- **Validasi:** 2–5 kelompok bernama, setiap kelompok berisi minimal 1 item, tidak ada item kosong.
- **Strip:** hapus `groupId`. Item selalu diacak, karena ditulis per kelompok dan urutannya akan membocorkan jawaban.
- **Player:** ketuk item lalu ketuk kelompoknya, atau seret. Item bisa dipindah atau dikembalikan ke kumpulan sebelum dikirim. Reveal menandai ✓/✗ dan menulis kelompok yang benar.

## Guess the Blank — `word_blank`

```ts
config: { text: string; unit: 'letter' | 'word'; blanks: number[]; hint?: string; caseSensitive: boolean }
answer: { values: Record<string /*tokenIdx*/, string> }
```

- Token dibentuk seperti `wbTokens()` di prototipe: per huruf (per code point, jadi huruf beraksen dan emoji tidak terpotong; spasi menjadi jarak) atau per kata (dipisah spasi). Blank yang menunjuk spasi atau indeks di luar teks diabaikan (`activeBlanks()`).
- Nilai parsial per blank, dengan normalisasi yang sama dengan Isian Singkat.
- **Strip:** `tokens: ({ kind: 'text', text } | { kind: 'blank', length })[]`. Huruf/kata yang di-blank tidak pernah dikirim, hanya panjangnya.
- **Player:** satu kotak per huruf dengan auto-advance, Backspace mundur ke kotak sebelumnya, Enter mengirim. Kata yang lebih panjang dari layar HP boleh berlanjut ke baris berikutnya. Reveal menulis huruf yang benar di bawah kotak yang salah.

## Hotspot — `hotspot`

```ts
config: { image: MediaRef | null; aspect: number; spots: { id: string; x: number; y: number; r: number; label?: string }[]; maxClicks: number | null }
answer: { clicks: { x: number; y: number }[] }   // koordinat dalam persen gambar
```

- `x`/`y` dalam persen lebar/tinggi gambar, `r` dalam persen **lebar**. `aspect` (tinggi/lebar) diukur editor saat gambar diunggah, sehingga jarak vertikal dihitung dalam satuan yang sama dan lingkaran tetap bulat di gambar yang tidak persegi.
- **Bug prototipe:** klik yang meleset tidak dibatasi, jadi peserta bisa mengklik seluruh gambar untuk mendapat nilai penuh. Aturan baru: `maxClicks` default (null) = jumlah titik, klik di luar jatah diabaikan, dan nilai = (titik ditemukan − klik meleset, min 0) / jumlah titik. Klik ulang pada titik yang sudah ditemukan tidak dihitung meleset.
- **Validasi:** gambar ada, minimal satu titik, dan `maxClicks` tidak lebih kecil dari jumlah titik.
- **Strip:** kirim `image`, `aspect`, `spotCount`, dan jatah klik. `spots` tidak pernah dikirim.
- **Player:** klik/ketuk untuk menandai, ketuk penanda untuk menghapus. Keyboard: fokus ke gambar, panah menggerakkan penanda silang, Enter menandai. **Editor:** klik gambar untuk menambah titik, panah menggeser titik yang dipilih, Delete menghapus.

## Branching Story — `branching`

```ts
config: {
  startId: string;
  scoring: 'ending' | 'choices';
  nodes: { id: string; text: string; media?: MediaRef; x: number; y: number;
           ending: { label: string; score: number /*0..1*/ } | null;
           choices: { id: string; text: string; targetId: string | null; correct: boolean }[] }[];
}
answer: { path: string[] /*choiceId berurutan*/ }
```

- Prototipe menilai `pilihan benar / pilihan yang diambil`, sehingga jalur buruk yang pendek bisa bernilai setara dengan jalur baik yang panjang. Default sekarang **`ending`**: nilai = `ending.score` dari akhir yang dicapai. `choices` tetap tersedia, dan setiap pilihan hanya dihitung sekali supaya berputar di pilihan benar tidak menaikkan nilai.
- Server menelusuri ulang `path` dari node awal (`walkStory()`). Jalur yang tidak sah atau belum sampai akhir bernilai 0.
- **Validasi** (diambil dari prototipe, ditambah satu): node awal ada dan bukan akhir cerita, minimal satu akhir, tidak ada jalan buntu, tidak ada pilihan tanpa tujuan, semua node bisa dijangkau, dan **dari setiap node cerita masih bisa sampai ke akhir** (tidak terjebak di putaran). Mode `ending` butuh minimal satu akhir bernilai > 0, dan mode `choices` butuh minimal satu pilihan benar.
- **Strip:** hapus `correct`, `ending.score`, dan posisi kanvas. Pilihan tanpa tujuan tidak dikirim. Untuk latihan seluruh graf dikirim. Di ujian node dikirim bertahap (P4-07b): `stripAnswers` dengan `storyPath` hanya menyertakan node awal dan node di sepanjang jalur itu, dan player meminta node berikutnya lewat `storyStepAction` (jalur divalidasi dengan `walkStory`).
- **Editor:** flowchart React Flow (dimuat terpisah dari player) dengan node yang bisa digeser, seret titik pilihan ke node mana pun untuk menyambung, garis bezier, penanda awal dan akhir, serta mode layar penuh. Semua hal juga bisa dilakukan lewat formulir di bawah kanvas (pilih tujuan, "+ Node baru"), jadi editor tetap bisa dipakai dengan keyboard.
- **Player:** node satu per satu, dengan tombol **Mundur** dan **Dari awal** sebelum dikirim. Jawaban baru tercatat setelah sampai di akhir cerita. Reveal menampilkan jejak pilihan dan nilai akhir.

## Esai — `essay`

```ts
config: {
  minWords: number | null;
  maxWords: number | null;
  rubric: {
    id: string;
    criterion: string;
    points: number;
  }
  [];
  guide: string;
}
answer: {
  text: string;
} // maks. 20.000 karakter
```

- `capabilities.manualGrading = true`. `score()` selalu 0/0; server menyimpan `responses.correct = null` (menunggu penilaian) dan peserta melihat "Guru akan menilai jawaban ini".
- **Rubrik:** maks. 10 kriteria, masing-masing 1–100 poin. Guru memilih 0..poin per kriteria; rasio = Σ skor / Σ poin (`rubricRatio`), lalu `grade_response` menghitung poin soal = `round(points × rasio)`. Tanpa rubrik, guru memberi persentase.
- `guide` (panduan atau contoh jawaban) hanya untuk guru, dan tampil ke peserta saat review jika kunci jawaban ditampilkan.
- **Validasi:** `minWords ≤ maxWords`, kriteria rubrik tidak kosong.
- **Strip:** hanya `minWords` dan `maxWords`. Rubrik dan panduan tidak pernah dikirim ke peserta.
- **Player:** textarea dengan penghitung kata (peringatan di luar batas, tetapi tetap bisa dikirim). **Penilaian:** antrean per soal di `/quizzes/[id]/exams/[examId]/grading`.

---

## Bank soal

✅ P8-12. Setiap soal punya `tags`, dan satu guru memakai satu kosakata tag untuk semua quiznya.

- **Ambil dari bank soal** (di bawah "Tambah soal" di editor, [`QuestionBankDialog.tsx`](../src/components/editor/QuestionBankDialog.tsx)): cari soal dari **quiz-quiz lain milik guru yang sama** berdasarkan teks pertanyaan, tipe, dan tag (bisa beberapa tag sekaligus = harus punya semuanya). Soal yang dipilih **disalin** ke akhir quiz yang sedang diedit dengan ID baru, jadi mengubah salinan tidak mengubah aslinya. Sumbernya adalah draf soal, termasuk quiz yang belum terbit.
- **Saran tag:** kolom Tag di panel properti menyarankan tag yang sudah dipakai di semua quiz guru (`my_question_tags()`, urut dari yang paling sering), supaya "kelas-8" tidak berubah menjadi "kls 8" di quiz lain.
- Pencarian memakai query biasa di bawah RLS (hanya quiz milik sendiri) dengan indeks GIN pada `questions.tags` ([`…_question_bank.sql`](../supabase/migrations/20261001500000_question_bank.sql)). Server Action: [`bank-actions.ts`](<../src/app/(dashboard)/quizzes/bank-actions.ts>).
- **Pool soal ujian** (`policy.questionPool.tags`, [08](08-mode-exam.md)) tetap mengambil dari soal quiz ujian itu sendiri, karena ujian memakai snapshot satu versi quiz. Untuk ujian dari banyak topik: kumpulkan soalnya dulu lewat bank soal ke satu quiz, lalu pakai pool dengan filter tag.

## Generate soal dengan AI

✅ P8-10. Tombol **Buat dengan AI** di editor (hanya muncul jika server punya `GEMINI_API_KEY`).

- **Sumber:** topik, teks yang ditempel (maks. 60.000 karakter), atau PDF (maks. 10 MB, dikirim sebagai dokumen ke model). Guru memilih jumlah soal (5–20), tingkat ("Kelas 5 SD"), dan tipe: Pilihan Ganda, Benar/Salah, Isian Singkat, Angka, Urutkan, Odd One Out.
- **Model:** Gemini Flash `gemini-3.8-flash`, dengan cadangan `gemini-3.7-flash`: jika model pertama membalas 503 (sedang ramai), 429 (kuota model habis), 500, atau 504, model berikutnya dicoba. Urutannya bisa diganti lewat env `GEMINI_MODEL` (dipisah koma), misalnya saat Google memensiunkan model. Dipanggil lewat `@google/genai` (`models.generateContent`, tanpa riwayat yang disimpan di Google), thinking default model. **Structured output:** skema Zod ([`src/lib/ai-questions.ts`](../src/lib/ai-questions.ts)) diubah ke JSON Schema (`geminiJsonSchema`, `responseJsonSchema`), satu objek datar per soal. Jawaban tetap di-parse ulang dengan skema Zod; yang tidak cocok ditampilkan sebagai "tidak bisa dibaca". Server action: [`ai-actions.ts`](<../src/app/(dashboard)/quizzes/ai-actions.ts>). Diblokir pengaman (`SAFETY`, `PROHIBITED_CONTENT`, dll.) atau terpotong (`MAX_TOKENS`) ditampilkan sebagai pesan yang jelas.
- **Prompt:** Bahasa Indonesia, satu jawaban benar yang tidak ambigu, distraktor masuk akal, fakta hanya dari bahan jika bahan diberikan, dan bahan diperlakukan sebagai data, bukan perintah (dibungkus `<bahan>`).
- **Wajib ditinjau:** hasilnya tidak langsung disimpan. Dialog menampilkan setiap soal beserta jawabannya dengan kotak centang. Soal yang dipilih masuk ke **draf** dan harus di-publish guru seperti biasa. Soal yang tidak lolos `validateQuestion` (misalnya tanpa kunci atau opsi kurang) dibuang lebih dulu dan jumlahnya disebutkan.
- **Batas biaya:** maksimal `AI_DAILY_LIMIT` (default 20) generate per guru per 24 jam, dicatat di `ai_generations` beserta jumlah token (output termasuk token thinking). Guru hanya bisa menambah baris, tidak bisa menghapus, jadi kuota tidak bisa di-reset. Server action berjalan maksimal 180 detik (`maxDuration` halaman editor): model pertama dicoba dua kali, masing-masing maks. 55 detik, lalu model cadangan, dengan total maks. 165 detik.
- **Privasi:** teks dan PDF dikirim ke Gemini API hanya untuk permintaan itu, dan dialog memberi tahu guru. Pakai kunci dari project dengan **billing aktif** (tier berbayar): di tier gratis, Google boleh memakai input untuk meningkatkan produknya dan peninjau manusia bisa membacanya.
- **Ketentuan usia Gemini API:** ketentuan Google melarang pemakaian layanan sebagai bagian dari aplikasi yang ditujukan atau kemungkinan diakses pengguna di bawah 18 tahun. Fitur ini hanya untuk guru, tetapi platformnya dipakai murid; periksa ketentuan ini sebelum mengaktifkan `GEMINI_API_KEY` di produksi.
- Error API dipetakan dari status HTTP `ApiError` (503, 429, 401/403, 400/PDF rusak, lainnya), timeout, dan koneksi ke pesan berbahasa Indonesia yang menyertakan kodenya (misalnya "kode 503"). Pesan asli dari Google dicatat di log server sebagai `AI generation failed <kode> <pesan>`.
- `/playground/editor` memakai generator palsu, jadi UI bisa dicoba tanpa kunci API.

## Impor & ekspor

✅ P8-13. Tombol spreadsheet di header editor: **Impor dari Excel / CSV**, **Ekspor ke Excel (.xlsx)**, **Ekspor ke CSV**, dan **Unduh template**. Semuanya berjalan di browser ([`src/components/editor/SheetMenu.tsx`](../src/components/editor/SheetMenu.tsx)). Soal hasil impor ditambahkan di akhir draf dan ikut tersimpan lewat autosave seperti editan biasa. Konversi murni ada di [`src/lib/question-sheet.ts`](../src/lib/question-sheet.ts) (diuji bolak-balik untuk semua tipe, termasuk lewat file .xlsx sungguhan).

Satu baris = satu soal. Kolom: `Tipe`, `Pertanyaan`, `Opsi 1`–`Opsi 6`, `Jawaban`, `Waktu (detik)`, `Poin`, `Penjelasan`, `Tag` (pisahkan dengan koma), `Data lanjutan (JSON)`. Judul kolom tidak peka huruf besar/kecil, dan kolom opsional boleh tidak ada.

| Tipe (kolom Tipe)                  | Opsi                         | Jawaban                                                     |
| ---------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `pilihan_ganda`                    | pilihan jawaban              | nomor opsi benar (`2`), atau beberapa (`1,3`) = pilih semua |
| `benar_salah`                      | –                            | `Benar` / `Salah`                                           |
| `isian`                            | –                            | jawaban yang diterima, dipisah `\|` (`Soekarno \| Sukarno`) |
| `angka`                            | –                            | `3,5` atau dengan toleransi `12,5 ± 0,5`                    |
| `urutkan`                          | item dalam urutan yang benar | –                                                           |
| `odd_one_out`                      | item                         | nomor item yang berbeda                                     |
| `esai`                             | –                            | panduan penilaian (opsional)                                |
| tipe lain (`matching`, `hotspot`…) | –                            | hanya lewat kolom Data lanjutan                             |

- Tipe juga bisa ditulis dengan kunci internal (`multiple_choice`) atau label editor ("Pilihan Ganda").
- **Data lanjutan (JSON)** berisi `{ config, media, help }`. Ekspor mengisinya hanya jika kolom biasa tidak cukup: media pada soal/opsi, rubrik esai, satuan angka, isian peka huruf besar, lebih dari 6 opsi, atau tipe lanjutan. Dengan begitu hasil ekspor selalu bisa diimpor kembali tanpa ada yang hilang. Saat impor, `config` divalidasi dengan `configSchema` tipe terkait.
- CSV: UTF-8 dengan BOM, pemisah `,`, `;` (Excel berbahasa Indonesia), atau tab dideteksi dari baris judul. Sel yang diawali `= + - @` diberi `'` saat ekspor (CSV injection), dan tanda itu dibuang lagi saat impor.
- Baris yang tidak bisa dibaca dilewati, dan dialog menampilkan nomor baris beserta alasannya sebelum soal ditambahkan. Maksimal 500 soal dan 5 MB per file.
- Library `write-excel-file` / `read-excel-file` hanya dimuat saat tombolnya dipakai.

---

## Menambah tipe soal baru (checklist)

1. Buat `src/questions/<tipe>/` berisi `definition.ts` (murni), `definition.test.ts`, `Editor.tsx`, dan `Player.tsx`.
2. Di `definition.test.ts`, uji kasus benar, salah, parsial, dan jawaban kosong/tidak valid, serta hasil `stripAnswers`.
   Isi `capabilities.modes`, dan beri `capabilities.notes` untuk setiap mode ⚠️ (idealnya juga untuk mode yang tidak didukung).
3. Daftarkan definisi di `registry.ts` dan UI-nya di `ui.tsx`.
4. Tambahkan field kunci jawabannya ke `ANSWER_KEYS` di `registry.test.ts`. Test kontrak bersama akan memastikan field itu tidak pernah bocor.
5. Tambahkan baris di matriks kapabilitas dokumen ini.
