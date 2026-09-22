import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { seed } from "../../drizzle/seeders";
import { loadPermissions, can } from "@/modules/auth/rbac.service";
import { users, userRoles, roles } from "@/db/schema";
import { eq } from "drizzle-orm";

// Unique suffix per process so repeated runs against the shared dev DB don't
// collide on the case-insensitive unique email index.
const suffix = process.pid.toString(36);

describe("rbac", () => {
  it("unions permissions across a user's roles", async () => {
    await seed(db);
    const [u] = await db.insert(users).values({
      full_name: "Test", email: `rbac-${suffix}@test.org`, consent_at: new Date(),
    }).returning();
    const [cm] = await db.select().from(roles).where(eq(roles.key, "content_manager"));
    const [sa] = await db.select().from(roles).where(eq(roles.key, "super_admin"));
    await db.insert(userRoles).values([{ user_id: u.id, role_id: cm.id }, { user_id: u.id, role_id: sa.id }]);
    const perms = await loadPermissions(u.id, db);
    expect(can(perms, "sermons.create")).toBe(true);
    expect(can(perms, "transactions.read")).toBe(true); // via super_admin
  }, 120000);
  it("denies members admin actions", async () => {
    const [u2] = await db.insert(users).values({
      full_name: "M", email: `m-${suffix}@test.org`, consent_at: new Date(),
    }).returning();
    const perms = await loadPermissions(u2.id, db);
    expect(can(perms, "sermons.create")).toBe(false);
  }, 30000);
});
