import { expect, test } from "@playwright/test";

import { createPublishedQuiz } from "./helpers";

// P8-11 · Library. Needs a real Supabase (CI starts one; locally: `pnpm db:start`, fill
// .env.local, E2E_SUPABASE=1).
test.skip(!process.env.E2E_SUPABASE, "needs local Supabase (set E2E_SUPABASE=1)");
test.skip(({ isMobile }) => isMobile, "library flow is the same on phones");

test("a public quiz shows in the library without answers and another teacher copies it", async ({
  page,
  browser,
}) => {
  const quizId = await createPublishedQuiz(page);
  await page.getByRole("button", { name: "Bagikan" }).click();
  await page.getByRole("tab", { name: "Library" }).click();
  await page.getByLabel(/Publik di library/).check();
  await expect(page.getByText("Quiz muncul di library.")).toBeVisible();

  // Anyone, signed in or not, can find and preview it.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/library?q=latihan e2e");
  await visitor
    .getByRole("link", { name: /Kuis Latihan E2E/ })
    .first()
    .click();
  await expect(visitor).toHaveURL(new RegExp(`/library/${quizId}$`));
  await expect(visitor.getByText("Ibu kota Indonesia tahun 2020?")).toBeVisible();
  const html = await visitor.content();
  expect(html).not.toContain("correctIds");
  await visitor.getByRole("link", { name: "Masuk untuk menyalin" }).click();
  await expect(visitor).toHaveURL(/\/login\?next=/);

  // Another teacher signs up there and copies it into their account.
  await visitor.getByRole("link", { name: "Daftar" }).click();
  await visitor.getByLabel("Nama").fill("Guru Penyalin");
  await visitor.getByLabel("Email").fill(`salin-${Date.now()}@sekolah.test`);
  await visitor.getByLabel("Password").fill("rahasia-e2e-123");
  await visitor.getByRole("button", { name: "Daftar" }).click();
  await expect(visitor).toHaveURL(new RegExp(`/library/${quizId}$`));
  await visitor.getByRole("button", { name: "Salin ke quiz saya" }).click();
  await expect(visitor).toHaveURL(/\/quizzes\/[0-9a-f-]+\/edit$/);
  expect(visitor.url()).not.toContain(quizId);
  await expect(visitor.getByLabel("Pertanyaan", { exact: true })).toHaveValue(
    "Ibu kota Indonesia tahun 2020?",
  );

  // Back to private: gone from the library.
  await page.getByLabel(/Pribadi/).check();
  await expect(page.getByText("Quiz tidak dibagikan ke library.")).toBeVisible();
  await visitor.goto(`/library/${quizId}`);
  await expect(visitor.getByText(/tidak ditemukan|404/i)).toBeVisible();
});
