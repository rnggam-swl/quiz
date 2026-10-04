# 10 · Mode Battle

Dua mekanik, satu engine:

- **Rebutan** (`battle_buzzer`): yang tercepat menjawab benar mendapat poin, lalu soal terkunci.
- **Battle Royale** (`battle_royale`): yang salah atau telat kehilangan nyawa, sampai tersisa satu pemenang.

Keduanya memakai infrastruktur mode Live ([09](09-mode-live.md)): dua layar, lobby, state machine, dan channel realtime. Yang berbeda hanya aturan di tahap `open` dan `resolving`.

## State machine putaran

```
pending ─▶ countdown (3s) ─▶ open ─┬─▶ locked ─▶ revealed ─▶ (putaran berikut | podium)
                                   └─▶ resolving (jeda toleransi, rebutan) ─▶ locked
```

| Kondisi `open → locked`            | Rebutan              | Battle Royale |
| ---------------------------------- | -------------------- | ------------- |
| Ada jawaban benar pertama          | ✅ langsung terkunci | –             |
| Semua peserta aktif sudah menjawab | ✅                   | ✅            |
| Timer habis                        | ✅                   | ✅            |
| Host menekan "kunci"               | ✅                   | ✅            |

---

## Rebutan

### Varian A: Tercepat Benar (default) ✅ P6

- Semua peserta bisa menjawab selama putaran terbuka.
- **Satu kesempatan per soal.** Peserta yang salah langsung terkunci untuk soal itu. Aturan ini ditegakkan oleh `unique (round_id, participant_id)`.
- Jawaban benar pertama yang **diterima database** menang. Dalam transaksi yang sama putaran terkunci dan sesi pindah ke tahap `reveal` (5 detik), sehingga semua layar langsung menampilkan pemenang.
- Pemenang mendapat `question.points` (tanpa faktor kecepatan). Penalti salah (`buzzer.wrongPenalty`, default 0; pilihan 100/250/500 di dialog) bersifat opsional dan tidak pernah membuat skor di bawah 0.
- Jika tidak ada yang benar sampai waktu habis (atau semua sudah menjawab salah), jawaban benar ditampilkan dan tidak ada yang mendapat poin.
- Streak rebutan = kemenangan beruntun; kemenangan orang lain memutusnya. Tidak ada bonus streak.

### Varian B: Pencet lalu Jawab (gaya Cerdas Cermat) ✅ P8-01

Dipilih di dialog "Mulai live" → **Cara menjawab: Pencet lalu jawab** (`policy.buzzer.variant = "buzz_then_answer"`), dengan **waktu menjawab setelah BUZZ** 3/5/10/15 detik (`holdS`, default 5).

1. Soal tampil di proyektor dan HP. HP menampilkan tombol **BUZZ** besar, bukan pilihan jawaban.
2. `buzz_in()` memberi putaran kepada BUZZ pertama yang diterima database (baris putaran dikunci `for update`, satu baris `buzzer_holds` per putaran) selama `holdS` detik. Proyektor menampilkan "🔔 Andi menjawab… 4", HP lain "Andi sedang menjawab…", dan HP pemegang menampilkan pilihan jawaban dengan hitung mundur "Buzzer milikmu!".
3. Hanya pemegang yang boleh menjawab (`record_battle_answer` menolak dengan `not_holding`).
   - **Benar:** menang seperti varian A (poin, putaran terkunci, reveal).
   - **Salah:** penalti seperti biasa, terkunci untuk soal ini, hold dihapus, dan buzzer terbuka lagi untuk peserta lain.
   - **Waktu hold habis:** dianggap salah (`expire_buzzer_hold`, termasuk penalti). Pencatatannya terjadi saat BUZZ berikutnya masuk, atau saat pemegang mencoba menjawab terlambat (`hold_expired`, toleransi jaringan 1 detik).
4. Setiap perubahan hold menaikkan `state_version` dan di-broadcast sebagai `state` bertanda tangan yang membawa `hold` (`live_game_state()` = `live_state()` + hold). Tidak ada event terpisah.
5. Jeda toleransi (P8-04) tidak berlaku di varian ini, karena giliran menjawab sudah eksklusif.
6. Cocok dipakai dengan proyektor dan **mode tim**: poin masuk ke tim, dan satu perwakilan per tim yang memencet buzzer.

