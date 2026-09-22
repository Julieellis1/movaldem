import { test, expect } from "@playwright/test";

test("register then login", async ({ page }) => {
  // Unique per run: re-runs must not collide with an existing account.
  const email = `grace-${Date.now()}@e2e.test`;
  await page.goto("/register");
  await page.getByLabel(/full name/i).fill("Grace Okafor");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password/i).fill("strong-pass-1");
  await page.getByLabel(/confirm password/i).fill("strong-pass-1");
  await page.getByLabel(/consent/i).check();
  await page.getByRole("button", { name: /create account/i }).click();
  // First hit compiles the register route + verify-email page in dev.
  await expect(page).toHaveURL(/\/login|\/verify-email/, { timeout: 90_000 });
});

test("register validation blocks missing consent", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByText(/consent is required/i)).toBeVisible();
});
