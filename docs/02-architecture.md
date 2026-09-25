# 02 · Arsitektur

## Stack

| Lapisan         | Pilihan                                                     | Alasan                                                               |
| --------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Framework       | **Next.js (App Router) + TypeScript**                       | Server Actions untuk penilaian di server, route terpisah untuk embed |
| Styling         | **Tailwind CSS** + CSS variables untuk tema                 | Token design system mudah dipetakan                                  |
| Database & Auth | **Supabase** (Postgres, Auth, Storage)                      | RLS, RPC, anonymous sign-in untuk peserta                            |
| Realtime        | **Supabase Realtime** (Broadcast + Presence)                | Cukup untuk skala kelas, tanpa server WebSocket sendiri              |
| Validasi        | **Zod**                                                     | Satu skema untuk tipe TS, validasi editor, dan validasi server       |
| Drag & drop     | **dnd-kit**                                                 | Aksesibel, mendukung sentuhan                                        |
| Animasi         | **Framer Motion**, **canvas-confetti**                      | Feedback yang seru di player                                         |
| State editor    | **Zustand**                                                 | State dokumen quiz dan autosave                                      |
| Test            | **Vitest** (unit, terutama `score()`), **Playwright** (E2E) |                                                                      |

## Struktur folder

```
quiz/
├─ docs/                      # dokumentasi ini
├─ spec/
│  ├─ reference-html/         # prototipe HTML (referensi visual & interaksi)
│  └─ task/                   # task per fase
├─ supabase/
│  ├─ migrations/             # DDL, RLS, RPC
│  └─ seed.sql
└─ src/
   ├─ app/
   │  ├─ (auth)/              # login, register
   │  ├─ (dashboard)/         # daftar quiz, laporan
   │  │  └─ quizzes/[id]/edit # editor
   │  ├─ join/                # masukkan kode
   │  ├─ play/[sessionCode]/  # player latihan & live (HP peserta)
   │  ├─ exam/[sessionCode]/  # player ujian
   │  ├─ host/[sessionId]/    # layar host / proyektor (live & battle)
   │  ├─ embed/[slug]/        # player versi embed (layout minimal)
   │  └─ api/                 # route handler (embed token, webhook)
   ├─ questions/              # Question Type Registry
   │  ├─ registry.ts
   │  ├─ types.ts
   │  ├─ multiple-choice/
   │  │  ├─ schema.ts         # zod: config + answer
   │  │  ├─ score.ts          # murni, tanpa I/O → mudah dites
   │  │  ├─ validate.ts       # cek sebelum publish
   │  │  ├─ Editor.tsx
   │  │  ├─ Player.tsx
   │  │  └─ index.ts
   │  └─ …                    # satu folder per tipe
   ├─ engine/
   │  ├─ policy.ts            # skema & default policy per mode
   │  ├─ practice/  exam/  live/  battle/   # state machine & server actions
   │  └─ transport/           # abstraksi realtime (Supabase sekarang)
   ├─ components/
   │  ├─ editor/              # shell editor 3 panel
   │  ├─ player/              # shell player, tombol 3D, timer bar, feedback
   │  └─ ui/                  # komponen dasar
   └─ lib/
      ├─ supabase/            # client browser, server, service-role
      └─ seed-random.ts       # PRNG dengan seed untuk acak soal/opsi
```

## Question Type Registry

Semua tipe soal mengikuti satu kontrak. Menambah tipe baru berarti menambah satu folder dan mendaftarkannya, tanpa mengubah editor, player, atau engine.

```ts
// src/questions/types.ts
export type Mode = "practice" | "exam" | "live" | "battle_buzzer" | "battle_royale";

export interface ScoreResult {
  correct: number; // unit benar
  total: number; // unit total
  ratio: number; // 0..1, dipakai untuk poin
}

export interface QuestionType<C, A> {
  type: string;
  label: string;
  icon: string;
  configSchema: z.ZodType<C>; // disimpan di questions.config
  answerSchema: z.ZodType<A>; // dikirim peserta
  defaults(): C;
  validate(config: C): string[]; // pesan error untuk publish
  score(config: C, answer: A): ScoreResult;
  stripAnswers(config: C, seed: number): unknown; // versi aman untuk peserta
  capabilities: {
    modes: Mode[];
    avgSeconds: number; // estimasi waktu jawab
    partialCredit: boolean;
    manualGrading?: boolean; // mis. esai
  };
  Editor: React.FC<EditorProps<C>>;
  Player: React.FC<PlayerProps<A>>; // menerima context mode (feedback on/off, locked, dsb.)
}
```

Aturan:

- `score()` dan `stripAnswers()` adalah **fungsi murni** dan diimpor oleh server. Keduanya tidak boleh bergantung pada React atau browser.
- `stripAnswers()` juga bertugas mengacak opsi atau item dengan `seed`. Dengan begitu urutan yang dilihat peserta konsisten saat halaman dimuat ulang, dan server tetap bisa memetakan jawabannya.
- `Player` tidak pernah tahu jawaban yang benar, kecuali saat server mengirim hasil (`reveal`).

