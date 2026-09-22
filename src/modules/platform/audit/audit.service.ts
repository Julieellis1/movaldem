import { auditLogs } from "@/db/schema";
import { redactSecrets } from "./redact";
import { hashIp } from "@/lib/ip-hash";
import type { DB } from "@/db/client";

export type AuditInput = {
  actor_user_id?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  changes?: unknown;
  ip?: string | null;
  user_agent?: string | null;
};

type Db = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

// Deliberately no update()/delete() — append-only (AUD-02).
// Accepts either the pool-backed db or an in-flight transaction, so callers can
// write the audit row atomically with the change it describes.
export async function auditLog(tx: Db, input: AuditInput) {
  const [row] = await tx.insert(auditLogs).values({
    actor_user_id: input.actor_user_id,
    actor_role: input.actor_role,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    changes: redactSecrets(input.changes) as Record<string, unknown>,
    ip_hash: hashIp(input.ip),
    user_agent: input.user_agent,
  }).returning({ id: auditLogs.id });
  return row.id;
}
