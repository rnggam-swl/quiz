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
  requireLogin: true,           // atau embed token / daftar peserta
  allowEmbed: false,
  timer: { totalS: 3600 },
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
| Akses       | Login, kode akses tambahan, atau daftar peserta (email/NIS)                                    |
| Navigasi    | Bebas (boleh kembali ke soal sebelumnya) atau maju saja                                        |
| Rilis nilai | Langsung, setelah ujian ditutup, atau manual                                                   |
| Akomodasi   | Waktu tambahan per peserta (mis. +25%)                                                         |

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
