import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seed } from "../../drizzle/seeders";
import { GIVING_SETTINGS_SEED } from "../../drizzle/seeders/giving";
import { PERMISSIONS } from "@/modules/auth/permissions";
import { ROLE_MATRIX } from "../../drizzle/seeders/role-permissions";
import { loadPermissions, can, requirePermission } from "@/modules/auth/rbac.service";
import {
  findSettingField,
  SETTINGS_FIELDS,
} from "@/modules/platform/settings/settings.fields";
import {
  getSecret,
  getSetting,
  maskSetting,
  setSetting,
} from "@/modules/platform/settings/settings.service";
import { middleware } from "@/middleware";
import { roles, settings, userRoles, users } from "@/db/schema";

// Phase 4 Item 6 guard tests (plan 2026-09-26-phase4-giving.md Task 6;
// PRD 06 §9, PRD 08 §6 Giving/Paystack rows, PRD 10 §5.8, SEC-07/11).
//
// Middleware truth (read src/middleware.ts first): ADMIN_PERMISSIONS only
// covers /admin/users*, /admin/settings and /admin/audit-logs. Giving pages
// (/admin/giving/*) have NO middleware permission entry, so an authenticated
// user of ANY role passes middleware and denial happens page-side via
// requirePermission (PERM-01) in each giving page / API route. The tests
// below assert exactly that split: unauthenticated -> /login redirect at the
// middleware, role denial via the same requirePermission guard the pages use
// (HTTP sessions cannot be fabricated inside vitest).

const suffix = process.pid.toString(36);

const GIVING_PAGES = [
  "/admin/giving/transactions",
  "/admin/giving/projects",
  "/admin/giving/reports",
] as const;

const GIVING_KEYS = [
  "transactions.read",
  "transactions.export",
  "transactions.reverify",
  "projects.read",
  "projects.create",
  "giving_reports.read",
] as const;

function matrixGrants(role: keyof typeof ROLE_MATRIX, key: string): boolean {
  const patterns = ROLE_MATRIX[role];
  if (patterns.includes("*")) return true;
  return patterns.some((pat) =>
    pat === key || (pat.endsWith(".*") && key.startsWith(pat.slice(0, -1))),
  );
}

async function createUserWithRole(
  fullName: string,
  email: string,
  roleKey: string | null,
) {
  const [user] = await db
    .insert(users)
    .values({ full_name: fullName, email, consent_at: new Date() })
    .returning();
  if (roleKey) {
    const [role] = await db.select().from(roles).where(eq(roles.key, roleKey));
    await db.insert(userRoles).values([{ user_id: user.id, role_id: role.id }]);
  }
  return user;
}

/** The exact role-key gate the reverify route applies AFTER requirePermission. */
async function hasSuperAdminRole(userId: string): Promise<boolean> {
  const roleRows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userId));
  return roleRows.some((r) => r.key === "super_admin");
}

