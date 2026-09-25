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

Galeri komponen dan token ada di [`/playground`](http://localhost:3000/playground) (hanya di development).

## Script

| Script                             | Fungsi                                                      |
| ---------------------------------- | ----------------------------------------------------------- |
| `pnpm dev` / `build` / `start`     | Next.js                                                     |
| `pnpm lint`                        | ESLint                                                      |
| `pnpm typecheck`                   | `next typegen` + `tsc --noEmit`                             |
| `pnpm format` / `format:check`     | Prettier (+ urutan class Tailwind)                          |
| `pnpm test` / `test:watch`         | Unit test (Vitest), file `src/**/*.test.ts(x)`              |
| `pnpm test:e2e`                    | E2E (Playwright), folder `e2e/`                             |
| `pnpm db:start` / `stop` / `reset` | Supabase lokal                                              |
| `pnpm db:types`                    | Generate `src/lib/supabase/database.types.ts` dari DB lokal |

Pre-commit hook (husky + lint-staged) menjalankan ESLint dan Prettier pada file yang di-stage.

## Struktur

```
src/
├─ app/            # route (App Router)
├─ components/
│  ├─ ui/          # komponen editor: Button, Input, Select, Switch, Dialog, Toast, Tooltip
│  ├─ player/      # komponen player: Button3D, AnswerShape
│  └─ editor/      # shell editor (P1)
├─ questions/      # Question Type Registry (P1)
├─ engine/         # mode sesi: practice, exam, live, battle (P2+)
└─ lib/
   ├─ supabase/    # client browser, server, admin (secret key)
   ├─ env.ts       # validasi env (Zod)
   ├─ seed-random.ts  # shuffle deterministik per seed
   └─ color.ts     # kontras WCAG, warna teks otomatis
supabase/          # config.toml, migrations/
e2e/               # Playwright
```
