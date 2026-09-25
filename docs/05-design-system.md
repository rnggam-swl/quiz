# 05 · Design System

Produk ini punya **dua bahasa visual** yang sengaja dibedakan:

|           | **Editor** (guru, di laptop)                        | **Player** (peserta, di HP dan proyektor) |
| --------- | --------------------------------------------------- | ----------------------------------------- |
| Nuansa    | Tenang, rapi, produktif (mirip Notion atau Linear)  | Bermain, penuh energi, memberi hadiah     |
| Warna     | Netral + satu aksen                                 | Warna per opsi jawaban, latar tema quiz   |
| Tipografi | 13–14px, padat                                      | Soal 22–32px, tombol ≥ 56px tingginya     |
| Interaksi | Autosave, shortcut keyboard, drag untuk mengurutkan | Tap besar, tombol 3D, animasi, suara      |
| Layout    | 3 panel: daftar soal · editor · properti            | Satu soal per layar, mobile-first         |

## Fondasi (diambil dari prototipe)

- **Font:** DM Sans (UI), DM Mono (kode, kode sesi).
- **Radius:** 8px (kontrol), 12px (kartu), 9999px (tombol pill di player).
- **Token:** didefinisikan di [`src/app/globals.css`](../src/app/globals.css) sebagai CSS variables, lalu dipetakan ke utility Tailwind (`bg-surface`, `text-fg-muted`, `border-line`, `bg-accent`, `bg-answer-1`, `bg-theme`, …). Gunakan token, bukan warna hex langsung.

| Token                                  | Terang                            | Gelap                             | Dipakai untuk                           |
| -------------------------------------- | --------------------------------- | --------------------------------- | --------------------------------------- |
| `--canvas`                             | `#f8fafc`                         | `#0b0f19`                         | Latar halaman                           |
| `--surface` / `--surface-muted`        | `#ffffff` / `#f1f5f9`             | `#111827` / `#1f2937`             | Kartu, panel, hover                     |
| `--line` / `--line-strong`             | `#e2e8f0` / `#cbd5e1`             | `#243044` / `#374151`             | Border                                  |
| `--fg`                                 | `#111827`                         | `#e5e7eb`                         | Teks utama                              |
| `--fg-muted`                           | `#475569` (7.2:1)                 | `#9ca3af`                         | Teks sekunder                           |
| `--fg-subtle`                          | `#64748b` (4.8:1)                 | `#8b95a5`                         | Label kecil, metadata                   |
| `--fg-placeholder`                     | `#94a3b8` (2.4:1)                 | `#6b7280`                         | **Hanya** placeholder dan dekorasi      |
| `--accent`                             | `#2563eb` (5.2:1 dengan putih)    | sama                              | Tombol utama editor, fokus              |
| `--accent-fg`                          | `#2563eb`                         | `#60a5fa`                         | Accent sebagai warna teks/link          |
| `--success` / `--warning` / `--danger` | `#15803d` / `#b45309` / `#dc2626` | `#4ade80` / `#fbbf24` / `#f87171` | Status (plus versi `-soft` untuk latar) |

- **Token tema quiz (bisa diatur guru):** `--theme-primary`, `--on-theme`, `--theme-bg`. Preset diambil dari prototipe: Indigo, Emerald, Amber, Rose, Violet, Sky, Pink, Slate. Default Indigo digeser dari `#5b6af7` (4.3:1) ke `#4f5bea` (5.2:1).
- **Warna teks di atas warna tema dihitung otomatis** dengan `readableTextColor()` di [`src/lib/color.ts`](../src/lib/color.ts). Beberapa preset prototipe gagal kontras dengan teks putih, misalnya Emerald `#10b981` 2.5:1, Amber `#f59e0b` 2.2:1, dan Sky `#0ea5e9` 2.8:1. Untuk preset seperti ini, teks otomatis menjadi gelap (`#1a1a24`). Saat tema diterapkan, set `--on-theme` dengan hasil fungsi ini.
- **Mode gelap:** mengikuti sistem operasi, kecuali `<html data-theme="light|dark">` memaksanya. Layar proyektor default memakai latar gelap.

## Warna & bentuk opsi jawaban

Setiap opsi jawaban di player punya **warna dan bentuk** sendiri. Bentuk memastikan pengguna buta warna tetap bisa membedakan opsi. Bentuk juga dipakai di layar proyektor, misalnya "Pilih ▲". Komponennya adalah `<AnswerShape slot={1..5}>`.

| #   | Bentuk | Warna            | Teks            | Kontras |
| --- | ------ | ---------------- | --------------- | ------- |
| 1   | ▲      | `#CE2C31` merah  | putih           | 5.2:1   |
| 2   | ◆      | `#2F6FEB` biru   | putih           | 4.6:1   |
| 3   | ●      | `#F5A524` kuning | `#1a1a24` gelap | 8.5:1   |
| 4   | ■      | `#0B7A6D` hijau  | putih           | 5.2:1   |
| 5   | ★      | `#8E4EC6` ungu   | putih           | 5.2:1   |

