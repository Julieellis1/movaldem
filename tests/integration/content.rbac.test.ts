import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { seed } from "../../drizzle/seeders";
import { PERMISSIONS } from "@/modules/auth/permissions";
import { ROLE_MATRIX } from "../../drizzle/seeders/role-permissions";
import { loadPermissions, can } from "@/modules/auth/rbac.service";
import { users, userRoles, roles } from "@/db/schema";
import { eq } from "drizzle-orm";

// Unique suffix per process so repeated runs against the shared dev DB don't
// collide on the case-insensitive unique email index.
const suffix = process.pid.toString(36);

// Phase 2 teaching-content resources (plan Item 10, RBAC half).
const CONTENT_MEDIA_RESOURCES = [
  "sermons",
  "bible_studies",
  "sunday_school",
  "series",
  "content_categories",
  "tags",
  "media",
] as const;

// Admin-UI CONTRACT: teaching types expose full lifecycle actions,
// taxonomy + media expose CRUD.
const TEACHING_TYPES = ["sermons", "bible_studies", "sunday_school"] as const;
const TEACHING_ACTIONS = ["create", "read", "update", "delete", "publish"] as const;
const TAXONOMY_MEDIA = ["series", "content_categories", "tags", "media"] as const;
const CRUD = ["create", "read", "update", "delete"] as const;

const keySet = new Set<string>(PERMISSIONS.map((p) => p.key));

function matrixGrants(role: keyof typeof ROLE_MATRIX, key: string): boolean {
  const patterns = ROLE_MATRIX[role];
  if (patterns.includes("*")) return true;
  return patterns.some((pat) =>
    pat === key || (pat.endsWith(".*") && key.startsWith(pat.slice(0, -1))),
  );
}

describe("content rbac [SEC-07][PRD 10 §5.8]", () => {
  it("defines permission rows for the 7 content/media resources", () => {
    for (const r of CONTENT_MEDIA_RESOURCES) {
      for (const a of ["create", "read", "update", "delete", "publish", "export"]) {
        expect(keySet.has(`${r}.${a}`), `missing permission row ${r}.${a}`).toBe(true);
      }
    }
  });

  it("exposes the Admin-UI CONTRACT keys (teaching lifecycle + taxonomy/media CRUD)", () => {
    const missing: string[] = [];
    for (const r of TEACHING_TYPES) {
      for (const a of TEACHING_ACTIONS) {
        if (!keySet.has(`${r}.${a}`)) missing.push(`${r}.${a}`);
      }
    }
    for (const r of TAXONOMY_MEDIA) {
      for (const a of CRUD) {
        if (!keySet.has(`${r}.${a}`)) missing.push(`${r}.${a}`);
      }
    }
    expect(missing, `missing CONTRACT keys: ${missing.join(", ")}`).toEqual([]);
  });

  it("grants content_manager content+media+taxonomy via the role matrix", () => {
    for (const r of CONTENT_MEDIA_RESOURCES) {
      expect(
        ROLE_MATRIX.content_manager.some((p) => p === `${r}.*`),
        `content_manager missing ${r}.*`,
      ).toBe(true);
    }
  });

  it("denies content_manager any quiz/giving keys", () => {
    const leaked = ROLE_MATRIX.content_manager.filter((p) => {
      const res = p.split(".")[0];
      return (
        res === "quizzes" ||
        res === "quiz_categories" ||
        res === "questions" ||
        res === "quiz_imports" ||
        res === "attempts" ||
        res === "leaderboards" ||
        res === "quiz_reports" ||
        res === "transactions" ||
        res === "projects" ||
        res === "giving_reports"
      );
    });
    expect(leaked, `content_manager leaked quiz/giving keys: ${leaked.join(", ")}`).toEqual([]);
    expect(matrixGrants("content_manager", "quizzes.create")).toBe(false);
    expect(matrixGrants("content_manager", "transactions.read")).toBe(false);
    expect(matrixGrants("content_manager", "projects.create")).toBe(false);
  });

  it("grants admin content_categories.* + tags.* (super_admin already *)", () => {
    expect(ROLE_MATRIX.admin).toContain("content_categories.*");
    expect(ROLE_MATRIX.admin).toContain("tags.*");
    expect(ROLE_MATRIX.super_admin).toContain("*");
    expect(ROLE_MATRIX.member).toEqual([]);
  });

  it("enforces the live matrix: content_manager gets taxonomy, not quizzes/giving; member gets none", async () => {
    await seed(db);

    const [cmUser] = await db
      .insert(users)
      .values({
        full_name: "Content RBAC",
        email: `content-rbac-${suffix}@test.org`,
        consent_at: new Date(),
      })
      .returning();
    const [cmRole] = await db.select().from(roles).where(eq(roles.key, "content_manager"));
    await db.insert(userRoles).values([{ user_id: cmUser.id, role_id: cmRole.id }]);
    const cmPerms = await loadPermissions(cmUser.id, db);

    for (const key of [
      "sermons.create",
      "sermons.publish",
      "bible_studies.read",
      "sunday_school.delete",
      "series.create",
      "content_categories.create",
      "content_categories.delete",
      "tags.create",
      "tags.delete",
      "media.create",
    ]) {
      expect(can(cmPerms, key), `content_manager should have ${key}`).toBe(true);
    }
    for (const key of ["quizzes.create", "transactions.read", "projects.create"]) {
      expect(can(cmPerms, key), `content_manager must NOT have ${key}`).toBe(false);
    }

    const [memberUser] = await db
      .insert(users)
      .values({
        full_name: "Content RBAC Member",
        email: `content-rbac-m-${suffix}@test.org`,
        consent_at: new Date(),
      })
      .returning();
    const memberPerms = await loadPermissions(memberUser.id, db);
    for (const key of [
      "sermons.read",
      "content_categories.read",
      "tags.read",
      "media.read",
      "quizzes.read",
    ]) {
      expect(can(memberPerms, key), `member must NOT have ${key}`).toBe(false);
    }
  }, 180000);
});
