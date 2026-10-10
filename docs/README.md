# Dokumentasi Platform Quiz

Platform quiz interaktif dengan gaya Wayground: editornya bersih dan intuitif, tampilan pemainnya seru. Satu konten quiz bisa dijalankan dalam beberapa mode: latihan mandiri, embed di situs lain, ujian individu, live di kelas, battle (rebutan & battle royale), dan papan soal bergiliran.

## Daftar dokumen

| #   | Dokumen                              | Isi                                                                                |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| 01  | [Produk](01-product.md)              | Visi, target pengguna, mode, pembeda, di luar scope                                |
| 02  | [Arsitektur](02-architecture.md)     | Stack, struktur folder, Question Type Registry, alur penilaian, keamanan           |
| 03  | [Model Data](03-data-model.md)       | Skema database, RLS, versi quiz                                                    |
| 04  | [Tipe Soal](04-question-types.md)    | Config & jawaban tiap tipe, penilaian, matriks kapabilitas                         |
| 05  | [Design System](05-design-system.md) | Editor yang tenang vs player yang seru, token, warna jawaban, motion, suara        |
| 06  | [Mode Latihan](06-mode-practice.md)  | Self-paced, link/kode, layar hasil                                                 |
| 07  | [Embed](07-embed.md)                 | Iframe, script loader, protokol `postMessage`, embed token                         |
| 08  | [Mode Ujian](08-mode-exam.md)        | Timer server, bank soal, acak, autosave, integritas                                |
| 09  | [Mode Live](09-mode-live.md)         | Lobby PIN, host memandu soal, poin kecepatan, leaderboard                          |
| 10  | [Mode Battle](10-mode-battle.md)     | Rebutan (buzzer) dan battle royale (eliminasi)                                     |
| 11  | [Mode Papan Soal](11-mode-board.md)  | Bergiliran memilih soal dari papan, jawaban salah direbut atau hangus (rencana P9) |

Task implementasi per fase ada di [`spec/task/`](../spec/task/README.md).
Prototipe visual dan interaksi ada di [`spec/reference-html/formulir-builder-quiz-mode.html`](../spec/reference-html/formulir-builder-quiz-mode.html). Prototipe mode Papan Soal ada di [`spec/reference-html/papan-soal.html`](../spec/reference-html/papan-soal.html).

## Prinsip utama

1. **Satu konten, banyak mode.** Soal dibuat sekali. Mode dan aturannya ditentukan oleh `Session.mode` + `Session.policy`, bukan oleh quiz-nya.
2. **Server yang menilai.** Kunci jawaban tidak pernah dikirim ke peserta, kecuali di mode latihan yang memang mengizinkannya.
3. **Satu tipe soal = satu modul.** Editor, Player, skema, penilaian, dan validasi sebuah tipe soal hidup di satu folder.
4. **Tenang untuk guru, meriah untuk peserta.** Dua bahasa visual yang berbeda secara sengaja.
5. **Sesi berjalan di atas snapshot.** Mengedit quiz tidak boleh merusak sesi yang sedang berjalan.

## Keputusan yang sudah diambil

| Keputusan    | Pilihan                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------- |
| Fokus produk | Quiz saja. Mode Form dari prototipe tidak dibawa.                                               |
| Stack        | Next.js (App Router) + TypeScript + Tailwind + Supabase                                         |
| Realtime     | Supabase Realtime (Broadcast + Presence), dengan lapisan transport yang bisa diganti            |
| Battle       | Dua mekanik: **Rebutan** (buzzer) dan **Battle Royale** (eliminasi), di atas satu battle engine |

## Pertanyaan terbuka

- Target pengguna utama untuk MVP: sekolah/guru, HR/perusahaan, atau penyelenggara event?
- Model bisnis: gratis dengan batas, langganan per guru, atau lisensi sekolah?
- Batas peserta per sesi live/battle di MVP (usulan: 200).
- Integrasi LMS: LTI 1.3 sudah ada ([07 · Embed](07-embed.md#lti-13)). Perlukah Google Classroom juga?