Semua kombinasi memenuhi WCAG AA (≥ 4.5:1) dan dijaga oleh test di `src/lib/color.test.ts`. Merah awal `#E5484D` (3.9:1) dan hijau awal `#12A594` (3.1:1) tidak lolos, jadi keduanya digelapkan.

## Tombol 3D (pressable pill)

Diambil dari `.pv-nav-btn` di prototipe:

```css
.btn-3d {
  border-radius: 9999px;
  padding: 14px 28px;
  font-weight: 600;
  background: var(--c);
  color: #fff;
  border: 2px solid color-mix(in srgb, var(--c) 65%, white);
  box-shadow: 0 4px 0 0 color-mix(in srgb, var(--c) 78%, black);
  transition:
    transform 0.08s ease,
    box-shadow 0.08s ease;
}
.btn-3d:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 0 color-mix(in srgb, var(--c) 78%, black);
}
```

Dipakai untuk semua tombol aksi dan kartu opsi jawaban di player. Editor tidak memakai tombol 3D.

## Komponen player

| Komponen           | Keterangan                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Timer bar**      | Bar tipis di atas layar yang menyusut. Berubah kuning di 30% sisa waktu, merah di 10%                                        |
| **Progress**       | "Soal 3 / 10" + titik-titik (hijau benar, merah salah bila feedback instan)                                                  |
| **HUD**            | XP, streak 🔥, nyawa ❤️ (royale), peringkat (live). Pojok kanan atas, tidak menutupi soal                                    |
| **Layar feedback** | Layar penuh 1.2–1.8 detik: ✅/❌, "+850", "🔥 ×3", penjelasan singkat. Dari reaksi maskot di prototipe (`gamifyReactionMsg`) |
| **Layar hasil**    | Skor besar berwarna (great/ok/low), daftar review per soal, tombol ulangi                                                    |
| **Podium**         | Juara 1–3 dengan animasi naik + confetti (live/battle)                                                                       |
| **Lobby**          | Kode besar, QR, avatar peserta muncul satu per satu                                                                          |

## Layar host / proyektor

- Soal ditampilkan besar di kiri atau tengah, opsi dalam grid 2×2 dengan warna dan bentuk.
- Penghitung "23/30 sudah menjawab".
- Timer besar berbentuk lingkaran.
- Setelah reveal: distribusi jawaban dalam bar per opsi, lalu leaderboard 5 besar.
- Battle: banner "⚡ Andi tercepat!", hitungan "12 / 40 tersisa", kartu pemain tercoret.

## Motion

| Momen      | Animasi                                      | Durasi |
| ---------- | -------------------------------------------- | ------ |
| Soal masuk | Fade + naik 8px (dari `fadeUp` di prototipe) | 200ms  |
| Pilih opsi | Tekan 3D + scale 0.98                        | 80ms   |
| Benar      | Hijau + pop + confetti kecil                 | 400ms  |
| Salah      | Merah + shake horizontal                     | 300ms  |
| Streak ≥ 3 | Api membesar di HUD                          | 500ms  |
| Eliminasi  | Kartu miring, pudar, dicoret                 | 600ms  |

- Hormati `prefers-reduced-motion`: ganti shake, confetti, dan scale dengan perubahan warna saja.

## Suara

- Efek: tik timer (5 detik terakhir), benar, salah, buzzer, eliminasi, fanfare podium.
- Musik latar lobby dan musik saat soal berjalan diputar dari layar host saja, tidak dari HP peserta.
- Tombol mute selalu terlihat. Status mute diingat per perangkat. Suara tidak diputar sebelum ada interaksi pengguna, karena aturan autoplay browser.

## Tone copy

- Bahasa Indonesia santai dan menyemangati. Contoh dari prototipe: "Mantap!", "On fire!", "Belum pas, coba lagi ya".
- **Mode ujian memakai copy netral:** tanpa emoji, tanpa reaksi. Contohnya "Jawaban tersimpan".
- Pesan error selalu menyebut soal mana dan apa yang harus diperbaiki. Contohnya validasi publish di prototipe: "Soal #3 minimal butuh 2 opsi."

## Aksesibilitas

- Semua interaksi drag (Sequencing, Grouping, Matching) punya alternatif keyboard dan tap. Prototipe sudah punya ▲▼ di Sequencing dan tap-lalu-tap di Grouping.
- Target sentuh minimal 44×44px.
- Fokus terlihat jelas (`:focus-visible`).
- Timer bisa diperpanjang lewat akomodasi (ujian).
- Gambar wajib punya `alt` (field di editor).
