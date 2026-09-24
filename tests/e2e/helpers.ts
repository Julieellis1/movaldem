import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "@neondatabase/serverless";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch {
    // CI may provide vars without .env.local
  }
}
loadEnvLocal();

const BASE = "http://localhost:3000";

async function warm(path: string, init?: RequestInit) {
  try {
    await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(180_000) });
  } catch {
    // compile/timeout still leaves the route cached for the next hit
  }
}

let warmed = false;
async function warmDevRoutes() {
  if (warmed) return;
  warmed = true;
  await warm("/login");
  await warm("/admin");
  await warm("/");
  await warm("/favicon.ico");
  await warm("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "warm@example.test", password: "wrong-password-1" }),
  });
}

/**
 * Seed a staff user with the given role via the public register API,
 * then sign in through the UI so the browser holds a real session.
 */
export async function loginAsStaff(page: Page, roleKey: string): Promise<string> {
  await warmDevRoutes();

  const email = `staff-${roleKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
  const password = "strong-pass-1";
  const fullName = `Staff ${roleKey}`;

  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: fullName,
      email,
      password,
      confirmPassword: password,
      consent: true,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    throw new Error(`register failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { user: { id: string } };

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const roles = await pool.query(`SELECT id FROM roles WHERE key = $1`, [roleKey]);
    if (roles.rowCount === 0) {
      throw new Error(`Role "${roleKey}" not found — run pnpm db:seed first`);
    }
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [body.user.id, roles.rows[0].id],
    );
  } finally {
    await pool.end();
  }

  await page.goto("/login");
  const submit = page.getByRole("button", { name: /sign in/i });
  await submit.waitFor({ state: "visible", timeout: 60_000 });
  const emailInput = page.getByLabel(/email/i);
  const passwordInput = page.getByLabel(/^password/i);
  await emailInput.fill(email);
  await passwordInput.fill(password);
  // RHF must register the inputs before submit or values are empty.
  await expectValue(emailInput, email);
  await expectValue(passwordInput, password);

  const loginResponse = page.waitForResponse(
    (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST",
    { timeout: 90_000 },
  );
  await submit.click();
  const lr = await loginResponse;
  if (!lr.ok()) {
    const text = await lr.text().catch(() => "");
    throw new Error(`login failed: ${lr.status()} ${text}`);
  }
  // router.push is a soft navigation — full "load" never fires.
  await page.waitForFunction(
    () => !window.location.pathname.startsWith("/login"),
    undefined,
    { timeout: 60_000 },
  );

  return email;
}

async function expectValue(locator: ReturnType<Page["getByLabel"]>, expected: string) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if ((await locator.inputValue()) === expected) return;
    await locator.fill(expected);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`input never held expected value: ${expected}`);
}

/**
 * Register a plain member (no staff role) through the public API so admin
 * pages have someone to list, search and suspend.
 */
export async function seedMember(_page: Page): Promise<{ id: string; name: string; email: string }> {
  await warmDevRoutes();
  const name = `Grace ${Date.now().toString(36)}`;
  const email = `grace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
  const password = "strong-pass-1";
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: name,
      email,
      password,
      confirmPassword: password,
      consent: true,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    throw new Error(`seedMember register failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { user: { id: string } };
  return { id: body.user.id, name, email };
}

/**
 * Compile the settings + audit-logs routes ahead of the e2e clock.
 *
 * Middleware redirects unauthenticated GETs before Next.js ever compiles the
 * page, so an anonymous warm-up is useless. This signs a super_admin in over
 * HTTP and hits the pages with that session. The save API is warmed with an
 * empty JSON change list, which compiles the route without writing anything.
 */
export async function warmSettingsRoutes(): Promise<void> {
  const email = `warm-settings-${Date.now()}@e2e.test`;
  const password = "strong-pass-1";
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: "Warm Settings",
      email,
      password,
      confirmPassword: password,
      consent: true,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) return;
  const { user } = (await res.json()) as { user: { id: string } };

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const roles = await pool.query(`SELECT id FROM roles WHERE key = $1`, ["super_admin"]);
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, roles.rows[0].id],
    );
  } finally {
    await pool.end();
  }

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(180_000),
  });
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) return;

  await warm("/login");
  await warm("/admin/settings", { headers: { cookie } });
  await warm("/admin/audit-logs", { headers: { cookie } });
  await warm("/api/admin/settings", {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ changes: [] }),
  });
}
