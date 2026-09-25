# 09 · Mode Live (klasik)

Host (guru) memandu soal satu per satu dari layar proyektor. Peserta menjawab di HP. Poin diberikan berdasarkan ketepatan dan kecepatan, lalu leaderboard ditampilkan di antara soal. Mode ini membangun infrastruktur realtime yang nanti dipakai mode Battle.

## Default policy

```ts
{
  feedback: 'instant',
  showCorrectAnswer: true,
  gamification: true,
  scoring: 'speed',
  timer: { perQuestionS: 20 },
  shuffleOptions: false,        // semua peserta melihat urutan yang sama dengan proyektor
  autoAdvance: false,
  lateJoin: 'allow',
}
```

## Dua layar

| Layar                | Route               | Isi                                                                                                                               |
| -------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Host / proyektor** | `/host/{sessionId}` | Soal besar, opsi dengan warna dan bentuk, timer, jumlah yang sudah menjawab, distribusi jawaban, leaderboard, kontrol host        |
| **Peserta (HP)**     | `/play/{code}`      | Mode controller: tombol besar berwarna dan berbentuk. Teks soal bisa ditampilkan atau disembunyikan (opsi "tampilkan soal di HP") |

## State machine sesi

```
lobby ──start──▶ question(countdown 3s) ──▶ question(open) ──timer habis / semua menjawab / host──▶
      reveal (jawaban benar + distribusi) ──▶ leaderboard ──next──▶ question … ──▶ podium ──▶ ended
```

- Perpindahan tahap dipicu host lewat tombol, atau otomatis jika `autoAdvance`.
- Setiap perpindahan: Server Action `advance_round`, yang memvalidasi transisi, menyimpan `phase` dan `closes_at` di DB, lalu broadcast `phase_changed`.
- Timer habis: layar host memanggil `advance_round`. Server memeriksa `now() ≥ closes_at`. Jika layar host tertutup, sesi berhenti di tahap itu sampai host kembali.

## Lobby

- Kode 6 digit besar + QR ke `/join?code=…`.
- Avatar dan nickname peserta muncul lewat Presence.
- Host bisa mengeluarkan peserta (nickname tidak pantas) dan mengunci lobby.
- Filter nickname: daftar kata terlarang, maks. 20 karakter.

## Poin kecepatan

```
poin = round(question.points × ratio × (1 − (waktu_jawab / batas_waktu) / 2))
```

- Menjawab benar seketika = 100% poin, menjawab benar di detik terakhir = 50%. Mirip formula Kahoot.
- `waktu_jawab = received_at − opened_at`, keduanya waktu server.
- Bonus streak: +100 per streak ≥ 2, maksimal +500.

## Event realtime (`session:{id}`)

| Event           | Payload                                   | Penerima                                         |
| --------------- | ----------------------------------------- | ------------------------------------------------ |
| `phase_changed` | `{ phase, roundIdx, openedAt, closesAt }` | semua                                            |
| `question`      | payload soal versi aman                   | peserta (dikirim saat `countdown`)               |
| `answer_count`  | `{ answered, total }`                     | host (throttle 250ms)                            |
| `reveal`        | `{ correct, distribution, explanation }`  | semua                                            |
| `leaderboard`   | `top: [{ nickname, score, delta }]`       | semua                                            |
| `you`           | `{ rank, score, delta, streak }`          | per peserta (diambil lewat RPC setelah `reveal`) |

## Reconnect

- Klien selalu memanggil `get_session_state` setelah terhubung ulang, lalu menyesuaikan tampilan ke tahap saat ini.
- Peserta yang terputus saat soal terbuka masih bisa menjawab jika `now() < closes_at`.

## Laporan

Setelah sesi selesai, laporan yang sama dengan mode lain tersedia (per soal dan per peserta), ditambah replay leaderboard per soal.

## Batas skala MVP

- Target 200 peserta per sesi.
- `answer_count` di-throttle. Leaderboard hanya mengirim 5 besar, sedangkan peringkat pribadi diambil lewat RPC.
- Uji beban dilakukan di fase ini (lihat task P5).
