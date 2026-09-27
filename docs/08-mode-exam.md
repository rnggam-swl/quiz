# 08 · Mode Ujian

Ujian individu yang terjadwal, adil, dan sulit dicontek. Prioritasnya integritas, bukan keseruan.

## Default policy

```ts
{
  feedback: 'none',
  showCorrectAnswer: false,
  gamification: false,          // tanpa XP, reaksi, confetti, suara
  scoring: 'accuracy',
  attempts: 1,
  shuffleQuestions: true,
  shuffleOptions: true,
  releaseResults: 'after_close',
  access: 'open',               // form "Buat ujian" menawarkan 'login' dan 'roster'
  allowEmbed: false,
  timer: { totalS: 3600 },
  navigation: 'free',
  attemptScoring: 'highest',
  integrity: { fullscreen: true, logTabSwitch: true, blockCopyPaste: true },
}
```

## Pengaturan yang dibuat guru

| Pengaturan  | Keterangan                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Jadwal      | `opens_at` – `closes_at`. Di luar jendela ini, peserta tidak bisa memulai                      |
| Durasi      | Total (mis. 60 menit) atau per soal                                                            |
| Bank soal   | Ambil N soal acak dari quiz, bisa difilter berdasarkan `tags`                                  |
| Acak        | Urutan soal dan opsi per peserta, dengan seed                                                  |
| Percobaan   | Jumlah maksimum attempt. Jika lebih dari satu, pilih nilai tertinggi, terakhir, atau rata-rata |
| Akses       | Siapa saja, wajib login, atau daftar peserta (email/NIS); plus kode akses tambahan opsional    |
| Navigasi    | Bebas (boleh kembali ke soal sebelumnya) atau maju saja                                        |
| Rilis nilai | Langsung, setelah ujian ditutup, atau manual                                                   |
| Akomodasi   | Waktu tambahan per peserta (mis. +25%), kolom ketiga di impor daftar peserta                   |

## Alur

```
Masuk → Halaman instruksi (durasi, jumlah soal, aturan) → Mulai
      → start_attempt: seed, question_ids (bank soal + acak), deadline
      → mengerjakan (autosave tiap jawaban) → Submit / waktu habis
      → submit_attempt → layar "Jawaban terkirim"
      → nilai dirilis sesuai policy
```

### Timer dari server

- `deadline = min(started_at + durasi × (1 + extraTimePct), closes_at)`.
- Klien hanya menampilkan hitung mundur dari `deadline − serverNow`. Selisih jam klien dan server dihitung saat payload dimuat.
- `record_response` menolak jawaban jika `now() > deadline + 5 detik`. Toleransi 5 detik menampung latensi jaringan.
- `pg_cron` menjalankan `expire_attempts()` tiap menit: attempt yang lewat deadline ditandai `expired`, lalu dinilai dari jawaban yang sudah tersimpan.

### Autosave & melanjutkan

- Setiap perubahan jawaban langsung disimpan (debounce 500ms untuk isian).
- Indikator "Tersimpan ✓ / Menyimpan… / Offline, akan dikirim ulang".
- Jika browser tertutup, peserta login lagi dan melanjutkan attempt yang sama, dengan sisa waktu tetap mengikuti deadline.

### Navigasi

- Panel nomor soal: sudah dijawab, belum dijawab, atau ditandai ragu-ragu 🚩.
- Sebelum submit, tampilkan ringkasan: "3 soal belum dijawab, 2 ditandai ragu. Yakin submit?"

## Integritas

Semua langkah ini **mencegah dan mencatat, bukan menjamin**. Browser tidak bisa sepenuhnya dikunci, dan hal ini perlu dijelaskan ke guru di UI.

| Mekanisme                      | Implementasi                                                                                   | Dicatat sebagai       |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------- |
| Pindah tab / aplikasi          | `visibilitychange`, `blur`                                                                     | `tab_hidden` + durasi |
| Keluar fullscreen              | `fullscreenchange`                                                                             | `fullscreen_exit`     |
| Copy / paste                   | Event `copy`, `paste` diblokir di area soal                                                    | `copy`, `paste`       |
| Ukuran jendela berubah drastis | `resize`                                                                                       | `resize`              |
| Beberapa perangkat             | Satu attempt aktif per participant. Login di perangkat lain memunculkan peringatan dan dicatat | `multi_device`        |

- Guru melihat ringkasan per peserta di laporan, misalnya "Pindah tab 4× (total 1m 20d)".
- Opsional: kunci attempt otomatis setelah N pelanggaran. Default mati.

## Penilaian

- Soal otomatis dinilai di server saat disimpan, tetapi hasilnya tidak dikirim ke peserta.
- **Esai** dan soal lain dengan `manualGrading` masuk antrean penilaian guru. Guru memberi nilai dan komentar per rubrik.
- Nilai akhir = Σ `points × ratio` / Σ `points`, dalam skala 0–100.
- Setelah nilai dirilis, peserta melihat nilai. Review jawaban hanya ditampilkan jika `showCorrectAnswer`.

