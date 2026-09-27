import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { createPublishedQuiz } from "./helpers";

// P4-21. Needs a real Supabase (CI starts one; locally: `pnpm db:start`, fill .env.local,
// E2E_SUPABASE=1). The test moves an attempt's deadline with the secret key, standing in
// for time passing, so it doesn't have to wait out a real exam.
test.skip(!process.env.E2E_SUPABASE, "needs local Supabase (set E2E_SUPABASE=1)");
test.skip(({ isMobile }) => isMobile, "host flow runs on desktop; the participant uses a phone");

function adminClient() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI may pass the variables directly.
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
}

test("exam: resume after closing, no answers after the deadline, results hidden until released", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const admin = adminClient();
  const quizId = await createPublishedQuiz(page);

  // Host: create an exam with manual release and no fullscreen (headless browsers).
  await page.goto(`/quizzes/${quizId}/exams`);
  await page.getByRole("link", { name: "Buat ujian" }).click();
  await page.getByLabel("Nama ujian").fill("UTS E2E");
  await page.getByLabel("Durasi (menit)").fill("30");
  await page.getByText("Manual", { exact: true }).click();
  await page.getByRole("switch", { name: "Minta layar penuh saat mulai" }).click();
  await page.getByRole("button", { name: "Buat ujian" }).click();
  await expect(page).toHaveURL(/\/exams\/[0-9a-f-]+$/);
  const examId = page.url().split("/").at(-1)!;
  await expect(page.getByRole("heading", { name: /UTS E2E/ })).toBeVisible();

  // Participant on a phone: join, answer, then close the tab.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let player = await phone.newPage();
  await player.goto(`/exam/${examId}`);
  await player.getByLabel("Nama lengkap").fill("Sari E2E");
  await player.getByRole("button", { name: "Mulai ujian" }).click();
  await expect(player.getByText("Ibu kota Indonesia tahun 2020?")).toBeVisible();
  await player.getByRole("button", { name: /Jakarta/ }).click();

  const savedAnswers = async () => {
    const { data } = await admin
      .from("responses")
      .select("answer, attempts!inner(session_id)")
      .eq("attempts.session_id", examId);
    return data ?? [];
  };
  await expect.poll(async () => (await savedAnswers()).length).toBe(1);
  const saved = JSON.stringify((await savedAnswers())[0]!.answer);
  await player.close();

  // Coming back resumes the same attempt with the saved answer.
  player = await phone.newPage();
  await player.goto(`/exam/${examId}`);
  await expect(player.getByText("Ibu kota Indonesia tahun 2020?")).toBeVisible();
  await expect(player.getByRole("button", { name: /Jakarta/ })).toHaveAttribute(
    "data-pressed",
    "true",
  );
  await expect(player.getByLabel("Nama lengkap")).toHaveCount(0);

  // Time runs out on the server: the cron job's function marks the attempt expired.
  await admin
    .from("attempts")
    .update({ deadline: new Date(Date.now() - 60_000).toISOString() })
    .eq("session_id", examId);
  await admin.rpc("expire_attempts");
  const { data: attempt } = await admin
    .from("attempts")
    .select("status")
    .eq("session_id", examId)
    .single();
  expect(attempt?.status).toBe("expired");

  // A late change is refused; the player hands in what was saved and shows the receipt.
  await player.getByRole("button", { name: /Bandung/ }).click();
  await expect(player.getByRole("heading", { name: "Jawaban terkirim" })).toBeVisible();
  await expect(player.getByText(/Waktu habis/)).toBeVisible();
  await expect(
    player.getByText("Nilai diumumkan oleh guru. Buka lagi halaman ini nanti."),
  ).toBeVisible();
  const answers = await savedAnswers();
  expect(answers).toHaveLength(1);
  expect(JSON.stringify(answers[0]!.answer)).toBe(saved);

  // Host: the monitor shows it, and the score stays hidden until "Rilis nilai".
  await page.reload();
  const row = page.getByRole("row", { name: /Sari E2E/ });
  await expect(row.getByText("Waktu habis")).toBeVisible();
  await player.getByRole("button", { name: "Cek nilai" }).click();
  await expect(player.getByText(/Nilai diumumkan oleh guru/)).toBeVisible();

  await page.getByRole("button", { name: "Rilis nilai" }).click();
  await expect(page.getByText(/Nilai dirilis/)).toBeVisible();
  await player.getByRole("button", { name: "Cek nilai" }).click();
  await expect(player.getByText("1000 / 1000 poin")).toBeVisible();
  await phone.close();

  // The report counts it.
  await page.goto(`/quizzes/${quizId}/exams/${examId}/report`);
  await expect(page.getByRole("cell", { name: "100%" })).toBeVisible();
});
