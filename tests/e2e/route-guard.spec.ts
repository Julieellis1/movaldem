import { test, expect } from "@playwright/test";

test("visitor is redirected from /admin to /login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
});
