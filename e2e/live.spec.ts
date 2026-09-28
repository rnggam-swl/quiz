import { expect, test } from "@playwright/test";

import { createPublishedQuiz } from "./helpers";

// P5. Needs a real Supabase with Realtime (CI starts one; locally: `pnpm db:start`, fill
// .env.local, E2E_SUPABASE=1). The host runs the projector on desktop, a participant
// plays on a phone-sized browser.
test.skip(!process.env.E2E_SUPABASE, "needs local Supabase (set E2E_SUPABASE=1)");
test.skip(({ isMobile }) => isMobile, "host flow runs on desktop; the participant uses a phone");

test("live: lobby → question → reveal → leaderboard → podium, with a reload in between", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const quizId = await createPublishedQuiz(page);

  // Host: open a live session from the dashboard.
  await page.goto(`/quizzes/${quizId}/live`);
  await page.getByRole("button", { name: "Mulai live" }).click();
  await page.getByRole("button", { name: "Buka lobby" }).click();
  await expect(page).toHaveURL(/\/host\/[0-9a-f-]+$/);
  const codeLabel = await page.getByLabel(/^Kode \d{6}$/).getAttribute("aria-label");
  const code = codeLabel!.replace(/\D/g, "");

  // Participant joins with the code.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const player = await phone.newPage();
  const bodies: string[] = [];
  let revealed = false;
  player.on("response", async (response) => {
    if (revealed) return;
    const type = response.headers()["content-type"] ?? "";
    if (/json|text|x-component/.test(type)) bodies.push(await response.text().catch(() => ""));
  });
  await player.goto(`/join?code=${code}`);
  await player.getByRole("button", { name: "Gabung" }).click();
  await expect(player).toHaveURL(new RegExp(`/play/${code}$`));
  await player.getByLabel("Nama panggilan").fill("Budi Live");
  await player.getByRole("button", { name: "Gabung" }).click();
  await expect(player.getByText("Kamu masuk!")).toBeVisible();

  // Host sees them in the lobby and starts; the countdown opens the question by itself.
  await expect(page.getByRole("button", { name: /Budi Live/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Mulai", exact: true }).click();
  await expect(page.getByText("dari 1 menjawab")).toBeVisible({ timeout: 15_000 });

  // The phone gets the controller; a reload keeps the participant and the phase.
  await expect(player.getByRole("button", { name: /Jakarta/ })).toBeVisible({ timeout: 15_000 });
  await player.reload();
  await expect(player.getByRole("button", { name: /Jakarta/ })).toBeVisible({ timeout: 15_000 });
  await expect(player.getByLabel("Nama panggilan")).toHaveCount(0);
  await player.getByRole("button", { name: /Jakarta/ }).click();
  await expect(player.getByText("Jawaban terkirim")).toBeVisible();

  // Nothing the phone received before the reveal may contain the answer key.
  for (const body of bodies) expect(body).not.toContain("correctIds");
  revealed = true;

  // Everyone answered: the round closes early and both screens show the result.
  await expect(page.getByText("1 benar")).toBeVisible({ timeout: 15_000 });
  await expect(player.getByText("Benar!")).toBeVisible({ timeout: 15_000 });
  await expect(player.getByText(/\+\d+ poin/)).toBeVisible();

  await page.getByRole("button", { name: "Papan skor" }).click();
  await expect(page.getByRole("heading", { name: "Papan skor" })).toBeVisible();
  await expect(page.getByText("Budi Live")).toBeVisible();
  await expect(player.getByText("Peringkatmu")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Podium" }).click();
  await expect(page.getByRole("heading", { name: "Juara" })).toBeVisible();
  await expect(player.getByText("Peringkat akhir")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Selesai" }).click();
  await expect(page.getByText("Sesi selesai")).toBeVisible();
  await phone.close();

  // The report lists the participant.
  await page.getByRole("link", { name: "Lihat laporan" }).click();
  await expect(page.getByRole("heading", { name: /Laporan live/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Budi Live" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "100%" })).toBeVisible();
});
