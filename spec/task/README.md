# Task per Fase

Rencana implementasi dipecah menjadi 10 fase. Setiap fase menghasilkan sesuatu yang bisa dipakai dan diuji. Detail desain ada di [`docs/`](../../docs/README.md).

| Fase | File                                                   | Hasil                                                           | Bergantung pada    |
| ---- | ------------------------------------------------------ | --------------------------------------------------------------- | ------------------ |
| P0   | [phase-0-setup.md](phase-0-setup.md)                   | Repo, tooling, Supabase, CI                                     | –                  |
| P1   | [phase-1-builder-mvp.md](phase-1-builder-mvp.md)       | Guru bisa membuat & publish quiz (5 tipe soal)                  | P0                 |
| P2   | [phase-2-practice-embed.md](phase-2-practice-embed.md) | Peserta bisa latihan lewat link/kode/embed, penilaian di server | P1                 |
| P3   | [phase-3-advanced-types.md](phase-3-advanced-types.md) | Port 7 tipe soal lanjutan dari prototipe                        | P2                 |
| P4   | [phase-4-exam.md](phase-4-exam.md)                     | Mode ujian lengkap + laporan butir soal                         | P2 (P3 opsional)   |
| P5   | [phase-5-live.md](phase-5-live.md)                     | Mode live dengan lobby, poin kecepatan, leaderboard             | P2                 |
| P6   | [phase-6-battle-buzzer.md](phase-6-battle-buzzer.md)   | Rebutan varian "tercepat benar"                                 | P5                 |
| P7   | [phase-7-battle-royale.md](phase-7-battle-royale.md)   | Battle royale dengan nyawa, eliminasi, penonton                 | P6                 |
| P8   | [phase-8-extras.md](phase-8-extras.md)                 | Pencet-lalu-jawab, tim, jeda toleransi, webhook, LTI, AI        | P6–P7              |
| P9   | [phase-9-board.md](phase-9-board.md)                   | Papan soal: bergiliran memilih soal, rebut atau hangus          | P5–P6, P8-01–P8-03 |

P3 dan P4 bisa dikerjakan paralel dengan P5 jika ada lebih dari satu developer.

## Konvensi

- ID task: `P{fase}-{nomor}`, misalnya `P1-07`. Pakai ID ini di nama branch dan pesan commit: `feat(P1-07): editor pilihan ganda`.
- Status ditandai langsung di file: `- [ ]` belum, `- [x]` selesai. Task yang sedang dikerjakan diberi `🚧`.
- Setiap fase punya **Definition of Done**. Fase belum selesai sebelum semua poinnya terpenuhi.
- Setiap tipe soal wajib punya unit test `score()` dan `stripAnswers()` sebelum dianggap selesai.
- Jika desain berubah saat implementasi, perbarui dokumen di `docs/` di PR yang sama.
