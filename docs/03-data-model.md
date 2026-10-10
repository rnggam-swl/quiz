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
                │                        │ 1─1 board_state, 1─* board_tiles   (📋 P9 papan soal)
                                          attempts 1─* integrity_events
```

## Enum

```sql
create type quiz_visibility as enum ('private', 'unlisted', 'public');
create type session_mode    as enum ('practice', 'exam', 'live', 'battle_buzzer', 'battle_royale');
-- 📋 P9: + 'board' (papan soal, docs/11)
create type session_status  as enum ('draft', 'scheduled', 'lobby', 'running', 'paused', 'ended');
create type attempt_status  as enum ('in_progress', 'submitted', 'expired');
create type round_status    as enum ('pending', 'countdown', 'open', 'resolving', 'locked', 'revealed');
create type live_phase      as enum ('lobby', 'countdown', 'open', 'reveal', 'leaderboard', 'podium', 'ended');  -- P5
-- 📋 P9: + 'pick', 'pass', 'buzz' (papan soal)
create type board_tile_status as enum ('open', 'won', 'burned', 'missed');  -- 📋 P9
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

**File yatim (✅ P8-15):** file tetap ada di Storage saat quiz dihapus, dan menghapus media di editor hanya mengubah JSON soal. `orphan_media()` ([`…_media_cleanup.sql`](../supabase/migrations/20261001300000_media_cleanup.sql)) mencari objek `quiz-media` yang URL publiknya tidak disebut di `quizzes.cover_url`, `questions.media`/`config` (media item), maupun `quiz_versions.snapshot` mana pun, termasuk salinan di quiz lain. Objek yang lebih muda dari 1 hari tidak disentuh, karena bisa jadi baru diunggah dan belum tersimpan oleh autosave. Penghapusan harus lewat Storage API (bukan `delete from storage.objects`), jadi dijalankan app di `/api/maintenance/media-cleanup` (maks. 5000 file per run, `?dry=1` hanya menampilkan daftar). Jadwalnya harian lewat `pg_cron` → `call_app()` → `pg_net`, dengan URL app dan `CRON_SECRET` yang sama di Vault seperti [webhook](07-embed.md#webhook).

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

create table teams (                     -- ✅ P8-02 (…_teams.sql), dibuat trigger saat sesi dibuat
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  slot       int  not null,              -- 1–5: warna + bentuk slot jawaban (Merah ▲ … Ungu ★)
  name       text not null,              -- "Tim Merah"
  unique (session_id, slot)
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
  team_id          uuid references teams,   -- ✅ P8-02 mode tim
  score            int  not null default 0,
  streak           int  not null default 0,
  lives            int,                  -- battle royale ✅ P7 (diisi saat mulai)
  eliminated_round int,                  -- battle royale: putaran tersingkir
  shadow_score     int not null default 0, -- battle royale: poin bayangan penonton
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
  resolve_at    timestamptz,           -- ✅ P8-04 rebutan: akhir jeda toleransi (status 'resolving')
  win_points    int,                   -- poin untuk pemenang jeda
  unique (session_id, idx)
);

create table battle_answers (           -- ✅ P6 (…_battle_buzzer.sql)
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references battle_rounds on delete cascade,
  participant_id  uuid not null references participants on delete cascade,
  answer          jsonb not null,
  correct         bool not null,
  points          int not null default 0,  -- poin pemenang, atau penalti (negatif)
  reaction_ms     int,                    -- jam DB: now() − opened_at; dengan jeda toleransi: klaim HP dalam batas (P8-04)
  client_ms       int,                    -- klaim waktu reaksi dari HP, untuk audit (P8-04)
  shadow          bool not null default false, -- royale: jawaban penonton (poin bayangan)
  received_at     timestamptz not null default now(),
  unique (round_id, participant_id)       -- satu kesempatan per soal
);

create table round_winners (             -- ✅ P6 · rebutan: satu pemenang per soal
  round_id        uuid primary key references battle_rounds on delete cascade,
  participant_id  uuid not null references participants,
  won_at          timestamptz not null default now()
);

create table buzzer_holds (              -- ✅ P8-01 rebutan varian "pencet lalu jawab"
  round_id        uuid primary key references battle_rounds on delete cascade,
  participant_id  uuid not null references participants,
  expires_at      timestamptz not null
);
```

## Papan soal

📋 Rencana P9 ([11 · Mode Papan Soal](11-mode-board.md)). Putaran dan percobaan memakai `battle_rounds`/`battle_answers` di atas: satu putaran setiap kali sebuah soal dimainkan (`idx` = urutan main), satu baris `battle_answers` per percobaan (penjawab pertama dan para perebut). `buzzer_holds` dipakai ulang untuk tahap `buzz`.

```sql
create table board_state (               -- satu baris per sesi papan
  session_id     uuid primary key references sessions on delete cascade,
  turn_order     uuid[] not null,        -- unit: id peserta (individu) atau id tim
  turn_idx       int  not null default 0,
  owner_unit     uuid,                   -- pemilik giliran
  picker_unit    uuid,                   -- yang memilih soal (pemilik, atau penjawab benar terakhir)
  answerer_unit  uuid,                   -- yang sedang menjawab
  last_winner    uuid,                   -- untuk policy.board.picker = 'last_winner'
  steals_used    int  not null default 0 -- perebut di soal yang sedang dimainkan
);

create table board_tiles (               -- satu baris per soal di papan
  session_id     uuid not null references sessions on delete cascade,
  question_id    uuid not null,
  position       int  not null,          -- urutan di papan
  category       text,                   -- default: tag pertama soal
  points         int  not null check (points between -10000 and 10000),
  time_limit_ms  int  not null,
  on_wrong       text not null check (on_wrong in ('steal', 'burn')),
  status         board_tile_status not null default 'open',
  closed_by      text check (closed_by in ('rule', 'host')),  -- hangus karena aturan atau host
  winner_unit    uuid,
  last_round     uuid references battle_rounds,
  primary key (session_id, question_id)
);

create table board_adjustments (         -- koreksi skor oleh host
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions on delete cascade,
  unit        uuid not null,             -- id peserta atau id tim
  delta       int  not null check (delta <> 0),
  note        text not null default '',
  created_at  timestamptz not null default now()
);

alter table battle_answers
  add column source text not null default 'player'
  check (source in ('player', 'timeout', 'host'));   -- host = nilai manual Benar/Salah
```

## Akun & integrasi

```sql
-- ✅ P8-07 (…_api_tokens.sql): token API hanya-baca, satu akun host = satu workspace
create table api_tokens (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles on delete cascade,
  name         text not null,            -- 1–60 huruf ("Moodle sekolah")
  prefix       text not null,            -- 10 karakter awal token, untuk ditampilkan
  token_hash   text not null unique,     -- SHA-256 hex; token aslinya tidak disimpan
  created_at   timestamptz not null default now(),
  expires_at   timestamptz,              -- null = tanpa batas
  last_used_at timestamptz,              -- diperbarui paling sering sekali per menit
  revoked_at   timestamptz               -- host hanya boleh mengubah kolom ini
);

-- ✅ P8-06 (…_webhooks.sql): webhook + outbox pengiriman
create table webhooks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles on delete cascade,
  url         text not null,            -- https://…, maks. 500
  secret      text not null,            -- whsec_… (Standard Webhooks)
  events      text[] not null default '{attempt.submitted}',
  description text not null default '',
  active      bool not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  webhook_id      uuid not null references webhooks on delete cascade,
  event_id        uuid not null,          -- header webhook-id, sama di setiap retry
  event           text not null,          -- attempt.submitted | webhook.test
  payload         jsonb not null,
  status          text not null default 'pending',  -- pending | succeeded | failed
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,            -- sedang dikirim oleh satu dispatcher
  response_status int,
  response_body   text,                   -- 500 karakter pertama
  last_error      text,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz,
  unique (webhook_id, event_id)
);

