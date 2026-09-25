# P8 · Lanjutan

**Tujuan:** melengkapi mekanik battle dan integrasi setelah fondasi stabil. Urutan di bawah adalah usulan prioritas dan bisa diubah sesuai masukan pengguna.

## Battle

- [ ] **P8-01** Rebutan varian **Pencet lalu Jawab**: tabel `buzzer_holds`, tombol BUZZ, hold eksklusif `holdS` detik, buzzer dibuka lagi jika salah atau waktu habis, event `buzz_hold`.
- [ ] **P8-02** **Mode tim**: tabel `teams`, pilih atau bagi otomatis di lobby, poin/nyawa per tim, leaderboard tim, satu perwakilan buzzer per tim.
- [ ] **P8-03** **Buka serentak**: soal dikirim saat countdown dan ditampilkan pada `openedAt` sesuai waktu server.
- [ ] **P8-04** **Jeda toleransi** (`graceMs`): status `resolving`, pemenang = `reaction_ms` terkecil yang sudah divalidasi di antara jawaban benar dalam jeda.
- [ ] **P8-05** Power-up (opsional): 50:50, perisai (tahan satu kesalahan di royale), tambah waktu. Perlu keputusan desain dulu karena memengaruhi keadilan.

## Integrasi

- [ ] **P8-06** Webhook `attempt.submitted` dengan tanda tangan HMAC + log pengiriman + retry.
- [ ] **P8-07** API REST read-only untuk hasil (token API per workspace).
- [ ] **P8-08** LTI 1.3 (Moodle, Canvas) + pengiriman nilai ke gradebook.
- [ ] **P8-09** Plugin WordPress / oEmbed.

## Konten

- [ ] **P8-10** Generate soal dengan AI dari topik, teks, atau PDF. Hasilnya berupa draft yang wajib ditinjau guru sebelum dipakai.
- [ ] **P8-11** Library quiz publik: visibilitas `public`, pencarian, duplikat ke akun sendiri.
- [ ] **P8-12** Bank soal lintas quiz (tag global).
- [ ] **P8-13** Impor soal dari CSV/XLSX, dan ekspor.

## Skala

- [ ] **P8-14** Evaluasi server game khusus (PartyKit / Durable Objects / Colyseus) jika uji beban P5 menunjukkan batas Supabase Realtime di bawah kebutuhan. Implementasi baru cukup di `engine/transport/`.