describe("phase 4 giving guards [SEC-07][SEC-11][PRD 10 §5.8]", () => {
  it("middleware redirects unauthenticated visitors on /admin/giving/* to /login (and only does that)", async () => {
    // src/middleware.ts: no session -> 307 to /login?redirect=<pathname> for
    // every /admin/* path. There is deliberately no giving permission entry,
    // so this redirect is ALL the middleware does for giving pages.
    for (const path of GIVING_PAGES) {
      const res = await middleware(new NextRequest(`http://localhost:3000${path}`));
      expect(res.status, `${path} should redirect a visitor`).toBe(307);
      expect(res.headers.get("location"), `${path} should land on /login`).toMatch(/\/login/);
    }
  }, 120000);

  it("member holds no giving key: denied on every /admin/giving/* page guard", async () => {
    await seed(db);
    const member = await createUserWithRole(
      "Giving Guards Member",
      `giving-guards-m-${suffix}@test.org`,
      "member",
    );
    const perms = await loadPermissions(member.id, db);
    for (const key of GIVING_KEYS) {
      expect(can(perms, key), `member must NOT have ${key}`).toBe(false);
      expect(() => requirePermission(perms, key), `member page gate for ${key}`).toThrowError(
        /forbidden/i,
      );
    }
  }, 180000);

  it("content_manager and quiz_manager are blocked from giving pages (matrix + live perms)", async () => {
    // Matrix half: neither staff matrix may leak a projects / transactions /
    // giving_reports / paystack grant (PRD 03 §2, 10 §5.8).
    for (const role of ["content_manager", "quiz_manager"] as const) {
      const leaked = ROLE_MATRIX[role].filter((p) => {
        const res = p.split(".")[0];
        return (
          res === "projects" ||
          res === "transactions" ||
          res === "giving_reports" ||
          res === "paystack"
        );
      });
      expect(leaked, `${role} leaked giving keys: ${leaked.join(", ")}`).toEqual([]);
      for (const key of GIVING_KEYS) {
        expect(matrixGrants(role, key), `${role} must NOT grant ${key}`).toBe(false);
      }
    }

    // Live half: the same requirePermission guard every giving page and every
    // /api/admin/transactions|projects route opens with (PERM-01).
    await seed(db);
    for (const role of ["content_manager", "quiz_manager"] as const) {
      const user = await createUserWithRole(
        `Giving Guards ${role}`,
        `giving-guards-${role}-${suffix}@test.org`,
        role,
      );
      const perms = await loadPermissions(user.id, db);
      for (const key of GIVING_KEYS) {
        expect(can(perms, key), `${role} must NOT have ${key}`).toBe(false);
      }
      expect(() => requirePermission(perms, "transactions.read")).toThrowError(/forbidden/i);
      expect(() => requirePermission(perms, "projects.read")).toThrowError(/forbidden/i);
      expect(() => requirePermission(perms, "giving_reports.read")).toThrowError(/forbidden/i);
    }
  }, 180000);

  it("admin cannot read or change a Paystack secret via any API: none is seeded, none is registered, masked reads never leak", async () => {
    // Paystack keys stay ENV-ONLY (PRD 06 §7 preferred; 06 D12): no seeder
    // writes a paystack.* setting, so a fresh database contains no secret
    // for any API response or settings read to carry (SEC-07/11).
    const { SETTINGS_SEED } = await import("../../drizzle/seeders/settings");
    for (const seedRows of [SETTINGS_SEED, GIVING_SETTINGS_SEED]) {
      expect(
        seedRows.filter((r) => r.key.toLowerCase().includes("paystack")),
        "seeders must never create a paystack.* setting",
      ).toEqual([]);
    }

    // NOTE: the shared dev DB may still hold a `paystack.secret_key` row:
    // tests/integration/settings.test.ts writes one as an encryption
    // round-trip artifact and never cleans it up. That artifact is NOT seeded
    // (it vanishes on a fresh `db:seed`) and the assertions below hold with
    // or without it — which is exactly the point: even when such a row
    // exists, it is encrypted at rest and only ever surfaces masked.
    await seed(db);
    const [artifact] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "paystack.secret_key"));
    if (artifact) {
      const plaintext = await getSecret(db, "paystack.secret_key");
      expect(JSON.stringify(artifact.value)).not.toContain(plaintext);
      expect(await maskSetting(db, "paystack.secret_key")).not.toContain(plaintext);
    }

    // Masked-read guarantee, deterministic half: a freshly written secret is
    // encrypted at rest and its mask never contains the plaintext — this is
    // the exact path the settings page uses for every isSecret field, so the
    // browser only ever receives the `sk_live_••••1234` placeholder (SEC-11).
    const probeKey = `paystack.guard_probe_${suffix}`;
    const probeSecret = `sk_test_probe_${suffix}`;
    try {
      await setSetting(db, probeKey, probeSecret, { isSecret: true, updatedBy: null });
      const [stored] = await db.select().from(settings).where(eq(settings.key, probeKey));
      expect(JSON.stringify(stored.value)).not.toContain(probeSecret);
      const masked = await maskSetting(db, probeKey);
      expect(masked.length > 0).toBe(true);
      expect(masked).not.toContain(probeSecret);
    } finally {
      await db.delete(settings).where(eq(settings.key, probeKey));
    }

    // The settings save API (src/app/api/admin/settings/route.ts) only writes
    // keys present in the registry (`if (!field) continue`), and the settings
    // page only renders registry fields — with no paystack field registered,
    // not even a Super Admin can smuggle a Paystack secret into the DB.
    expect(
      SETTINGS_FIELDS.filter((f) => f.key.toLowerCase().includes("paystack")),
      "settings registry must expose no paystack key",
    ).toEqual([]);
    expect(findSettingField("paystack.secret_key")).toBeUndefined();
    expect(findSettingField("paystack_secret_key")).toBeUndefined();
    expect(findSettingField("PAYSTACK_SECRET_KEY")).toBeUndefined();

    // Sanity: the permission catalogue still scopes paystack.* to Super Admin
    // only (08 §6 Paystack row), matching the matrix assertion below.
    expect(new Set(PERMISSIONS.map((p) => p.key)).has("paystack.read")).toBe(true);
    expect(matrixGrants("admin", "paystack.read")).toBe(false);
    expect(matrixGrants("super_admin", "paystack.read")).toBe(true);
  }, 180000);

  it("reverify is Super Admin only even though admin carries the permission key (06 §9)", async () => {
    // The trap, documented: the matrix DOES grant admin transactions.reverify
    // (needed so requirePermission passes), and the route then applies a
    // second super_admin role-key gate. Both halves are asserted live.
    expect(matrixGrants("admin", "transactions.reverify")).toBe(true);
    expect(matrixGrants("super_admin", "transactions.reverify")).toBe(true);

    await seed(db);
    const admin = await createUserWithRole(
      "Giving Guards Admin",
      `giving-guards-a-${suffix}@test.org`,
      "admin",
    );
    const superAdmin = await createUserWithRole(
      "Giving Guards SuperAdmin",
      `giving-guards-s-${suffix}@test.org`,
      "super_admin",
    );
    const adminPerms = await loadPermissions(admin.id, db);
    const superPerms = await loadPermissions(superAdmin.id, db);

    // Half 1 (shared): both pass requirePermission on the key.
    expect(can(adminPerms, "transactions.reverify")).toBe(true);
    expect(can(superPerms, "transactions.reverify")).toBe(true);

    // Half 2 (the 06 §9 gate): admin lacks the super_admin role key, so the
    // reverify route answers 403 "Super Admin only"; super_admin passes.
    expect(await hasSuperAdminRole(admin.id), "admin must NOT hold super_admin").toBe(false);
    expect(await hasSuperAdminRole(superAdmin.id), "super_admin must hold super_admin").toBe(true);

    // Non-staff roles never even reach the gate.
    for (const role of ["member", "content_manager", "quiz_manager"] as const) {
      const user = await createUserWithRole(
        `Giving Guards NoReverify ${role}`,
        `giving-guards-noreverify-${role}-${suffix}@test.org`,
        role,
      );
      const perms = await loadPermissions(user.id, db);
      expect(() => requirePermission(perms, "transactions.reverify")).toThrowError(/forbidden/i);
    }
  }, 180000);

  it("seeds the Item-6 giving defaults and never overwrites staff edits", async () => {
    // Static half: the seed file carries exactly the five Item-6 keys.
    expect(GIVING_SETTINGS_SEED.map((r) => r.key).sort()).toEqual(
      [
        "giving.abandon_after_minutes",
        "giving.max_amount",
        "giving.min_amount",
        "giving.receipt_footer",
        "giving.require_phone",
      ].sort(),
    );
    expect(GIVING_SETTINGS_SEED.every((r) => r.is_secret === false)).toBe(true);

    await seed(db);
    await seed(db); // idempotent: second run inserts zero rows
    expect(await getSetting<number>(db, "giving.min_amount")).toBe(10000); // ₦100 in kobo
    expect(await getSetting<boolean>(db, "giving.require_phone")).toBe(false);
    expect(await getSetting<number>(db, "giving.abandon_after_minutes")).toBe(60);
    expect(await getSetting<string>(db, "giving.receipt_footer")).toBe("");

    // giving.max_amount is unset-by-design (no cap): no row, null fallback.
    const [maxRow] = await db.select().from(settings).where(eq(settings.key, "giving.max_amount"));
    expect(maxRow).toBeUndefined();
    expect(await getSetting<number | null>(db, "giving.max_amount", null)).toBeNull();

    // Staff edits survive re-seeding (onConflictDoNothing). Restore after so
    // the shared dev DB is left as found.
    const sentinel = 424242;
    await db.update(settings).set({ value: sentinel }).where(eq(settings.key, "giving.min_amount"));
    await seed(db);
    expect(await getSetting<number>(db, "giving.min_amount")).toBe(sentinel);
    await db.update(settings).set({ value: 10000 }).where(eq(settings.key, "giving.min_amount"));
  }, 180000);
});
