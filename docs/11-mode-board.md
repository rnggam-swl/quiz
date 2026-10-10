# 11 · Mode Papan Soal

Peserta (atau tim) bergiliran memilih soal dari papan, lalu menjawabnya. Soal yang dijawab benar tertutup. Kalau jawabannya salah, soal bisa direbut peserta lain atau langsung hangus, tergantung aturan sesi, aturan per soal, atau keputusan host saat sesi berjalan. Formatnya mirip babak pilihan Cerdas Cermat atau Jeopardy, dimainkan dengan proyektor di kelas.

📋 **Rencana P9** ([spec/task/phase-9-board.md](../spec/task/phase-9-board.md)). Prototipe interaksi yang sudah dicoba: [`spec/reference-html/papan-soal.html`](../spec/reference-html/papan-soal.html) (proyektor, HP, dan host disimulasikan di satu layar; semua aturan di dokumen ini bisa diubah di sana).

Mode ini memakai infrastruktur Live ([09](09-mode-live.md)) dan Battle ([10](10-mode-battle.md)): dua layar, lobby, state bertanda tangan, `battle_rounds`/`battle_answers`, `buzzer_holds`, dan mode tim. Yang baru hanya giliran, papan, dan aturan rebut atau hangus.

## Istilah

| Istilah             | Arti                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Unit**            | Peserta (format individu) atau tim (format tim). Giliran, skor papan, dan "sudah mencoba" dihitung per unit |
| **Pemilik giliran** | Unit yang mendapat giliran menurut urutan                                                                   |
| **Pemilih**         | Unit yang memilih soal untuk pemilik giliran                                                                |
| **Penjawab**        | Unit yang sedang menjawab: pemilik giliran, lalu perebut                                                    |
| **Hangus**          | Soal ditutup tanpa pemenang karena aturan "hangus jika salah" atau keputusan host                           |
| **Tak terjawab**    | Soal ditutup karena kesempatan merebut sudah habis dan tidak ada yang benar                                 |

## Default policy

```ts
{
  feedback: 'instant',
  showCorrectAnswer: true,
  gamification: true,
  scoring: 'first_correct',      // poin tetap untuk jawaban benar, tanpa faktor kecepatan
  timer: { perQuestionS: 10 },   // waktu menjawab default; bisa diubah per soal
  shuffleOptions: false,
  autoAdvance: false,
  lateJoin: 'allow',             // masuk di akhir urutan giliran
  teams: { enabled: false, count: 2, assign: 'auto' },   // format individu atau tim (P8-02)
  board: {
    maxPlayers: 0,               // individu: batas peserta yang ikut giliran; 0 = tanpa batas
    turnOrder: 'join',           // 'join' (urutan masuk lobby) | 'random' (diacak saat Mulai)
    picker: 'owner',             // 'owner' | 'last_winner'
    onWrong: 'steal',            // aturan sesi: 'steal' (boleh direbut) | 'burn' (hangus)
    steal: 'next',               // 'next' (dilempar sesuai urutan) | 'buzz' (rebutan)
    maxSteals: 0,                // 0 = sampai semua unit sudah mencoba
    showWrongAnswers: true,      // jawaban salah sebelumnya terlihat oleh perebut
    pickS: 10,                   // waktu memilih soal; 0 = tanpa batas, habis = dipilih acak
    buzzS: 5,                    // jendela rebutan
    defaultPoints: 100,          // boleh negatif
    wrongPenalty: 0,
    tiles: [],                   // pengaturan per soal, lihat di bawah
  },
}
```

Pengaturan per soal (`board.tiles`). Semua kolom opsional dan jatuh ke nilai sesi:

```ts
type BoardTile = {
  questionId: string;
  category?: string; // default: tag pertama soal (bank soal P8-12)
  points?: number; // default: board.defaultPoints; -10000…10000
  timeS?: number; // default: time_limit_s soal, lalu timer.perQuestionS
  onWrong?: "steal" | "burn"; // default: board.onWrong
};
```

