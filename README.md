# Quiz

Platform quiz interaktif gaya Wayground: editornya tenang untuk guru, player-nya seru untuk peserta. Satu konten quiz bisa dimainkan sebagai latihan, embed, ujian, live, atau battle (rebutan & battle royale).

- Desain produk & teknis: [`docs/`](docs/README.md)
- Task per fase: [`spec/task/`](spec/task/README.md)
- Prototipe referensi: [`spec/reference-html/`](spec/reference-html/formulir-builder-quiz-mode.html)

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, Realtime) · Zod 4 · Radix UI · Vitest · Playwright

## Mulai

Butuh Node.js 22+, pnpm (lewat `corepack enable`), dan Docker (untuk Supabase lokal).

```bash
pnpm install
cp .env.example .env.local
pnpm db:start          # Supabase lokal di Docker, cetak URL + key
pnpm dev               # http://localhost:3000
```

Isi `.env.local` dengan `API URL`, `Publishable key`, dan `Secret key` dari output `pnpm db:start` (atau `pnpm supabase status`). Halaman yang tidak memakai Supabase tetap jalan tanpa `.env.local`.

Khusus development:

- [`/playground`](http://localhost:3000/playground): galeri komponen dan token.
- [`/playground/editor`](http://localhost:3000/playground/editor): editor quiz lengkap dengan penyimpanan in-memory, jadi bisa dipakai tanpa Supabase. Tambahkan `?fail` ke URL untuk melihat perilaku saat penyimpanan gagal.

## Script

| Script                             | Fungsi                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`     | Next.js                                                                                |
| `pnpm lint`                        | ESLint                                                                                 |
| `pnpm typecheck`                   | `next typegen` + `tsc --noEmit`                                                        |
| `pnpm format` / `format:check`     | Prettier (+ urutan class Tailwind)                                                     |
| `pnpm test` / `test:watch`         | Vitest: `src/**/*.test.ts(x)` + migrasi/RLS di `supabase/tests` (PGlite, tanpa Docker) |
| `pnpm test:e2e`                    | E2E (Playwright), folder `e2e/`. Test yang butuh DB jalan jika `E2E_SUPABASE=1`        |
| `pnpm db:start` / `stop` / `reset` | Supabase lokal                                                                         |
| `pnpm db:types`                    | Generate `src/lib/supabase/database.types.ts` dari DB lokal                            |

Pre-commit hook (husky + lint-staged) menjalankan ESLint dan Prettier pada file yang di-stage.

## Struktur

```
src/
├─ proxy.ts        # refresh sesi Supabase + redirect ke /login
├─ app/            # route: /login, /quizzes, /quizzes/[id]/edit, /playground
├─ components/
│  ├─ ui/          # komponen dasar: Button, Input, Select, Switch, Dialog, DropdownMenu, Toast, Tooltip
│  ├─ player/      # Button3D, AnswerShape, AnswerTile
│  ├─ editor/      # QuizEditor: store, autosave, daftar soal, canvas, panel, pratinjau, publish
│  └─ host/        # header dashboard
├─ questions/      # Question Type Registry: definition.ts (murni) + Editor/Player per tipe
├─ engine/         # mode sesi: practice, exam, live, battle (P2+)
└─ lib/
   ├─ supabase/    # client browser/server/admin, proxy, upload, tipe DB
   ├─ auth.ts      # Data Access Layer (requireHost)
   ├─ quiz-data.ts # baris DB ↔ model editor, validasi autosave
   ├─ env.ts       # validasi env (Zod)
   ├─ seed-random.ts  # shuffle deterministik per seed
   └─ color.ts     # kontras WCAG, warna teks otomatis
supabase/          # config.toml, migrations/, tests/ (PGlite)
e2e/               # Playwright
```

# quiz
