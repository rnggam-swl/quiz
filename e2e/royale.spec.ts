import { expect, test, type Browser } from "@playwright/test";

import { createPublishedQuiz } from "./helpers";

// P7 · Battle Royale. Needs a real Supabase (CI starts one; locally: `pnpm db:start`, fill
// .env.local, E2E_SUPABASE=1).
test.skip(!process.env.E2E_SUPABASE, "needs local Supabase (set E2E_SUPABASE=1)");
test.skip(({ isMobile }) => isMobile, "host flow runs on desktop; participants use phones");

async function phone(browser: Browser, code: string, nickname: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const player = await context.newPage();
  await player.goto(`/play/${code}`);
  await player.getByLabel("Nama panggilan").fill(nickname);
  await player.getByRole("button", { name: "Gabung" }).click();
  await expect(player.getByText("Kamu masuk!")).toBeVisible();
  return { context, player };
}

test("royale: a wrong answer with the last life eliminates, the survivor wins", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const quizId = await createPublishedQuiz(page);
  await page.goto(`/quizzes/${quizId}/live`);
  await page.getByRole("button", { name: "Mulai live" }).click();
  await page.getByText("Battle Royale", { exact: true }).click();
  await page.getByLabel("Nyawa").selectOption("1");
  await page.getByRole("button", { name: "Buka lobby" }).click();
  await expect(page).toHaveURL(/\/host\/[0-9a-f-]+$/);
  const label = await page.getByLabel(/^Kode \d{6}$/).getAttribute("aria-label");
  const code = label!.replace(/\D/g, "");

  const ani = await phone(browser, code, "Ani Tahan");
  const budi = await phone(browser, code, "Budi Keluar");
  await expect(page.getByRole("button", { name: /Budi Keluar/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Mulai", exact: true }).click();

  // The projector counts survivors; both answer and the round closes early.
  await expect(page.getByText("2 / 2")).toBeVisible({ timeout: 15_000 });
  await ani.player.getByRole("button", { name: /Jakarta/ }).click({ timeout: 15_000 });
  await budi.player.getByRole("button", { name: /Bandung/ }).click();

  await expect(page.getByText("Tersingkir: Budi Keluar")).toBeVisible({ timeout: 15_000 });
  await expect(budi.player.getByText("Kamu bertahan sampai putaran 1!")).toBeVisible({
    timeout: 15_000,
  });
  await expect(ani.player.getByText("Benar! Nyawa aman")).toBeVisible({ timeout: 15_000 });

  // One survivor: straight to the podium.
  await page.getByRole("button", { name: "Podium" }).click();
  await expect(page.getByText("Bertahan sampai akhir")).toBeVisible();
  await expect(ani.player.getByText("Kamu yang terakhir bertahan!")).toBeVisible({
    timeout: 15_000,
  });
  await expect(budi.player.getByText("Bertahan sampai putaran ke-1")).toBeVisible({
    timeout: 15_000,
  });

  await ani.context.close();
  await budi.context.close();
});
