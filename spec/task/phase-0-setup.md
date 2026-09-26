# P0 · Setup & Fondasi

**Tujuan:** repo siap dikembangkan dengan tooling, Supabase lokal, dan pipeline CI.
**Referensi:** [02-architecture](../../docs/02-architecture.md)

## Task

- [ ] 🚧 **P0-01** Pisahkan repo: `git init` di folder `quiz/`. Saat ini folder ini berada di dalam repo git `C:\Users\meina`, sehingga riwayatnya tercampur dengan project lain. Buat remote baru di GitHub.
  - ✅ Repo lokal sendiri (branch `main`).
  - ⏳ Remote GitHub belum dibuat, menunggu keputusan nama repo dan visibilitas (private/public).
- [x] **P0-02** Scaffold Next.js (App Router, TypeScript, Tailwind, ESLint, `src/`), dengan package manager pnpm.
  - Next.js 16.3.6 (Turbopack), React 19.2, Tailwind 4, pnpm 11. `AGENTS.md` bawaan Next.js dipertahankan dan ditambah catatan project.
- [x] **P0-03** Tambahkan Prettier, `lint-staged` + Husky (lint & format saat commit), dan `tsconfig` strict.
  - `tsconfig`: `strict` + `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Prettier memakai `prettier-plugin-tailwindcss` untuk urutan class.
- [x] **P0-04** Buat struktur folder sesuai dokumen arsitektur: `questions/`, `engine/`, `components/{editor,player,ui}`, `lib/`.
- [ ] 🚧 **P0-05** Setup Supabase CLI: `supabase init`, jalankan lokal (`supabase start`), buat project cloud (staging).
  - ✅ Supabase CLI 2.117 sebagai devDependency, `supabase init` selesai (`supabase/config.toml`, `site_url` diarahkan ke `http://localhost:3000`).
  - ↪️ Docker terlalu berat untuk mesin ini, jadi development memakai **Supabase cloud** (project `itqwtzazzbwgiapwbpmy`) lewat `pnpm db:link` + `pnpm db:push`. Test SQL/RLS jalan di PGlite. `supabase start` tetap opsional bagi yang punya Docker, dan CI memakainya.
  - ⏳ Project cloud (staging) belum dibuat, menunggu persetujuan.
- [x] **P0-06** `lib/supabase/`: client browser, client server (cookies, `@supabase/ssr`), dan client `service_role` (khusus server, dengan guard `server-only`).
  - `client.ts`, `server.ts`, `admin.ts`. Env divalidasi Zod di `lib/env.ts` (publik) dan `lib/env.server.ts` (secret key). Memakai key baru Supabase (`publishable` / `secret`). Key lama `anon` / `service_role` juga diterima.
- [x] **P0-07** Generate tipe DB (`supabase gen types typescript`) + script `pnpm db:types`.
  - `pnpm db:types` kini generate dari project cloud yang ter-link (`--linked`). Tipe resmi sudah menggantikan versi tulisan tangan; hanya dua argumen RPC opsional yang perlu disesuaikan.
- [x] **P0-08** Setup Vitest (unit) dan Playwright (E2E), masing-masing dengan satu test contoh.
  - Vitest 5: 25 test (`seed-random`, `color`, `cn`). Playwright 1.63: 2 test home × 2 project (desktop + Pixel 7), semuanya lolos.
- [x] **P0-09** CI GitHub Actions: install → lint → typecheck → unit test → build. E2E dijalankan terhadap Supabase lokal di job terpisah.
  - `.github/workflows/ci.yml`. Belum terverifikasi karena belum ada remote. Akan berjalan otomatis setelah push pertama.
- [x] **P0-10** Token design system dasar di `globals.css` + konfigurasi Tailwind (warna editor, warna opsi jawaban, radius, font DM Sans/DM Mono). Lihat [05-design-system](../../docs/05-design-system.md).
  - Mode terang/gelap, warna opsi jawaban sudah dikoreksi agar lolos WCAG AA (dijaga oleh test), dan `prefers-reduced-motion` dihormati.
- [x] **P0-11** Komponen `ui/` dasar: Button, Input, Textarea, Select, Toggle, Dialog, Toast, Tooltip.
  - Toggle bernama `Switch` (Radix). Select memakai `<select>` native. Toast memakai Sonner. Semua bisa dilihat di `/playground` (hanya development).
- [x] **P0-12** Komponen `player/Button3D` (tombol pill 3D dari prototipe).
  - Warna teks dipilih otomatis sesuai kontras (`readableTextColor`). Ditambah `player/AnswerShape` (warna + bentuk opsi jawaban).
- [x] **P0-13** `lib/seed-random.ts`: PRNG dengan seed (mis. mulberry32) + `shuffle(arr, seed)`, beserta unit test determinisme.
  - Ditambah `shuffleAvoidingIdentity` (untuk Sequencing) dan `sample` (untuk bank soal).
- [ ] **P0-14** Deploy staging (Vercel) yang terhubung ke Supabase staging. Env var didokumentasikan di `.env.example`.
  - ✅ `.env.example` lengkap.
  - ⏳ Deploy menunggu remote GitHub, project Supabase cloud, dan persetujuan.

## Definition of Done

- [ ] `pnpm dev` jalan dengan Supabase. Target diubah ke Supabase cloud; menunggu key di `.env.local` dan `pnpm db:push`.
- [ ] CI hijau di branch utama. Menunggu remote.
- [ ] Staging bisa diakses.
- [x] `.env.example` lengkap, dan tidak ada secret yang ter-commit.
