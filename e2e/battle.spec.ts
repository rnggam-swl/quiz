import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { createPublishedQuiz } from "./helpers";

// P6 · Rebutan. Needs a real Supabase (CI starts one; locally: `pnpm db:start`, fill
// .env.local, E2E_SUPABASE=1).
test.skip(!process.env.E2E_SUPABASE, "needs local Supabase (set E2E_SUPABASE=1)");
test.skip(({ isMobile }) => isMobile, "host flow runs on desktop; participants use phones");

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

/** Host: a published quiz and a Rebutan session in its lobby, on the projector screen. */
async function openRebutan(page: Page) {
  const quizId = await createPublishedQuiz(page);
  await page.goto(`/quizzes/${quizId}/live`);
  await page.getByRole("button", { name: "Mulai live" }).click();
  await page.getByText("Rebutan", { exact: true }).click();
  await page.getByRole("button", { name: "Buka lobby" }).click();
  await expect(page).toHaveURL(/\/host\/[0-9a-f-]+$/);
  const sessionId = page.url().split("/").at(-1)!;
  const label = await page.getByLabel(/^Kode \d{6}$/).getAttribute("aria-label");
  return { quizId, sessionId, code: label!.replace(/\D/g, "") };
}

async function phone(browser: Browser, code: string, nickname: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const player = await context.newPage();
  await player.goto(`/play/${code}`);
  await player.getByLabel("Nama panggilan").fill(nickname);
  await player.getByRole("button", { name: "Gabung" }).click();
  await expect(player.getByText("Kamu masuk!")).toBeVisible();
  return { context, player };
}

