import { auditLogs } from "@/db/schema";
import { redactSecrets } from "./redact";
import { hashIp } from "@/lib/ip-hash";

export type AuditInput = {
  actor_user_id?: string;
  actor_role?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  changes?: unknown;
  ip?: string | null;
  user_agent?: string | null;
};

// Deliberately no update()/delete() — append-only (AUD-02).
export async function auditLog(tx: Parameters<Parameters<import("@/db/client").DB["transaction"]>[0]>[0], input: AuditInput) {
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