## Alur penilaian (server-authoritative)

```
Peserta (Player)                Next.js Server Action               Postgres (RPC)
     │  submitAnswer(qid, ans)        │                                  │
     │ ─────────────────────────────▶ │ 1. zod parse answer              │
     │                                │ 2. ambil config dari snapshot    │
     │                                │ 3. registry[type].score()        │
     │                                │ 4. rpc record_*(…, result) ────▶ │ transaksi: cek waktu,
     │                                │                                  │ unique constraint,
     │                                │ ◀──────────────────────────────  │ pemenang, nyawa
     │ ◀───────────────────────────── │ 5. kembalikan hasil sesuai policy│
```

- **Penilaian dilakukan di TypeScript**, jadi satu sumber kebenaran dengan editor dan unit test.
- **Atomisitas dilakukan di Postgres.** Contohnya siapa pemenang rebutan, pengurangan nyawa, dan pengecekan deadline. Semua dijalankan dalam satu RPC.
- RPC `record_*` hanya bisa dieksekusi oleh `service_role`, sehingga peserta tidak bisa memanggilnya langsung dengan `correct = true`.
- Waktu selalu memakai `now()` dari database, bukan dari klien.

## Identitas peserta

- **Host** memakai Supabase Auth biasa (email atau Google).
- **Peserta** memakai **Supabase anonymous sign-in**. Setiap peserta mendapat `auth.uid()`, sehingga RLS tetap berlaku tanpa perlu mendaftar. Sesi disimpan di `localStorage`, yang tetap berfungsi di dalam iframe (browser mempartisinya per situs induk).
- **Ujian dengan daftar peserta** mewajibkan peserta login, atau memakai embed token dari sistem pemasang.

## Realtime

Satu channel per sesi: `session:{sessionId}`.

| Jenis                          | Dipakai untuk                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| **Broadcast** (dikirim server) | Perubahan tahap (`phase_changed`), jumlah yang sudah menjawab, pemenang rebutan, eliminasi, leaderboard |
| **Presence**                   | Daftar peserta online di lobby dan layar host                                                           |

- Broadcast dikirim dari server, lewat Server Action setelah transaksi DB berhasil. Klien tidak mengirim event game.
- Semua event bersifat **petunjuk**. Klien yang baru terhubung atau reconnect selalu mengambil state lengkap dari DB (`get_session_state`).
- `src/engine/transport/` membungkus Supabase Realtime. Kalau nanti skala menuntut server game khusus (PartyKit, Durable Objects, Colyseus), cukup lapisan ini yang diganti.

## Versi quiz

Quiz yang di-publish menghasilkan baris `quiz_versions` berisi snapshot JSON semua soal. Sesi selalu menunjuk ke satu versi. Akibatnya:

- Guru bisa terus mengedit tanpa mengganggu ujian yang sedang berjalan.
- Laporan tetap akurat walaupun soal sudah diubah.

## Keamanan

| Risiko                    | Mitigasi                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Kunci jawaban bocor       | `stripAnswers()` + RLS: peserta tidak punya akses `select` ke `questions` dan `quiz_versions`, hanya lewat RPC yang mengembalikan versi aman |
| Jawaban dimanipulasi      | Penilaian di server, RPC khusus `service_role`                                                                                               |
| Timer diakali             | Deadline disimpan dan diperiksa di DB                                                                                                        |
| Spam jawaban              | Unique `(attempt/round, participant)`, rate limit per peserta                                                                                |
| Quiz di-embed sembarangan | `frame-ancestors` dari `quizzes.embed_allowed_origins`                                                                                       |
| XSS dari konten soal      | Render teks sebagai teks. Rich text disanitasi (DOMPurify) saat disimpan dan saat ditampilkan                                                |
| Upload berbahaya          | Storage bucket dengan batas tipe MIME dan ukuran, path per pemilik                                                                           |

## Pemetaan dari prototipe

| Prototipe (`formulir-builder-quiz-mode.html`) | Aplikasi                                          |
| --------------------------------------------- | ------------------------------------------------- |
| `FIELD_TYPES`, `applyTypeDefaults()`          | `questions/*/index.ts` → `defaults()`             |
| `renderXEditor()`                             | `questions/*/Editor.tsx`                          |
| `renderPvXInner()` + fungsi interaksi         | `questions/*/Player.tsx`                          |
| `xScoreCompute()`, `scoreField()`             | `questions/*/score.ts` (dijalankan di server)     |
| `validateQuizForPublish()`                    | `questions/*/validate.ts` + validasi tingkat quiz |
| `formCfg.checkMode` (`end` / `instant`)       | `policy.feedback` (`end` / `instant` / `none`)    |
| Gamifikasi (`gamifyOnCheck`)                  | `engine/practice` + komponen player               |
| Panel Embed (snippet iframe)                  | `/embed/[slug]` + `embed.js`                      |
