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
│  └─ tests/                  # migrasi + RLS diuji di PGlite (Postgres in-memory, tanpa Docker)
├─ e2e/                       # Playwright
└─ src/
   ├─ proxy.ts                # refresh sesi Supabase + redirect cepat (pengganti middleware di Next 16)
   ├─ app/
   │  ├─ (auth)/              # login/daftar + Server Actions auth
   │  ├─ auth/callback/       # OAuth & link konfirmasi email (PKCE)
   │  ├─ (dashboard)/quizzes/ # daftar quiz, editor, Server Actions quiz
   │  ├─ playground/          # galeri komponen + editor dengan adapter in-memory (dev saja)
   │  ├─ join/                # masukkan kode (P2)
   │  ├─ play/[sessionCode]/  # player latihan & live (HP peserta, P2)
   │  ├─ exam/[sessionCode]/  # player ujian (P4)
   │  ├─ host/[sessionId]/    # layar host / proyektor (P5)
   │  └─ embed/[slug]/        # player versi embed (P2)
   ├─ questions/              # Question Type Registry
   │  ├─ types.ts             # kontrak QuestionDefinition
   │  ├─ registry.ts          # daftar definisi (aman untuk server)
   │  ├─ ui.tsx               # daftar Editor/Player per tipe (klien)
   │  ├─ question.ts          # amplop soal (prompt, media, poin…) + validasi quiz
   │  ├─ multiple-choice/
   │  │  ├─ definition.ts     # schema, defaults, validate, score, stripAnswers — murni
   │  │  ├─ definition.test.ts
   │  │  ├─ Editor.tsx
   │  │  └─ Player.tsx
   │  └─ …                    # satu folder per tipe
   ├─ engine/                 # mode sesi (P2+)
   ├─ components/
   │  ├─ editor/              # QuizEditor: store, autosave, daftar soal, canvas, panel, pratinjau
   │  ├─ player/              # Button3D, AnswerShape, AnswerTile
   │  ├─ host/                # header dashboard
   │  └─ ui/                  # komponen dasar
   └─ lib/
      ├─ supabase/            # client browser/server/admin, proxy, upload, tipe DB
      ├─ auth.ts              # Data Access Layer: getSessionUser, requireHost
      ├─ quiz-data.ts         # baris DB ↔ model editor, validasi autosave di server
      └─ seed-random.ts       # PRNG dengan seed untuk acak soal/opsi
```

## Question Type Registry

Setiap tipe soal dipecah menjadi dua bagian, supaya kode penilaian di server tidak pernah menarik komponen React:

1. **`definition.ts`**, murni dan aman untuk server. Isinya skema, validasi, penilaian, dan `stripAnswers`.
2. **`Editor.tsx` + `Player.tsx`**, untuk klien. Didaftarkan di `questions/ui.tsx`.

```ts
// src/questions/types.ts (ringkas)
export interface QuestionDefinition<Config, Answer, Public> {
  type: string;
  label: string;
  description: string;
  configSchema: z.ZodType<Config>; // disimpan di questions.config (termasuk kunci jawaban)
  answerSchema: z.ZodType<Answer>; // dikirim peserta; dibatasi ukurannya
  capabilities: {
    modes: Partial<Record<SessionMode, "ok" | "warn">>;
    avgSeconds: number;
    partialCredit: boolean;
  };
  defaults(): Config;
  validate(config: Config): Issue[]; // { path: "options.2.text", message } — path dipakai editor untuk menyorot field
  score(config: Config, answer: Answer): ScoreResult; // { correct, total, ratio }
  stripAnswers(config: Config, ctx: { seed: number; shuffle: boolean }): Public; // tanpa kunci jawaban
  isAnswered(answer: Answer | null | undefined): boolean;
}

