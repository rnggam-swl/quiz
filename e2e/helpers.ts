import { expect, type Page } from "@playwright/test";

/**
 * Sign up a fresh host and publish a one-question quiz (Jakarta is correct).
 * Returns the quiz id; the page is left in the editor.
 */
export async function createPublishedQuiz(page: Page): Promise<string> {
  await page.goto("/login?mode=signup");
  await page.getByLabel("Nama").fill("Guru Latihan");
  await page.getByLabel("Email").fill(`latihan-${Date.now()}@sekolah.test`);
  await page.getByLabel("Password").fill("rahasia-e2e-123");
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/quizzes$/);

  await page.getByRole("button", { name: "Buat quiz" }).click();
  await expect(page).toHaveURL(/\/quizzes\/[0-9a-f-]+\/edit$/);
  const quizId = page.url().split("/").at(-2)!;
  await page.getByLabel("Judul quiz").first().fill("Kuis Latihan E2E");

  await page.getByRole("button", { name: "Tambah soal pertama" }).click();
  await page.getByRole("menuitem", { name: /Pilihan Ganda/ }).click();
  await page.getByLabel("Pertanyaan", { exact: true }).fill("Ibu kota Indonesia tahun 2020?");
  await page.getByLabel("Teks opsi 1").fill("Jakarta");
  await page.getByLabel("Teks opsi 2").fill("Bandung");
  await page.getByLabel("Teks opsi 3").fill("Surabaya");
  await page.getByLabel("Teks opsi 4").fill("Medan");
  await page.getByRole("button", { name: "Tandai opsi 1 benar" }).click();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Quiz terbit! Versi 1/)).toBeVisible();
  return quizId;
}
