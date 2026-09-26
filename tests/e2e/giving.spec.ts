import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { Pool } from "@neondatabase/serverless";
import { loginAsStaff } from "./helpers";

// Phase 4 giving acceptance: PRD 10 §5.4 (tithe ₦10,000) + §5.5 (project
// ₦5,000 / ₦10,000,000) against Paystack TEST mode. Item 6 (e2e half) of
// docs/superpowers/plans/2026-09-26-phase4-giving.md.
//
// CI-ONLY: never run locally (`pnpm e2e` in CI after `pnpm db:seed`). Kept
// serial + generous timeouts like teaching-content.spec.ts — cold `next dev`
// compile is slow, and Paystack's hosted checkout adds its own latency.
//
// Required CI secrets:
// - PAYSTACK_SECRET_KEY : Paystack TEST secret key (sk_test_...). The server
//   reads it env-only (PRD 06 §7 preferred); no DB setting exists.
// - PAYSTACK_PUBLIC_KEY : Paystack TEST public key (pk_test_...).
// - DATABASE_URL / APP_URL / APP_SECRET / IP_HASH_SALT / CRON_SECRET : the
//   standard suite env (see src/lib/env.ts).
// - Paystack TEST card (per Paystack docs at time of writing — re-check the
//   current docs first per the plan's API-drift rule): 4084 0840 8408 4081,
//   any future expiry, any 3-digit CVV, PIN 0000, OTP 123456.
//
// Webhook caveat: Paystack cannot deliver webhooks to CI localhost, so the
// confirmation page may sit at "Payment pending" after the test-card payment.
// The spec therefore completes verification through the Super Admin reverify
// endpoint (server-to-server verify with Paystack, 06 §9) and re-checks the
// confirmation page — the same transition the webhook/reconciler path
// performs. If CI ever exposes a public webhook URL, replace the reverify
// step with a wait for webhook arrival; the assertions are identical.
//
// Strategy:
// - 5.4 drives the REAL /give UI (Tithe select, ₦10,000, name, email) then
//   follows the Paystack redirect and pays with the test card.
// - 5.5 creates/activates the project through the real admin APIs (admin
//   session), pays a ₦5,000 project gift, and asserts amount_raised_cached
//   moves by exactly 500,000 kobo. Pending-unchanged and closed-rejects are
//   asserted through the same APIs.
// - Refunded-excluded is covered at integration level
//   (tests/integration/giving.projects.test.ts); issuing a real refund in
//   TEST mode is flaky and adds minutes.
// - Unique Date.now+random stamps everywhere; nothing is cleaned up.

const BASE = "http://localhost:3000";

// Paystack hosted-checkout field selectors. These target the hosted page at
// time of writing; if Paystack renames them, refresh per the plan drift rule
// (behaviour requirements win over DOM details). Each step tries several
// candidate selectors and fails with a clear message naming the step.
const CARD_NUMBER_SELECTORS = [
  "input[name='cardNumber']",
  "input[placeholder*='0000' i]",
  "input[id*='card-number' i]",
  "input[type='tel']",
];
const EXPIRY_SELECTORS = ["input[name='expiry']", "input[placeholder*='MM/YY' i]", "input[id*='expiry' i]"];
const CVV_SELECTORS = ["input[name='cvv']", "input[placeholder*='CVV' i]", "input[id*='cvv' i]"];
const PIN_SELECTORS = ["input[name='pin']", "input[placeholder*='PIN' i]", "input[id*='pin' i]"];
const OTP_SELECTORS = ["input[name='otp']", "input[placeholder*='OTP' i]", "input[id*='otp' i]"];

function stamp(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fillFirstVisible(page: Page, selectors: string[], value: string, step: string) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    try {
      await loc.waitFor({ state: "visible", timeout: 15_000 });
      await loc.fill(value);
      return;
    } catch {
      // try the next candidate selector
    }
  }
  throw new Error(`Paystack step "${step}": no field matched ${selectors.join(", ")}`);
}

async function clickFirstVisible(page: Page, selectors: string[], step: string) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    try {
      await loc.waitFor({ state: "visible", timeout: 15_000 });
      await loc.click();
      return;
    } catch {
      // try the next candidate selector
    }
  }
  throw new Error(`Paystack step "${step}": no button matched ${selectors.join(", ")}`);
}

