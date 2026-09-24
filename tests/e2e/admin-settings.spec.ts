import { test, expect } from "@playwright/test";
import { loginAsStaff, warmSettingsRoutes } from "./helpers";

// Dev first-hit compiles (settings/audit-logs pages + the save API) can exceed
// the 120s default; this box is 2-core, so a fresh route compile is slow.
test.describe(() => {
  test.setTimeout(420_000);

  // Compile the routes before any test's clock starts, so the first test does
  // not pay for /login + settings + save-route cold compiles.
  test.beforeAll(async () => {
    test.setTimeout(600_000);
    await warmSettingsRoutes();
  });

  test("settings tabs save a non-secret value", async ({ page }) => {
    await loginAsStaff(page, "admin");
    await page.goto("/admin/settings");
    await page.getByLabel(/church name/i).fill("MOVALDEM Test");
    await page.getByRole("button", { name: /save/i }).click();
    // The save posts natively and redirects back with ?saved=1; on this box the
    // round trip can take a while, so wait for the URL rather than the banner.
    await page.waitForURL(/saved=1/, { timeout: 90_000 });
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 30_000 });
  });
  test("secrets are write-only and masked", async ({ page }) => {
    await loginAsStaff(page, "super_admin");
    await page.goto("/admin/settings");
    await page.getByLabel(/smtp/i).fill("smtp://user:pass@mail");
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForURL(/saved=1/, { timeout: 90_000 });
    await page.reload();
    await expect(page.getByLabel(/smtp/i)).toHaveValue(/••••/, { timeout: 30_000 });
  });
  test("audit logs are read-only", async ({ page }) => {
    await loginAsStaff(page, "super_admin");
    await page.goto("/admin/audit-logs");
    await expect(page.getByText(/user\.register/)).toBeVisible();
    await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
  });
});
