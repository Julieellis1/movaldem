import { and, eq, inArray } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { roles, userRoles } from "@/db/schema";

export type HomeAudience = "staff" | "member" | "guest";

const STAFF_ROLE_KEYS = ["super_admin", "admin", "content_manager", "quiz_manager"] as const;

/**
 * Post-login landing for "/".
 *
 * The login form pushes `redirect ?? "/"`, and "/" used to redirect everyone
 * to /login unconditionally — so every staff sign-in looped straight back to
 * the login page with a success toast. "/" now dispatches per audience; the
 * real marketing homepage replaces the member/guest targets in Phase 3.
 */
export function resolveHomeTarget(audience: HomeAudience): string {
  if (audience === "staff") return "/admin";
  if (audience === "member") return "/sermons";
  return "/login";
}

/** Classify a user by role keys (explicit staff list, not permission count,
 *  so future member permissions can't promote anyone by accident). */
export async function getHomeAudience(userId: string, database: DB = defaultDb): Promise<HomeAudience> {
  const staffRoles = await database
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.role_id, roles.id))
    .where(and(eq(userRoles.user_id, userId), inArray(roles.key, [...STAFF_ROLE_KEYS])));
  return staffRoles.length > 0 ? "staff" : "member";
}
