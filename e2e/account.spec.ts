import { expect, test, type Page } from "@playwright/test";

// P8-16 · Akun: ubah password, lupa password. Needs a real Supabase (CI starts one; locally:
// `pnpm db:start`, fill .env.local, E2E_SUPABASE=1). Reset emails land in the local Mailpit.
test.skip(!process.env.E2E_SUPABASE, "needs local Supabase (set E2E_SUPABASE=1)");
test.skip(({ isMobile }) => isMobile, "account flows are the same on phones");

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function signUp(page: Page, email: string, password: string) {
  await page.goto("/login?mode=signup");
  await page.getByLabel("Nama").fill("Guru Akun");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/quizzes$/);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
}

/** The newest email to this address, as HTML (polls; the auth server sends asynchronously). */
async function latestEmail(to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    if (messages[0]) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
      return ((await message.json()) as { HTML: string }).HTML;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`no email for ${to}`);
}

test("change the password on /account, then sign in with the new one", async ({ page }) => {
  const email = `akun-${Date.now()}@sekolah.test`;
  await signUp(page, email, "rahasia-lama-123");

  await page.getByRole("link", { name: email }).click();
  await expect(page.getByRole("heading", { name: "Ubah password" })).toBeVisible();

  await page.getByLabel("Password saat ini").fill("salah-sekali-123");
  await page.getByLabel("Password baru", { exact: true }).fill("rahasia-baru-456");
  await page.getByLabel("Ulangi password baru").fill("rahasia-baru-456");
  await page.getByRole("button", { name: "Ganti password" }).click();
  await expect(page.getByText("Password saat ini salah.")).toBeVisible();

  await page.getByLabel("Password saat ini").fill("rahasia-lama-123");
  await page.getByLabel("Password baru", { exact: true }).fill("rahasia-baru-456");
  await page.getByLabel("Ulangi password baru").fill("rahasia-baru-456");
  await page.getByRole("button", { name: "Ganti password" }).click();
  await expect(page.getByText("Password diganti.")).toBeVisible();

  await page.getByRole("button", { name: "Keluar" }).click();
  await signIn(page, email, "rahasia-lama-123");
  await expect(page.getByText("Email atau password salah.")).toBeVisible();
  await signIn(page, email, "rahasia-baru-456");
  await expect(page).toHaveURL(/\/quizzes$/);
});

test("forgot password: the emailed link lets you set a new one", async ({ page, browser }) => {
  const email = `lupa-${Date.now()}@sekolah.test`;
  await signUp(page, email, "rahasia-lama-123");
  await page.getByRole("button", { name: "Keluar" }).click();

  // Without the link, /reset-password refuses, even when signed in.
  await page.goto("/reset-password");
  await expect(page.getByText("Link reset tidak berlaku")).toBeVisible();

  await page.goto("/login");
  await page.getByRole("link", { name: "Lupa password?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Kirim link reset" }).click();
  await expect(page.getByText("Cek email kamu")).toBeVisible();

  // The template links to /auth/confirm (token_hash), so it works in another browser too.
  const html = await latestEmail(email);
  const link = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(html)?.[1]?.replaceAll("&amp;", "&");
  expect(link).toBeTruthy();
  const phone = await browser.newContext();
  const other = await phone.newPage();
  await other.goto(link!);
  await expect(other).toHaveURL(/\/reset-password$/);
  await other.getByLabel("Password baru", { exact: true }).fill("rahasia-baru-789");
  await other.getByLabel("Ulangi password baru").fill("rahasia-baru-789");
  await other.getByRole("button", { name: "Simpan password" }).click();
  await expect(other).toHaveURL(/\/account\?password=reset$/);
  await expect(other.getByText("Password baru tersimpan.")).toBeVisible();
  await phone.close();

  await signIn(page, email, "rahasia-baru-789");
  await expect(page).toHaveURL(/\/quizzes$/);
});
