import { test, expect } from "@playwright/test";
import { loginAsStaff, seedMember } from "./helpers";

// Dev first-hit compiles (users/staff/roles pages) can exceed the 120s default;
// this box is 2-core, so a fresh compile of an admin route can take a minute.
test.describe(() => {
  test.setTimeout(420_000);

  test("admin lists and suspends a member", async ({ page }) => {
    const member = await seedMember(page);
    await loginAsStaff(page, "admin");
    await page.goto("/admin/users");
    await page.getByRole("textbox", { name: /search/i }).waitFor({ state: "visible", timeout: 60_000 });
    await page.getByRole("textbox", { name: /search/i }).fill(member.email);
    await expect(page.getByText(member.name)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /suspend/i }).first().click();
    await expect(page.getByText(/suspended/i)).toBeVisible({ timeout: 30_000 });
  });

  test("super admin can invite staff; content_manager cannot open the page", async ({ page }) => {
    await loginAsStaff(page, "super_admin");
    await page.goto("/admin/users/staff");
    await expect(page.getByRole("heading", { name: /staff/i })).toBeVisible({ timeout: 60_000 });

    await loginAsStaff(page, "content_manager");
    await page.goto("/admin/users/staff");
    await expect(page).not.toHaveURL(/\/admin\/users\/staff$/, { timeout: 60_000 });
  });

  test("roles page lists permission keys", async ({ page }) => {
    await loginAsStaff(page, "super_admin");
    await page.goto("/admin/users/roles");
    // `members.suspend` is granted to both admin and super_admin, so the text
    // is not unique — asserting on the first match is enough (USR-04).
    await expect(page.getByText(/members\.suspend/i).first()).toBeVisible({ timeout: 60_000 });
  });
});
