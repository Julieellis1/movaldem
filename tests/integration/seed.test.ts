import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { roles, permissions, rolePermissions, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seed } from "../../drizzle/seeders";

describe("seed", () => {
  it("creates the 5 roles with the full permission matrix", async () => {
    await seed(db);
    const r = await db.select().from(roles);
    expect(r.map((x) => x.key).sort()).toEqual(
      ["admin", "content_manager", "member", "quiz_manager", "super_admin"].sort(),
    );
    const perms = await db.select().from(permissions);
    expect(perms.length).toBeGreaterThanOrEqual(50);
    // super_admin holds every permission
    const superRole = r.find((x) => x.key === "super_admin")!;
    const links = await db.select().from(rolePermissions).where(eq(rolePermissions.role_id, superRole.id));
    expect(links.length).toBe(perms.length);
    // member has no admin permissions
    const memberRole = r.find((x) => x.key === "member")!;
    const memberLinks = await db.select().from(rolePermissions).where(eq(rolePermissions.role_id, memberRole.id));
    expect(memberLinks.length).toBe(0);
  }, 120000);
  it("seeds settings defaults and is idempotent", async () => {
    await seed(db);
    await seed(db);
    const s = await db.select().from(settings).where(eq(settings.key, "quiz.require_verified_email"));
    expect(s.length).toBe(1);
    expect(s[0].value).toBe(true);
  }, 240000);
});