test("rebutan: a wrong answer locks you out, the first right one wins for everyone", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const { code } = await openRebutan(page);
  const ani = await phone(browser, code, "Ani Salah");
  const budi = await phone(browser, code, "Budi Cepat");

  await expect(page.getByRole("button", { name: /Budi Cepat/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Mulai", exact: true }).click();

  // Ani answers wrong: locked out for this question (P6-09).
  await ani.player.getByRole("button", { name: /Bandung/ }).click({ timeout: 15_000 });
  await expect(ani.player.getByText("Coba di soal berikutnya")).toBeVisible();

  // Budi answers right: he wins, the round locks and everyone sees it (P6-07, P6-10, P6-11).
  await budi.player.getByRole("button", { name: /Jakarta/ }).click();
  await expect(budi.player.getByText("Kamu tercepat!")).toBeVisible();
  await expect(page.getByText("Budi Cepat tercepat!")).toBeVisible({ timeout: 5_000 });
  await expect(ani.player.getByText("Keduluan Budi Cepat!")).toBeVisible({ timeout: 10_000 });

  // The leaderboard counts wins (P6-08).
  await page.getByRole("button", { name: "Papan skor" }).click();
  await expect(page.getByText("soal dimenangkan").first()).toBeAttached();

  await ani.context.close();
  await budi.context.close();
});

test("rebutan: exactly one winner out of 50 simultaneous right answers, 20 times (P6-12)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const admin = adminClient();
  const { sessionId } = await openRebutan(page);
  // Leave the projector: its timers would move the session while the test drives it.
  await page.goto("/quizzes");
  // This test is about the plain rule: the first right answer to arrive wins at once.
  await setGrace(sessionId, 0);

  const players: string[] = [];
  for (let i = 0; i < 50; i += 10) {
    const batch = await Promise.all(
      Array.from({ length: 10 }, (_, k) =>
        admin.rpc("join_live", { p_session_id: sessionId, p_nickname: `Bot ${i + k + 1}` }),
      ),
    );
    for (const { data, error } of batch) {
      expect(error).toBeNull();
      players.push((data as { id: string }).id);
    }
  }
  const { data: session } = await admin
    .from("sessions")
    .select("question_ids")
    .eq("id", sessionId)
    .single();
  const questionId = (session!.question_ids as string[])[0]!;

  for (let round = 0; round < 20; round++) {
    // Open round `round` directly, as advance_live would.
    const now = Date.now();
    await admin.from("battle_rounds").insert({
      session_id: sessionId,
      idx: round,
      question_id: questionId,
      status: "open",
      time_limit_ms: 60_000,
      opened_at: new Date(now).toISOString(),
      closes_at: new Date(now + 60_000).toISOString(),
    });
    await admin
      .from("sessions")
      .update({ phase: "open", current_round: round, status: "running" })
      .eq("id", sessionId);

    const outcomes = await Promise.all(
      players.map((id) =>
        admin
          .rpc("record_battle_answer", {
            p_participant_id: id,
            p_question_id: questionId,
            p_answer: { selectedIds: ["correct"] },
            p_correct: true,
            p_points: 1000,
          })
          .then(({ data }) => data as { accepted: boolean; won?: boolean; reason?: string }),
      ),
    );
    expect(
      outcomes.filter((o) => o.won),
      `round ${round}`,
    ).toHaveLength(1);
    expect(outcomes.filter((o) => !o.accepted && o.reason === "round_closed")).toHaveLength(49);
  }

  const { count } = await admin
    .from("round_winners")
    .select("round_id, battle_rounds!inner(session_id)", { count: "exact", head: true })
    .eq("battle_rounds.session_id", sessionId);
  expect(count).toBe(20);
});

/** Set policy.buzzer.graceMs on a session (P8-04). */
async function setGrace(sessionId: string, graceMs: number) {
  const admin = adminClient();
  const { data } = await admin.from("sessions").select("policy").eq("id", sessionId).single();
  const policy = (data!.policy ?? {}) as { buzzer?: Record<string, unknown> };
  await admin
    .from("sessions")
    .update({ policy: { ...policy, buzzer: { ...policy.buzzer, graceMs } } })
    .eq("id", sessionId);
}

test("rebutan with a grace window: 50 simultaneous right answers, one winner (P8-04)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = adminClient();
  const { sessionId } = await openRebutan(page);
  await page.goto("/quizzes");
  await setGrace(sessionId, 250);

  const players: string[] = [];
  for (let i = 0; i < 50; i++) {
    const { data } = await admin.rpc("join_live", {
      p_session_id: sessionId,
      p_nickname: `Bot ${i + 1}`,
    });
    players.push((data as { id: string }).id);
  }
  const { data: session } = await admin
    .from("sessions")
    .select("question_ids")
    .eq("id", sessionId)
    .single();
  const questionId = (session!.question_ids as string[])[0]!;

  for (let round = 0; round < 5; round++) {
    const now = Date.now();
    await admin.from("battle_rounds").insert({
      session_id: sessionId,
      idx: round,
      question_id: questionId,
      status: "open",
      time_limit_ms: 60_000,
      opened_at: new Date(now).toISOString(),
      closes_at: new Date(now + 60_000).toISOString(),
    });
    await admin
      .from("sessions")
      .update({ phase: "open", current_round: round, status: "running" })
      .eq("id", sessionId);

    // Every phone says it reacted in 1–2 s; the server keeps each claim within bounds.
    const outcomes = await Promise.all(
      players.map((id, i) =>
        admin
          .rpc("record_battle_answer", {
            p_participant_id: id,
            p_question_id: questionId,
            p_answer: { selectedIds: ["correct"] },
            p_correct: true,
            p_points: 1000,
            p_client_ms: 1000 + i * 20,
          })
          .then(({ data }) => data as { accepted: boolean; pending?: boolean; won?: boolean }),
      ),
    );
    expect(outcomes.some((o) => o.won)).toBe(false); // nobody wins on arrival
    expect(outcomes.filter((o) => o.pending).length).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const { data: resolved } = await admin.rpc("resolve_buzzer_round", {
      p_session_id: sessionId,
    });
    expect(resolved, `round ${round}`).toMatchObject({ status: "resolved" });
  }

  const { count } = await admin
    .from("round_winners")
    .select("round_id, battle_rounds!inner(session_id)", { count: "exact", head: true })
    .eq("battle_rounds.session_id", sessionId);
  expect(count).toBe(5);
});
