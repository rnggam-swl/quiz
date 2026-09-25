import { expect, test } from "@playwright/test";

test("home page renders the hero", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Quiz/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("home page has no horizontal scroll on phones", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
