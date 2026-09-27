import { expect, test } from "@playwright/test";

// The dev-only playgrounds run the real UI on in-memory adapters, so the player,
// preview and join form can be tested without Supabase. They 404 in production
// builds (CI), hence the skip.
test.skip(!!process.env.CI, "playgrounds only exist in development");

test.describe("practice player (in-memory engine)", () => {
  test("instant feedback: XP, streak, gentle wrong answers and the summary", async ({ page }) => {
    await page.goto("/playground/play?set=core&latency=50");
    await page.getByLabel("Nama panggilan").fill("Budi");
    await page.getByRole("button", { name: "Mulai" }).click();

    await page.getByRole("button", { name: /Jakarta/ }).click();
    await expect(page.getByText("Mantap!")).toBeVisible();
    await expect(page.getByLabel("10 XP")).toBeVisible();
    await page.getByRole("button", { name: "Lanjut" }).click();

    await page.getByRole("button", { name: /Salah/ }).click();
    await expect(page.getByText("Dua kali beruntun!")).toBeVisible();
    await expect(page.getByLabel("2 benar beruntun")).toBeVisible();
    await page.getByRole("button", { name: "Lanjut" }).click();

    await page.getByLabel("Jawaban", { exact: true }).fill("Hatta");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Belum tepat")).toBeVisible();
    await expect(page.getByText("Jawaban yang benar:")).toBeVisible();
    // Enter submitted the answer but must not also skip past the feedback.
    await expect(page.getByLabel("Jawaban", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Lanjut" }).click();

    await page.getByLabel(/Jawaban dalam/).fill("9,85");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Benar!")).toBeVisible();
    await page.getByRole("button", { name: "Lanjut" }).click();

    for (const [left, right] of [
      ["Mamalia", "Kucing"],
      ["Mamalia", "Paus"],
      ["Reptil", "Kadal"],
    ]) {
      await page.getByRole("button", { name: new RegExp(`^${left}`) }).click();
      await page.getByRole("button", { name: new RegExp(`^${right}`) }).click();
      await page.getByRole("button", { name: new RegExp(`^${left}`) }).click();
    }
    await page.getByRole("button", { name: "Kirim jawaban" }).click();
    await page.getByRole("button", { name: "Lihat hasil" }).click();

    await expect(page.getByRole("heading", { name: "Selesai! 🎉" })).toBeVisible();
    await expect(page.getByText("80%")).toBeVisible();
    await expect(page.getByText("4 dari 5 benar")).toBeVisible();
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expect(page.getByRole("heading", { name: /ibu kota/i })).toBeVisible();
  });

  test("feedback at the end: no per-question feedback, results at the end", async ({ page }) => {
    await page.goto("/playground/play?set=core&feedback=end&latency=50");
    await page.getByLabel("Nama panggilan").fill("Siti");
    await page.getByRole("button", { name: "Mulai" }).click();

    await page.getByRole("button", { name: /Jakarta/ }).click();
    await expect(page.getByRole("heading", { name: /Matahari/ })).toBeVisible();
    await expect(page.getByText("Benar!")).toHaveCount(0);
    await expect(page.getByLabel(/XP/)).toHaveCount(0);
  });

  test("P3 types: slider, odd one out, sequencing, grouping, blanks, hotspot, story", async ({
    page,
  }) => {
    await page.goto("/playground/play?set=advanced&latency=0");
    await page.getByLabel("Nama panggilan").fill("Rina");
    await page.getByRole("button", { name: "Mulai" }).click();
    const submit = () => page.getByRole("button", { name: "Kirim jawaban" }).click();
    const next = () => page.getByRole("button", { name: "Lanjut" }).click();

    // Slider: the value only counts once it's moved; 71 ± 3.
    await expect(page.getByText("Geser untuk menjawab")).toBeVisible();
    await page.getByLabel("Jawaban", { exact: true }).focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight"); // 50 → 70
    await submit();
    await expect(page.getByText("Benar!")).toBeVisible();
    await next();

    // Odd one out answers on tap and shows the reason.
    await page.getByRole("button", { name: /Bulan/ }).click();
    await expect(page.getByText("Bulan adalah satelit alami Bumi, bukan planet.")).toBeVisible();
    await next();

    // Sequencing, with the ▲ buttons: bring each item up to its slot.
    const order = ["Penguapan", "Kondensasi", "Hujan", "Aliran ke laut"];
    for (const [slot, name] of order.entries()) {
      for (;;) {
        const labels = await page
          .getByRole("button", { name: /^Naikkan / })
          .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
        if (labels.indexOf(`Naikkan ${name}`) <= slot) break;
        await page.getByRole("button", { name: `Naikkan ${name}` }).click();
      }
    }
    await submit();
    await expect(page.getByText("Benar!")).toBeVisible();
    await next();

    // Grouping by tapping an item, then its group.
    for (const [item, group] of [
      ["Apel", "Buah"],
      ["Mangga", "Buah"],
      ["Bayam", "Sayur"],
      ["Wortel", "Sayur"],
    ]) {
      await page.getByRole("button", { name: item, exact: true }).click();
      await page.getByRole("button", { name: `Masukkan ke ${group}` }).click();
    }
    await submit();
    await expect(page.getByText("Benar!")).toBeVisible();
    await next();

    // Letter boxes advance on their own; one letter wrong on purpose. Enter submits.
    await page.getByLabel("Huruf kosong 1").pressSequentially("ostx");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Sebagian benar (3/4)")).toBeVisible();
    await next();

    // Hotspot with the keyboard crosshair (starts in the middle, 3% per arrow press).
    await page.getByRole("group", { name: /Tiga bentuk berwarna/ }).focus();
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    for (let i = 0; i < 15; i++) await page.keyboard.press("ArrowRight");
    for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page.getByText("2/2 klik")).toBeVisible();
    await submit();
    await expect(page.getByText("Benar!")).toBeVisible();
    await next();

    // Branching story: a step back is allowed before the ending is submitted.
    await page.getByRole("button", { name: /Ambil dan kembalikan/ }).click();
    await page.getByRole("button", { name: /Simpan sampai besok/ }).click();
    await expect(page.getByText("Akhir cukup baik")).toBeVisible();
    await page.getByRole("button", { name: "Mundur" }).click();
    await page.getByRole("button", { name: /Titipkan ke guru piket/ }).click();
    await submit();
    await expect(page.getByText("Akhir ini bernilai 100%.")).toBeVisible();
    await page.getByRole("button", { name: "Lihat hasil" }).click();

    await expect(page.getByRole("heading", { name: "Selesai! 🎉" })).toBeVisible();
    await expect(page.getByText("6 dari 7 benar")).toBeVisible();
  });

  test("rude nicknames are refused", async ({ page }) => {
    await page.goto("/playground/play?latency=0");
    await page.getByLabel("Nama panggilan").fill("B4ngs4t");
    await page.getByRole("button", { name: "Mulai" }).click();
    // Not getByRole("alert"): Next's route announcer also has role=alert.
    await expect(page.getByText("Pakai nama panggilan yang lain, ya.")).toBeVisible();
  });
});

test("editor preview plays the draft with the real player", async ({ page }) => {
  await page.goto("/playground/editor");
  await page.getByRole("button", { name: "Pratinjau" }).click();
  const preview = page.getByRole("dialog", { name: "Pratinjau quiz" });
  await expect(preview.getByText("Jawaban tidak disimpan.", { exact: true })).toBeVisible();
  await expect(preview.getByRole("heading", { name: /ibu kota/i })).toBeVisible();
  await preview.getByRole("button", { name: /Jakarta/ }).click();
  await expect(preview.getByText("Mantap!")).toBeVisible();
  await preview.getByRole("button", { name: "Tutup" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("join form: digits advance and a pasted code fills the boxes", async ({ page }) => {
  await page.goto("/join");
  await page.getByLabel("Digit 1").fill("1");
  await expect(page.getByLabel("Digit 2")).toBeFocused();
  await page.getByLabel("Digit 2").fill("2");
  await page.getByLabel("Digit 3").focus();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData("text", "kode: 98-76");
    document.activeElement?.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  const digits = await page
    .locator('input[inputmode="numeric"]')
    .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value).join(""));
  expect(digits).toBe("129876");
  await expect(page.getByRole("button", { name: "Gabung" })).toBeEnabled();
});
