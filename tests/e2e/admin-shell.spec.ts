import { test, expect } from "@playwright/test";
import { loginAsStaff } from "./helpers";

// Dev first-hit compiles (register/login/admin) can exceed the 120s default.
test.describe(() => {
  test.setTimeout(240_000);

  test("staff sees permitted nav only", async ({ page }) => {
    await loginAsStaff(page, "content_manager");
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: /sermons/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /transactions/i })).toHaveCount(0);
  });

  test("admin is noindex", async ({ page }) => {
    await loginAsStaff(page, "admin");
    await page.goto("/admin");
    const meta = page.locator('meta[name="robots"]');
    await expect(meta).toHaveAttribute("content", /noindex/i, { timeout: 30_000 });
  });
});
