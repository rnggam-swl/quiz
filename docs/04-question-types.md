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

Editor menyembunyikan atau menonaktifkan tipe yang tidak didukung mode sesi yang dipilih. Saat membuat sesi, soal yang tidak kompatibel dilaporkan dan bisa dilewati.

## Konvensi umum

- Setiap item atau opsi punya `id` stabil (`nanoid`), **bukan indeks**. Ini memungkinkan pengacakan tanpa kehilangan pemetaan jawaban. Prototipe masih memakai indeks dan perlu diubah.
- Semua teks item boleh punya `media?: MediaRef` (gambar atau audio), seperti lampiran di prototipe.
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
config: {
  min: number;
  max: number;
  step: number;
  value: number;
  tolerance: number;
  partial: boolean;
}
answer: {
  value: number;
}
```

Jika `partial`: `ratio = max(0, 1 − |selisih| / (max − min) × 2)`.

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

- **Validasi:** minimal 3 item. `reason` ditampilkan saat reveal.

## Sequencing — `sequencing`

```ts
config: { items: Item[] }          // urutan di config = urutan benar
answer: { orderedIds: string[] }
```

- Prototipe menilai per posisi persis, sehingga satu item yang tergeser bisa membuat hampir semua posisi salah. Usulan: nilai = **pasangan berurutan yang benar** (`A→B`, `B→C`, …) / `(n−1)`. Pilihan metode dibuat sebagai opsi `scoring: 'position' | 'adjacent'`.
- **Strip:** acak dengan seed dan pastikan hasil acak ≠ urutan benar.

## Grouping — `grouping`

```ts
config: { groups: { id: string; name: string }[]; items: (Item & { groupId: string })[] }
answer: { placement: Record<string /*itemId*/, string /*groupId*/> }
```

- **Validasi:** minimal 2 grup, dan setiap grup berisi minimal 1 item.

## Guess the Blank — `word_blank`

```ts
config: { text: string; unit: 'letter' | 'word'; blanks: number[]; hint?: string; caseSensitive: boolean }
answer: { values: Record<number /*tokenIdx*/, string> }
```

- Token dibentuk seperti `wbTokens()` di prototipe: per huruf, atau per kata (dipisah spasi).
- **Strip:** kirim token yang bukan blank, plus panjang tiap blank. Huruf yang di-blank tidak dikirim.

## Hotspot — `hotspot`

```ts
config: { image: MediaRef; spots: { id: string; x: number; y: number; r: number; label?: string }[]; maxClicks?: number }
answer: { clicks: { x: number; y: number }[] }   // koordinat dalam persen gambar
```

- **Bug prototipe:** klik yang meleset tidak dibatasi, jadi peserta bisa mengklik seluruh gambar untuk mendapat nilai penuh. Aturan baru: `maxClicks` default = `spots.length`, klik di luar jatah diabaikan, dan nilai = spot ditemukan − klik meleset (min 0) / jumlah spot.
- **Strip:** hapus `spots`, kirim jumlahnya saja.

## Branching Story — `branching`

```ts
config: {
  startId: string;
  nodes: { id: string; text: string; media?: MediaRef; x: number; y: number;
           ending?: { label: string; score: number /*0..1*/ };
           choices: { id: string; text: string; targetId: string; correct: boolean }[] }[];
}
answer: { path: string[] /*choiceId berurutan*/ }
```

- Prototipe menilai `pilihan benar / pilihan yang diambil`, sehingga jalur buruk yang pendek bisa bernilai setara dengan jalur baik yang panjang. Usulan: nilai ditentukan oleh **ending yang dicapai** (`ending.score`), dengan penilaian per pilihan sebagai opsi.
- Server memvalidasi bahwa `path` adalah jalur yang sah di graf.
- **Strip:** hapus `correct` dan `ending.score`. Node dikirim bertahap (hanya node yang sudah dicapai) untuk ujian. Untuk latihan, seluruh graf boleh dikirim.
- Validasi publish diambil dari prototipe: node awal harus ada, harus ada ending, tidak boleh ada jalan buntu, tidak boleh ada pilihan tanpa target, dan semua node harus bisa dijangkau.

## Esai — `essay`

```ts
config: { minWords?: number; maxWords?: number; rubric?: { criterion: string; points: number }[] }
answer: { text: string }
```

- `capabilities.manualGrading = true`. `responses.correct` bernilai `null` sampai guru menilai.

---

## Menambah tipe soal baru (checklist)

1. Buat `src/questions/<tipe>/` berisi `definition.ts` (murni), `definition.test.ts`, `Editor.tsx`, dan `Player.tsx`.
2. Di `definition.test.ts`, uji kasus benar, salah, parsial, dan jawaban kosong/tidak valid, serta hasil `stripAnswers`.
3. Daftarkan definisi di `registry.ts` dan UI-nya di `ui.tsx`.
4. Tambahkan field kunci jawabannya ke `ANSWER_KEYS` di `registry.test.ts`. Test kontrak bersama akan memastikan field itu tidak pernah bocor.
5. Tambahkan baris di matriks kapabilitas dokumen ini.
