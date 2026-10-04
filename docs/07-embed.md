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
- `completed` hanya berisi informasi. **Situs pemasang tidak boleh memakai event ini sebagai bukti nilai**, karena bisa dipalsukan. Untuk nilai yang sah, gunakan [webhook](#webhook) atau [API](02-architecture.md#api-rest) dari server ke server.

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

## oEmbed & WordPress

✅ P8-09. Link embed `https://{domain}/embed/{slug}` bisa ditempel langsung di situs yang mendukung [oEmbed](https://oembed.com) (WordPress, Notion, Discourse, Ghost, …).

- **Endpoint:** `GET /api/oembed?url=https://{domain}/embed/{slug}[?theme=dark]&maxwidth=&maxheight=&format=json` → `{ type: "rich", html: "<iframe …>", width, height, title }`. Kode: [`src/app/api/oembed/route.ts`](../src/app/api/oembed/route.ts), helper murni [`src/lib/oembed.ts`](../src/lib/oembed.ts).
- Hanya menjawab jika quiz sudah terbit, embed dinyalakan (daftar domain tidak kosong), dan sesi latihan default terbuka. Selain itu 404. `format=xml` → 501. Respons publik (`Access-Control-Allow-Origin: *`, cache 5 menit).
- HTML-nya iframe biasa (tinggi tetap, default 600 px), karena konsumen oEmbed membuang `<script>`. Untuk tinggi otomatis, pakai loader `embed.js`.
- **Discovery:** halaman `/embed/{slug}` memuat `<link rel="alternate" type="application/json+oembed">`.
- Domain situs pemasang tetap harus ada di `embed_allowed_origins`. oEmbed tidak melewati `frame-ancestors`.

**Plugin WordPress** ([`integrations/wordpress/quiz-embed/`](../integrations/wordpress/quiz-embed/)):

- Tanpa plugin, WordPress menemukan provider lewat discovery, tetapi menganggapnya tidak tepercaya dan memberi iframe `sandbox="allow-scripts"`. Akibatnya origin iframe menjadi `null`, `localStorage` dan Server Action gagal. Plugin mendaftarkan provider (`wp_oembed_add_provider`), sehingga iframe tidak di-sandbox.
- Shortcode `[quiz slug="…" theme="dark" session="123456" title="…"]` memakai loader `embed.js` (tinggi otomatis, event).
- Opsional: pengguna WordPress yang login dikirim sebagai embed token HS256 (`sub = "wp:{ID}"`, `name = display_name`, berlaku 50 menit). Embed secret per quiz diisi di **Pengaturan → Quiz** sebagai `slug=secret`. Halaman yang berisi token dikirim dengan `nocache_headers()`.

## Webhook

✅ P8-06. Nilai yang sah untuk situs pemasang dikirim dari server ke server, bukan dari event `completed` di browser.

- **Pengaturan:** **Akun → Integrasi** (`/account/integrations`). Satu akun bisa punya maksimal 5 URL. Setiap URL punya secret `whsec_…`, bisa dijeda, dites ("Kirim tes" mengirim `webhook.test`), dan secretnya bisa diganti.
- **Event `attempt.submitted`:** dikirim setiap kali attempt berubah dari `in_progress` menjadi `submitted` atau `expired`, di semua mode (latihan, ujian, live/battle saat podium). Attempt yang dibuka ulang lalu dikirim lagi menjadi event baru.

```json
{
  "id": "5f0c…", // sama di setiap percobaan kirim (header webhook-id)
  "type": "attempt.submitted",
  "created_at": "2026-09-29T08:00:00+00:00",
  "data": {
    "attempt": {
      "id": "…",
      "attempt_no": 1,
      "status": "submitted",
      "score": 3000,
      "max_score": 4000,
      "ratio": 0.75,
      "started_at": "…",
      "submitted_at": "…"
    },
    "participant": { "id": "…", "nickname": "Budi", "external_id": "user-123", "user_id": null },
    "session": { "id": "…", "mode": "practice", "title": null },
    "quiz": {
      "id": "…",
      "title": "Klasifikasi Hewan",
      "slug": "kuis-klasifikasi-hewan",
      "version": 3
    }
  }
}
```

- `participant.external_id` adalah `sub` dari embed token, jadi pemasang bisa mencocokkan nilai dengan user mereka. Jawaban per soal tidak dikirim; ambil lewat `GET /api/v1/attempts/{id}` ([API REST](02-architecture.md#api-rest)).
- **Tanda tangan ([Standard Webhooks](https://www.standardwebhooks.com)):** header `webhook-id`, `webhook-timestamp` (detik Unix), dan `webhook-signature: v1,<base64 HMAC-SHA256(kunci, "{id}.{timestamp}.{body}")>`. Kunci = bagian base64 setelah `whsec_`. Penerima wajib memverifikasi tanda tangan atas **body mentah**, menolak timestamp yang selisihnya lebih dari 5 menit, dan mengabaikan `webhook-id` yang sudah pernah diproses. Library resmi Standard Webhooks (Node, PHP, Python, dll.) bisa langsung dipakai.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, headers, rawBody) {
  const id = headers["webhook-id"],
    ts = headers["webhook-timestamp"];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = `v1,${createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest("base64")}`;
  return headers["webhook-signature"]
    .split(" ")
    .some(
      (sig) =>
        sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)),
    );
}
```

- **Sukses** = HTTP 2xx dalam 10 detik. Redirect dianggap gagal (tidak diikuti).
- **Retry:** gagal → dicoba lagi setelah 1 menit, 5 menit, 30 menit, 2 jam, 6 jam, 12 jam (7 kali, ±21 jam), lalu ditandai gagal. Riwayat 20 pengiriman terakhir ada di halaman Integrasi, dengan tombol **Kirim ulang**. Log dihapus setelah 30 hari.

**Cara kerja** ([`supabase/migrations/20261001200000_webhooks.sql`](../supabase/migrations/20261001200000_webhooks.sql), [`src/lib/webhooks/`](../src/lib/webhooks/)):

1. **Outbox:** trigger di `attempts` menulis satu baris `webhook_deliveries` per webhook aktif, di transaksi yang sama dengan submit. Event tidak hilang walaupun server mati tepat setelah submit.
2. **Kirim segera:** Server Action yang men-submit (latihan, ujian, podium live) memanggil `after(dispatchWebhooks)`. `claim_webhook_deliveries` mengunci baris (`for update skip locked`, 2 menit), jadi dua dispatcher tidak mengirim percobaan yang sama.
3. **Retry dan attempt yang kedaluwarsa oleh cron:** `pg_cron` setiap menit menjalankan `ping_webhook_dispatcher()`. Jika ada yang jatuh tempo, fungsi itu memanggil `POST {app}/api/webhooks/dispatch` lewat `pg_net` dengan `Authorization: Bearer CRON_SECRET`. Sekali setup di Supabase (SQL editor):

   ```sql
   select vault.create_secret('https://quiz.sekolah.id', 'quiz_app_url');
   select vault.create_secret('<nilai CRON_SECRET>', 'quiz_cron_secret');
   ```

   dan isi env `CRON_SECRET` (≥ 32 karakter) di Vercel. Tanpa ini, pengiriman pertama tetap jalan. Retry baru terkirim saat dispatcher berikutnya berjalan (submit berikutnya, atau tombol Kirim ulang). Alternatif di Vercel Pro: Vercel Cron `GET /api/webhooks/dispatch` tiap menit (header yang sama dikirim otomatis).

4. **Kenapa dikirim dari app, bukan `pg_net` langsung:** URL webhook diisi pengguna. Kalau database yang memanggilnya, URL itu bisa diarahkan ke jaringan internal database (SSRF). App menolak `http://`, `localhost`, IP privat/link-local/CGNAT (dicek saat disimpan dan setelah DNS di-resolve saat mengirim) serta redirect. `pg_net` hanya memanggil URL app sendiri dari Vault. Untuk pengembangan, `http://localhost` diizinkan di `pnpm dev` atau jika `WEBHOOKS_ALLOW_LOCAL=true` (hanya CI E2E).

## LTI 1.3

✅ P8-08. Quiz bisa dipasang sebagai aktivitas di Moodle, Canvas, atau LMS lain yang mendukung [LTI 1.3](https://www.imsglobal.org/spec/lti/v1p3). Peserta masuk dengan akun LMS-nya, dan nilainya masuk ke buku nilai LMS lewat AGS (Assignment and Grade Services).

**Pengaturan** (**Akun → Integrasi → LMS (LTI 1.3)**):

1. Di LMS, daftarkan tool eksternal LTI 1.3 dengan URL dari halaman Integrasi:

   | Isian di LMS                           | URL                               |
   | -------------------------------------- | --------------------------------- |
   | Tool URL / Redirect URI / Deep linking | `https://{domain}/api/lti/launch` |
   | Initiate login URL                     | `https://{domain}/api/lti/login`  |
   | Public keyset URL                      | `https://{domain}/api/lti/jwks`   |

   Nyalakan Deep Linking dan layanan nilai (AGS). Kirim nama peserta supaya laporan menampilkan nama asli.

2. Salin detail platform dari LMS ke formulir: **Issuer**, **Client ID**, URL login OIDC, URL token OAuth2, URL keyset (JWKS), dan opsional **Deployment ID** (kosong = semua deployment diterima). Maksimal 10 LMS per akun. Pasangan issuer + client ID unik secara global.
3. Pengajar menambah aktivitas dari tool ini di kelas. LMS membuka halaman **Pilih quiz** (Deep Linking), yang hanya menampilkan quiz akun pendaftar yang sudah terbit. Pilihan dikirim balik ke LMS sebagai link bertanda tangan dengan `custom.quiz = slug` dan kolom nilai `scoreMaximum: 100`.

   Tanpa Deep Linking, link manual juga bisa: tambahkan `?quiz={slug}` di URL aktivitas.

**Alur peluncuran** ([`src/app/api/lti/`](../src/app/api/lti/), [`src/lib/lti/`](../src/lib/lti/)):

1. `GET|POST /api/lti/login` (OIDC third-party login). Platform dicari dari `iss` + `client_id`. Server menyimpan `state` dan `nonce` acak di `lti_states` (sekali pakai, berlaku 10 menit), lalu mengarahkan browser ke URL login LMS. State disimpan di database, bukan cookie, karena LMS menampilkan tool di iframe dan cookie pihak ketiga sering diblokir.
2. `POST /api/lti/launch`: LMS mengirim `id_token`. State diambil (dan dihapus), lalu token diverifikasi dengan JWKS platform (`jose`): hanya RS256, `iss` dan `aud` harus cocok, umur maksimal 10 menit, `nonce` sama. Deployment dicek jika didaftarkan. Launch disimpan di `lti_launches`.
   - `LtiResourceLinkRequest` → `/lti/play/{launchId}`. Quiz harus milik akun pendaftar dan sudah terbit.
   - `LtiDeepLinkingRequest` (hanya peran Instructor/Administrator) → `/lti/deep-link/{launchId}`.
3. `/lti/play/{launchId}` memakai sesi latihan default quiz (`lti_practice_session`, dibuat jika belum ada, dengan pemilik quiz sebagai host) dan pemain embed yang sama. Server membuat embed token HS256 dengan embed secret quiz (dibuat otomatis jika belum ada): `sub = lti:{8 karakter awal id platform}:{sub LMS}`, `name` dari LMS. Batas percobaan dan laporan jadi per akun LMS. Link launch hanya berlaku 1 jam. Setelah itu peserta membuka lagi dari LMS.
4. **Nilai:** setelah submit latihan, `after(sendLtiGrade)` mencari launch terbaru peserta untuk quiz itu yang punya `lineitem` dan scope `…/scope/score`. Server meminta access token (client credentials dengan assertion JWT bertanda tangan kunci tool, `aud` = URL token), lalu `POST {lineitem}/scores` (`application/vnd.ims.lis.v1.score+json`) dengan `scoreGiven` = persentase (0–100, dua desimal), `activityProgress: Completed`, `gradingProgress: FullyGraded`. Gagal kirim hanya dicatat di log. Attempt tetap tersimpan, dan submit berikutnya mengirim nilai terbaru. Nilai tidak dikirim jika kebijakan sesi menahan hasil.

**Kunci tool:** RSA 2048 dibuat saat pertama dipakai dan disimpan di `lti_keys` (hanya `service_role`). Kunci publiknya ada di `/api/lti/jwks`. Kunci ini menandatangani respons Deep Linking dan assertion token AGS.

**Keamanan:**

- `/lti/*` boleh di-frame oleh LMS mana pun (`frame-ancestors *`) dan tidak memakai cookie sesi. `/api/lti/*` dikecualikan dari proxy sesi.
- `lti_platforms` hanya bisa dibaca, ditambah, dan dihapus pemiliknya (RLS), dan tidak bisa diubah. Untuk mengganti URL, hapus lalu tambah lagi. URL platform wajib `https://` ke alamat publik.
- Sebuah LMS hanya bisa membuka quiz milik guru yang mendaftarkannya.

## Fase lanjutan

- Pengiriman nilai LTI saat hasil yang ditahan dirilis, dan untuk mode ujian.
