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
2. Peserta mengisi nickname. Sistem melakukan anonymous sign-in, lalu memanggil `join_session`.
3. Server memanggil `start_attempt`, yang membuat seed dan urutan soal.
4. Klien memanggil `get_play_payload(attemptId)` dan menerima soal versi aman (`stripAnswers`).
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

- **Halaman dimuat ulang:** attempt `in_progress` dilanjutkan, dan jawaban yang sudah tersimpan dimuat ulang.
- **Offline sesaat:** jawaban diantrikan di klien dan dikirim ulang. Unique `(attempt_id, question_id)` membuat pengiriman ulang aman, karena server memakai upsert.
- **Quiz di-publish ulang saat peserta mengerjakan:** attempt tetap memakai versi lama, karena sesi terikat ke `quiz_version_id`.
