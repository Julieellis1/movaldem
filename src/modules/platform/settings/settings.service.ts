import type { DB } from "@/db/client";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto";

export async function getSetting<T>(db: DB, key: string, fallback?: T): Promise<T | undefined> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  if (!row) return fallback;
  return (row.is_secret ? decryptSecret(row.value as string) : row.value) as T;
}

export async function setSetting(
  db: DB, key: string, value: unknown,
  opts: { isSecret?: boolean; updatedBy?: string | null },
) {
  const stored = opts.isSecret ? encryptSecret(String(value)) : value;
  await db
    .insert(settings)
    .values({ key, value: stored as Record<string, unknown>, is_secret: !!opts.isSecret, updated_by: opts.updatedBy ?? null })
    .onConflictDoUpdate({ target: settings.key, set: { value: stored as Record<string, unknown>, is_secret: !!opts.isSecret, updated_by: opts.updatedBy ?? null, updated_at: new Date() } });
}

export async function getSecret(db: DB, key: string): Promise<string | null> {
  const v = await getSetting<string>(db, key);
  return v ?? null;
}

export async function maskSetting(db: DB, key: string): Promise<string> {
  const v = await getSecret(db, key);
  if (!v) return "";
  return maskSecret(encryptSecret(v));
}
