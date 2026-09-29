# 03 · Model Data

Semua tabel berada di schema `public` Supabase dengan RLS aktif. DDL final akan ditulis di `supabase/migrations/`. Dokumen ini adalah acuannya.

## Diagram relasi

```
profiles 1─* quizzes 1─* questions
                │ 1─* quiz_versions 1─* sessions 1─* participants 1─* attempts 1─* responses
                │                        │                │
                │                        │ 1─* teams ─────┘ (team_id)
                │                        │ 1─* battle_rounds 1─* battle_answers
                │                        │                   1─1 round_winners
                │                        │                   1─1 buzzer_holds
                                          attempts 1─* integrity_events
```

## Enum

```sql
create type quiz_visibility as enum ('private', 'unlisted', 'public');
create type session_mode    as enum ('practice', 'exam', 'live', 'battle_buzzer', 'battle_royale');
create type session_status  as enum ('draft', 'scheduled', 'lobby', 'running', 'paused', 'ended');
create type attempt_status  as enum ('in_progress', 'submitted', 'expired');
create type round_status    as enum ('pending', 'countdown', 'open', 'resolving', 'locked', 'revealed');
create type live_phase      as enum ('lobby', 'countdown', 'open', 'reveal', 'leaderboard', 'podium', 'ended');  -- P5
```

## Konten

✅ Sudah diimplementasikan di [`supabase/migrations/20260926000000_content.sql`](../supabase/migrations/20260926000000_content.sql) (P1), beserta check constraint, trigger `updated_at`, dan RLS. Ringkasannya:

```sql
create table profiles (                  -- dibuat otomatis saat daftar (bukan untuk peserta anonim)
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table quizzes (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid() references profiles on delete cascade,
  title                  text not null default '',
  description            text not null default '',
  cover_url              text,
  theme                  jsonb not null default '{}',   -- { primary, bg }
  visibility             quiz_visibility not null default 'private',
  slug                   text unique,                   -- dibuat saat publish pertama
  embed_allowed_origins  text[] not null default '{}',  -- kosong = embed dimatikan
  draft_revision         int not null default 0,        -- naik tiap autosave (optimistic lock)
  published_revision     int,                           -- draft_revision yang terakhir di-publish
  latest_version         int,                           -- versi publish terakhir
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table questions (                 -- draft yang sedang diedit
  id           uuid primary key,          -- UUID dari editor (crypto.randomUUID)
  quiz_id      uuid not null references quizzes on delete cascade,
  position     int  not null,
  type         text not null,             -- kunci di registry
  prompt       text not null default '',
  help         text not null default '',
  media        jsonb not null default '[]',   -- [{ kind:'image'|'audio'|'video', url, alt }]
  config       jsonb not null,                -- divalidasi configSchema tipe terkait (di server action)
  time_limit_s int,                           -- null = pakai default policy
  points       int  not null default 1000,
  explanation  text not null default '',      -- ditampilkan saat reveal/review
  tags         text[] not null default '{}',  -- untuk bank soal
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on questions (quiz_id, position);

create table quiz_versions (             -- snapshot immutable saat publish
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references quizzes on delete cascade,
  version      int  not null,
  snapshot     jsonb not null,            -- { quiz:{…}, questions:[{ id,type,prompt,config,… }] }
  published_at timestamptz not null default now(),
  unique (quiz_id, version)
);
```

Bucket Storage `quiz-media` bersifat publik (peserta anonim harus bisa memuat gambar). Path-nya `{owner_id}/{quiz_id}/{uuid}.{ext}`, dan hanya pemilik yang boleh menulis di folder miliknya. Server action menolak URL media yang bukan dari bucket ini.

## Sesi & peserta

