# P2 · Mode Latihan & Embed

**Tujuan:** peserta bisa mengerjakan quiz lewat link, kode, atau embed. Semua penilaian dilakukan di server. Hasilnya bisa dilihat guru.
**Referensi:** [06-mode-practice](../../docs/06-mode-practice.md), [07-embed](../../docs/07-embed.md), [02-architecture § Alur penilaian](../../docs/02-architecture.md#alur-penilaian-server-authoritative)

> **Status verifikasi.** Mesin penilaian, SQL/RLS (di PGlite), token, protokol embed, dan seluruh UI player sudah teruji. UI player diuji di `/playground/play` dan pratinjau editor dengan engine in-memory yang sama. Yang ditandai 🚧 sudah selesai kodenya tapi butuh Supabase asli untuk diuji: berbagi, hasil, embed ujung-ke-ujung, dan E2E di CI.

## Perubahan desain

- **Identitas peserta memakai participant token, bukan Supabase anonymous sign-in.** Cookie sesi Supabase (`SameSite=Lax`) tidak terkirim di iframe lintas situs, jadi Server Action tidak bisa mengenali peserta di mode embed. Server kini menerbitkan token HMAC yang disimpan di `localStorage` dan dikirim di setiap aksi. Lihat [02-architecture § Identitas peserta](../../docs/02-architecture.md#identitas-peserta).
- **Tidak ada RPC `get_play_payload` terpisah.** Soal versi aman dikirim di respons `startAttemptAction`, karena `stripAnswers` berjalan di TypeScript.
- **Sesi latihan default mengikuti versi terbaru** (`sessions.quiz_version_id = null`). Versi dikunci per attempt (`attempts.quiz_version_id`).
- **Seed diturunkan per soal** (`deriveSeed`). Tanpa ini, semua soal dengan jumlah opsi sama akan diacak dengan pola yang sama, sehingga posisi jawaban benar bisa ditebak.

## Database & server

> ✅ Di Supabase cloud: `join_session` ditolak untuk anon (`permission denied`) dan berjalan untuk service role (`session_closed` untuk sesi yang tidak ada). `/play/000000`, `/embed/…`, dan redirect `/quizzes` → `/login` sudah dicek ke database sungguhan.

- [x] **P2-01** Migrasi: `sessions`, `participants`, `attempts`, `responses` + index kode aktif. Ditambah `quiz_embed_secrets`. Lihat [`20260926100000_practice_sessions.sql`](../../supabase/migrations/20260926100000_practice_sessions.sql).
- [x] **P2-02** `engine/policy.ts`: skema Zod `Policy` + default per mode, dengan `resolvePolicy` untuk JSON lama atau sebagian.
- [x] **P2-03** ~~Aktifkan anonymous sign-in~~ → **participant token** (`src/lib/participant-token.ts`): HMAC, 30 hari, menolak token palsu, diubah, atau kedaluwarsa.
- [x] **P2-04** RPC `join_session(session, nickname, external_id)`: validasi status dan jadwal, nickname unik tanpa beda huruf besar/kecil (akhiran angka), filter kata kasar di TS (tanpa salah blokir "Asuka"/"Dickson").
- [x] **P2-05** RPC `start_attempt`: melanjutkan attempt terbuka, batas attempt, seed, `question_ids`, `deadline` opsional.
- [x] **P2-06** ~~RPC `get_play_payload`~~ → payload aman dibangun di `startAttemptAction`, termasuk jawaban tersimpan untuk melanjutkan.
- [x] **P2-07** Server Action `submitAnswerAction`: parse → score → `record_response` (hanya `service_role`) → hasil sesuai `policy.feedback`. Mode instan: jawaban pertama final.
- [x] **P2-08** Server Action `finishAttemptAction` + RPC `submit_attempt`: skor, XP, streak (logika `gamifyComputeRetro`). Idempoten.
- [x] **P2-09** RLS tabel baru: host hanya bisa membaca sesinya sendiri; host, anon, dan browser tidak bisa menulis peserta/jawaban. Ada 16 test di [`supabase/tests/sessions.test.ts`](../../supabase/tests/sessions.test.ts).

## Host

- [ ] 🚧 **P2-10** Tombol **Bagikan** di editor: membuat sesi latihan, lalu menampilkan kode, link, QR, dan pengaturan (feedback langsung/akhir, acak soal/opsi, jumlah kesempatan). Kode selesai; butuh Supabase untuk diuji.
- [ ] 🚧 **P2-11** Halaman hasil `/quizzes/[id]/results`: statistik, tabel percobaan (nama, nilai, durasi, status), dan detail per percobaan (jawaban vs kunci, penjelasan). Ada juga menu **Hasil** di kartu dashboard. Kode selesai; butuh Supabase.

## Player

- [x] **P2-12** `/join`: 6 kotak digit (auto-advance, backspace mundur, tempel kode dengan teks lain), cek kode sebelum pindah halaman.
- [x] **P2-13** Shell player (`PracticePlayer`): satu soal per layar, progress, tombol 3D, tema quiz, mobile-first. Dipakai juga oleh pratinjau editor (duplikat kode dihapus) dan embed.
- [x] **P2-14** Feedback instan: panel feedback dengan reaksi dari prototipe, HUD XP + streak, confetti (≥ 80%), dan suara sintesis Web Audio (tanpa file) dengan tombol mute yang diingat.
- [x] **P2-15** Mode feedback `end`: tanpa feedback per soal dan tanpa XP berjalan; hasil dan review di akhir.
- [x] **P2-16** Layar hasil: skor berwarna, XP dan streak terbaik, review per soal yang bisa dibuka (jawaban vs kunci), **Coba lagi**.
- [ ] 🚧 **P2-17** Melanjutkan attempt setelah refresh ✅ (termasuk layar "sudah pernah mengerjakan" alih-alih diam-diam membuat attempt baru), retry otomatis + **Coba lagi** saat offline ✅. Antrean offline yang bertahan setelah reload ❌ (belum).
- [x] **P2-18** `prefers-reduced-motion` (CSS global + confetti dimatikan) dan token mode gelap.
  - Ditemukan lewat E2E mobile: tombol Pratinjau/Bagikan di layar kecil hanya berisi ikon, jadi tidak punya nama untuk pembaca layar. Status simpan juga tersembunyi. Keduanya sudah diperbaiki (`aria-label`, `sr-only sm:not-sr-only`).

## Embed

- [ ] 🚧 **P2-19** Route `/embed/[slug]` dengan tinggi natural (untuk auto-resize) + parameter `session`, `theme`, `token`. Parameter `lang` belum ada (UI masih bahasa Indonesia saja).
- [x] **P2-20** Header `frame-ancestors` dari `embed_allowed_origins`, disetel di `src/proxy.ts` (cache 1 menit). Semua halaman lain mendapat `frame-ancestors 'self'` (anti-clickjacking), `nosniff`, dan `Referrer-Policy`.
- [x] **P2-21** Protokol `postMessage` (`ready`, `resize`, `started`, `answered`, `completed`; host → `setTheme`, `restart`) dengan validasi origin di kedua arah ([`src/lib/embed-protocol.ts`](../../src/lib/embed-protocol.ts)).
- [x] **P2-22** `public/embed.js`: loader `data-quiz`, auto-resize, event `CustomEvent`, `el.quiz.restart()/setTheme()`. Ukuran **1,2 KB gzip**.
- [ ] 🚧 **P2-23** Tab **Embed** di dialog Bagikan: daftar domain (divalidasi, `https://` wajib kecuali localhost), snippet script/iframe + salin. Kode selesai; butuh Supabase.
- [ ] 🚧 **P2-24** Embed token: verifikasi HS256 ✅ (menolak `alg: none`, salah quiz, kedaluwarsa, > 1 jam; unit test), contoh Node & PHP di dokumen ✅, buat/tampilkan/ganti secret di panel 🚧.
- [x] **P2-25** Demo situs lain: `pnpm embed:demo` → `http://localhost:5500/?quiz=SLUG` (log event + tombol kontrol).

## Test

- [ ] 🚧 **P2-26** E2E [`e2e/practice.spec.ts`](../../e2e/practice.spec.ts): guru publish → bagikan → peserta (konteks HP terpisah) join → jawab → hasil di halaman guru; plus embed di situs yang diizinkan (event diterima) vs situs lain (diblokir). Jalan di CI (`E2E_SUPABASE=1`).
- [ ] 🚧 **P2-27** Tes keamanan di E2E yang sama: tidak ada respons jaringan yang memuat `correctIds` sebelum peserta menjawab. Unit test kontrak (`registry.test.ts`, `practice.test.ts`) sudah memastikan `stripAnswers`/`toPlayQuestion` tanpa kunci.
- [x] Tambahan: [`e2e/playground.spec.ts`](../../e2e/playground.spec.ts) menguji player (instan & akhir), filter nickname, pratinjau editor, dan form kode di dev server tanpa DB.

## Definition of Done

- [ ] Peserta tanpa akun bisa menyelesaikan quiz dari HP dalam alur kurang dari 15 detik sampai soal pertama. Alurnya kode → nickname → soal (2 layar); menunggu uji dengan Supabase.
- [ ] Tidak ada kunci jawaban di respons jaringan mana pun untuk peserta. Terjamin di unit test; E2E jaringan menunggu CI.
- [ ] Quiz bisa di-embed di domain yang diizinkan, dan ditolak di domain lain. E2E sudah ditulis, menunggu CI.
- [ ] Guru melihat hasil setiap peserta. Menunggu Supabase.
