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

### Varian A: Tercepat Benar (default, dibangun dulu)

- Semua peserta bisa menjawab selama putaran terbuka.
- **Satu kesempatan per soal.** Peserta yang salah langsung terkunci untuk soal itu. Aturan ini ditegakkan oleh `unique (round_id, participant_id)`.
- Jawaban benar pertama yang **diterima server** menang, lalu putaran langsung terkunci untuk semua peserta.
- Pemenang mendapat `question.points`. Penalti salah (`buzzer.wrongPenalty`, default 0) bersifat opsional.
- Jika tidak ada yang benar sampai waktu habis, jawaban benar ditampilkan dan tidak ada yang mendapat poin.

### Varian B: Pencet lalu Jawab (gaya Cerdas Cermat, fase lanjutan)

1. Soal tampil dan tombol **BUZZ** aktif untuk semua.
2. Buzz pertama yang diterima server mendapat `buzzer_holds` selama `holdS` detik (default 5). Peserta lain melihat "Andi sedang menjawab…".
3. Jika benar: dapat poin, putaran terkunci.
   Jika salah atau waktu hold habis: pemegang terkunci, hold dihapus, dan buzzer dibuka lagi untuk peserta lain.
4. Cocok dipakai dengan proyektor dan **mode tim**: poin masuk ke tim, dan satu perwakilan per tim yang memencet buzzer.

### Tipe soal

Pilihan Ganda, Benar/Salah, Odd One Out. Isian dan Angka boleh dipakai, tapi editor menampilkan peringatan.

---

## Battle Royale

### Aturan

- Semua peserta aktif menjawab setiap putaran, masing-masing satu kesempatan.
- Saat putaran terkunci, `resolve_round` berjalan:
  - Salah atau tidak menjawab: `lives − 1`.
  - Opsional `eliminateSlowest`: jika **semua** yang tersisa benar, peserta paling lambat kehilangan 1 nyawa, supaya permainan tidak macet.
  - `lives = 0`: `eliminated_round = idx`, `is_spectator = true`.
- **Zona menyempit:** batas waktu putaran berikutnya = sebelumnya × (1 − `shrinkTimerPct`), dengan batas bawah 5 detik.
- Default: 3 nyawa, `shrinkTimerPct` 10%.

### Kasus khusus (wajib)

| Kasus                                                      | Aturan                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Semua peserta tersisa kehabisan nyawa di putaran yang sama | Putaran dibatalkan untuk eliminasi: nyawa dikembalikan ke 1, lanjut ke putaran berikutnya                                                                          |
| Tersisa 1 peserta                                          | Langsung ke podium, dia pemenangnya                                                                                                                                |
| Soal habis dan masih ada > 1 peserta                       | Jika `suddenDeath`: ulang soal dari bank dengan timer 5 detik, satu kesalahan langsung tersingkir. Jika tidak: ranking berdasarkan nyawa, lalu total `reaction_ms` |
| Peserta masuk setelah mulai                                | `lateJoin = 'spectator'` (default)                                                                                                                                 |
| Peserta terputus                                           | Tetap aktif. Tidak menjawab = kehilangan nyawa seperti biasa                                                                                                       |

### Penonton

Peserta yang tersingkir tetap bisa menjawab untuk **poin bayangan** dan melihat "X tersisa". Di layar akhir ada peringkat penonton terbaik, supaya peserta yang gugur (apalagi anak-anak) tetap terlibat.

### Tipe soal

Semua yang cepat dijawab: Pilihan Ganda, Benar/Salah, Isian, Angka, Slider, Odd One Out. Sequencing, Grouping, dan Guess the Blank boleh dipakai dengan timer lebih panjang.

---

## Menentukan pemenang secara adil

**Prinsip:** waktu dari klien tidak dipercaya. Pemenang ditentukan di database dalam satu transaksi.

### Alur jawaban

```
HP peserta ──submitBattleAnswer──▶ Server Action
                                     1. parse answer (zod)
                                     2. score() dari registry  → correct
                                     3. rpc record_battle_answer(round, participant, answer, correct, reaction_ms)
                                     4. jika menang → broadcast round_locked { winner }
```

### Sketsa RPC

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

- `select … for update` pada baris putaran menyerialkan jawaban per putaran. Contention hanya terjadi di satu baris dan singkat.
- `reaction_ms` dari klien dibatasi dengan waktu server (`least(...)`), jadi klien tidak bisa mengklaim lebih cepat dari kenyataan secara ekstrem. Nilai ini hanya dipakai sebagai tie-breaker.

### Keadilan latensi (fase lanjutan)

Versi pertama memakai urutan tiba di server. Setelah itu, tambahkan dua perbaikan:

1. **Buka serentak:** payload soal dikirim saat `countdown`. Klien menyimpan soal dan baru menampilkannya pada `openedAt` (waktu server, disesuaikan dengan selisih jam yang diukur saat join). Semua peserta melihat soal di saat yang sama, walaupun sinyalnya berbeda.
2. **Jeda toleransi (grace window):** jawaban benar pertama memindahkan putaran ke `resolving` selama `graceMs` (default 250ms). Semua jawaban benar dalam jeda itu dibandingkan berdasarkan `reaction_ms` yang sudah divalidasi, dan yang terkecil menang. Putaran menjadi `locked` setelah jeda berakhir.

## Event realtime tambahan

| Event          | Payload                                             |
| -------------- | --------------------------------------------------- |
| `buzz_hold`    | `{ participantId, nickname, expiresAt }` (varian B) |
| `round_locked` | `{ winner?: { nickname, teamId? }, reason }`        |
| `eliminated`   | `{ participants: [{ id, nickname }], remaining }`   |
| `lives`        | per peserta: `{ lives }`                            |

## UX

- **Rebutan:** bunyi buzzer. Proyektor menampilkan banner "⚡ Andi tercepat!". HP peserta lain bergetar dengan tulisan "Keduluan!". HP peserta yang salah menampilkan kunci 🔒 "Coba di soal berikutnya".
- **Royale:** ❤️❤️🤍 di HUD. Proyektor menampilkan "12 / 40 tersisa" besar dan grid avatar, dengan avatar yang tersingkir menjadi abu-abu dan dicoret. Zona menyempit ditandai timer yang berubah warna.
- Podium akhir: juara 1–3 + confetti. Untuk royale ditambah "Bertahan sampai putaran ke-N" per peserta.

## Mode tim (fase lanjutan)

- `policy.teams.enabled`: peserta memilih tim di lobby, atau dibagi otomatis secara merata.
- Rebutan: poin masuk ke tim. Royale: nyawa dihitung per tim, dan tim tersingkir jika semua anggotanya tersingkir.