Playground: `/playground/live?mode=pencet` (bot juga memencet lalu menjawab). Test: `supabase/tests/battle.test.ts` (pencet lalu jawab), `src/engine/live/live.test.ts`.

### Tipe soal

Pilihan Ganda, Benar/Salah, Odd One Out. Isian dan Angka boleh dipakai, tapi dialog "Mulai" menampilkan peringatannya (kecepatan mengetik ikut menentukan hasil). Tipe lain dilewati, dan dialog menyebutkan soal mana saja.

---

## Battle Royale ✅ P7

### Aturan

- Nyawa diberikan saat host menekan **Mulai** (`policy.royale.lives`, default 3; pilihan 1/2/3/5 di dialog).
- Semua peserta yang masih bertahan menjawab setiap putaran, masing-masing satu kesempatan (`battle_answers`). Benar/salah baru terlihat saat reveal, seperti live. Jawaban benar mendapat poin kecepatan (formula live) sebagai skor sampingan.
- Saat putaran terkunci (timer habis, semua sudah menjawab, atau host menutup soal), `advance_live` menjalankan `resolve_royale_round`:
  - Salah atau tidak menjawab: `lives − 1`.
  - Opsional `eliminateSlowest`: jika **semua** yang tersisa benar, peserta paling lambat kehilangan 1 nyawa, supaya permainan tidak macet.
  - `lives = 0`: `eliminated_round = idx`, `is_spectator = true`.
- **Zona menyempit:** batas waktu putaran ke-n = batas soal × (1 − `shrinkTimerPct`)ⁿ, dengan batas bawah 5 detik. Proyektor menampilkan "Zona menyempit!" dan timer menjadi merah. Default `shrinkTimerPct` 10% (pilihan 0/10/20%).
- **Peringkat** (`royale_standings`): yang masih bertahan dulu (nyawa terbanyak), lalu yang tersingkir (yang keluar belakangan lebih tinggi); seri dipecah dengan rata-rata waktu jawaban benar, lalu siapa yang masuk lebih dulu. Selalu tepat satu peringkat 1.

### Kasus khusus (wajib)

| Kasus                                                      | Aturan                                                                                                                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Semua peserta tersisa kehabisan nyawa di putaran yang sama | Putaran dibatalkan untuk eliminasi: nyawa dikembalikan ke 1, lanjut ke putaran berikutnya                                                                                                    |
| Tersisa 1 peserta                                          | Setelah reveal langsung ke podium, dia pemenangnya                                                                                                                                           |
| Soal habis dan masih ada > 1 peserta                       | Jika `suddenDeath` (default nyala): soal diulang dengan timer 5 detik, sekali salah langsung tersingkir, maksimal 10 putaran tambahan. Jika tidak (atau sudah 10 putaran): peringkat di atas |
| Peserta masuk setelah mulai                                | `lateJoin = 'spectator'` (default royale): menonton dan bisa menjawab untuk poin bayangan, dengan penjelasan di HP                                                                           |
| Peserta terputus                                           | Tetap aktif. Tidak menjawab = kehilangan nyawa seperti biasa                                                                                                                                 |

### Penonton

Peserta yang tersingkir (dan yang masuk terlambat) tetap bisa menjawab untuk **poin bayangan** (`participants.shadow_score`, `battle_answers.shadow`): tidak memengaruhi nyawa, jumlah yang menjawab, maupun peringkat utama. HP menampilkan "Kamu bertahan sampai putaran N! Tetap main untuk poin bayangan". Di podium ada tiga penonton terbaik, supaya peserta yang gugur (apalagi anak-anak) tetap terlibat.

### Tipe soal

Semua yang cepat dijawab: Pilihan Ganda, Benar/Salah, Isian, Angka, Slider, Odd One Out. Sequencing, Grouping, dan Guess the Blank boleh dipakai dengan timer lebih panjang.

### Implementasi (P7)

