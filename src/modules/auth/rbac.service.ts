import { db as defaultDb, type DB } from "@/db/client";
import { userRoles, rolePermissions, permissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requestCtx } from "@/lib/request-context";

export async function loadPermissions(userId: string, db: DB = defaultDb): Promise<Set<string>> {
  const cached = requestCtx.getStore()?.permissions;
  if (cached) return cached;
  const rows = await db
    .select({ key: permissions.key })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.role_id, userRoles.role_id))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permission_id))
    .where(eq(userRoles.user_id, userId));
  const set = new Set(rows.map((r) => r.key));
  requestCtx.enterWith({ userId, permissions: set });
  return set;
}

export function can(perms: Set<string>, key: string): boolean {
  return perms.has(key);
}

export function requirePermission(perms: Set<string>, key: string): void {
  if (!can(perms, key)) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}
