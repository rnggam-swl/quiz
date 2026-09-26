import { expect, test } from "@playwright/test";

// Needs a real Supabase (CI starts one; locally: `pnpm db:start`, fill .env.local, E2E_SUPABASE=1).
test.skip(!process.env.E2E_SUPABASE, "needs local Supabase (set E2E_SUPABASE=1)");

// Desktop only: the editor's three-panel layout is the target for building quizzes.
test.skip(({ isMobile }) => isMobile, "editor flow runs on desktop");

test("a new host signs up, builds a quiz and publishes it", async ({ page }) => {
  const email = `guru-${Date.now()}@sekolah.test`;

  await test.step("sign up", async () => {
    await page.goto("/login?mode=signup");
    await page.getByLabel("Nama").fill("Guru E2E");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("rahasia-e2e-123");
    await page.getByRole("button", { name: "Daftar" }).click();
    await expect(page).toHaveURL(/\/quizzes$/);
    await expect(page.getByText("Belum ada quiz")).toBeVisible();
  });

  await test.step("create a quiz", async () => {
    await page.getByRole("button", { name: "Buat quiz" }).click();
    await expect(page).toHaveURL(/\/quizzes\/[0-9a-f-]+\/edit$/);
    await page.getByLabel("Judul quiz").first().fill("Kuis E2E");
  });

  await test.step("add a multiple-choice question", async () => {
    await page.getByRole("button", { name: "Tambah soal pertama" }).click();
    await page.getByRole("menuitem", { name: /Pilihan Ganda/ }).click();
    await page.getByLabel("Pertanyaan", { exact: true }).fill("Ibu kota Indonesia tahun 2020?");
    await page.getByLabel("Teks opsi 1").fill("Jakarta");
    await page.getByLabel("Teks opsi 2").fill("Bandung");
    await page.getByLabel("Teks opsi 3").fill("Surabaya");
    await page.getByLabel("Teks opsi 4").fill("Medan");
    await page.getByRole("button", { name: "Tandai opsi 1 benar" }).click();
  });

  await test.step("add a true/false question", async () => {
    await page.getByRole("button", { name: "Tambah soal" }).first().click();
    await page.getByRole("menuitem", { name: /Benar \/ Salah/ }).click();
    await page.getByLabel("Pertanyaan", { exact: true }).fill("Matahari terbit dari timur.");
  });

  await test.step("autosave reaches the server", async () => {
    await expect(page.getByRole("status").filter({ hasText: "Tersimpan" })).toBeVisible({
      timeout: 10_000,
    });
    await page.reload();
    await expect(page.getByText("Matahari terbit dari timur.")).toBeVisible();
  });

  await test.step("publish", async () => {
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText(/Quiz terbit! Versi 1/)).toBeVisible();
    await page.getByRole("link", { name: "Kembali ke daftar quiz" }).click();
    await expect(page.getByText("Terbit · v1")).toBeVisible();
  });
});

test("dashboard redirects signed-out visitors to login", async ({ page }) => {
  await page.goto("/quizzes");
  await expect(page).toHaveURL(/\/login\?next=%2Fquizzes/);
});