| Bagian        | Lokasi                                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrasi & RPC | `supabase/migrations/20260930000000_battle_royale.sql`: `resolve_royale_round`, `record_royale_answer`, `royale_standings`, `advance_live` dan `live_state` dengan aturan royale |
| Test          | `supabase/tests/royale.test.ts`: setiap kasus khusus + simulasi 100 bot sampai podium (selalu tepat 1 pemenang)                                                                  |
| Layar         | `src/components/live/RoyaleStages.tsx` (penghitung "12 / 40 tersisa", grid avatar, podium royale), HUD nyawa dan layar tersingkir di `LivePlayer`                                |
| Playground    | `/playground/live?mode=royale` (2 nyawa, zona −20%, bot)                                                                                                                         |
| Event         | Tidak ada event baru: `state` bertanda tangan membawa `royale` (tersisa, total, siapa yang tersingkir, zona, sudden death); nyawa pribadi diambil saat reveal                    |

---

## Menentukan pemenang secara adil

**Prinsip:** waktu dari klien tidak dipercaya. Pemenang ditentukan di database dalam satu transaksi.

### Alur jawaban

```
HP peserta ──answerLiveAction──▶ Server Action (src/app/play/live-actions.ts)
                                   1. parse answer (zod)
                                   2. score() dari registry  → correct (ratio = 1)
                                   3. rpc record_battle_answer(participant, question, answer, correct, points, penalty)
                                   4. jika menang → broadcast state bertanda tangan (tahap reveal + pemenang)
                                   5. kembalikan { won, correct, points } ke HP itu
```

### RPC (disederhanakan dari implementasi di `supabase/migrations/20260929000000_battle_buzzer.sql`)

```sql
create or replace function record_battle_answer(
  p_round uuid, p_participant uuid, p_answer jsonb, p_correct bool, p_reaction_ms int
) returns jsonb
language plpgsql security definer as $$
declare
  r      battle_rounds;
  s      sessions;
  won    bool := false;
begin
  select * into r from battle_rounds where id = p_round for update;   -- serialisasi per putaran
  select * into s from sessions where id = r.session_id;

  if r.status <> 'open' or now() > r.closes_at then
    return jsonb_build_object('accepted', false, 'reason', 'round_closed');
  end if;

  if exists (select 1 from participants where id = p_participant and is_spectator)
     and s.mode = 'battle_buzzer' then
    return jsonb_build_object('accepted', false, 'reason', 'spectator');
  end if;

  insert into battle_answers (round_id, participant_id, answer, correct, reaction_ms)
  values (p_round, p_participant, p_answer, p_correct,
          least(p_reaction_ms, (extract(epoch from now() - r.opened_at) * 1000)::int))
  on conflict (round_id, participant_id) do nothing;
  if not found then
    return jsonb_build_object('accepted', false, 'reason', 'already_answered');
  end if;

  if s.mode = 'battle_buzzer' and p_correct then
    insert into round_winners (round_id, participant_id) values (p_round, p_participant)
    on conflict (round_id) do nothing;
    won := found;
    if won then
      update battle_rounds set status = 'locked', locked_at = now() where id = p_round;
      update participants set score = score + (select points_for_round(p_round)) where id = p_participant;
    end if;
  end if;

  return jsonb_build_object('accepted', true, 'won', won);
end $$;

revoke execute on function record_battle_answer from public, anon, authenticated;
grant  execute on function record_battle_answer to service_role;
```

- `select … for update` pada baris putaran menyerialkan jawaban per putaran. Contention hanya terjadi di satu baris dan singkat. Setelah menunggu kunci, RPC membaca ulang sesi: kalau sudah ada pemenang, jawaban berikutnya mendapat `round_closed` beserta nama pemenangnya.
- `round_winners` (primary key `round_id`) adalah pengaman kedua: satu pemenang per putaran.
- `reaction_ms` diambil dari jam database (`now() − opened_at`), tidak dari klien. Nilai ini dipakai di laporan (rata-rata waktu) dan nanti sebagai tie-breaker jeda toleransi.
- Test: `supabase/tests/battle.test.ts` (aturan, penalti, izin) dan `e2e/battle.spec.ts` (50 jawaban benar serentak ke Postgres sungguhan, diulang 20 kali → tepat satu pemenang per putaran).

### Keadilan latensi

Versi pertama memakai urutan tiba di server. Setelah itu, tambahkan dua perbaikan:

