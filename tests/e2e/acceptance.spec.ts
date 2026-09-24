import { test, expect } from "@playwright/test";
import { login, loginAsStaff, readOutboxLink, readSeedShape, seedMember } from "./helpers";

// Dev first-hit compiles and the multi-step invite flow are slow on this
// 2-core box, so every story gets a generous budget.
test.describe(() => {
  test.setTimeout(600_000);

  test("S1: migrations+seeds yield 5 roles and one super admin", async () => {
    // The seed matrix itself is asserted by tests/integration/seed.test.ts in
    // the same CI run; here we assert the deployed database really is shaped
    // that way, which is what "seeds run from scratch" means end to end.
    const { roleKeys, superAdminPermissions } = await readSeedShape();
    expect(roleKeys).toEqual(
      ["admin", "content_manager", "member", "quiz_manager", "super_admin"],
    );
    expect(superAdminPermissions).toBeGreaterThanOrEqual(50);
  });

  test("S2: super admin logs in and sees the dashboard", async ({ page }) => {
    await loginAsStaff(page, "super_admin");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible({ timeout: 90_000 });
  });

  test("S3: super admin invites staff; invitee sets password and reaches the admin", async ({ browser }) => {
    const invitee = `invited-${Date.now()}@e2e.test`;
    const password = "invited-pass-9";

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAsStaff(adminPage, "super_admin");
    await adminPage.goto("/admin/users/staff");
    await adminPage.getByLabel(/email/i).fill(invitee);
    await adminPage.getByRole("button", { name: /invite/i }).click();
    // A form click returns as soon as the event fires, well before the server
    // action commits, so wait for its effect — the revalidated staff table now
    // lists the invitee — before reading the queued link out of the outbox.
    await expect(adminPage.getByText(invitee)).toBeVisible({ timeout: 90_000 });
    // The invite writes a token, queues the email and assigns the role in one
    // transaction; the link is only reachable from the outbox row.
    const link = await readOutboxLink(invitee);
    expect(link).toContain("/accept-invite?token=");

    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await inviteePage.goto(link);
    await inviteePage.getByLabel(/^password/i).fill(password);
    await inviteePage.getByLabel(/confirm/i).fill(password);
    await inviteePage.getByRole("button", { name: /set password/i }).click();
    await inviteePage.waitForURL(/\/login/, { timeout: 90_000 });

    // The invited account is a real staff account: it can sign in and the
    // middleware lets it through to the admin shell.
    await login(inviteePage, invitee, password);
    await inviteePage.goto("/admin");
    await expect(inviteePage.getByRole("heading", { name: /dashboard/i })).toBeVisible({ timeout: 90_000 });

    await adminContext.close();
    await inviteeContext.close();
  });

  test("S5: suspended member cannot log in", async ({ browser }) => {
    const member = await seedMember();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAsStaff(adminPage, "admin");
    await adminPage.goto("/admin/users");
    await adminPage.getByRole("textbox", { name: /search/i }).fill(member.email);
    await expect(adminPage.getByText(member.name)).toBeVisible({ timeout: 90_000 });
    // Scope both the click and the assertion to this member's row: the admin
    // account is created after the member, so it sorts first and a bare
    // `.first()` would suspend (and revoke) the acting admin instead.
    const row = adminPage.getByRole("row").filter({ hasText: member.email });
    await row.getByRole("button", { name: /suspend/i }).click();
    await expect(row.getByText(/suspended/i)).toBeVisible({ timeout: 90_000 });

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.goto("/login");
    await memberPage.getByLabel(/email/i).fill(member.email);
    await memberPage.getByLabel(/^password/i).fill("strong-pass-1");
    await memberPage.getByRole("button", { name: /sign in/i }).click();
    await expect(memberPage.getByRole("alert")).toBeVisible({ timeout: 90_000 });
    await expect(memberPage).toHaveURL(/\/login/, { timeout: 30_000 });

    await adminContext.close();
    await memberContext.close();
  });

  test("S6/S7: a role without members.read is denied the members list", async ({ page }) => {
    await loginAsStaff(page, "content_manager");
    await page.goto("/admin/users");
    // Middleware redirects rather than rendering a page the role cannot read.
    await expect(page).not.toHaveURL(/\/admin\/users$/, { timeout: 90_000 });
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible({ timeout: 90_000 });
  });
});
