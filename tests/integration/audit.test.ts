import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { redactSecrets } from "@/modules/platform/audit/redact";

describe("audit", () => {
  it("writes a row inside the caller transaction", async () => {
    const id = await db.transaction(async (tx) => {
      return auditLog(tx, { action: "user.suspend", entity_type: "users", entity_id: "u1", actor_role: "admin" });
    });
    const rows = await db.select().from(auditLogs);
    expect(rows.some((r) => r.id === id)).toBe(true);
  }, 30000);
  it("redacts known secret fields", () => {
    const out = redactSecrets({ before: { paystack_secret_key: "sk_live_x", name: "Grace" } });
    expect(out.before.paystack_secret_key).toBe("[REDACTED]");
    expect(out.before.name).toBe("Grace");
  });
});
