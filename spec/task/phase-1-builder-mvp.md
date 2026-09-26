# P1 · Builder MVP

**Tujuan:** guru bisa login, membuat quiz dengan 5 tipe soal, mengunggah media, dan mem-publish quiz (snapshot versi).
**Referensi:** [03-data-model](../../docs/03-data-model.md), [04-question-types](../../docs/04-question-types.md), [05-design-system](../../docs/05-design-system.md), prototipe (editor mode quiz)

> **Status verifikasi.** Logika murni, SQL/RLS (PGlite), dan UI editor (`/playground/editor`) sudah teruji. **E2E ke Supabase sungguhan lolos di [CI main](https://github.com/rnggam-swl/quiz/actions/runs/36205753359)**: daftar → buat quiz → tambah soal → autosave + reload → publish → badge "Terbit · v1". Yang masih 🚧 hanya bagian yang belum dicakup E2E: duplikat/hapus/cari di dashboard, upload ke Storage, dan Google login.

## Database

> ✅ Migrasi sudah diterapkan ke Supabase cloud `itqwtzazzbwgiapwbpmy` (`pnpm db:push`), dan hasilnya dicek lewat API: 9 tabel ada, anon ditolak membaca tabel, bucket `quiz-media` publik dengan batas yang benar.

- [x] **P1-01** Migrasi: enum, `profiles`, `quizzes`, `questions`, `quiz_versions` + trigger `updated_at`.
  - [`supabase/migrations/20260926000000_content.sql`](../../supabase/migrations/20260926000000_content.sql). Ditambah `draft_revision`/`published_revision` untuk optimistic lock dan status "ada perubahan", RPC `save_quiz_draft` & `publish_quiz`, serta check constraint panjang teks.
- [x] **P1-02** Trigger pembuatan `profiles` saat user mendaftar. User anonim (peserta, P2) sengaja tidak dibuatkan profil.
- [x] **P1-03** RLS: pemilik bisa CRUD quiz, soal, dan versi miliknya. Tidak ada akses publik ke `questions` dan `quiz_versions`.
  - 18 test di [`supabase/tests/content.test.ts`](../../supabase/tests/content.test.ts) (PGlite + shim Supabase): isolasi antar user, `anon` ditolak, versi tidak bisa diubah, pembajakan id soal milik quiz lain gagal, dan konflik revisi.
- [x] **P1-04** Storage bucket `quiz-media`: path `{owner_id}/{quiz_id}/…`, batas MIME (`image/*`, `audio/*`) dan ukuran (gambar 5MB, audio 10MB), RLS per pemilik.
  - Bucket publik (peserta anonim harus bisa memuat media). Server action juga menolak URL media di luar bucket ini. SVG sengaja tidak diizinkan.

## Auth & dashboard

- [x] **P1-05** Login / daftar dengan email + Google (Supabase Auth), plus `src/proxy.ts` (pengganti `middleware` di Next.js 16) untuk refresh sesi Supabase dan proteksi route dashboard.
  - ✅ Halaman `/login` (masuk/daftar), Server Actions, `/auth/callback` (PKCE), `proxy.ts`, dan DAL `requireHost()`. Redirect `/quizzes` → `/login?next=…` dan validasi form sudah dicek di browser.
  - ✅ Daftar dengan email + password ke Supabase sungguhan terbukti di E2E ([CI main](https://github.com/rnggam-swl/quiz/actions/runs/36205753359)).
  - ⏳ Google tersedia di balik `NEXT_PUBLIC_AUTH_GOOGLE=true` dan perlu kredensial OAuth, belum diuji. Reset password dipindah ke P8.
- [ ] 🚧 **P1-06** Dashboard daftar quiz: kartu (cover, judul, jumlah soal, terakhir diubah), buat baru, duplikat, hapus (dengan konfirmasi), dan pencarian.
  - ✅ Buat quiz dan status "Terbit · v1" terbukti di E2E. ⏳ Duplikat, hapus, dan pencarian belum dicakup E2E.

## Registry & tipe soal

- [x] **P1-07** `questions/types.ts` + `registry.ts` sesuai kontrak `QuestionType`.
  - Kontraknya dipecah: `definition.ts` (murni, aman untuk server) + `Editor.tsx`/`Player.tsx` (klien, di `ui.tsx`). Test kontrak bersama di `registry.test.ts` memastikan kunci jawaban tidak pernah bocor.
- [x] **P1-08** Tipe `multiple_choice` (tunggal & banyak): schema, score (nilai parsial untuk banyak), validate, strip (acak dengan seed), Editor, Player, test.
  - Maksimal 5 opsi (satu per warna + bentuk). Pilihan tunggal langsung terjawab saat diketuk.
- [x] **P1-09** Tipe `true_false`: lengkap + test.
- [x] **P1-10** Tipe `short_answer`: normalisasi, daftar jawaban diterima, `fuzzy` Levenshtein + test.
- [x] **P1-11** Tipe `number`: nilai + toleransi + satuan + test. Input menerima koma desimal (`3,5`).
- [x] **P1-12** Tipe `matching`: model `left`/`right`/`pairs` (one-to-many), Editor Item List / Pair List (lihat `renderMatchEditor` prototipe), ~~Player dengan garis bezier~~, score + strip + test.
  - Player memakai "ketuk kiri → ketuk kanan" dengan penanda bentuk + warna yang sama, bukan garis bezier, supaya nyaman di HP dan proyektor. Ada juga pengecoh (pasangan tanpa item).

## Editor

- [x] **P1-13** Shell editor 3 panel: sidebar daftar soal · canvas editor · panel properti (lihat `.qlist-*`, `.qed-*` di prototipe).
- [x] **P1-14** Store Zustand untuk dokumen quiz + **autosave** (debounce 800ms, indikator "Tersimpan / Menyimpan… / Gagal, coba lagi").
  - `autosaver.ts`: satu request berjalan, backoff saat gagal, berhenti saat konflik (banner "Muat ulang"), peringatan saat menutup tab. Ada 6 test dengan fake timers.
- [x] **P1-15** Sidebar: tambah soal (pilih tipe), urutkan dengan drag (dnd-kit, juga keyboard), duplikat, hapus (dengan **Batalkan**), nomor dan ikon tipe.
- [x] **P1-16** Canvas: judul soal, teks bantuan, media soal (upload gambar/audio + `alt`), lalu editor spesifik tipe.
  - ⏳ Upload ke Supabase Storage belum diuji. Di playground, upload memakai object URL.
- [x] **P1-17** Panel properti: ganti tipe soal (dengan konfirmasi jika data akan hilang), batas waktu, poin, penjelasan, tag.
- [x] **P1-18** Panel Desain quiz (tab "Quiz"): judul, deskripsi, cover, preset tema + warna kustom (dari `THEME_PRESETS` prototipe, warna teks otomatis).
- [x] **P1-19** Shortcut keyboard: `Ctrl+Enter` tambah soal, `Alt+↑/↓` pindah soal, `Ctrl+D` duplikat, `Ctrl+S` simpan sekarang.
- [x] **P1-20** Preview: memainkan quiz di dalam editor memakai komponen Player. Penilaian di klien untuk preview saja, tanpa menyimpan data.
  - Sudah dicoba sampai ringkasan skor. Perbaikan yang ditemukan saat uji: Enter untuk mengirim tidak lagi ikut menekan tombol "Lanjut", dan opsi yang tidak dipilih kini diredupkan saat reveal.

## Publish

- [x] **P1-21** Validasi publish: `validate()` per soal + validasi tingkat quiz (minimal 1 soal, judul terisi). Tampilkan daftar masalah yang bisa diklik dan langsung melompat ke soal terkait (pengganti `alert()` di prototipe).
  - Field yang bermasalah disorot merah dan soalnya diberi tanda di daftar. Server memvalidasi ulang draf tersimpan sebelum snapshot.
- [x] **P1-22** Aksi publish: buat `quiz_versions` (snapshot), update `latest_version`, buat `slug` jika belum ada. Tampilkan badge "Ada perubahan belum di-publish".
  - ✅ RPC teruji di PGlite, dan alur penuh ke Supabase terbukti di E2E CI.

## Test

- [x] **P1-23** E2E: daftar → buat quiz → tambah soal → autosave + reload → publish.
  - [`e2e/builder.spec.ts`](../../e2e/builder.spec.ts) memakai 2 tipe (Pilihan Ganda, Benar/Salah). Test ini hanya jalan jika `E2E_SUPABASE=1` (otomatis di CI). Kelima tipe sudah dicoba manual di `/playground/editor`.

## Definition of Done

- [x] Guru bisa membuat quiz 10 soal (campuran 5 tipe) dan mem-publish-nya. Lima tipe dan publish terbukti di playground; alur simpan + publish ke Supabase terbukti di E2E CI.
- [x] Semua tipe soal punya test `score` & `stripAnswers` yang lulus, termasuk test bahwa kunci jawaban tidak ada di output strip.
- [x] Refresh halaman editor tidak menghilangkan perubahan apa pun (autosave). Terbukti di E2E CI (reload lalu soal masih ada).
- [x] Editor bisa dipakai penuh dengan keyboard untuk alur utama.
