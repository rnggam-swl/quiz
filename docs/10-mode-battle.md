# 10 · Mode Battle

Dua mekanik, satu engine:

- **Rebutan** (`battle_buzzer`): yang tercepat menjawab benar mendapat poin, lalu soal terkunci.
- **Battle Royale** (`battle_royale`): yang salah atau telat kehilangan nyawa, sampai tersisa satu pemenang.

Keduanya memakai infrastruktur mode Live ([09](09-mode-live.md)): dua layar, lobby, state machine, dan channel realtime. Yang berbeda hanya aturan di tahap `open` dan `resolving`.

## State machine putaran

```
pending ─▶ countdown (3s) ─▶ open ─┬─▶ locked ─▶ revealed ─▶ (putaran berikut | podium)
                                   └─▶ resolving (jeda toleransi, fase lanjutan) ─▶ locked
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

### Varian B: Pencet lalu Jawab (gaya Cerdas Cermat, fase lanjutan)

1. Soal tampil dan tombol **BUZZ** aktif untuk semua.
2. Buzz pertama yang diterima server mendapat `buzzer_holds` selama `holdS` detik (default 5). Peserta lain melihat "Andi sedang menjawab…".
3. Jika benar: dapat poin, putaran terkunci.
   Jika salah atau waktu hold habis: pemegang terkunci, hold dihapus, dan buzzer dibuka lagi untuk peserta lain.
4. Cocok dipakai dengan proyektor dan **mode tim**: poin masuk ke tim, dan satu perwakilan per tim yang memencet buzzer.

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

### Keadilan latensi (fase lanjutan)

Versi pertama memakai urutan tiba di server. Setelah itu, tambahkan dua perbaikan:

1. **Buka serentak:** payload soal dikirim saat `countdown`. Klien menyimpan soal dan baru menampilkannya pada `openedAt` (waktu server, disesuaikan dengan selisih jam yang diukur saat join). Semua peserta melihat soal di saat yang sama, walaupun sinyalnya berbeda.
2. **Jeda toleransi (grace window):** jawaban benar pertama memindahkan putaran ke `resolving` selama `graceMs` (default 250ms). Semua jawaban benar dalam jeda itu dibandingkan berdasarkan `reaction_ms` yang sudah divalidasi, dan yang terkecil menang. Putaran menjadi `locked` setelah jeda berakhir.

## Event realtime tambahan

Rebutan dan battle royale tidak butuh event baru (royale: `state` bertanda tangan membawa siapa yang tersingkir dan jumlah yang tersisa).
Untuk rebutan: kemenangan memindahkan sesi ke `reveal`, dan Server Action pemenang mem-broadcast `state` bertanda tangan ([09 · Realtime](09-mode-live.md#realtime-sessionid)) yang membawa `winner`. Proyektor dan semua HP langsung tahu siapa yang tercepat.

| Event       | Payload                                             |
| ----------- | --------------------------------------------------- |
| `buzz_hold` | `{ participantId, nickname, expiresAt }` (varian B) |

## UX

- **Rebutan:** bunyi buzzer. Proyektor menampilkan banner "⚡ Andi tercepat!" di atas reveal, dan papan skor menampilkan 🏆 jumlah soal yang dimenangkan. HP peserta lain bergetar dengan tulisan "Keduluan Andi!" dan jawaban benar. HP peserta yang salah langsung menampilkan kunci 🔒 "Coba di soal berikutnya" (+ getar dan penalti jika ada). HP pemenang: "Kamu tercepat! +poin".
- **Royale:** ❤️❤️🤍 di HUD. Proyektor menampilkan "12 / 40 tersisa" besar dan grid avatar, dengan avatar yang tersingkir menjadi abu-abu dan dicoret. Zona menyempit ditandai timer yang berubah warna.
- Podium akhir: juara 1–3 + confetti. Untuk royale ditambah "Bertahan sampai putaran ke-N" per peserta.

## Mode tim (fase lanjutan)

- `policy.teams.enabled`: peserta memilih tim di lobby, atau dibagi otomatis secara merata.
- Rebutan: poin masuk ke tim. Royale: nyawa dihitung per tim, dan tim tersingkir jika semua anggotanya tersingkir.

## Implementasi Rebutan (P6)

| Bagian        | Lokasi                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrasi & RPC | `supabase/migrations/20260929000000_battle_buzzer.sql`: `battle_answers`, `round_winners`, `record_battle_answer`; fungsi live (`advance_live`, `join_live`, `live_state`, …) kini menerima sesi battle |
| Policy        | `policy.buzzer = { variant, holdS, wrongPenalty }` (`src/engine/policy.ts`)                                                                                                                             |
| Membuat sesi  | Dialog "Mulai live" di `/quizzes/{id}/live`: pilih **Live klasik** atau **Rebutan** + penalti                                                                                                           |
| Layar         | Sama dengan live (`/host/{id}`, `/play/{code}`), dengan layar khusus rebutan di `HostStages` dan `LivePlayer`                                                                                           |
| Laporan       | `/quizzes/{id}/live/{sessionId}`: klasemen + jumlah menang, replay papan skor, analisis butir soal                                                                                                      |
| Playground    | `/playground/live?mode=rebutan` (penalti 100, bot ikut berebut)                                                                                                                                         |
