# P2 · Mode Latihan & Embed

**Tujuan:** peserta bisa mengerjakan quiz lewat link, kode, atau embed. Semua penilaian dilakukan di server. Hasilnya bisa dilihat guru.
**Referensi:** [06-mode-practice](../../docs/06-mode-practice.md), [07-embed](../../docs/07-embed.md), [02-architecture § Alur penilaian](../../docs/02-architecture.md#alur-penilaian-server-authoritative)

## Database & server

- [ ] **P2-01** Migrasi: `sessions`, `participants`, `attempts`, `responses` + index kode aktif.
- [ ] **P2-02** `engine/policy.ts`: skema Zod `Policy` + default per mode.
- [ ] **P2-03** Aktifkan anonymous sign-in di Supabase. Buat helper `ensureParticipantAuth()` di klien.
- [ ] **P2-04** RPC `join_session(code, nickname)`: validasi status dan jadwal, nickname unik (tambah akhiran angka jika sudah dipakai), filter kata terlarang.
- [ ] **P2-05** RPC `start_attempt`: batas attempt, seed, `question_ids` (acak jika policy), `deadline` opsional.
- [ ] **P2-06** RPC `get_play_payload(attempt_id)`: kembalikan soal dari snapshot yang sudah di-strip. Karena `stripAnswers` ditulis di TS, payload dibangun di Server Action memakai client `service_role`, dan RPC hanya memvalidasi kepemilikan attempt.
- [ ] **P2-07** Server Action `submitAnswer`: parse → score → `record_response` (upsert, hanya `service_role`) → kembalikan hasil sesuai `policy.feedback`.
- [ ] **P2-08** Server Action `submitAttempt` + RPC `submit_attempt`: hitung skor, XP, dan streak (logika dari `gamifyComputeRetro`).
- [ ] **P2-09** RLS untuk tabel-tabel baru (lihat tabel RLS di dokumen data model). Tambahkan test SQL (pgTAP, atau skrip yang login sebagai peserta dan mencoba membaca `questions` → harus gagal).

## Host

- [ ] **P2-10** Dari dashboard quiz: tombol "Bagikan untuk latihan" membuat sesi `practice` dan menampilkan link, kode, dan QR.
- [ ] **P2-11** Halaman hasil sesi: tabel peserta (nickname, skor, durasi, attempt ke-), klik untuk melihat detail jawaban per soal.

## Player

- [ ] **P2-12** `/join`: input kode 6 digit (auto-advance antar kotak, bisa ditempel), lalu input nickname.
- [ ] **P2-13** Shell player: satu soal per layar, progress, tombol 3D, tema dari quiz, mobile-first.
- [ ] **P2-14** Feedback instan: layar feedback, HUD XP dan streak, reaksi (dari `gamifyReactionMsg`), confetti, suara (dengan mute).
- [ ] **P2-15** Mode feedback `end`: tanpa feedback per soal, lalu review di akhir.
- [ ] **P2-16** Layar hasil: skor berwarna, ringkasan XP dan streak, daftar review per soal (dari `buildReviewList`), tombol coba lagi.
- [ ] **P2-17** Melanjutkan attempt setelah refresh + antrean jawaban saat offline.
- [ ] **P2-18** `prefers-reduced-motion` dan mode gelap di player.

## Embed

- [ ] **P2-19** Route `/embed/[slug]` dengan layout minimal + parameter `session`, `theme`, `lang`.
- [ ] **P2-20** Header `frame-ancestors` dari `embed_allowed_origins`, disetel di `src/proxy.ts`.
- [ ] **P2-21** Protokol `postMessage` (ready, resize dengan `ResizeObserver`, started, answered, completed) + validasi origin.
- [ ] **P2-22** `public/embed.js`: loader `data-quiz`, auto-resize, event diteruskan sebagai `CustomEvent`. Target ukuran < 3KB gzip.
- [ ] **P2-23** Panel Embed di editor: daftar domain diizinkan, snippet script dan iframe, tombol salin (dari panel Embed prototipe).
- [ ] **P2-24** Embed token: generate secret per quiz, endpoint verifikasi JWT, pemetaan `external_id`. Sertakan contoh kode penandatanganan (Node & PHP) di dokumen.
- [ ] **P2-25** Halaman demo `embed-test.html` (lokal) untuk menguji embed dari origin lain.

## Test

- [ ] **P2-26** E2E: guru membagikan → peserta join → mengerjakan → hasil muncul di halaman guru.
- [ ] **P2-27** Test keamanan: payload yang diterima peserta tidak mengandung `correctIds`, `pairs`, `oddId`, `spots`, dan sejenisnya. Cek ini di network response pada E2E.

## Definition of Done

- Peserta tanpa akun bisa menyelesaikan quiz dari HP dalam alur kurang dari 15 detik sampai soal pertama.
- Tidak ada kunci jawaban di respons jaringan mana pun untuk peserta.
- Quiz bisa di-embed di domain yang diizinkan, dan ditolak di domain lain.
- Guru melihat hasil setiap peserta.
