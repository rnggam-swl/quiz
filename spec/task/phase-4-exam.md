# P4 · Mode Ujian

**Tujuan:** ujian individu yang terjadwal, dengan timer dari server, bank soal, pengacakan, autosave, catatan integritas, penilaian manual, dan laporan butir soal.
**Referensi:** [08-mode-exam](../../docs/08-mode-exam.md)

## Database & server

- [x] **P4-01** Migrasi: `integrity_events`, kolom akomodasi di policy, index attempt per sesi. _(Akomodasi disimpan per peserta di `session_roster.extra_time_pct`, bukan di policy.)_
- [x] **P4-02** `start_attempt` versi ujian: cek jendela `opens_at`/`closes_at`, akses (login, kode akses, daftar peserta), bank soal (`questionPool` + tag), `deadline` dengan akomodasi.
- [x] **P4-03** `record_response` menolak jawaban setelah `deadline + 5 detik`.
- [x] **P4-04** `pg_cron` + `expire_attempts()`: tandai attempt `expired` dan nilai dari jawaban yang tersimpan.
- [x] **P4-05** Satu attempt aktif per peserta. Login di perangkat kedua memunculkan peringatan dan dicatat `multi_device`.
- [x] **P4-06** Daftar peserta: impor CSV (nama, email/NIS). Hanya peserta dalam daftar yang boleh masuk.

## Tipe soal

- [x] **P4-07** Tipe `essay` (`manualGrading`): editor dengan batas kata dan rubrik, player dengan penghitung kata.
- [x] **P4-07b** Cerita Bercabang di ujian (pindahan dari P3-09): kirim node bertahap lewat Server Action `nextStoryNode` (`storyStepAction`), supaya cabang lain tidak terbaca di klien. Graf penuh hanya untuk latihan.

## Host

- [x] **P4-08** Wizard "Buat ujian": jadwal, durasi, bank soal, acak, attempt dan metode nilai, navigasi (bebas/maju saja), rilis nilai, integritas, akses. Tampilkan peringatan soal yang tidak kompatibel.
- [x] **P4-09** Monitor ujian yang berjalan: siapa yang sedang mengerjakan, progres, sisa waktu, catatan integritas (auto refresh).
- [x] **P4-10** Aksi per peserta: tambah waktu, buka ulang, reset attempt.
- [x] **P4-11** Antrean penilaian manual: per soal esai, rubrik, komentar, navigasi ke peserta berikutnya.
- [x] **P4-12** Rilis nilai (manual / otomatis setelah ditutup).
- [x] **P4-13** Laporan: tabel nilai + analisis butir soal (persentase benar, rata-rata waktu, distribusi opsi, tanda soal < 30%) + ekspor CSV/XLSX. _(CSV sudah; XLSX belum — file CSV dibuka langsung oleh Excel.)_

## Player ujian

- [x] **P4-14** Halaman instruksi sebelum mulai: durasi, jumlah soal, aturan, tombol mulai.
- [x] **P4-15** Shell ujian dengan tampilan netral (tanpa gamifikasi): timer dari selisih waktu server, panel nomor soal (terjawab / kosong / ragu 🚩), navigasi sesuai policy.
- [x] **P4-16** Autosave per jawaban + indikator status + antrean offline.
- [x] **P4-17** Ringkasan sebelum submit + konfirmasi. Submit otomatis saat waktu habis.
- [x] **P4-18** Integritas: fullscreen (minta saat mulai), `visibilitychange`/`blur`, blokir copy/paste di area soal, kirim `integrity_events` dalam batch.
- [x] **P4-19** Halaman nilai untuk peserta (setelah dirilis) + review jika diizinkan.

## Test

- [x] **P4-20** Unit: perhitungan deadline (akomodasi, batas `closes_at`), bank soal deterministik per seed.
- [ ] **P4-21** E2E: jawaban setelah deadline ditolak, attempt dilanjutkan setelah browser ditutup, `expired` otomatis, nilai tersembunyi sampai dirilis. _(Ditulis di `e2e/exam.spec.ts`, menunggu dijalankan CI dengan Supabase lokal.)_

## Definition of Done

- Ujian 40 soal dari bank 100 soal, 60 menit, berjalan untuk 50 peserta simulasi tanpa jawaban hilang.
- Tidak ada cara menjawab setelah deadline (sudah diuji).
- Guru bisa menilai esai dan merilis nilai, dan peserta melihat nilai setelah rilis.