- Poin papan **tidak** memakai `questions.points`. Poin soal di editor berskala 1000 untuk poin kecepatan live, sedangkan papan memakai angka ringkas seperti 100/200/300. Host mengisi poin per soal di dialog.
- Pengaturan per soal disimpan di policy sesi, bukan di soal, supaya konten tetap bisa dipakai di semua mode (prinsip "satu konten, banyak mode").

## Membuat sesi

Dialog **Mulai live** di `/quizzes/{id}/live` mendapat pilihan **Papan Soal**, dengan kelompok pengaturan yang sama dengan prototipe:

1. **Peserta dan giliran:** format (individu atau tim), batas yang ikut (jumlah peserta, atau jumlah tim), urutan giliran, yang memilih soal.
2. **Kalau jawaban salah:** aturan sesi, cara merebut, maks. perebut per soal, tampilkan atau sembunyikan jawaban salah sebelumnya.
3. **Waktu:** menjawab (default 10 detik), memilih soal (default 10 detik), jendela buzz (default 5 detik).
4. **Poin:** poin default (100, boleh negatif), penalti salah (default 0).
5. **Soal di papan:** tabel berisi nomor, cuplikan pertanyaan, kategori, poin, waktu, dan "Jika salah" (ikuti sesi, boleh direbut, atau hangus).

