# 07 · Embed

Quiz bisa dipasang di situs lain (blog, LMS, landing page) lewat iframe. Hasilnya bisa diteruskan ke halaman pemasang.

## Cara pasang

**Opsi 1: script loader (disarankan)**

```html
<div data-quiz="kuis-klasifikasi-hewan"></div>
<script src="https://{domain}/embed.js" async></script>
```

Loader ([`public/embed.js`](../public/embed.js), ±1,2 KB gzip) membuat iframe, menyesuaikan tingginya otomatis, dan meneruskan event sebagai `CustomEvent` (`quiz:ready`, `quiz:started`, `quiz:answered`, `quiz:completed`, `quiz:resize`) yang _bubble_ dari elemen `data-quiz`. Elemen itu juga mendapat `el.quiz.restart()` dan `el.quiz.setTheme({ primary, mode })`.

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

1. **Tamu (default):** peserta mengisi nickname, lalu menerima _participant token_ dari server yang disimpan di `localStorage` iframe (dipartisi per situs induk). Lihat [02-architecture § Identitas peserta](02-architecture.md#identitas-peserta).
2. **Embed token:** situs pemasang menandatangani JWT di server mereka memakai secret dari panel Embed (**Bagikan → Embed → Buat secret**), lalu mengirimnya lewat `data-token` (loader) atau `?token=` (iframe).

```json
{
  "iss": "<quiz workspace id>",
  "sub": "user-123", // id user di sistem pemasang → participants.external_id
  "name": "Budi Santoso", // nickname otomatis
  "quiz": "kuis-klasifikasi-hewan",
  "exp": 1760000000 // maksimal 1 jam
}
```

- Server memverifikasi token (**hanya HS256**, secret per quiz), lalu membuat atau memakai participant dengan `external_id = sub`. Jika ada `name`, peserta langsung masuk tanpa mengisi nickname.
- Token wajib berumur pendek: `exp` maksimal 1 jam ke depan (toleransi jam 60 detik). Token dengan `quiz` yang tidak sama dengan slug ditolak.
- Dengan token, laporan guru menampilkan identitas asli, dan batas `attempts` berlaku per user.
- Mengganti secret di panel membuat semua token lama tidak berlaku.

**Contoh menandatangani token — Node.js** (tanpa library):

```js
import { createHmac } from "node:crypto";

function signQuizToken(secret, { userId, name, quizSlug }) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({
    sub: String(userId),
    name,
    quiz: quizSlug,
    exp: Math.floor(Date.now() / 1000) + 10 * 60, // 10 menit
  });
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
```

**Contoh — PHP:**

```php
function sign_quiz_token(string $secret, string $userId, string $name, string $quizSlug): string {
    $b64 = fn($data) => rtrim(strtr(base64_encode(json_encode($data)), '+/', '-_'), '=');
    $header = $b64(['alg' => 'HS256', 'typ' => 'JWT']);
    $payload = $b64(['sub' => $userId, 'name' => $name, 'quiz' => $quizSlug, 'exp' => time() + 600]);
    $sig = rtrim(strtr(base64_encode(hash_hmac('sha256', "$header.$payload", $secret, true)), '+/', '-_'), '=');
    return "$header.$payload.$sig";
}
```

Lalu di halaman: `<div data-quiz="SLUG" data-token="<?= htmlspecialchars($token) ?>"></div>`.

## Mencoba embed secara lokal

1. Publish quiz, buka **Bagikan → Embed**, lalu tambahkan `http://localhost:5500` ke daftar domain.
2. Jalankan `pnpm embed:demo`, lalu buka `http://localhost:5500/?quiz=SLUG`. Halaman demo menampilkan semua event dan tombol `restart()`/`setTheme()`.
3. Daftar domain di-cache proxy selama ±1 menit.
4. Chrome (fitur _Local Network Access_) memblokir situs publik yang memuat app dari `localhost`, atau meminta izin dulu ke pengunjung. Demo di `localhost:5500` tidak kena karena sama-sama loopback. E2E memakai situs palsu `https://sekolah.test`, jadi konteks browsernya diberi izin `local-network-access`. Di produksi app ada di domain publik, jadi tidak ada prompt apa pun.

## Ujian lewat embed

- Hanya bisa jika `policy.allowEmbed = true`, dan editor menampilkan peringatan: "Ujian di dalam situs lain lebih mudah dimanipulasi. Gunakan untuk ujian berisiko rendah."
- Fullscreen memerlukan `allow="fullscreen"` pada iframe. Jika tidak tersedia, fitur fullscreen dilewati dan kejadiannya dicatat.

## Fase lanjutan

- Webhook `attempt.submitted` ke URL milik pemasang (ditandatangani HMAC).
- LTI 1.3 untuk Moodle, Canvas, dan lainnya, dengan pengiriman nilai ke gradebook.
- Plugin WordPress / oEmbed.
