import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/db/client";
import { seed } from "../../drizzle/seeders";
import { PERMISSIONS } from "@/modules/auth/permissions";
import { ROLE_MATRIX } from "../../drizzle/seeders/role-permissions";
import { loadPermissions, can, requirePermission } from "@/modules/auth/rbac.service";
import { middleware } from "@/middleware";
import { users, userRoles, roles, sitePages } from "@/db/schema";
import { eq } from "drizzle-orm";

// Unique suffix per process so repeated runs against the shared dev DB don't
// collide on the case-insensitive unique email index.
const suffix = process.pid.toString(36);

// Phase 3 site resources (plan Phase 3 Item 8, guards half).
const SITE_RESOURCES = [
  "events",
  "programmes",
  "gallery",
  "media",
  "pages",
  "contact_messages",
] as const;

const keySet = new Set<string>(PERMISSIONS.map((p) => p.key));

function matrixGrants(role: keyof typeof ROLE_MATRIX, key: string): boolean {
  const patterns = ROLE_MATRIX[role];
  if (patterns.includes("*")) return true;
  return patterns.some((pat) =>
    pat === key || (pat.endsWith(".*") && key.startsWith(pat.slice(0, -1))),
  );
}

describe("phase 3 site guards [SEC-07][PRD 10 §5.8]", () => {
  it("defines permission rows for the 6 events/programmes/gallery/site resources", () => {
    for (const r of SITE_RESOURCES) {
      for (const a of ["create", "read", "update", "delete", "publish", "export"]) {
        expect(keySet.has(`${r}.${a}`), `missing permission row ${r}.${a}`).toBe(true);
      }
    }
  });

  it("grants content_manager site scope only: events/programmes/media full, gallery CRUD, pages CRU", () => {
    // Full lifecycle incl. publish for time-bound content.
    expect(ROLE_MATRIX.content_manager).toContain("events.*");
    expect(ROLE_MATRIX.content_manager).toContain("programmes.*");
    expect(ROLE_MATRIX.content_manager).toContain("media.*");
    // Gallery contract: album publish is guarded by `gallery.update`
    // (no `gallery.publish` grant); export is not a CMS action.
    for (const a of ["create", "read", "update", "delete"]) {
      expect(matrixGrants("content_manager", `gallery.${a}`), `content_manager missing gallery.${a}`).toBe(true);
    }
    expect(matrixGrants("content_manager", "gallery.publish")).toBe(false);
    expect(matrixGrants("content_manager", "gallery.export")).toBe(false);
    // About/leadership/branches pages: CRU only (PRD 03 §2).
    for (const a of ["create", "read", "update"]) {
      expect(matrixGrants("content_manager", `pages.${a}`), `content_manager missing pages.${a}`).toBe(true);
    }
    expect(matrixGrants("content_manager", "pages.delete")).toBe(false);
    expect(matrixGrants("content_manager", "pages.publish")).toBe(false);
  });

  it("denies content_manager quiz/giving, contact inbox, and user/admin keys", () => {
    const leaked = ROLE_MATRIX.content_manager.filter((p) => {
      const res = p.split(".")[0];
      return (
        res === "quiz_categories" ||
        res === "questions" ||
        res === "quizzes" ||
        res === "quiz_imports" ||
        res === "attempts" ||
        res === "leaderboards" ||
        res === "quiz_reports" ||
        res === "projects" ||
        res === "transactions" ||
        res === "giving_reports" ||
        res === "contact_messages" ||
        res === "members" ||
        res === "staff" ||
        res === "roles" ||
        res === "settings" ||
        res === "paystack" ||
        res === "audit_logs"
      );
    });
    expect(leaked, `content_manager leaked keys: ${leaked.join(", ")}`).toEqual([]);
    for (const key of [
      "quizzes.create",
      "quizzes.read",
      "questions.create",
      "quiz_categories.read",
      "attempts.read",
      "leaderboards.read",
      "transactions.read",
      "projects.create",
      "giving_reports.read",
      "contact_messages.read",
      "contact_messages.update",
      "members.read",
      "settings.read",
    ]) {
      expect(matrixGrants("content_manager", key), `content_manager must NOT have ${key}`).toBe(false);
    }
  });

  it("grants admin events/programmes/gallery/media/pages + contact inbox RUD (super_admin already *)", () => {
    for (const pat of ["events.*", "programmes.*", "gallery.*", "media.*", "pages.*"]) {
      expect(ROLE_MATRIX.admin, `admin missing ${pat}`).toContain(pat);
    }
    for (const key of ["contact_messages.read", "contact_messages.update", "contact_messages.delete"]) {
      expect(matrixGrants("admin", key), `admin missing ${key}`).toBe(true);
    }
    // Inbox is read/update/delete only — no publish/export semantics.
    expect(matrixGrants("admin", "contact_messages.publish")).toBe(false);
    expect(ROLE_MATRIX.super_admin).toContain("*");
    expect(ROLE_MATRIX.member).toEqual([]);
  });

  it("enforces the live matrix: content_manager gets site keys not quiz/giving; member gets none; admin gets inbox", async () => {
    await seed(db);

    const [cmUser] = await db
      .insert(users)
      .values({
        full_name: "Site Guards CM",
        email: `site-guards-cm-${suffix}@test.org`,
        consent_at: new Date(),
      })
      .returning();
    const [cmRole] = await db.select().from(roles).where(eq(roles.key, "content_manager"));
    await db.insert(userRoles).values([{ user_id: cmUser.id, role_id: cmRole.id }]);
    const cmPerms = await loadPermissions(cmUser.id, db);

    for (const key of [
      "events.create",
      "events.publish",
      "programmes.create",
      "programmes.publish",
      "gallery.create",
      "gallery.update",
      "media.create",
      "pages.create",
      "pages.update",
    ]) {
      expect(can(cmPerms, key), `content_manager should have ${key}`).toBe(true);
    }
    for (const key of [
      "gallery.publish",
      "pages.delete",
      "quizzes.create",
      "quizzes.read",
      "questions.create",
      "transactions.read",
      "projects.create",
      "contact_messages.read",
      "members.read",
      "settings.read",
    ]) {
      expect(can(cmPerms, key), `content_manager must NOT have ${key}`).toBe(false);
    }
    // Page-level guard (PERM-01): content_manager hitting a quiz/giving admin
    // page gets a 403 from requirePermission.
    expect(() => requirePermission(cmPerms, "quizzes.read")).toThrowError(/forbidden/i);
    expect(() => requirePermission(cmPerms, "transactions.read")).toThrowError(/forbidden/i);

    const [memberUser] = await db
      .insert(users)
      .values({
        full_name: "Site Guards Member",
        email: `site-guards-m-${suffix}@test.org`,
        consent_at: new Date(),
      })
      .returning();
    const memberPerms = await loadPermissions(memberUser.id, db);
    for (const key of [
      "events.read",
      "programmes.read",
      "gallery.read",
      "media.read",
      "pages.read",
      "contact_messages.read",
    ]) {
      expect(can(memberPerms, key), `member must NOT have ${key}`).toBe(false);
    }
    expect(() => requirePermission(memberPerms, "events.read")).toThrowError(/forbidden/i);

    const [adminUser] = await db
      .insert(users)
      .values({
        full_name: "Site Guards Admin",
        email: `site-guards-a-${suffix}@test.org`,
        consent_at: new Date(),
      })
      .returning();
    const [adminRole] = await db.select().from(roles).where(eq(roles.key, "admin"));
    await db.insert(userRoles).values([{ user_id: adminUser.id, role_id: adminRole.id }]);
    const adminPerms = await loadPermissions(adminUser.id, db);
    for (const key of [
      "events.read",
      "events.publish",
      "programmes.publish",
      "gallery.delete",
      "pages.update",
      "contact_messages.read",
      "contact_messages.update",
      "contact_messages.delete",
    ]) {
      expect(can(adminPerms, key), `admin should have ${key}`).toBe(true);
    }
    expect(() => requirePermission(adminPerms, "events.read")).not.toThrow();
    expect(() => requirePermission(adminPerms, "contact_messages.read")).not.toThrow();
  }, 180000);

  it("middleware redirects unauthenticated visitors on site admin routes to /login", async () => {
    // src/middleware.ts: no session -> redirect to /login?redirect=<pathname>.
    // This holds for every /admin/* path (matcher), including the Phase 3
    // site routes, whether or not the page itself exists yet.
    for (const path of ["/admin/events", "/admin/programmes", "/admin/gallery", "/admin/pages", "/admin/contact"]) {
      const res = await middleware(new NextRequest(`http://localhost:3000${path}`));
      expect(res.status, `${path} should redirect a visitor`).toBe(307);
      expect(res.headers.get("location"), `${path} should land on /login`).toMatch(/\/login/);
    }
  }, 120000);

  it("seeds idempotent site_pages defaults with [Placeholder] copy", async () => {
    // Fresh-seed copy always carries the [Placeholder] marker (unit-level:
    // independent of whatever other suites left in the shared dev DB).
    const { SITE_PAGE_SEED } = await import("../../drizzle/seeders/content");
    expect(SITE_PAGE_SEED.map((r) => r.key).sort()).toEqual(
      ["about.beliefs", "about.history", "about.mission", "about.vision"],
    );
    for (const row of SITE_PAGE_SEED) {
      expect(row.title.length > 0, `${row.key} needs a title`).toBe(true);
      expect(row.body, `${row.key} body must be marked [Placeholder]`).toMatch(/\[Placeholder\]/);
    }
    // No demo events/albums ride along with the site-page defaults.
    expect(SITE_PAGE_SEED.some((r) => (r.key as string).includes("event") || (r.key as string).includes("album"))).toBe(
      false,
    );

    await seed(db);
    const rows = await db.select().from(sitePages);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    for (const key of ["about.history", "about.vision", "about.mission", "about.beliefs"]) {
      const row = byKey.get(key);
      expect(row, `missing seeded site page ${key}`).toBeTruthy();
      expect(row!.title.length > 0, `${key} needs a title`).toBe(true);
      expect(row!.body.length > 0, `${key} needs a body`).toBe(true);
    }

    // Idempotent: re-seeding never overwrites staff-edited copy. Capture and
    // restore so the shared dev DB is left as found.
    const [before] = await db.select().from(sitePages).where(eq(sitePages.key, "about.history"));
    const sentinel = `Edited History ${suffix}`;
    await db.update(sitePages).set({ title: sentinel }).where(eq(sitePages.key, "about.history"));
    await seed(db);
    const [kept] = await db.select().from(sitePages).where(eq(sitePages.key, "about.history"));
    expect(kept.title).toBe(sentinel);
    await db
      .update(sitePages)
      .set({ title: before.title, body: before.body })
      .where(eq(sitePages.key, "about.history"));
  }, 180000);
});
