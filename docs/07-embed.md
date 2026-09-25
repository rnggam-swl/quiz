# 07 · Embed

Quiz bisa dipasang di situs lain (blog, LMS, landing page) lewat iframe. Hasilnya bisa diteruskan ke halaman pemasang.

## Cara pasang

**Opsi 1: script loader (disarankan)**

```html
<div data-quiz="kuis-klasifikasi-hewan"></div>
<script src="https://{domain}/embed.js" async></script>
```

Loader membuat iframe, menyesuaikan tingginya otomatis, dan meneruskan event ke `window` sebagai `CustomEvent`.

**Opsi 2: iframe langsung**

```html
<iframe
  src="https://{domain}/embed/kuis-klasifikasi-hewan"
  style="width:100%;border:0;min-height:560px"
  allow="fullscreen; autoplay"
  loading="lazy"
></iframe>
```

Panel Embed di editor menampilkan kedua snippet, seperti panel Embed di prototipe.

## Route `/embed/[slug]`

- Layout minimal: tanpa navigasi dashboard, tanpa footer, dan bundle sekecil mungkin.
- Parameter query:

| Parameter | Contoh      | Fungsi                                                                      |
| --------- | ----------- | --------------------------------------------------------------------------- |
| `session` | `ABC123`    | Pakai sesi tertentu. Tanpa parameter ini, dipakai sesi latihan default quiz |
| `theme`   | `dark`      | Paksa terang atau gelap                                                     |
| `token`   | JWT         | Embed token (lihat di bawah)                                                |
| `lang`    | `id` / `en` | Bahasa UI                                                                   |

## Protokol `postMessage`

Semua pesan memakai format `{ source: 'quiz-embed', type, payload }`.

**Iframe → halaman induk**

| `type`      | `payload`                                                          |
| ----------- | ------------------------------------------------------------------ |
| `ready`     | `{ quizId, title }`                                                |
| `resize`    | `{ height }`                                                       |
| `started`   | `{ attemptId }`                                                    |
| `answered`  | `{ questionIndex, correct?, total? }` (hanya jika feedback instan) |
| `completed` | `{ attemptId, score, maxScore, ratio, durationMs }`                |

**Halaman induk → iframe**

| `type`     | `payload`             |
| ---------- | --------------------- |
| `setTheme` | `{ primary?, mode? }` |
| `restart`  | `{}`                  |

- Iframe mengirim pesan ke `document.referrer` origin. Iframe hanya menerima pesan dari origin yang ada di `embed_allowed_origins`.
- `completed` hanya berisi informasi. **Situs pemasang tidak boleh memakai event ini sebagai bukti nilai**, karena bisa dipalsukan. Untuk nilai yang sah, gunakan webhook atau API dari server ke server (fase lanjutan).

## Pembatasan domain

- `quizzes.embed_allowed_origins` diisi oleh guru di panel Embed.
- `src/proxy.ts` (pengganti `middleware` di Next.js 16) menyetel header `Content-Security-Policy: frame-ancestors 'self' <origins>` untuk route `/embed/*`.
- Jika daftarnya kosong, embed dimatikan dan route menampilkan pesan.

## Identitas pengguna

Browser memblokir third-party cookie, jadi login di dalam iframe tidak bisa diandalkan.

1. **Anonim (default):** peserta mengisi nickname. Anonymous sign-in disimpan di `localStorage` iframe, yang dipartisi per situs induk.
2. **Embed token:** situs pemasang menandatangani JWT di server mereka memakai secret yang dibuat di panel Embed.

```json
{
  "iss": "<quiz workspace id>",
  "sub": "user-123", // id user di sistem pemasang → participants.external_id
  "name": "Budi Santoso", // nickname otomatis
  "quiz": "kuis-klasifikasi-hewan",
  "exp": 1760000000 // maksimal 1 jam
}
```

- Server memverifikasi token (HS256, secret per quiz/workspace), lalu membuat atau memakai participant dengan `external_id = sub`.
- Dengan token, laporan guru bisa menampilkan identitas asli, dan batas `attempts` berlaku per user.

## Ujian lewat embed

- Hanya bisa jika `policy.allowEmbed = true`, dan editor menampilkan peringatan: "Ujian di dalam situs lain lebih mudah dimanipulasi. Gunakan untuk ujian berisiko rendah."
- Fullscreen memerlukan `allow="fullscreen"` pada iframe. Jika tidak tersedia, fitur fullscreen dilewati dan kejadiannya dicatat.

## Fase lanjutan

- Webhook `attempt.submitted` ke URL milik pemasang (ditandatangani HMAC).
- LTI 1.3 untuk Moodle, Canvas, dan lainnya, dengan pengiriman nilai ke gradebook.
- Plugin WordPress / oEmbed.