```sql
create table sessions (
  id               uuid primary key default gen_random_uuid(),
  quiz_version_id  uuid not null references quiz_versions,
  host_id          uuid not null references profiles,
  mode             session_mode not null,
  policy           jsonb not null,        -- lihat "Policy" di bawah
  code             char(6),               -- kode join, unik selama sesi aktif
  status           session_status not null default 'draft',
  opens_at         timestamptz,
  closes_at        timestamptz,
  title            text,                  -- nama ujian ("UTS IPA 8B"); null = judul quiz (P4)
  results_released_at timestamptz,        -- rilis nilai manual oleh guru (P4)
  -- ✅ P5 (supabase/migrations/20260928000000_live.sql): live & battle
  phase            live_phase,            -- tahap state machine (docs/09)
  current_round    int,                   -- indeks soal (0-based) yang sedang dimainkan
  phase_opened_at  timestamptz,
  phase_closes_at  timestamptz,           -- timer tahap (countdown, soal, reveal, papan skor)
  paused_at        timestamptz,           -- sedang dijeda
  paused_remaining_ms int,                -- sisa timer saat dijeda
  state_version    int not null default 0,  -- naik di setiap perubahan; klien mengambil ulang state
  lobby_locked     bool not null default false,
  auto_advance     bool not null default false,
  seed             bigint,                -- satu seed untuk semua (proyektor dan HP sama)
  question_ids     uuid[],                -- urutan soal sesi (soal yang tidak bisa live dilewati)
  created_at       timestamptz not null default now()
);
create unique index sessions_active_code on sessions (code)
  where status in ('scheduled', 'lobby', 'running', 'paused');

create table teams (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  name       text not null,
  color      text not null
);

-- ✅ P2 (supabase/migrations/20260926100000_practice_sessions.sql): sessions, participants,
-- attempts, responses, quiz_embed_secrets. Kolom tim/nyawa ditambahkan di P5–P7.
create table participants (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references sessions on delete cascade,
  user_id          uuid references auth.users,          -- hanya peserta yang login (ujian, P4)
  roster_id        uuid references session_roster on delete set null,  -- ujian dengan daftar peserta (P4)
  external_id      text,                 -- dari embed token (sub)
  nickname         text not null,        -- 1–60 huruf, unik per sesi, case-insensitive ("Budi", "Budi 2", …)
  avatar           text,
  team_id          uuid references teams,
  score            int  not null default 0,
  streak           int  not null default 0,
  lives            int,                  -- battle royale
  eliminated_round int,                  -- battle royale
  is_spectator     bool not null default false,  -- live: masuk terlambat dengan lateJoin 'spectator'
  kicked_at        timestamptz,          -- live: dikeluarkan host (P5)
  joined_at        timestamptz not null default now(),
  last_seen_at     timestamptz,
  unique (session_id, user_id),
  unique (session_id, roster_id),
  unique (session_id, nickname)
);

-- ✅ P4 (supabase/migrations/20260927000000_exam.sql): daftar peserta ujian (akses "roster").
create table session_roster (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions on delete cascade,
  name            text not null,            -- 1–60 huruf, dipakai sebagai nama peserta
  identifier      text not null,            -- NIS atau email yang diketik peserta
  extra_time_pct  int  not null default 0,  -- akomodasi 0–200 (%), dipakai start_attempt
  created_at      timestamptz not null default now()
);
create unique index on session_roster (session_id, lower(btrim(identifier)));
```

## Attempt & jawaban (latihan, ujian, live)

```sql
create table attempts (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions on delete cascade,
  participant_id  uuid not null references participants on delete cascade,
  attempt_no      int  not null default 1,
  seed            int  not null,          -- acak urutan soal & opsi
  question_ids    uuid[] not null,        -- urutan final (hasil acak / bank soal)
  started_at      timestamptz not null default now(),
  deadline        timestamptz,            -- null = tanpa batas waktu
  submitted_at    timestamptz,
  status          attempt_status not null default 'in_progress',
  score           numeric,
  max_score       numeric,
  unique (participant_id, attempt_no)
);

create table responses (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references attempts on delete cascade,
  question_id  uuid not null,             -- id soal di snapshot
  answer       jsonb not null,
  correct      numeric,                   -- null = menunggu penilaian manual
  total        numeric,
  points       int not null default 0,
  time_ms      int,
  answered_at  timestamptz not null default now(),
  graded_by    uuid references profiles,  -- penilaian manual (P4)
  graded_at    timestamptz,
  feedback     text,                      -- komentar guru untuk peserta
  rubric_scores jsonb,                    -- [{ id, criterion, score, max }] per kriteria rubrik
  unique (attempt_id, question_id)
);

create table integrity_events (          -- ujian ✅ P4
  id          bigint generated always as identity primary key,
  attempt_id  uuid not null references attempts on delete cascade,
  kind        text not null,              -- tab_hidden | fullscreen_exit | paste | copy | resize | multi_device
  at          timestamptz not null default now(),   -- dari klien, dibatasi maksimal now()
  meta        jsonb not null default '{}'           -- mis. { durationMs } untuk tab_hidden, maks. 1000 byte
);
```

## Putaran live & battle