## Laporan ujian

- Tabel peserta: nilai, durasi, status (selesai/expired/belum mulai), jumlah catatan integritas.
- Analisis butir soal: persentase benar, rata-rata waktu, dan distribusi opsi. Soal dengan persentase benar di bawah 30% ditandai, karena mungkin kuncinya salah.
- Ekspor CSV / XLSX.
- Aksi: buka ulang attempt untuk peserta tertentu, tambah waktu, reset attempt.

## Tipe soal

Semua tipe dengan `modes` berisi `exam` (lihat [04](04-question-types.md#matriks-kapabilitas)). Branching Story dikirim bertahap per node supaya seluruh graf tidak terbaca di klien.

## Implementasi (P4)

### Rute

| Rute                                       | Untuk   | Isi                                                                                                                               |
| ------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `/exam/[sessionId]`                        | peserta | Halaman instruksi + form masuk, shell ujian, lalu tanda terima/nilai. Tetap bisa dibuka setelah ujian ditutup untuk melihat nilai |
| `/play/[code]`, `/join`                    | peserta | Kode ujian diarahkan ke `/exam/[sessionId]`, juga sebelum ujian dibuka                                                            |
| `/quizzes/[id]/exams`                      | guru    | Daftar ujian sebuah quiz + tombol "Buat ujian" (quiz harus sudah terbit)                                                          |
| `/quizzes/[id]/exams/new`                  | guru    | Form "Buat ujian" (P4-08), dengan peringatan soal yang tidak kompatibel                                                           |
| `/quizzes/[id]/exams/[examId]`             | guru    | Monitor (auto refresh 10 detik): status, progres, sisa waktu, nilai, catatan integritas, aksi peserta                             |
| `…/[examId]/roster`                        | guru    | Impor daftar peserta (tempel atau file CSV) dan hapus entri                                                                       |
| `…/[examId]/grading`                       | guru    | Antrean penilaian esai per soal, dengan rubrik dan komentar                                                                       |
| `…/[examId]/report`, `…/report/csv?kind=…` | guru    | Tabel nilai + analisis butir soal, ekspor CSV (`scores` / `items`)                                                                |

Ujian adalah baris `sessions` dengan `mode = 'exam'`, `title`, dan `quiz_version_id` yang dipatok ke versi terbit terakhir saat dibuat, sehingga perubahan quiz tidak mengganggu ujian yang berjalan.

### Masuk & akses

- `joinExamAction` memeriksa jendela waktu dan kode akses, lalu memanggil `join_exam`:
  - **Siapa saja:** nama bebas (disaring seperti nickname latihan).
  - **Wajib masuk:** memakai akun Supabase yang sedang login; nama dari profil. Tombol "Masuk" membawa kembali ke halaman ujian.
  - **Daftar peserta:** peserta mengetik NIS/email; nama diambil dari daftar. Tidak cocok → "tidak ada di daftar peserta".
- Untuk login dan daftar peserta, perangkat kedua mendapat peserta yang sama. Jika attempt sedang berjalan, dicatat `multi_device` dan peserta melihat peringatan.
- Server Action latihan menolak sesi ujian, jadi kode akses dan daftar peserta tidak bisa dilewati lewat `/play`.

### Selama ujian

- Soal dikirim tanpa kunci (`stripAnswers`); Cerita Bercabang dikirim per node (`storyStepAction`).
- Jawaban disimpan per soal lewat `saveExamAnswerAction`; antrean offline di `localStorage` mengirim ulang tiap 5 detik dan saat online lagi.
- Jika server menolak jawaban karena waktu habis (mis. guru mengakhiri ujian), player langsung mengirim jawaban yang tersimpan dan menampilkan tanda terima.
- Catatan integritas dikirim per batch (maks. 50) tiap 10 detik dan saat halaman ditutup.

### Guru

- **Akhiri ujian** (`end_exam`): status `ended`, `closes_at` = sekarang, deadline attempt yang berjalan ditarik ke sekarang.
- **Rilis nilai:** `results_released_at` diisi; selalu menang atas `releaseResults`. Rilis manual bisa ditarik kembali.
- **Aksi peserta:** tambah waktu (attempt berjalan), buka ulang (attempt selesai, selama N menit), reset (hapus attempt).
- **Penilaian esai:** `grade_response` menyimpan rasio, komentar, dan skor per kriteria; skor attempt yang sudah selesai ikut diperbarui.
- **Laporan:** nilai akhir per peserta mengikuti `attemptScoring`. Analisis butir soal memakai attempt yang sudah selesai; soal dengan benar < 30% (minimal 3 jawaban dinilai) ditandai. Ekspor CSV memakai BOM UTF-8 agar terbaca Excel dan menetralkan sel yang diawali `=`, `+`, `-`, `@`. Ekspor XLSX belum ada: file CSV dibuka langsung oleh Excel/Sheets.
