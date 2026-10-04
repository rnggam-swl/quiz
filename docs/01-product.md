# 01 · Produk

## Visi

Platform untuk membuat dan memainkan quiz yang **clean dan intuitif saat dibuat, tetapi seru saat dimainkan**. Guru, trainer, atau pembuat konten cukup membuat soal sekali, lalu memakainya untuk latihan, ujian, permainan di kelas, atau memasangnya di situs sendiri.

## Pengguna

| Persona                               | Kebutuhan                                                              | Mode yang dipakai            |
| ------------------------------------- | ---------------------------------------------------------------------- | ---------------------------- |
| **Guru / trainer** (host)             | Membuat soal dengan cepat, menjalankan kuis di kelas, melihat hasil    | Semua mode                   |
| **Murid / peserta**                   | Masuk tanpa ribet (kode + nickname), tampilan jelas di HP, terasa seru | Latihan, live, battle, ujian |
| **Penyelenggara ujian** (sekolah, HR) | Ujian yang adil, terjadwal, sulit dicontek, dengan laporan             | Ujian                        |
| **Pembuat konten / pemilik situs**    | Memasang quiz di blog, LMS, atau landing page                          | Embed                        |

## Mode

| Mode                      | Ringkasan                                                                    | Dokumen                   |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------- |
| **Latihan**               | Mandiri, kapan saja, lewat link atau kode. Feedback dan gamifikasi opsional. | [06](06-mode-practice.md) |
| **Embed**                 | Mode latihan (atau ujian ringan) di dalam iframe situs lain                  | [07](07-embed.md)         |
| **Ujian**                 | Individu, terjadwal, timer dari server, soal diacak, tanpa feedback          | [08](08-mode-exam.md)     |
| **Live**                  | Host memandu soal satu per satu, poin berdasarkan kecepatan, leaderboard     | [09](09-mode-live.md)     |
| **Battle: Rebutan**       | Yang tercepat menjawab benar mendapat poin, lalu soal terkunci               | [10](10-mode-battle.md)   |
| **Battle: Battle Royale** | Salah atau telat berarti kehilangan nyawa, sampai tersisa satu pemenang      | [10](10-mode-battle.md)   |

## Pembeda

- **Tipe soal yang kaya:** selain pilihan ganda, ada Matching, Grouping, Guess the Blank, Sequencing, Odd One Out, Hotspot, dan Branching Story (cerita bercabang dengan flowchart editor).
- **Dua mekanik battle** dalam satu engine: rebutan ala Cerdas Cermat dan battle royale dengan nyawa.
- **Satu konten untuk semua mode:** soal yang sama bisa dipakai untuk latihan hari ini dan ujian minggu depan.
- **Embed yang benar-benar terintegrasi:** hasil dikirim ke halaman pemasang lewat event, dan identitas pengguna bisa diteruskan lewat embed token.

## Alur utama

1. Host membuat quiz di editor dan menambahkan soal.
2. Host mem-publish quiz, yang menghasilkan snapshot versi.
3. Host membuat **sesi** dengan memilih mode dan aturannya, lalu mendapat kode 6 digit dan link.
4. Peserta masuk lewat kode, link, atau embed.
5. Peserta bermain. Server menilai jawaban.
6. Host melihat laporan per soal dan per peserta.

## Library

✅ P8-11. Guru bisa membagikan quiz yang sudah terbit ke guru lain lewat **Bagikan → Library** di editor.

| Visibilitas (`quizzes.visibility`) | Siapa yang bisa melihat dan menyalin                                      |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `private` (default)                | Hanya pemilik. Peserta tetap bisa bermain lewat link, kode, atau embed    |
| `unlisted` ("Dengan link")         | Siapa pun yang punya link `/library/{id}`, tapi tidak muncul di pencarian |
| `public` ("Publik di library")     | Muncul di `/library`, bisa dicari berdasarkan judul dan deskripsi         |

- `/library` bisa dibuka tanpa login. Urutannya: paling banyak disalin, lalu terbaru. Halaman quiz menampilkan pertanyaan dan tipe soal (**tanpa kunci jawaban**), serta tombol **Coba mainkan** jika sesi latihan default quiz itu terbuka.
- Library selalu memakai **versi terbit terakhir** (snapshot), bukan draf yang sedang diedit.
- **Salin ke quiz saya** (butuh login) membuat draf pribadi baru dari snapshot itu, lengkap dengan kunci jawaban, ID soal baru, dan `copied_from` untuk menghitung "N× disalin". Media tetap menunjuk file aslinya (lihat [file yatim](03-data-model.md#konten)). Karena salinan berisi kunci jawaban, editor memperingatkan agar quiz untuk ujian tidak dibagikan.
- RPC: `library_quizzes` dan `library_quiz` (anon + login, hanya kolom aman), `copy_library_quiz` (login). Tabel `quizzes`/`quiz_versions` tetap tertutup RLS.

## Di luar scope (untuk sekarang)

- Proctoring dengan kamera atau mikrofon
- Aplikasi native iOS/Android (web mobile-first dulu)
- Mode Form (survei atau formulir tanpa penilaian)
- Marketplace konten berbayar

## Ukuran keberhasilan MVP

- Guru bisa membuat quiz 10 soal dalam waktu kurang dari 5 menit.
- Peserta bisa masuk ke sesi dalam kurang dari 15 detik (kode + nickname).
- Sesi live berisi 50 peserta berjalan tanpa jeda lebih dari 1 detik antara aksi host dan layar peserta.
- Tidak ada kunci jawaban di payload yang dikirim ke peserta pada mode ujian, live, dan battle.