-- ✅ P8-08 (…_lti.sql): LTI 1.3, docs/07-embed.md#lti-13
create table lti_platforms (             -- RLS: pemilik baca/tambah/hapus, tidak bisa diubah
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles on delete cascade,
  name           text not null,
  issuer         text not null,          -- https://…
  client_id      text not null,
  auth_login_url text not null,          -- OIDC auth (https)
  auth_token_url text not null,          -- OAuth2 token untuk AGS (https)
  jwks_url       text not null,          -- kunci publik LMS (https)
  deployment_ids text[] not null default '{}',  -- kosong = semua deployment
  created_at     timestamptz not null default now(),
  unique (issuer, client_id)
);

-- Tiga tabel berikut hanya untuk service_role.
create table lti_keys (                  -- kunci RSA tool, dibuat saat pertama dipakai
  kid text primary key, public_jwk jsonb not null, private_pem text not null,
  created_at timestamptz not null default now()
);
create table lti_states (                -- state/nonce login OIDC, sekali pakai, 10 menit
  state text primary key, nonce text not null,
  platform_id uuid not null references lti_platforms on delete cascade,
  created_at timestamptz not null default now()
);
create table lti_launches (              -- launch yang sudah diverifikasi
  id                   uuid primary key default gen_random_uuid(),
  platform_id          uuid not null references lti_platforms on delete cascade,
  deployment_id        text not null,
  message_type         text not null,   -- LtiResourceLinkRequest | LtiDeepLinkingRequest
  lti_user_id          text not null,   -- sub dari LMS
  external_id          text not null,   -- participants.external_id: lti:{platform8}:{sub}
  name                 text,
  resource_link_id     text,
  quiz_id              uuid references quizzes on delete cascade,
  lineitem             text,            -- kolom nilai AGS (null = tidak kirim nilai)
  deep_link_return_url text,
  deep_link_data       text,
  created_at           timestamptz not null default now()
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
  buzzer?: {
    variant: "first_correct" | "buzz_then_answer";
    holdS: number;
    wrongPenalty: number;
    graceMs: number; // jeda toleransi (P8-04), default 250, 0 = mati
  };
  royale?: {
    lives: number;
    eliminateSlowest: boolean;
    shrinkTimerPct: number;
    suddenDeath: boolean;
  };
  teams: { enabled: boolean; count: number; assign: "auto" | "choose" }; // P8-02, 2–5 tim
  // 📋 P9 papan soal (docs/11)
  board?: {
    turnOrder: "join" | "random";
    picker: "owner" | "last_winner";
    onWrong: "steal" | "burn"; // aturan sesi; per soal di tiles
    steal: "next" | "buzz";
    maxPlayers: number; // individu: batas yang ikut giliran, 0 = tanpa batas; tim memakai teams.count
    maxSteals: number; // 0 = sampai semua unit mencoba
    showWrongAnswers: boolean;
    pickS: number; // 0 = tanpa batas
    buzzS: number;
    defaultPoints: number; // boleh negatif
    wrongPenalty: number;
    tiles: {
      questionId: string;
      category?: string;
      points?: number;
      timeS?: number;
      onWrong?: "steal" | "burn";
    }[];
  };
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

| RPC                                                                   | Pemanggil                              | Fungsi                                                                                                                                                                            |
| --------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `save_quiz_draft(quiz, base_revision, meta, questions)` ✅            | host (RLS)                             | Ganti seluruh draf dalam satu transaksi; `revision_conflict` jika revisi basi; id soal milik quiz lain tidak pernah dipindah                                                      |
| `publish_quiz(quiz, base_revision, slug)` ✅                          | host (RLS)                             | Snapshot draf tersimpan menjadi versi berikutnya; slug hanya diisi sekali                                                                                                         |
| `join_session(code, nickname)`                                        | peserta                                | Validasi kode & status, buat `participants`                                                                                                                                       |
| `lti_practice_session(quiz)` ✅                                       | `service_role`                         | LTI (P8-08): sesi latihan default quiz yang sudah terbit, dibuat jika belum ada dengan pemilik quiz sebagai host                                                                  |
| `live_state(session_id, participant_id?)` ✅                          | host (RLS) / `service_role`            | State lengkap untuk reconnect (P5-04): tahap, timer, jumlah menjawab, 5 besar dengan poin terakhir & peringkat sebelumnya, dan skor/peringkat/jawaban peserta                     |
| `join_live(session_id, nickname)` ✅                                  | `service_role`                         | Masuk sesi live: cek lobby terkunci dan `lateJoin`, nickname unik, buat satu attempt                                                                                              |
| `record_live_answer(...)` ✅                                          | `service_role`                         | Satu jawaban per soal; poin kecepatan + bonus streak dihitung dari jam DB; update `participants.score`/`streak`                                                                   |
| `advance_live(session_id, version, action)` ✅                        | host (pemilik)                         | State machine live (`next`/`auto`/`pause`/`resume`/`end`); versi harus cocok; `auto` hanya setelah `phase_closes_at`                                                              |
| `update_live_settings` / `kick_participant` ✅                        | host (pemilik)                         | Kunci lobby, lanjut otomatis; keluarkan peserta                                                                                                                                   |
| `join_exam(session_id, nickname, user_id?, identifier?)` ✅           | `service_role`                         | Masuk ujian: nama bebas, akun login, atau NIS/email dari daftar peserta; peserta yang sama dipakai lagi di perangkat lain                                                         |
| `start_attempt(...)` ✅                                               | `service_role`                         | Buat attempt, seed, bank soal; ujian: cek `opens_at`, deadline = min(mulai + durasi × (1 + akomodasi), `closes_at`)                                                               |
| `record_response(...)` ✅                                             | `service_role`                         | Simpan jawaban + hasil nilai, tolak jika lewat deadline + 5 detik; `correct = null` untuk soal yang dinilai manual                                                                |
| `submit_attempt(attempt_id)` ✅                                       | `service_role`                         | Kunci attempt, hitung skor total; terlambat → `expired`                                                                                                                           |
| `log_integrity_events(attempt_id, events)` ✅                         | `service_role`                         | Simpan catatan integritas (maks. 50 per batch)                                                                                                                                    |
| `extend_attempt` / `reopen_attempt` / `reset_attempt` ✅              | host (pemilik)                         | Tambah waktu, buka ulang attempt yang selesai, atau hapus attempt agar peserta mulai lagi                                                                                         |
| `grade_response(response_id, ratio, feedback?, rubric?)` ✅           | host (pemilik)                         | Nilai esai; poin diambil dari snapshot; skor attempt yang sudah selesai ikut diperbarui                                                                                           |
| `end_exam(session_id)` ✅                                             | host (pemilik)                         | Tutup ujian sekarang dan tarik deadline attempt yang berjalan ke saat ini                                                                                                         |
| `record_battle_answer(...)` ✅                                        | `service_role`                         | Satu transaksi: kunci putaran (`for update`), simpan jawaban (satu per peserta), jawaban benar pertama menang, putaran terkunci dan sesi pindah ke reveal; penalti salah opsional |
| `resolve_royale_round(session, round)` ✅                             | `advance_live` (saat putaran terkunci) | Battle royale: kurangi nyawa yang salah/tidak menjawab, `eliminateSlowest`, tandai tersingkir; semua habis bersamaan → tidak ada yang tersingkir                                  |
| `record_royale_answer(...)` ✅                                        | `service_role`                         | Satu jawaban per putaran; poin kecepatan, atau poin bayangan untuk penonton                                                                                                       |
| `royale_standings(session)` ✅                                        | host (RLS) / `service_role`            | Peringkat royale: bertahan, nyawa, putaran tersingkir, rata-rata waktu benar                                                                                                      |
| `expire_attempts()` ✅                                                | `pg_cron` tiap menit                   | Tandai attempt yang lewat deadline sebagai `expired` dan nilai dari jawaban yang tersimpan                                                                                        |
| `account_has_password()` ✅                                           | host                                   | Apakah akun ini sudah punya password (akun Google belum), untuk halaman akun (P8-16)                                                                                              |
| `api_authenticate(token_hash)` ✅                                     | `service_role`                         | Pemilik token API yang masih aktif; catat `last_used_at` (P8-07)                                                                                                                  |
| `api_quizzes` / `api_quiz` / `api_attempts` / `api_attempt` ✅        | `service_role`                         | Data untuk `/api/v1`, selalu disaring dengan `p_owner` di SQL; paginasi attempt dengan cursor `(started_at, id)`                                                                  |
| `claim_webhook_deliveries(limit)` / `finish_webhook_delivery(...)` ✅ | `service_role`                         | Ambil pengiriman yang jatuh tempo (kunci 2 menit, `skip locked`); catat hasil, retry 1 m/5 m/30 m/2 j/6 j/12 j, gagal setelah 7 kali (P8-06)                                      |
| `send_test_webhook(webhook)` / `redeliver_webhook(delivery)` ✅       | host (pemilik)                         | Kirim tes, kirim ulang sekarang                                                                                                                                                   |
| `open_due_round(session)` ✅                                          | host (pemilik) / `service_role`        | Buka serentak (P8-03): countdown yang sudah habis dibuka per waktu terjadwal                                                                                                      |
| `resolve_buzzer_round(session)` ✅                                    | host (pemilik) / `service_role`        | Jeda toleransi (P8-04): setelah jeda habis, reaksi tervalidasi terkecil menang; `pending` + waktu tunggu jika belum                                                               |
| `buzz_in(participant, question)` ✅                                   | `service_role`                         | Pencet lalu jawab (P8-01): satu pemegang buzzer per putaran selama `holdS`; hold yang habis dicatat sebagai jawaban salah                                                         |
| `live_game_state(session, participant?)` ✅                           | host (RLS) / `service_role`            | `live_state` + siapa yang memegang buzzer                                                                                                                                         |
| `assign_teams(session, force)` / `shuffle_teams(session)` ✅          | host (pemilik) / `service_role`        | Mode tim (P8-02): masuk ke tim terkecil (saat bergabung jika otomatis; semua sisanya saat mulai); acak ulang merata di lobby                                                      |
| `choose_team(participant, team)` ✅                                   | `service_role`                         | Mode tim "peserta memilih": pilih tim di lobby                                                                                                                                    |
| `board_pick` / `record_board_answer` / `board_buzz_in` 📋 P9          | `service_role`                         | Papan soal: pilih soal, catat percobaan dan terapkan aturan salah, BUZZ perebut ([11 · RPC](11-mode-board.md#rpc))                                                                |
| `board_host(session, version, action, question?)` 📋 P9               | host (pemilik)                         | Papan soal: lewati giliran, hanguskan, buka lagi, nilai manual, koreksi skor, ikut/menonton di lobby                                                                              |