Soal yang tidak bisa dimainkan live dilewati dan disebutkan di dialog, sama seperti mode lain. Peringatan tipe soal ada di bagian [Tipe soal](#tipe-soal).

## Tahap

```
lobby ──Mulai──▶ pick ──pilih / waktu habis (acak)──▶ countdown (2 dtk) ──▶ open (penjawab)

open ──benar────────────────────────────────────────────────────────▶ reveal (dimenangkan)
open ──salah / waktu habis──┬── aturan hangus ──────────────────────▶ reveal (hangus)
                            ├── tidak ada kandidat perebut ─────────▶ reveal (tak terjawab)
                            └── boleh direbut ──▶ pass (2 dtk) ──┬── lempar ──▶ open (unit berikutnya)
                                                                 └── buzz ────▶ buzz ──BUZZ──▶ open (pemegang)
                                                                                    └── habis ──▶ reveal (tak terjawab)

reveal ──Lanjut──▶ pick (giliran berikutnya) | podium (tidak ada soal tersedia)
```

- Tahap baru di `live_phase`: `pick`, `pass`, `buzz`. Tahap `countdown`, `open`, `reveal`, `podium`, dan `ended` dipakai ulang, termasuk buka serentak (P8-03) supaya soal tampil bersamaan di proyektor dan HP.
- Tidak ada tahap `leaderboard`: skor selalu tampil di bawah papan proyektor.
- Host bisa menghanguskan soal dari `countdown`, `open`, `pass`, atau `buzz`. Sesi langsung pindah ke `reveal (hangus)`.
- Semua perpindahan memakai `state_version` seperti live. Klik ganda atau dua tab host tidak bisa melompati tahap.

## Giliran

- Urutan giliran adalah urutan unit masuk lobby, atau diacak saat Mulai (`turnOrder`). Host bisa menggeser urutan di lobby sebelum mulai. Urutan disimpan di `board_state.turn_order`.
- Setelah reveal, giliran pindah ke unit berikutnya setelah **pemilik giliran**, bukan setelah perebut.
- Peserta yang masuk terlambat ditambahkan di akhir urutan, selama batas belum penuh. Peserta yang dikeluarkan dilewati.
- **Batas yang ikut:**
  - Individu: host mengisi `maxPlayers` (0 = tanpa batas). Peserta setelah batas penuh tetap bisa masuk, tetapi sebagai **penonton**: HP-nya menampilkan papan dan skor, tanpa giliran dan tanpa BUZZ. Lobby proyektor menampilkan "6 / 6 ikut · 12 menonton".
  - Tim: batasnya adalah jumlah tim (`teams.count`, 2–5). Semua anggota tetap masuk ke salah satu tim.
  - Di lobby host bisa memindahkan peserta antara **ikut** dan **menonton**, misalnya untuk memilih wakil kelas. Pemindahan tidak bisa melewati batas.
- **Tim:** giliran per tim. Anggota mana pun boleh memilih, menjawab, atau menekan BUZZ untuk timnya. Yang pertama diterima database mewakili tim, dan anggota lain mendapat `team_answered` (aturan dari P8-02).
- Host bisa melewati giliran, misalnya kalau pemilik giliran sedang tidak ada.

## Memilih soal

- `picker: 'owner'`: pemilik giliran memilih soalnya sendiri.
- `picker: 'last_winner'`: unit yang terakhir menjawab benar memilihkan soal untuk pemilik giliran. HP-nya menampilkan "Pilihkan soal untuk Citra".
  - Kalau soal sebelumnya tidak terjawab benar (hangus, tak terjawab, atau giliran dilewati), pemilik giliran memilih sendiri. Proyektor menjelaskan alasannya.
  - Kalau pemenang terakhir adalah pemilik giliran itu sendiri, dia memilih untuk dirinya.
- HP pemilih menampilkan daftar soal yang masih tersedia: nomor, kategori, poin, tipe, waktu, dan tanda "hangus jika salah". **Isi soal baru dikirim setelah soal dipilih.**
- Kalau `pickS` habis, server memilih soal tersedia secara acak (`advance_live('auto')`).
- Proyektor menampilkan papan. HP lain menampilkan "Menunggu Andi memilih soal", dan HP pemilik giliran (kalau bukan pemilih) menampilkan "Bunga sedang memilihkan soal untukmu".

## Menjawab dan merebut

- Hanya penjawab yang bisa mengirim jawaban. Unit lain mendapat `not_answerer`.
- **Satu kesempatan per unit per soal.** Untuk individu ditegakkan oleh `unique (round_id, participant_id)` di `battle_answers`. Untuk tim, RPC memeriksa jawaban anggota lain di putaran yang sama.
- **Benar:** unit mendapat poin soal. Soal tertutup dan di papan berganti warna serta nama unit itu. Unit itu menjadi `last_winner` untuk aturan pemilih.
- **Salah atau waktu habis:** `wrongPenalty` dikurangi, lalu aturan salah diterapkan.

Urutan aturan salah:

1. Host menghanguskan soal: hangus, kapan saja.
2. Aturan soal (`tiles[].onWrong`), kalau diisi.
3. Aturan sesi (`board.onWrong`).

Kalau soal **boleh direbut**:

- Kandidat adalah unit yang belum mencoba soal ini. Kalau tidak ada kandidat, atau jumlah perebut sudah mencapai `maxSteals`, soal menjadi tak terjawab.
- `steal: 'next'`: soal dilempar ke kandidat berikutnya setelah **penjawab terakhir** dalam urutan giliran. Penjawab baru mendapat waktu soal penuh.
- `steal: 'buzz'`: sesi masuk tahap `buzz` selama `buzzS`. Kandidat menekan BUZZ, dan `board_buzz_in` memberi hold ke BUZZ pertama yang diterima database (`buzzer_holds`, berlaku selama waktu soal). Kalau tidak ada yang menekan BUZZ, soal menjadi tak terjawab.
- Tahap `pass` (2 detik) menampilkan "Andi belum tepat. Soal dilempar ke Bunga" sebelum timer perebut mulai.
- `showWrongAnswers`:
  - **Tampilkan:** jawaban salah sebelumnya terlihat di proyektor, dan opsi yang sudah dipilih salah dinonaktifkan di HP perebut.
  - **Sembunyikan:** proyektor hanya menampilkan siapa saja yang sudah salah.

## Kontrol host

| Aksi                     | Kapan                                                     | Efek                                                                                                  |
| ------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Lewati giliran           | `pick`                                                    | Giliran pindah ke unit berikutnya                                                                     |
| Hanguskan soal ini       | `countdown`, `open`, `pass`, `buzz`                       | Soal hangus (oleh host), lalu reveal                                                                  |
| Hanguskan soal di papan  | `pick`, `reveal`                                          | Soal tersedia langsung hangus tanpa dimainkan                                                         |
| Buka lagi                | Soal hangus atau tak terjawab yang tidak sedang dimainkan | Soal kembali tersedia. Percobaan lama tetap ada di laporan; permainan berikutnya memakai putaran baru |
| Nilai manual Benar/Salah | `open`                                                    | Menilai jawaban yang diucapkan (atau tipe Lisan). Dicatat dengan `source = 'host'`                    |
| Koreksi skor             | Kapan saja sebelum sesi ditutup                           | Tambah atau kurangi skor sebuah unit (+/−) dengan catatan opsional. Tercatat di riwayat dan laporan   |
| Jeda / lanjutkan         | Selama timer berjalan                                     | Sama dengan live                                                                                      |
| Akhiri                   | Kapan saja                                                | Ke podium dengan skor saat ini                                                                        |

Layar host selalu menampilkan kunci jawaban soal yang sedang dimainkan (hanya di state host).

## Poin dan skor

- Benar: + poin soal. Salah atau waktu habis: − `wrongPenalty`.
- **Poin soal boleh negatif.** Soal seperti ini berfungsi sebagai soal jebakan (zonk): menjawab benar justru mengurangi skor.
- **Skor boleh minus.** Berbeda dari rebutan (skor tidak pernah di bawah 0), karena soal jebakan dan penalti adalah pilihan host.
- Tim: skor tim = jumlah poin anggotanya, sama dengan rebutan.
- **Koreksi skor oleh host** dicatat terpisah di `board_adjustments` (unit, selisih, catatan, waktu), lalu ditambahkan ke skor unit. Klasemen menampilkan skor akhir; laporan menampilkan rinciannya.
- Peringkat: skor tertinggi. Seri dipecah dengan jumlah soal yang dimenangkan, lalu rata-rata waktu jawaban benar.

## Tipe soal

Semua tipe yang bisa dimainkan live ([04](04-question-types.md#matriks-kapabilitas)) bisa dipakai, dan dalam satu sesi boleh campur. Esai dan Cerita Bercabang dilewati.

| Tipe                                                     | Status | Catatan                                                                                                                |
| -------------------------------------------------------- | :----: | ---------------------------------------------------------------------------------------------------------------------- |
| Pilihan Ganda, Isian, Angka, Slider, Odd One Out         |   ✅   |                                                                                                                        |
| Benar / Salah                                            |   ⚠️   | Kalau boleh direbut, perebut tinggal memilih jawaban sebaliknya. Dialog menyarankan "Hangus jika salah" untuk soal ini |
| Matching, Sequencing, Grouping, Guess the Blank, Hotspot |   ⚠️   | Butuh waktu lebih lama. Dialog mengingatkan kalau waktunya ≤ 10 detik                                                  |
| Esai, Cerita Bercabang                                   |   ❌   | Tidak bisa live                                                                                                        |
| **Lisan** (tipe baru P9-21, hanya untuk Papan)           |   ✅   | Tanpa isian di HP. Peserta menjawab dengan suara, host menekan Benar/Salah. Kunci hanya untuk host                     |

Matriks ini masuk ke `capabilities.modes` tiap tipe sebagai mode `board` (P9-11), lalu kolom **Papan** ditambahkan di [04](04-question-types.md#matriks-kapabilitas).

## Model data

Tabel baru (`board_state`, `board_tiles`), nilai enum baru, dan kolom tambahan dijelaskan di [03 · Papan soal](03-data-model.md#papan-soal). Ringkasnya:

- `board_tiles`: satu baris per soal di papan, berisi pengaturan hasil override (kategori, poin, waktu, aturan salah) dan status (`open`, `won`, `burned`, `missed`).
- `board_state`: satu baris per sesi, berisi urutan giliran, pemilik giliran, pemilih, penjawab, dan pemenang terakhir.
- `board_adjustments`: koreksi skor oleh host.
- `battle_rounds`: satu baris **setiap kali sebuah soal dimainkan**. `idx` adalah urutan main, bukan posisi soal. Soal yang dibuka lagi mendapat putaran baru.
- `battle_answers`: satu baris per percobaan (penjawab pertama dan para perebut), dengan kolom baru `source` (`player`, `timeout`, `host`).
- `buzzer_holds` dipakai ulang untuk tahap `buzz`.

## RPC

| RPC                                                           | Pemanggil             | Fungsi                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `advance_live` (diperluas)                                    | host (pemilik)        | Mulai papan (urutan giliran, isi `board_tiles`); `auto` dari `pick` (soal acak), `open` (waktu habis = salah), `pass` (lempar atau buzz), dan `buzz` (habis = tak terjawab); `next` dari `reveal` ke `pick` atau podium |
| `board_pick(participant, question)`                           | `service_role`        | Validasi pemilih (atau anggota timnya) dan soal tersedia, buat putaran, masuk `countdown`                                                                                                                               |
| `record_board_answer(participant, question, answer, correct)` | `service_role`        | Satu transaksi dengan baris sesi dikunci `for update`: validasi penjawab dan tenggat, catat percobaan, poin atau penalti, terapkan aturan salah, pindah tahap                                                           |
| `board_buzz_in(participant, question)`                        | `service_role`        | Hold untuk BUZZ pertama dari kandidat perebut                                                                                                                                                                           |
| `board_host(session, version, action, question?)`             | host (pemilik)        | `skip`, `burn`, `burn_tile`, `reopen`, `judge_correct`, `judge_wrong`, `adjust_score` (unit, selisih, catatan); di lobby: `set_playing` (ikut/menonton)                                                                 |
| `live_game_state` (diperluas)                                 | host / `service_role` | Menambahkan bagian `board` ke state                                                                                                                                                                                     |

Penilaian tetap di server: Server Action menjalankan `score()` dari registry lalu memanggil `record_board_answer`, sama dengan alur rebutan ([10 · Alur jawaban](10-mode-battle.md#alur-jawaban)).

## Realtime

Tidak ada event baru. `state` bertanda tangan membawa bagian `board`:

```ts
board: {
  tiles: {
    questionId: string; n: number; category?: string; points: number;
    type: string; timeS: number; onWrong: "steal" | "burn";
    status: "open" | "won" | "burned" | "missed";
    closedBy?: "rule" | "host"; winnerUnitId?: string;
  }[];                                   // tanpa teks soal
  turn: { order: string[]; ownerId: string; pickerId: string; answererId?: string; isSteal: boolean; note?: string };
  attempts: { unitId: string; correct: boolean; answer?: unknown }[];  // soal yang sedang dimainkan
  hold?: { unitId: string; nickname: string; expiresAt: string };
}
```

Pengaman kebocoran:

- Teks soal baru ikut di state setelah soal dipilih (`countdown`).
- Kunci jawaban hanya ikut saat `reveal`. Untuk tipe Lisan, kunci hanya ada di state host.
- `attempts[].answer` hanya diisi kalau `showWrongAnswers` menyala. Jawaban benar tidak pernah muncul sebelum `reveal`.

## Layar

| Layar         | Isi                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Proyektor** | Banner giliran ("Giliran Andi memilih soal", "Bunga memilihkan soal untuk Citra") + timer lingkaran. Papan: kolom per kategori jika 2–6 kategori dan semua soal punya kategori, selain itu grid bernomor. Soal yang dimenangkan memakai warna dan nama unit; yang hangus atau tak terjawab bergaris dan pudar. Saat soal dimainkan: soal besar, opsi berwarna dan berbentuk, percobaan sebelumnya. Skor semua unit di bawah, dengan penanda "giliran" |
| **HP**        | Pemilih: daftar soal tersedia. Penjawab: input sesuai tipe. Unit lain: menunggu, "siap merebut", atau tombol BUZZ. Hasil: benar/salah, poin, "soal dilempar ke kamu"                                                                                                                                                                                                                                                                                  |
| **Host**      | Kunci jawaban, Benar/Salah manual, hanguskan atau buka lagi per soal, lewati giliran, koreksi skor, jeda, riwayat kejadian                                                                                                                                                                                                                                                                                                                            |

Visual mengikuti [05 · Design System](05-design-system.md): proyektor berlatar gelap, warna unit dari palet slot jawaban plus bentuknya, tombol 3D di HP, dan copy yang menyemangati.

## Laporan

`/quizzes/{id}/live/{sessionId}` untuk sesi papan:

- Klasemen: skor, soal dimenangkan, jumlah benar dan salah, rata-rata waktu jawaban benar, dan total koreksi host.
- Daftar koreksi skor: unit, selisih, catatan, waktu.
- Per soal: dipilih oleh siapa dan untuk siapa, percobaan berurutan (unit, jawaban, benar/salah, waktu, sumber), dan hasil (dimenangkan, hangus karena aturan, hangus oleh host, tak terjawab, tidak dimainkan).
- Ekspor CSV dan analisis butir soal seperti live.

## Keputusan dari prototipe

Diambil dari jawaban pemilik produk dan uji coba prototipe (2026-09, dilengkapi 2026-10-10). Bisa diubah sebelum implementasi.

| Hal                                         | Keputusan                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| Cara merebut                                | Keduanya bisa dipilih per sesi: dilempar sesuai urutan, atau rebutan dengan BUZZ |
| Yang memilih soal                           | Keduanya bisa dipilih per sesi: pemilik giliran, atau penjawab benar terakhir    |
| Hangus                                      | Tiga tingkat: aturan sesi, aturan per soal, dan host saat sesi berjalan          |
| Poin                                        | Default 100, bisa diatur per soal, boleh negatif                                 |
| Waktu menjawab                              | Default 10 detik, bisa diatur per soal                                           |
| Individu atau tim                           | Pilih salah satu per sesi                                                        |
| Tipe soal                                   | Boleh campur dalam satu sesi; hanya tipe yang bisa live                          |
| Pemilih saat soal sebelumnya tidak terjawab | Pemilik giliran memilih sendiri                                                  |
| Soal dilempar ke                            | Unit berikutnya setelah penjawab terakhir                                        |
| Giliran berikutnya                          | Unit berikutnya setelah pemilik giliran (perebut tidak memotong urutan)          |
| Koreksi skor                                | Host bisa menambah atau mengurangi skor unit kapan saja, tercatat di laporan     |
| Batas yang ikut                             | Host menentukan batas peserta (individu) atau jumlah tim; sisanya menonton       |
| Tipe Lisan                                  | Hanya untuk mode Papan                                                           |
| Soal yang dibuka lagi                       | Kembali ke papan dan bisa dipilih siapa saja                                     |

## Implementasi (rencana)

| Bagian        | Lokasi                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Migrasi & RPC | `supabase/migrations/…_board.sql`, test `supabase/tests/board.test.ts`                             |
| Policy        | `policy.board` di `src/engine/policy.ts`                                                           |
| Engine        | `src/engine/board/` (tampilan per layar, aturan salah, engine lokal untuk playground)              |
| Server Action | `src/app/play/live-actions.ts` (pilih, jawab, BUZZ), `src/app/host/actions.ts` (aksi host)         |
| Layar         | `src/components/live/` (tahap papan di `HostStages` dan `LivePlayer`, atau komponen `BoardStages`) |
| Playground    | `/playground/live?mode=papan` (proyektor + HP + bot)                                               |