Live (P5) memakai `battle_rounds` sebagai tabel putaran umum; jawaban live masuk ke `attempts`/`responses` (satu attempt per peserta) supaya laporan sama dengan mode lain. `participants.score`/`streak` menyimpan skor berjalan.

```sql
create table battle_rounds (         -- ✅ P5
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions on delete cascade,
  idx           int  not null,
  question_id   uuid not null,
  status        round_status not null default 'pending',
  time_limit_ms int  not null,         -- batas waktu soal (soal sendiri, atau timer sesi, atau 20 dtk)
  opened_at     timestamptz,           -- dasar poin kecepatan (waktu DB)
  closes_at     timestamptz,
  locked_at     timestamptz,
  unique (session_id, idx)
);

create table battle_answers (           -- ✅ P6 (…_battle_buzzer.sql)
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references battle_rounds on delete cascade,
  participant_id  uuid not null references participants on delete cascade,
  answer          jsonb not null,
  correct         bool not null,
  points          int not null default 0,  -- poin pemenang, atau penalti (negatif)
  reaction_ms     int,                    -- jam DB: now() − opened_at
  received_at     timestamptz not null default now(),
  unique (round_id, participant_id)       -- satu kesempatan per soal
);

create table round_winners (             -- ✅ P6 · rebutan: satu pemenang per soal
  round_id        uuid primary key references battle_rounds on delete cascade,
  participant_id  uuid not null references participants,
  won_at          timestamptz not null default now()
);

create table buzzer_holds (              -- rebutan varian "pencet lalu jawab"
  round_id        uuid primary key references battle_rounds on delete cascade,
  participant_id  uuid not null references participants,
  expires_at      timestamptz not null
);
```

## Policy

`sessions.policy` divalidasi dengan Zod (`src/engine/policy.ts`). Setiap mode punya nilai default.

```ts
type Policy = {
  // umum
  timer: { perQuestionS?: number; totalS?: number };
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  feedback: "instant" | "end" | "none"; // kapan benar/salah ditampilkan
  showCorrectAnswer: boolean;
  gamification: boolean; // XP, streak, reaksi, confetti
  scoring: "accuracy" | "speed" | "first_correct" | "elimination";
  // latihan & ujian
  attempts: number; // 0 = tanpa batas
  questionPool?: { size: number; tags?: string[] };
  releaseResults: "immediately" | "after_close" | "manual";
  access: "open" | "login" | "roster"; // siapa pun / wajib login / daftar peserta (menggantikan requireLogin)
  passcode?: string; // kode akses tambahan (ujian)
  allowEmbed: boolean;
  navigation: "free" | "forward"; // ujian: boleh kembali ke soal sebelumnya?
  attemptScoring: "highest" | "last" | "average"; // nilai yang dipakai jika attempt > 1
  integrity: { fullscreen: boolean; logTabSwitch: boolean; blockCopyPaste: boolean };
  // Akomodasi waktu tidak di policy: per peserta di session_roster.extra_time_pct.
  // live & battle
  autoAdvance: boolean;
  lateJoin: "allow" | "spectator" | "deny";
  // battle
  buzzer?: { variant: "first_correct" | "buzz_then_answer"; holdS: number; wrongPenalty: number };
  royale?: {
    lives: number;
    eliminateSlowest: boolean;
    shrinkTimerPct: number;
    suddenDeath: boolean;
  };
  teams?: { enabled: boolean; count: number };
};
```

## RLS (ringkasan)

| Tabel                                   | Host (pemilik)                                       | Peserta                                                                                                          |
| --------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `quizzes`, `questions`, `quiz_versions` | CRUD milik sendiri                                   | **Tidak ada akses langsung.** Soal diambil lewat RPC `get_play_payload()` yang menjalankan logika `stripAnswers` |
| `sessions`                              | CRUD milik sendiri                                   | `select` kolom publik lewat view `session_public`                                                                |
| `participants`                          | `select` semua di sesinya                            | `select` diri sendiri + leaderboard lewat view                                                                   |
| `attempts`, `responses`                 | `select` di sesinya, `update` untuk penilaian manual | `select` milik sendiri. **Tidak ada `insert`/`update` langsung.** Semua lewat Server Action + RPC `service_role` |
| `session_roster`                        | CRUD di sesinya                                      | Tidak ada akses. `join_exam` mencocokkan NIS/email di server                                                     |
| `integrity_events`                      | `select` di sesinya                                  | Tidak ada akses langsung. Dikirim lewat Server Action + `log_integrity_events` (`service_role`)                  |
| `battle_rounds`                         | `select` di sesinya                                  | Tidak ada akses langsung. State diambil lewat Server Action + `live_state` (`service_role`)                      |
| `battle_answers`, `round_winners` ✅    | `select` di sesinya                                  | `select` terbatas (tanpa jawaban peserta lain sebelum reveal)                                                    |