// Pays the currently-loaded Paystack hosted checkout with the TEST card.
// Conditional PIN/OTP steps are attempted only if their fields appear.
async function payWithTestCard(page: Page) {
  await fillFirstVisible(page, CARD_NUMBER_SELECTORS, "4084084084084081", "card number");
  await fillFirstVisible(page, EXPIRY_SELECTORS, "12/30", "expiry");
  await fillFirstVisible(page, CVV_SELECTORS, "408", "cvv");
  await clickFirstVisible(
    page,
    ["button:has-text('Pay')", "button[type='submit']"],
    "pay button",
  );
  // Card PIN (test PIN 0000) — only present for cards that require it.
  try {
    await fillFirstVisible(page, PIN_SELECTORS, "0000", "card pin");
    await clickFirstVisible(page, ["button:has-text('Submit')", "button[type='submit']"], "pin submit");
  } catch {
    // No PIN step offered — continue.
  }
  // OTP (test OTP 123456) — only present when the bank simulator asks.
  try {
    await fillFirstVisible(page, OTP_SELECTORS, "123456", "otp");
    await clickFirstVisible(page, ["button:has-text('Submit')", "button[type='submit']"], "otp submit");
  } catch {
    // No OTP step offered — continue.
  }
}

async function getStatus(
  request: APIRequestContext,
  reference: string,
): Promise<{ status?: string }> {
  const res = await request.get(
    `/api/giving/status?reference=${encodeURIComponent(reference)}`,
    { timeout: 90_000 },
  );
  expect(res.ok(), `status poll failed: ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as { status?: string };
}

async function waitForStatus(
  request: APIRequestContext,
  reference: string,
  want: string,
  timeoutMs = 90_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { status } = await getStatus(request, reference);
    if (status === want) return;
    if (Date.now() > deadline) {
      throw new Error(`reference ${reference} never reached ${want} (last: ${status})`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function readRaisedKobo(projectId: string): Promise<number> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query<{ amount_raised_cached: string }>(
      `SELECT amount_raised_cached::text AS amount_raised_cached FROM giving_projects WHERE id = $1`,
      [projectId],
    );
    return Number(r.rows[0]?.amount_raised_cached ?? 0);
  } finally {
    await pool.end();
  }
}

test.describe("Phase 4 giving journeys (PRD 10 §5.4/5.5, Paystack TEST mode)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(600_000);

  test("5.4 tithe ₦10,000: UI checkout → Paystack test payment → verified success + receipt (GIV-01..04 GIV-12 RCP-01)", async ({
    page,
    browser,
  }) => {
    const s = stamp();
    const name = `E2E Giver ${s}`;
    const email = `e2e-giver-${s}@e2e.test`;

    // GIV flow steps 1-4 through the real /give UI (guest allowed).
    await page.goto("/give");
    await expect(page.getByRole("heading", { name: /give/i }).first()).toBeVisible({ timeout: 90_000 });
    await page.getByLabel("Giving type").click();
    await page.getByRole("option", { name: "Tithe" }).click();
    await page.getByLabel(/Amount/).fill("10000");
    await page.getByLabel("Full name").fill(name);
    await page.getByLabel("Email", { exact: true }).fill(email);

    // Server creates the pending transaction (1,000,000 kobo) and answers
    // with the Paystack authorization URL, which the form navigates to.
    await page.getByRole("button", { name: /Proceed to Payment/ }).click();
    await page.waitForURL(/paystack\.com|paystack\.co/, { timeout: 90_000 });

    await payWithTestCard(page);

    // Paystack redirects to our callback /give/confirmation?reference=MVD-….
    // The reference is unguessable; read it back off the landing URL.
    await page.waitForURL(/\/give\/confirmation\?reference=/, { timeout: 90_000 });
    const reference = new URL(page.url()).searchParams.get("reference");
    expect(reference, "confirmation URL carries the transaction reference").toMatch(/^MVD-/);

    // In CI the webhook cannot reach localhost, so the page may still show
    // pending (GIV-03: the frontend redirect alone NEVER marks success).
    // Complete verification server-side via the Super Admin reverify endpoint
    // — the same verifyAndTransition the webhook path runs.
    await loginAsStaff(page, "super_admin");
    const reverify = await page.request.post(
      `/api/admin/transactions/${encodeURIComponent(reference!)}/reverify`,
      { timeout: 180_000 },
    );
    expect(reverify.ok(), `reverify failed: ${reverify.status()} ${await reverify.text()}`).toBe(true);
    await waitForStatus(page.request, reference!, "successful");

    // Confirmation page now shows success with a receipt link (RCP-01); the
    // receipt itself is viewable and the emailed copy rides the outbox.
    const visitorCtx = await browser.newContext();
    const visitor = await visitorCtx.newPage();
    try {
      await visitor.goto(`/give/confirmation?reference=${encodeURIComponent(reference!)}`);
      await expect(visitor.getByText("Payment successful").first()).toBeVisible({ timeout: 90_000 });
      const receiptLink = visitor.getByRole("link", { name: /View receipt/ });
      await expect(receiptLink).toBeVisible({ timeout: 90_000 });
      const href = await receiptLink.getAttribute("href");
      expect(href).toContain(`/give/receipt/${encodeURIComponent(reference!)}`);

      // The receipt page renders for the owner/guest-token path without
      // leaking other donors' data (RCP-04; PRJ-03 analogue for gifts).
      await visitor.goto(href!);
      await expect(visitor.getByText(reference!).first()).toBeVisible({ timeout: 90_000 });
    } finally {
      await visitorCtx.close();
    }
  });

  test("5.5 project ₦10,000,000 target: ₦5,000 gift raises progress; pending/closed excluded (PRJ-01..05)", async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, "admin");
    const s = stamp();
    const title = `E2E Project ${s}`;

    // Admin creates a ₦10,000,000 project and activates it (PRJ-04).
    const created = await page.request.post("/api/admin/projects", {
      timeout: 180_000,
      data: { title, target_naira: 10_000_000 },
    });
    expect(created.ok(), `create project failed: ${created.status()} ${await created.text()}`).toBe(true);
    const { row } = (await created.json()) as { row: { id: string; slug: string } };
    const activated = await page.request.post(`/api/admin/projects/${row.id}/status`, {
      timeout: 180_000,
      data: { status: "active" },
    });
    expect(activated.ok(), `activate failed: ${activated.status()} ${await activated.text()}`).toBe(true);

    const raisedBefore = await readRaisedKobo(row.id);

    // A pending checkout moves nothing (only successful payments raise).
    const pendingEmail = `e2e-proj-pending-${s}@e2e.test`;
    const pendingRes = await page.request.post("/api/giving/checkout", {
      timeout: 180_000,
      data: {
        type: "project",
        projectId: row.id,
        amountNaira: 5000,
        name: `E2E Pending ${s}`,
        email: pendingEmail,
      },
    });
    expect(pendingRes.ok(), `pending checkout failed: ${pendingRes.status()} ${await pendingRes.text()}`).toBe(
      true,
    );
    expect(await readRaisedKobo(row.id), "pending gift must not move raised").toBe(raisedBefore);

    // Visitor pays ₦5,000 to the project through the hosted checkout.
    const giftEmail = `e2e-proj-giver-${s}@e2e.test`;
    const visitorCtx = await browser.newContext();
    const visitor = await visitorCtx.newPage();
    let giftReference: string;
    try {
      await visitor.goto(`/give/project/${row.slug}`);
      await expect(visitor.getByRole("heading", { name: title }).first()).toBeVisible({ timeout: 90_000 });
      const checkout = await visitor.request.post("/api/giving/checkout", {
        timeout: 180_000,
        data: {
          type: "project",
          projectId: row.id,
          amountNaira: 5000,
          name: `E2E Project Giver ${s}`,
          email: giftEmail,
        },
      });
      expect(checkout.ok(), `project checkout failed: ${checkout.status()} ${await checkout.text()}`).toBe(true);
      const { reference, authorizationUrl } = (await checkout.json()) as {
        reference: string;
        authorizationUrl: string;
      };
      giftReference = reference;
      await visitor.goto(authorizationUrl);
      await payWithTestCard(visitor);
      await visitor.waitForURL(/\/give\/confirmation\?reference=/, { timeout: 90_000 });
    } finally {
      await visitorCtx.close();
    }

    // Webhook cannot reach CI localhost: verify server-side (same transition
    // the webhook/reconciler performs), then assert raised += ₦5,000.
    const reverify = await page.request.post(
      `/api/admin/transactions/${encodeURIComponent(giftReference!)}/reverify`,
      { timeout: 180_000 },
    );
    // This request runs on the admin session, which is NOT Super Admin: it
    // must 403 (06 §9). Retry with a Super Admin session instead.
    expect(reverify.status(), "admin reverify must be Super Admin-gated").toBe(403);

    await loginAsStaff(page, "super_admin");
    const reverifySa = await page.request.post(
      `/api/admin/transactions/${encodeURIComponent(giftReference!)}/reverify`,
      { timeout: 180_000 },
    );
    expect(reverifySa.ok(), `reverify failed: ${reverifySa.status()} ${await reverifySa.text()}`).toBe(true);
    await waitForStatus(page.request, giftReference!, "successful");
    expect(await readRaisedKobo(row.id), "successful ₦5,000 gift raises by 500,000 kobo").toBe(
      raisedBefore + 500_000,
    );

    // A closed project does not accept new gifts (PRJ-02 gate).
    await loginAsStaff(page, "admin");
    const closed = await page.request.post(`/api/admin/projects/${row.id}/status`, {
      timeout: 180_000,
      data: { status: "closed" },
    });
    expect(closed.ok(), `close failed: ${closed.status()} ${await closed.text()}`).toBe(true);
    const rejected = await page.request.post("/api/giving/checkout", {
      timeout: 180_000,
      data: {
        type: "project",
        projectId: row.id,
        amountNaira: 1000,
        name: `E2E Late ${s}`,
        email: `e2e-proj-late-${s}@e2e.test`,
      },
    });
    expect(rejected.status(), "closed project must reject gifts with a 4xx").toBeGreaterThanOrEqual(400);
    expect(rejected.status()).toBeLessThan(500);
  });
});
