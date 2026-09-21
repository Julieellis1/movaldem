import type { DB } from "@/db/client";
import { roles, permissions, rolePermissions, settings } from "@/db/schema";
import { PERMISSION_SEED } from "./permissions";
import { ROLE_KEYS } from "./roles";
import { ROLE_MATRIX } from "./role-permissions";
import { SETTINGS_SEED } from "./settings";

export async function seed(db: DB) {
  await db.transaction(async (tx) => {
    for (const [key, name] of Object.entries(ROLE_KEYS)) {
      await tx.insert(roles).values({ key, name, is_system: true }).onConflictDoNothing({ target: roles.key });
    }
    for (const p of PERMISSION_SEED) {
      await tx.insert(permissions).values(p).onConflictDoNothing({ target: permissions.key });
    }
    const allPerms = await tx.select().from(permissions);
    const byKey = new Map(allPerms.map((p) => [p.key, p.id]));
    const allRoles = await tx.select().from(roles);
    const byRoleKey = new Map(allRoles.map((r) => [r.key, r.id]));
    for (const [roleKey, patterns] of Object.entries(ROLE_MATRIX)) {
      const roleId = byRoleKey.get(roleKey)!;
      const keys = patterns.flatMap((pat) =>
        pat === "*" ? allPerms.map((p) => p.key)
          : pat.endsWith(".*") ? allPerms.filter((p) => p.key.startsWith(pat.slice(0, -1))).map((p) => p.key)
          : [pat],
      );
      for (const k of keys) {
        const pid = byKey.get(k);
        if (!pid) continue;
        await tx.insert(rolePermissions).values({ role_id: roleId, permission_id: pid }).onConflictDoNothing();
      }
    }
    for (const s of SETTINGS_SEED) {
      await tx.insert(settings).values(s).onConflictDoUpdate({
        target: settings.key, set: { value: s.value, is_secret: s.is_secret },
      });
    }
  });
}
