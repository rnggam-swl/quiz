# P1 · Builder MVP

**Tujuan:** guru bisa login, membuat quiz dengan 5 tipe soal, mengunggah media, dan mem-publish quiz (snapshot versi).
**Referensi:** [03-data-model](../../docs/03-data-model.md), [04-question-types](../../docs/04-question-types.md), [05-design-system](../../docs/05-design-system.md), prototipe (editor mode quiz)

## Database

- [ ] **P1-01** Migrasi: enum, `profiles`, `quizzes`, `questions`, `quiz_versions` + trigger `updated_at`.
- [ ] **P1-02** Trigger pembuatan `profiles` saat user mendaftar.
- [ ] **P1-03** RLS: pemilik bisa CRUD quiz, soal, dan versi miliknya. Tidak ada akses publik ke `questions` dan `quiz_versions`.
- [ ] **P1-04** Storage bucket `quiz-media`: path `{owner_id}/{quiz_id}/…`, batas MIME (`image/*`, `audio/*`) dan ukuran (gambar 5MB, audio 10MB), RLS per pemilik.

## Auth & dashboard

- [ ] **P1-05** Login / daftar dengan email + Google (Supabase Auth), plus `src/proxy.ts` (pengganti `middleware` di Next.js 16) untuk refresh sesi Supabase dan proteksi route dashboard.
- [ ] **P1-06** Dashboard daftar quiz: kartu (cover, judul, jumlah soal, terakhir diubah), buat baru, duplikat, hapus (dengan konfirmasi), dan pencarian.

## Registry & tipe soal

- [ ] **P1-07** `questions/types.ts` + `registry.ts` sesuai kontrak `QuestionType`.
- [ ] **P1-08** Tipe `multiple_choice` (tunggal & banyak): schema, score (nilai parsial untuk banyak), validate, strip (acak dengan seed), Editor, Player, test.
- [ ] **P1-09** Tipe `true_false`: lengkap + test.
- [ ] **P1-10** Tipe `short_answer`: normalisasi, daftar jawaban diterima, `fuzzy` Levenshtein + test.
- [ ] **P1-11** Tipe `number`: nilai + toleransi + satuan + test.
- [ ] **P1-12** Tipe `matching`: model `left`/`right`/`pairs` (one-to-many), Editor Item List / Pair List (lihat `renderMatchEditor` prototipe), Player dengan garis bezier (`matchDrawLines`), score + strip + test.

## Editor

- [ ] **P1-13** Shell editor 3 panel: sidebar daftar soal · canvas editor · panel properti (lihat `.qlist-*`, `.qed-*` di prototipe).
- [ ] **P1-14** Store Zustand untuk dokumen quiz + **autosave** (debounce 800ms, indikator "Tersimpan / Menyimpan… / Gagal, coba lagi").
- [ ] **P1-15** Sidebar: tambah soal (pilih tipe), urutkan dengan drag (dnd-kit), duplikat, hapus, nomor dan ikon tipe.
- [ ] **P1-16** Canvas: judul soal, teks bantuan, media soal (upload gambar/audio + `alt`), lalu editor spesifik tipe.
- [ ] **P1-17** Panel properti: ganti tipe soal (dengan konfirmasi jika data akan hilang), batas waktu, poin, penjelasan, tag.
- [ ] **P1-18** Panel Desain quiz: judul, deskripsi, cover, preset tema + warna kustom (dari `THEME_PRESETS` prototipe).
- [ ] **P1-19** Shortcut keyboard: `Ctrl+Enter` tambah soal, `Alt+↑/↓` pindah soal, `Ctrl+D` duplikat.
- [ ] **P1-20** Preview: memainkan quiz di dalam editor memakai komponen Player. Penilaian di klien untuk preview saja, tanpa menyimpan data.

## Publish

- [ ] **P1-21** Validasi publish: `validate()` per soal + validasi tingkat quiz (minimal 1 soal, judul terisi). Tampilkan daftar masalah yang bisa diklik dan langsung melompat ke soal terkait (pengganti `alert()` di prototipe).
- [ ] **P1-22** Aksi publish: buat `quiz_versions` (snapshot), update `latest_version`, buat `slug` jika belum ada. Tampilkan badge "Ada perubahan belum di-publish".

## Test

- [ ] **P1-23** E2E: daftar → buat quiz → tambah 5 tipe soal → publish.

## Definition of Done

- Guru bisa membuat quiz 10 soal (campuran 5 tipe) dan mem-publish-nya.
- Semua tipe soal punya test `score` & `stripAnswers` yang lulus, termasuk test bahwa kunci jawaban tidak ada di output strip.
- Refresh halaman editor tidak menghilangkan perubahan apa pun (autosave).
- Editor bisa dipakai penuh dengan keyboard untuk alur utama.