1. **Buka serentak ✅ P8-03:** soal sudah ikut di state `countdown`. Setiap layar menampilkannya tepat saat countdown habis menurut jam server (`openOnTime` di `src/engine/live/phases.ts`, memakai selisih jam dari `/api/time`), tanpa menunggu event `open`. Semua peserta melihat soal di saat yang sama, walaupun sinyalnya berbeda. Database mengikuti jam yang sama: `open_due_round()` membuka putaran dengan `opened_at` = akhir countdown yang dijadwalkan (bukan saat panggilan `auto` host tiba), sehingga poin kecepatan dan `reaction_ms` dihitung dari titik mulai yang sama. Fungsi ini dipanggil oleh action host sebelum `advance_live('auto')`, atau oleh action jawaban peserta jika jawaban datang saat putaran masih `countdown` (lalu jawaban dicoba sekali lagi). Detail: [09 · Buka serentak](09-mode-live.md#buka-serentak).
2. **Jeda toleransi (grace window) ✅ P8-04:** jawaban benar pertama memindahkan putaran ke `resolving` selama `policy.buzzer.graceMs` (default 250 ms; pilihan Mati/250/500 ms di dialog "Mulai live"; 0 = aturan lama, yang pertama tiba langsung menang). Jawaban benar lain yang masuk dalam jeda itu ikut bersaing. Setelah jeda habis, `resolve_buzzer_round()` memilih `reaction_ms` terkecil (seri: yang tiba lebih dulu), lalu putaran terkunci dan sesi pindah ke reveal seperti biasa.
   - **`reaction_ms` yang divalidasi:** HP mengukur waktu dari soal tampil sampai diketuk (`performance.now()`, dan berkat buka serentak semua HP mulai di waktu server yang sama), lalu mengirimnya bersama jawaban. Server hanya memercayainya dalam batas: `reaction = min(server, max(klaim_HP, server − 300 ms, 100 ms))`, dengan `server` = waktu tiba − `opened_at`. Sinyal lambat mendapat kompensasi sampai 300 ms, dan HP yang berbohong paling banyak juga hanya untung 300 ms. Klaim mentah disimpan di `battle_answers.client_ms` untuk audit.
   - **Siapa yang menutup jeda:** Server Action jawaban yang masuk jeda menunggu sampai jeda habis, memanggil `resolve_buzzer_round` (hanya satu yang berhasil, sisanya mendapat `none`), lalu membaca pemenang, sehingga HP tetap menerima "Kamu tercepat!" atau "Keduluan" seperti sebelumnya. Action host juga menutup jeda (menunggu jika perlu) sebelum `next`/`auto`/`end`, supaya timer yang habis di tengah jeda tidak menutup putaran tanpa pemenang.
   - Engine lokal (`/playground/live`) tetap memakai aturan tanpa jeda. Test: `supabase/tests/battle.test.ts` (jeda toleransi), `e2e/battle.spec.ts` (50 jawaban benar serentak dengan jeda → tepat satu pemenang).

## Event realtime tambahan

Rebutan dan battle royale tidak butuh event baru (royale: `state` bertanda tangan membawa siapa yang tersingkir dan jumlah yang tersisa).
Untuk rebutan: kemenangan memindahkan sesi ke `reveal`, dan Server Action pemenang mem-broadcast `state` bertanda tangan ([09 · Realtime](09-mode-live.md#realtime-sessionid)) yang membawa `winner`. Proyektor dan semua HP langsung tahu siapa yang tercepat.

Varian B juga tidak butuh event baru: `state` bertanda tangan membawa `hold: { id, nickname, expiresAt }` (rencana awal `buzz_hold`).

## UX

- **Rebutan:** bunyi buzzer. Proyektor menampilkan banner "⚡ Andi tercepat!" di atas reveal, dan papan skor menampilkan 🏆 jumlah soal yang dimenangkan. HP peserta lain bergetar dengan tulisan "Keduluan Andi!" dan jawaban benar. HP peserta yang salah langsung menampilkan kunci 🔒 "Coba di soal berikutnya" (+ getar dan penalti jika ada). HP pemenang: "Kamu tercepat! +poin".
- **Royale:** ❤️❤️🤍 di HUD. Proyektor menampilkan "12 / 40 tersisa" besar dan grid avatar, dengan avatar yang tersingkir menjadi abu-abu dan dicoret. Zona menyempit ditandai timer yang berubah warna.
- Podium akhir: juara 1–3 + confetti. Untuk royale ditambah "Bertahan sampai putaran ke-N" per peserta.

## Mode tim ✅ P8-02

Dinyalakan di dialog "Mulai live" (**Mode tim**, 2–5 tim), untuk live, rebutan, dan battle royale. `policy.teams = { enabled, count, assign }`.

- **Tim** dibuat bersama sesi (trigger `sessions_create_teams`) dengan warna **dan** bentuk slot jawaban: Tim Merah ▲, Tim Biru ◆, Tim Kuning ●, Tim Hijau ■, Tim Ungu ★. Warna tidak pernah menjadi satu-satunya penanda.
- **Pembagian:**
  - **Otomatis rata** (default): peserta baru masuk ke tim dengan anggota paling sedikit (seri: slot terkecil) begitu bergabung.
  - **Peserta memilih:** HP menampilkan tombol tim di lobby (`choose_team`).
  - Peserta yang belum punya tim saat host menekan Mulai, atau yang masuk terlambat, dibagikan otomatis (`assign_teams(session, force)` sebelum `next`).
  - Di lobby host bisa **Acak ulang tim** (`shuffle_teams`, merata dan acak).
- **Skor tim** (`live_game_state().teams`):

| Mode    | Skor tim                                             | Catatan                                                                                                                             |
| ------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Live    | **Rata-rata** skor anggota                           | Tim yang lebih kecil tidak dirugikan. Selama countdown dan soal terbuka skor tim disembunyikan, supaya tidak membocorkan hasil      |
| Rebutan | **Jumlah** skor anggota                              | **Satu perwakilan per tim per soal:** anggota pertama yang menjawab (atau BUZZ) mewakili timnya, yang lain mendapat `team_answered` |
| Royale  | Anggota yang masih bertahan, lalu total nyawa mereka | Tim tersingkir jika semua anggotanya tersingkir                                                                                     |

- **Layar:**
  - Lobby proyektor mengelompokkan peserta per tim, plus "Belum memilih tim".
  - Papan skor dan podium menampilkan papan tim (batang berwarna + bentuk), dengan banner "🏆 Tim Merah menang!".
  - HP menampilkan chip tim di header dan "Tim Merah peringkat 2 dari 3" di papan skor dan podium.
  - Laporan sesi punya **Klasemen tim**, dan nama tim di klasemen serta CSV.
- **Rebutan bertim ditutup lebih cepat** saat setiap tim yang punya anggota sudah menjawab (`teamsAnswered`), bukan saat semua peserta menjawab.
- HP tahu timnya setelah diacak ulang tanpa fetch: di lobby, state bertanda tangan membawa `memberIds` per tim (±7 KB untuk 200 peserta). Setelah lobby, daftar itu dibuang supaya broadcast tetap kecil.
- Playground: `/playground/live?teams=1` (2 tim otomatis) atau `?teams=choose` (3 tim, pilih sendiri). Test: `supabase/tests/teams.test.ts`.

## Implementasi Rebutan (P6)

| Bagian        | Lokasi                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrasi & RPC | `supabase/migrations/20260929000000_battle_buzzer.sql`: `battle_answers`, `round_winners`, `record_battle_answer`; fungsi live (`advance_live`, `join_live`, `live_state`, …) kini menerima sesi battle |
| Policy        | `policy.buzzer = { variant, holdS, wrongPenalty }` (`src/engine/policy.ts`)                                                                                                                             |
| Membuat sesi  | Dialog "Mulai live" di `/quizzes/{id}/live`: pilih **Live klasik** atau **Rebutan** + penalti                                                                                                           |
| Layar         | Sama dengan live (`/host/{id}`, `/play/{code}`), dengan layar khusus rebutan di `HostStages` dan `LivePlayer`                                                                                           |
| Laporan       | `/quizzes/{id}/live/{sessionId}`: klasemen + jumlah menang, replay papan skor, analisis butir soal                                                                                                      |
| Playground    | `/playground/live?mode=rebutan` (penalti 100, bot ikut berebut)                                                                                                                                         |
