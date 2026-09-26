import { expect, test, type Page } from "@playwright/test";

// Needs a real Supabase (CI starts one; locally: `pnpm db:start`, fill .env.local, E2E_SUPABASE=1).
test.skip(!process.env.E2E_SUPABASE, "needs local Supabase (set E2E_SUPABASE=1)");
test.skip(
  ({ isMobile }) => isMobile,
  "host flow runs on desktop; the participant uses a phone below",
);

async function createPublishedQuiz(page: Page): Promise<string> {
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

test("host shares a quiz, a participant plays it, the host sees the result", async ({
  page,
  browser,
}) => {
  const quizId = await createPublishedQuiz(page);

  // Host: open "Bagikan" and read the join code.
  await page.getByRole("button", { name: "Bagikan" }).click();
  const codeText = await page.getByText(/^\d{3} \d{3}$/).textContent();
  const code = codeText!.replace(/\s/g, "");
  expect(code).toMatch(/^\d{6}$/);

  // Participant: a separate phone-sized browser with no account.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const player = await phone.newPage();
  const bodies: string[] = [];
  let answered = false;
  player.on("response", async (response) => {
    if (answered) return;
    const type = response.headers()["content-type"] ?? "";
    if (/json|text|x-component/.test(type)) bodies.push(await response.text().catch(() => ""));
  });

  await player.goto(`/join?code=${code}`);
  await player.getByRole("button", { name: "Gabung" }).click();
  await expect(player).toHaveURL(new RegExp(`/play/${code}$`));
  await player.getByLabel("Nama panggilan").fill("Budi E2E");
  await player.getByRole("button", { name: "Mulai" }).click();
  await expect(player.getByText("Ibu kota Indonesia tahun 2020?")).toBeVisible();

  // P2-27: nothing the participant received so far may contain the answer key.
  for (const body of bodies) expect(body).not.toContain("correctIds");

  answered = true;
  await player.getByRole("button", { name: /Jakarta/ }).click();
  await expect(player.getByText("Benar!")).toBeVisible();
  await player.getByRole("button", { name: "Lihat hasil" }).click();
  await expect(player.getByText("100%")).toBeVisible();

  // A reload recognizes the participant (token in localStorage) and doesn't silently start over.
  await player.reload();
  await expect(player.getByRole("button", { name: "Mulai lagi" })).toBeVisible();
  await expect(player.getByLabel("Nama panggilan")).toHaveCount(0);
  await phone.close();

  // Host: the attempt shows up in the results.
  await page.goto(`/quizzes/${quizId}/results`);
  await expect(page.getByRole("link", { name: "Budi E2E" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "100%" })).toBeVisible();
});

/** A fake third-party site (intercepted by Playwright) that embeds the quiz with embed.js. */
function hostPage(appOrigin: string, slug: string) {
  return `<!doctype html><html><body>
    <h1>Blog sekolah</h1>
    <div id="quiz" data-quiz="${slug}"></div>
    <pre id="log"></pre>
    <script>
      const el = document.getElementById("quiz");
      for (const t of ["ready", "resize", "started", "answered", "completed"]) {
        el.addEventListener("quiz:" + t, (e) => {
          document.getElementById("log").textContent += t + " " + JSON.stringify(e.detail) + "\\n";
        });
      }
    </script>
    <script src="${appOrigin}/embed.js"></script>
  </body></html>`;
}

test("the quiz embeds on an allowed site and reports back; other sites are refused", async ({
  page,
  browser,
  baseURL,
}) => {
  await createPublishedQuiz(page);
  await page.getByRole("button", { name: "Bagikan" }).click();
  await page.getByRole("tab", { name: "Embed" }).click();
  await page.getByLabel("Domain yang boleh memasang quiz ini").fill("https://sekolah.test");
  await page.getByRole("button", { name: "Simpan domain" }).click();
  await expect(page.getByText(/Domain disimpan/)).toBeVisible();
  const snippet = await page.getByLabel("Snippet script", { exact: true }).textContent();
  const slug = /data-quiz="([a-z0-9-]+)"/.exec(snippet ?? "")![1]!;

  // Chrome's Local Network Access blocks a public site from loading the app on localhost
  // unless the visitor allows it; a real deployment is on a public domain and needs nothing.
  const visitor = await browser.newContext({ permissions: ["local-network-access"] });
  const site = await visitor.newPage();
  for (const origin of ["https://sekolah.test", "https://bukan-sekolah.test"]) {
    await site.route(`${origin}/`, (route) =>
      route.fulfill({ contentType: "text/html", body: hostPage(baseURL!, slug) }),
    );
  }

  // Allowed site: the quiz loads, talks to the page, and resizes its iframe.
  await site.goto("https://sekolah.test/");
  await expect(site.locator("#log")).toContainText("ready", { timeout: 20_000 });
  await expect(site.locator("#log")).toContainText("resize");
  const quiz = site.frameLocator("#quiz iframe");
  await quiz.getByLabel("Nama panggilan").fill("Tamu Embed");
  await quiz.getByRole("button", { name: "Mulai" }).click();
  await quiz.getByRole("button", { name: /Jakarta/ }).click();
  await quiz.getByRole("button", { name: "Lihat hasil" }).click();
  await expect(site.locator("#log")).toContainText('completed {"attemptId"');
  await expect(site.locator("#log")).toContainText('"ratio":1');

  // Another site: frame-ancestors blocks the iframe, so it never says "ready".
  await site.goto("https://bukan-sekolah.test/");
  await site.waitForTimeout(4000);
  await expect(site.locator("#log")).not.toContainText("ready");
  await visitor.close();
});

test("unknown join codes are rejected", async ({ page }) => {
  await page.goto("/join?code=000000");
  await page.getByRole("button", { name: "Gabung" }).click();
  await expect(page.getByText(/Kode tidak ditemukan/)).toBeVisible();
});