// src/questions/ui-types.ts
type PlayerProps<Public, Answer, Config> = {
  data: Public; // hasil stripAnswers
  answer: Answer | null;
  onAnswer(a: Answer): void;
  onCommit?(a: Answer): void; // jawaban final (mis. tap pilihan tunggal)
  disabled?: boolean;
  reveal?: Config; // dikirim server setelah menjawab, untuk menampilkan benar/salah
};
```

Aturan:

- `score()` dan `stripAnswers()` adalah **fungsi murni** yang diimpor server. Semua tipe diuji dengan test kontrak bersama di `registry.test.ts`, termasuk cek bahwa output `stripAnswers` tidak mengandung field kunci jawaban.
- `stripAnswers()` mengacak dengan `seed`, sehingga urutan tetap konsisten saat halaman dimuat ulang. Untuk mode yang semua pesertanya harus melihat urutan sama (live/battle), pemanggil memberi seed sesi.
- Id opsi/item memakai id stabil (`nanoid`), bukan indeks. Id soal adalah UUID yang dibuat di klien.
- `Player` tidak pernah tahu jawaban benar sebelum server mengirim `reveal`.

## Editor & autosave

- `QuizEditor` menerima `EditorAdapter` (`saveDraft`, `publish`, `uploadMedia`). Halaman asli memakai Server Actions + Supabase Storage, sedangkan `/playground/editor` memakai adapter in-memory, supaya UI bisa dikembangkan tanpa database.
- State editor ada di store Zustand per editor. Setiap edit menaikkan penghitung `edit`, dan autosave (`autosaver.ts`) membandingkannya dengan `savedEdit`.
- Autosave: debounce 800 ms, maksimal satu request berjalan, edit yang terjadi saat menyimpan ikut di simpanan berikutnya, gagal → coba lagi dengan backoff (2–30 detik), konflik revisi → berhenti dan minta muat ulang.
- Server menyimpan seluruh draf dalam satu transaksi (`save_quiz_draft`) dengan `draft_revision` sebagai optimistic lock, sehingga dua tab yang mengedit quiz yang sama terdeteksi.
- Publish: validasi di klien untuk umpan balik cepat, lalu validasi ulang di server terhadap draf yang **tersimpan** pada revisi yang sama, baru snapshot (`publish_quiz`).

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
- **Peserta** tidak punya akun. Saat bergabung, server membuat baris `participants` dan mengembalikan **participant token**, yaitu token bertanda tangan HMAC (`pt1.<payload>.<hmac>`, berlaku 30 hari, secret `PARTICIPANT_TOKEN_SECRET`). Klien menyimpannya di `localStorage` dan mengirimnya di setiap Server Action. Server Action memverifikasi token, lalu memakai client secret key untuk memanggil RPC khusus `service_role`.
  - _Kenapa bukan Supabase anonymous sign-in (rencana awal)?_ Sesi Supabase disimpan di cookie `SameSite=Lax`, yang tidak dikirim browser di dalam iframe lintas situs. Akibatnya Server Action tidak bisa mengenali peserta di mode embed. `localStorage` tetap berfungsi di iframe karena dipartisi per situs induk. Bonus: tidak ada akun `auth.users` sampah untuk setiap peserta.
  - Kode: [`src/lib/participant-token.ts`](../src/lib/participant-token.ts), [`src/app/play/actions.ts`](../src/app/play/actions.ts).
- **Ujian dengan daftar peserta** (P4) mewajibkan peserta login (`participants.user_id`), atau memakai embed token dari sistem pemasang (`participants.external_id`).

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

| Prototipe (`formulir-builder-quiz-mode.html`) | Aplikasi                                                           |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `FIELD_TYPES`, `applyTypeDefaults()`          | `questions/*/definition.ts` → `defaults()`                         |
| `renderXEditor()`                             | `questions/*/Editor.tsx`                                           |
| `renderPvXInner()` + fungsi interaksi         | `questions/*/Player.tsx`                                           |
| `xScoreCompute()`, `scoreField()`             | `definition.ts` → `score()` (dijalankan di server)                 |
| `validateQuizForPublish()`                    | `definition.ts` → `validate()` + `validateQuiz()` di `question.ts` |
| `formCfg.checkMode` (`end` / `instant`)       | `policy.feedback` (`end` / `instant` / `none`)                     |
| Gamifikasi (`gamifyOnCheck`)                  | `engine/practice` + komponen player                                |
| Panel Embed (snippet iframe)                  | `/embed/[slug]` + `embed.js`                                       |
