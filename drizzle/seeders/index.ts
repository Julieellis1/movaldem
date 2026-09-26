import { sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { db } from "@/db/client";
import { roles, permissions, rolePermissions, settings } from "@/db/schema";
import { PERMISSION_SEED } from "./permissions";
import { ROLE_KEYS } from "./roles";
import { ROLE_MATRIX } from "./role-permissions";
import { SETTINGS_SEED } from "./settings";
import { seedGivingSettings } from "./giving";
import { seedContentTables } from "./content";

export async function seed(db: DB) {
  await db.transaction(async (tx) => {
    // Batched: one INSERT per table instead of one row per query. Over the
    // neon WebSocket driver each statement is a network round-trip, so the
    // naive per-row loop made this ~320 queries / ~150s. Batched it is ~6.
    await tx.insert(roles)
      .values(Object.entries(ROLE_KEYS).map(([key, name]) => ({ key, name, is_system: true })))
      .onConflictDoNothing({ target: roles.key });

    await tx.insert(permissions)
      .values(PERMISSION_SEED)
      .onConflictDoNothing({ target: permissions.key });

    const allPerms = await tx.select().from(permissions);
    const byKey = new Map(allPerms.map((p) => [p.key, p.id]));
    const allRoles = await tx.select().from(roles);
    const byRoleKey = new Map(allRoles.map((r) => [r.key, r.id]));

    const links: { role_id: string; permission_id: string }[] = [];
    for (const [roleKey, patterns] of Object.entries(ROLE_MATRIX)) {
      const roleId = byRoleKey.get(roleKey);
      if (!roleId) continue;
      const keys = patterns.flatMap((pat) =>
        pat === "*" ? allPerms.map((p) => p.key)
          : pat.endsWith(".*") ? allPerms.filter((p) => p.key.startsWith(pat.slice(0, -1))).map((p) => p.key)
          : [pat],
      );
      for (const k of keys) {
        const pid = byKey.get(k);
        if (pid) links.push({ role_id: roleId, permission_id: pid });
      }
    }
    if (links.length) {
      await tx.insert(rolePermissions).values(links).onConflictDoNothing();
    }

    await tx.insert(settings)
      .values(SETTINGS_SEED as (typeof settings.$inferInsert)[])
      .onConflictDoUpdate({
        target: settings.key, set: { value: sql`excluded.value`, is_secret: sql`excluded.is_secret` },
      });

    await seedGivingSettings(tx);

    await seedContentTables(tx);
  });
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  seed(db)
    .then(() => { console.log("seed complete"); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
