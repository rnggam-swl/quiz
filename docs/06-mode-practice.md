# 06 · Mode Latihan (self-paced)

Peserta mengerjakan quiz sendiri, kapan saja, lewat link, kode, atau embed. Mode ini menjadi fondasi untuk mode lain, karena alur attempt, penilaian di server, dan layar hasil dipakai ulang.

## Default policy

```ts
{
  feedback: 'instant',          // atau 'end' (sama dengan checkMode di prototipe)
  showCorrectAnswer: true,
  gamification: true,
  scoring: 'accuracy',
  attempts: 0,                  // tanpa batas
  shuffleQuestions: false,
  shuffleOptions: true,
  releaseResults: 'immediately',
  requireLogin: false,
  allowEmbed: true,
  timer: {},                    // opsional per soal
}
```

## Alur

1. Peserta membuka `/play/{code}` atau `/embed/{slug}`.
2. Peserta mengisi nickname (disaring dari kata kasar). Server memanggil `join_session` (nickname kembar menjadi "Budi 2"), lalu mengembalikan _participant token_ yang disimpan di `localStorage`.
3. `startAttemptAction(token)` membuat seed dan urutan soal di TypeScript, lalu `start_attempt` menyimpannya secara atomik. Kalau masih ada attempt terbuka, attempt itu yang dilanjutkan.
4. Respons yang sama berisi soal versi aman (`stripAnswers` dengan seed per soal, supaya pola urutan opsi tidak berulang antar soal), plus jawaban yang sudah tersimpan untuk melanjutkan.
5. Untuk setiap soal:
   - Peserta menjawab. Server Action `submitAnswer` menilai dan menyimpan jawaban lewat `record_response`.
   - Jika `feedback = 'instant'`, respons berisi `{ correct, total, points, reveal }`. `reveal` berisi jawaban benar dan penjelasan, jika `showCorrectAnswer`.
   - Jika `feedback = 'end'`, respons hanya `{ saved: true }`.
6. Peserta menekan Submit. Server memanggil `submit_attempt` dan menampilkan layar hasil.

## Gamifikasi

Diambil dari lapisan gamifikasi prototipe (`gamifyOnCheck`, `gamifyComputeRetro`). Perhitungannya dipindah ke server:

- **XP:** benar penuh = 10 + bonus streak `min(streak − 1, 5) × 2`. Parsial = `round(10 × ratio)`.
- **Streak:** bertambah jika benar penuh, reset jika tidak.
- **Reaksi:** pesan berdasarkan streak, misalnya "Mantap!", "Dua kali beruntun!", "On fire!", "Unstoppable!". Pesan saat salah dibuat lembut.
- Jika `feedback = 'end'`, XP dan streak dihitung ulang di akhir, lalu ditampilkan di layar hasil.

## Layar hasil

- Skor besar dengan warna berdasarkan persentase: ≥ 80% hijau, ≥ 50% kuning, < 50% merah (dari `.pv-score-box` prototipe).
- Ringkasan XP, streak maksimal, dan waktu total.
- Daftar review per soal: ✅ / ◐ / ❌ + `correct/total`, bisa diklik untuk melihat jawaban benar dan penjelasan.
- Tombol **Coba lagi** (jika `attempts` masih tersisa) yang membuat attempt baru dengan seed baru.

## Kasus khusus

- **Halaman dimuat ulang:** attempt `in_progress` dilanjutkan, beserta jawaban dan feedback-nya. Kalau attempt terakhir sudah selesai, player menampilkan "Kamu sudah pernah mengerjakan quiz ini" + **Mulai lagi**, dan tidak diam-diam membuat attempt baru.
- **Offline sesaat:** pengiriman diulang otomatis 3× (0,8 / 2 / 4 detik). Kalau masih gagal, muncul "Koneksi terputus" + **Coba lagi**. Jawaban yang sama aman dikirim ulang: mode instan menjawab `already_answered` (dianggap sukses), mode akhir memakai upsert. Antrean offline yang bertahan setelah reload belum dibuat (lihat P2-17).
- **Quiz di-publish ulang saat peserta mengerjakan:** attempt yang sedang berjalan tetap memakai versinya sendiri (`attempts.quiz_version_id`). Sesi latihan default mengikuti versi terbaru (`sessions.quiz_version_id = null`), jadi attempt berikutnya memakai versi baru. Ujian nanti bisa mengunci versi.
