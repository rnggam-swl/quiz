import { createHmac } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test } from "@playwright/test";

import { createPublishedQuiz } from "./helpers";

// P8-06 · Webhooks. Needs a real Supabase (CI starts one; locally: `pnpm db:start`, fill
// .env.local, E2E_SUPABASE=1) and a server that may call localhost (dev, or
// WEBHOOKS_ALLOW_LOCAL=true as in CI).
test.skip(!process.env.E2E_SUPABASE, "needs local Supabase (set E2E_SUPABASE=1)");
test.skip(({ isMobile }) => isMobile, "webhook settings are the same on phones");

type Received = { headers: IncomingHttpHeaders; body: string };

test("test event and attempt.submitted reach the receiver, signed", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const received: Received[] = [];
  const receiver = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.writeHead(200).end("ok");
    });
  });
  await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  const port = (receiver.address() as AddressInfo).port;

  try {
    await createPublishedQuiz(page);
    await page.getByRole("button", { name: "Bagikan" }).click();
    const code = (await page.getByText(/^\d{3} \d{3}$/).textContent())!.replace(/\s/g, "");

    await page.goto("/account/integrations");
    await page.getByLabel("URL penerima").fill(`http://localhost:${port}/hook`);
    await page.getByRole("button", { name: "Tambah webhook" }).click();
    await page.getByRole("button", { name: "Secret" }).click();
    const secret = await page.getByLabel(/^Secret webhook/).inputValue();
    expect(secret).toMatch(/^whsec_/);

    await page.getByRole("button", { name: "Kirim tes" }).click();
    await expect(page.getByText("Terkirim (HTTP 200).")).toBeVisible({ timeout: 20_000 });
    expect(JSON.parse(received[0]!.body)).toMatchObject({ type: "webhook.test" });

    // Standard Webhooks signature over `${id}.${timestamp}.${body}`.
    const { headers, body } = received[0]!;
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key)
      .update(`${headers["webhook-id"]}.${headers["webhook-timestamp"]}.${body}`)
      .digest("base64");
    expect(headers["webhook-signature"]).toBe(`v1,${expected}`);

    // A learner finishes the quiz: attempt.submitted arrives right after.
    const learner = await (await browser.newContext()).newPage();
    await learner.goto(`/play/${code}`);
    await learner.getByLabel("Nama panggilan").fill("Siswa Webhook");
    await learner.getByRole("button", { name: "Mulai" }).click();
    await learner.getByRole("button", { name: /Jakarta/ }).click();
    await learner.getByRole("button", { name: "Lihat hasil" }).click();
    await expect(learner.getByText("100%")).toBeVisible();

    await expect
      .poll(() => received.map((r) => JSON.parse(r.body).type), { timeout: 20_000 })
      .toContain("attempt.submitted");
    const event = JSON.parse(received.find((r) => r.body.includes("attempt.submitted"))!.body);
    expect(event.data).toMatchObject({
      attempt: { status: "submitted", ratio: 1 },
      participant: { nickname: "Siswa Webhook" },
      quiz: { title: "Kuis Latihan E2E" },
    });

    await page.reload();
    await expect(page.getByRole("cell", { name: "Terkirim" })).toHaveCount(2);
  } finally {
    receiver.close();
  }
});
