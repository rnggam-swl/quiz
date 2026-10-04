# P8 · Lanjutan

**Tujuan:** melengkapi mekanik battle dan integrasi setelah fondasi stabil. Urutan di bawah adalah usulan prioritas dan bisa diubah sesuai masukan pengguna.

**Urutan pengerjaan (2026-09-29, dari yang paling cepat):** P8-16 → P8-14 → P8-09 → P8-07 → P8-06 → P8-15 → P8-11 → P8-13 → P8-12 → P8-03 → P8-10 → P8-04 → P8-01 → P8-02 → P8-08. P8-05 ditunda.

## Battle

- [x] **P8-01** Rebutan varian **Pencet lalu Jawab**: tabel `buzzer_holds`, tombol BUZZ, hold eksklusif `holdS` detik, buzzer dibuka lagi jika salah atau waktu habis, event `buzz_hold`. _(`buzz_in`; hold ikut di `state` bertanda tangan, bukan event terpisah; lihat [docs/10](../../docs/10-mode-battle.md#varian-b-pencet-lalu-jawab-gaya-cerdas-cermat--p8-01).)_
- [x] **P8-02** **Mode tim**: tabel `teams`, pilih atau bagi otomatis di lobby, poin/nyawa per tim, leaderboard tim, satu perwakilan buzzer per tim. _(Live: rata-rata, rebutan: jumlah, royale: anggota bertahan; lihat [docs/10](../../docs/10-mode-battle.md#mode-tim--p8-02).)_
- [x] **P8-03** **Buka serentak**: soal dikirim saat countdown dan ditampilkan pada `openedAt` sesuai waktu server. _(`openOnTime` + `open_due_round`; lihat [docs/09](../../docs/09-mode-live.md#buka-serentak).)_
- [x] **P8-04** **Jeda toleransi** (`graceMs`): status `resolving`, pemenang = `reaction_ms` terkecil yang sudah divalidasi di antara jawaban benar dalam jeda. _(`resolve_buzzer_round`, kredit latensi maks. 300 ms; lihat [docs/10](../../docs/10-mode-battle.md#keadilan-latensi).)_
- [ ] **P8-05** Power-up (opsional): 50:50, perisai (tahan satu kesalahan di royale), tambah waktu. Perlu keputusan desain dulu karena memengaruhi keadilan. _(Ditunda 2026-09-29: keputusan desain masih terbuka.)_

## Integrasi

- [x] **P8-06** Webhook `attempt.submitted` dengan tanda tangan HMAC + log pengiriman + retry. _(Standard Webhooks, outbox + retry 7×; lihat [docs/07](../../docs/07-embed.md#webhook).)_
- [x] **P8-07** API REST read-only untuk hasil (token API per workspace). _(Satu akun = satu workspace; `/api/v1/*`, token di Akun → Integrasi; lihat [docs/02](../../docs/02-architecture.md#api-rest).)_
- [x] **P8-08** LTI 1.3 (Moodle, Canvas) + pengiriman nilai ke gradebook. _(OIDC login, Deep Linking, AGS; lihat [docs/07](../../docs/07-embed.md#lti-13).)_
- [x] **P8-09** Plugin WordPress / oEmbed. _(`/api/oembed` + discovery; plugin di `integrations/wordpress/quiz-embed/`; lihat [docs/07](../../docs/07-embed.md#oembed--wordpress).)_

## Konten

- [x] **P8-10** Generate soal dengan AI dari topik, teks, atau PDF. Hasilnya berupa draft yang wajib ditinjau guru sebelum dipakai. _(Claude Opus 5.5 + structured output; butuh `ANTHROPIC_API_KEY`; lihat [docs/04](../../docs/04-question-types.md#generate-soal-dengan-ai).)_
- [x] **P8-11** Library quiz publik: visibilitas `public`, pencarian, duplikat ke akun sendiri. _(`/library`, **Bagikan → Library**, `copy_library_quiz`; lihat [docs/01](../../docs/01-product.md#library).)_
- [x] **P8-12** Bank soal lintas quiz (tag global). _(Dialog "Ambil dari bank soal" + saran tag; lihat [docs/04](../../docs/04-question-types.md#bank-soal).)_
- [x] **P8-13** Impor soal dari CSV/XLSX, dan ekspor. _(Menu spreadsheet di editor; lihat [docs/04](../../docs/04-question-types.md#impor--ekspor).)_

## Skala

- [x] **P8-14** Evaluasi server game khusus (PartyKit / Durable Objects / Colyseus) jika uji beban P5 menunjukkan batas Supabase Realtime di bawah kebutuhan. Implementasi baru cukup di `engine/transport/`. _(Keputusan: tetap Supabase Realtime; pemicu evaluasi ulang dan rekomendasi relay Durable Objects di [docs/09](../../docs/09-mode-live.md#evaluasi-server-game-khusus-p8-14).)_

## Perawatan

- [x] **P8-15** Bersihkan file yatim di bucket `quiz-media`: file milik quiz yang dihapus, dan media yang dilepas dari soal (di editor, hapus media hanya mengubah JSON soal). Usulan: job terjadwal yang membandingkan isi bucket dengan referensi di `questions.media`, `quizzes.cover_url`, dan `quiz_versions.snapshot`. _(`orphan_media()` + `/api/maintenance/media-cleanup`, harian lewat pg_cron; lihat [docs/03](../../docs/03-data-model.md#konten).)_
- [x] **P8-16** Lupa/reset password (email) dan ubah password di halaman akun. _(`/forgot-password`, `/reset-password`, `/account`; lihat [docs/02](../../docs/02-architecture.md#identitas-peserta).)_
