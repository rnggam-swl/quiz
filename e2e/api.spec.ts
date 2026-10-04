import { expect, test } from "@playwright/test";

import { createPublishedQuiz } from "./helpers";

// P8-07 · Read-only REST API with tokens made on /account/integrations. Needs a real Supabase
// (CI starts one; locally: `pnpm db:start`, fill .env.local, E2E_SUPABASE=1).
test.skip(!process.env.E2E_SUPABASE, "needs local Supabase (set E2E_SUPABASE=1)");
test.skip(({ isMobile }) => isMobile, "API flow is the same on phones");

test("a token reads the owner's quizzes and results until it is revoked", async ({
  page,
  browser,
}) => {
  const quizId = await createPublishedQuiz(page);

  // A learner finishes the quiz, so there is a result to read.
  await page.getByRole("button", { name: "Bagikan" }).click();
  const code = (await page.getByText(/^\d{3} \d{3}$/).textContent())!.replace(/\s/g, "");
  const learner = await (await browser.newContext()).newPage();
  await learner.goto(`/play/${code}`);
  await learner.getByLabel("Nama panggilan").fill("Siswa API");
  await learner.getByRole("button", { name: "Mulai" }).click();
  await learner.getByRole("button", { name: /Jakarta/ }).click();
  await learner.getByRole("button", { name: "Lihat hasil" }).click();
  await expect(learner.getByText("100%")).toBeVisible();

  await page.goto("/account/integrations");
  await page.getByLabel("Nama token").fill("Moodle uji");
  await page.getByRole("button", { name: "Buat token" }).click();
  const token = await page.getByRole("textbox", { name: "Token API baru" }).inputValue();
  expect(token).toMatch(/^qz_/);
  await page.getByRole("button", { name: "Selesai" }).click();
  await expect(page.getByText("Moodle uji")).toBeVisible();

  const headers = { Authorization: `Bearer ${token}` };
  const quizzes = await page.request.get("/api/v1/quizzes", { headers });
  expect(quizzes.status()).toBe(200);
  expect((await quizzes.json()).data).toEqual([
    expect.objectContaining({ id: quizId, title: "Kuis Latihan E2E", question_count: 1 }),
  ]);

  const quiz = await (await page.request.get(`/api/v1/quizzes/${quizId}`, { headers })).json();
  expect(JSON.stringify(quiz)).not.toContain("correct");
  expect(quiz.data.questions[0]).toMatchObject({ prompt: "Ibu kota Indonesia tahun 2020?" });

  const attempts = await (
    await page.request.get(`/api/v1/quizzes/${quizId}/attempts?status=submitted`, { headers })
  ).json();
  expect(attempts.next_cursor).toBeNull();
  expect(attempts.data).toEqual([
    expect.objectContaining({
      status: "submitted",
      ratio: 1,
      participant: expect.objectContaining({ nickname: "Siswa API" }),
    }),
  ]);
  const attempt = await (
    await page.request.get(`/api/v1/attempts/${attempts.data[0].id}`, { headers })
  ).json();
  expect(attempt.data.responses).toHaveLength(1);

  // Someone else's quiz id is simply not found.
  const missing = await page.request.get(`/api/v1/quizzes/${crypto.randomUUID()}`, { headers });
  expect(missing.status()).toBe(404);

  await page.getByRole("button", { name: "Cabut" }).click();
  await page.getByRole("button", { name: "Cabut “Moodle uji”?" }).click();
  await expect(page.getByText("Dicabut", { exact: true })).toBeVisible();
  const revoked = await page.request.get("/api/v1/quizzes", { headers });
  expect(revoked.status()).toBe(401);
});
