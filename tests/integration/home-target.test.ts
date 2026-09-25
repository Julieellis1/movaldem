import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { getHomeAudience } from "@/modules/auth/home-target";
import { users, userRoles, roles } from "@/db/schema";
import { eq } from "drizzle-orm";

const suffix = process.pid.toString(36);

describe("getHomeAudience", () => {
  it("classifies a super_admin as staff (post-login lands on /admin)", async () => {
    const [u] = await db.insert(users).values({
      full_name: "Home Staff", email: `home-staff-${suffix}@test.org`, consent_at: new Date(),
    }).returning();
    const [sa] = await db.select().from(roles).where(eq(roles.key, "super_admin"));
    await db.insert(userRoles).values({ user_id: u.id, role_id: sa.id });
    await expect(getHomeAudience(u.id, db)).resolves.toBe("staff");
  }, 60000);

  it("classifies a role-less member as member (post-login lands on /sermons)", async () => {
    const [u] = await db.insert(users).values({
      full_name: "Home Member", email: `home-member-${suffix}@test.org`, consent_at: new Date(),
    }).returning();
    await expect(getHomeAudience(u.id, db)).resolves.toBe("member");
  }, 60000);
});
