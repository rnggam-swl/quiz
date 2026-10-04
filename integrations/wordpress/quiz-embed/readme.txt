=== Quiz Embed ===
Tags: quiz, embed, oembed, education
Requires at least: 5.9
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: MIT

Pasang quiz dari aplikasi Quiz di WordPress.

== Description ==

* **Tempel link:** setelah URL aplikasi diisi, tempel link embed quiz (`https://quiz.sekolah.id/embed/kuis-hewan`) di baris kosong editor. WordPress menampilkannya sebagai quiz (oEmbed).
* **Shortcode:** `[quiz slug="kuis-hewan"]`. Tinggi quiz menyesuaikan isi otomatis. Atribut opsional: `theme="light|dark"`, `session="123456"` (kode sesi tertentu), `title="…"`.
* **Identitas pengguna (opsional):** jika dinyalakan dan embed secret quiz diisi, pengguna WordPress yang login langsung masuk dengan nama mereka (embed token HS256, berlaku 50 menit). Laporan guru menampilkan identitas asli dan batas percobaan berlaku per orang.

== Installation ==

1. Salin folder `quiz-embed` ke `wp-content/plugins/`, lalu aktifkan plugin.
2. Buka **Pengaturan → Quiz** dan isi URL aplikasi Quiz.
3. Di aplikasi Quiz, buka quiz → **Bagikan → Embed**, lalu tambahkan domain situs WordPress ke daftar domain. Tanpa langkah ini browser menolak menampilkan quiz.
4. Opsional: buat embed secret di panel yang sama, lalu tempel sebagai `slug=secret` di pengaturan plugin.

== Frequently Asked Questions ==

= Quiz tidak muncul, hanya link =

URL aplikasi belum diisi, quiz belum di-publish, atau embed quiz dimatikan (daftar domain kosong).

= Quiz muncul tapi kosong atau ditolak =

Domain situs WordPress belum ada di daftar domain embed quiz. Perubahan daftar domain butuh sekitar 1 menit.

= Apakah nilai dari quiz bisa masuk ke WordPress? =

Belum dari plugin ini. Event `quiz:completed` di halaman hanya informasi dan bisa dipalsukan. Untuk nilai yang sah, gunakan webhook atau API dari server aplikasi Quiz.