## RPC utama

| RPC                                                         | Pemanggil                   | Fungsi                                                                                                                                                                            |
| ----------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `save_quiz_draft(quiz, base_revision, meta, questions)` ✅  | host (RLS)                  | Ganti seluruh draf dalam satu transaksi; `revision_conflict` jika revisi basi; id soal milik quiz lain tidak pernah dipindah                                                      |
| `publish_quiz(quiz, base_revision, slug)` ✅                | host (RLS)                  | Snapshot draf tersimpan menjadi versi berikutnya; slug hanya diisi sekali                                                                                                         |
| `join_session(code, nickname)`                              | peserta                     | Validasi kode & status, buat `participants`                                                                                                                                       |
| `live_state(session_id, participant_id?)` ✅                | host (RLS) / `service_role` | State lengkap untuk reconnect (P5-04): tahap, timer, jumlah menjawab, 5 besar dengan poin terakhir & peringkat sebelumnya, dan skor/peringkat/jawaban peserta                     |
| `join_live(session_id, nickname)` ✅                        | `service_role`              | Masuk sesi live: cek lobby terkunci dan `lateJoin`, nickname unik, buat satu attempt                                                                                              |
| `record_live_answer(...)` ✅                                | `service_role`              | Satu jawaban per soal; poin kecepatan + bonus streak dihitung dari jam DB; update `participants.score`/`streak`                                                                   |
| `advance_live(session_id, version, action)` ✅              | host (pemilik)              | State machine live (`next`/`auto`/`pause`/`resume`/`end`); versi harus cocok; `auto` hanya setelah `phase_closes_at`                                                              |
| `update_live_settings` / `kick_participant` ✅              | host (pemilik)              | Kunci lobby, lanjut otomatis; keluarkan peserta                                                                                                                                   |
| `join_exam(session_id, nickname, user_id?, identifier?)` ✅ | `service_role`              | Masuk ujian: nama bebas, akun login, atau NIS/email dari daftar peserta; peserta yang sama dipakai lagi di perangkat lain                                                         |
| `start_attempt(...)` ✅                                     | `service_role`              | Buat attempt, seed, bank soal; ujian: cek `opens_at`, deadline = min(mulai + durasi × (1 + akomodasi), `closes_at`)                                                               |
| `record_response(...)` ✅                                   | `service_role`              | Simpan jawaban + hasil nilai, tolak jika lewat deadline + 5 detik; `correct = null` untuk soal yang dinilai manual                                                                |
| `submit_attempt(attempt_id)` ✅                             | `service_role`              | Kunci attempt, hitung skor total; terlambat → `expired`                                                                                                                           |
| `log_integrity_events(attempt_id, events)` ✅               | `service_role`              | Simpan catatan integritas (maks. 50 per batch)                                                                                                                                    |
| `extend_attempt` / `reopen_attempt` / `reset_attempt` ✅    | host (pemilik)              | Tambah waktu, buka ulang attempt yang selesai, atau hapus attempt agar peserta mulai lagi                                                                                         |
| `grade_response(response_id, ratio, feedback?, rubric?)` ✅ | host (pemilik)              | Nilai esai; poin diambil dari snapshot; skor attempt yang sudah selesai ikut diperbarui                                                                                           |
| `end_exam(session_id)` ✅                                   | host (pemilik)              | Tutup ujian sekarang dan tarik deadline attempt yang berjalan ke saat ini                                                                                                         |
| `record_battle_answer(...)` ✅                              | `service_role`              | Satu transaksi: kunci putaran (`for update`), simpan jawaban (satu per peserta), jawaban benar pertama menang, putaran terkunci dan sesi pindah ke reveal; penalti salah opsional |
| `resolve_round(round_id)`                                   | server                      | Battle royale: kurangi nyawa, tentukan eliminasi                                                                                                                                  |
| `expire_attempts()` ✅                                      | `pg_cron` tiap menit        | Tandai attempt yang lewat deadline sebagai `expired` dan nilai dari jawaban yang tersimpan                                                                                        |
