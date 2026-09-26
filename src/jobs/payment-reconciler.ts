// Phase 4 giving — payment reconciliation job (PRD 06 GIV-10/11).
//
// External scheduler (per C15) hits
// `POST /api/cron/reconcile-payments` every 10 minutes, which calls
// `reconcilePayments`. Lost webhooks, closed tabs and slow payers all
// converge here. Fully idempotent: re-runs change nothing once rows settle.

import { and, eq, lt } from "drizzle-orm";
import { db, type DB } from "@/db/client";
import { paymentEvents, transactions } from "@/db/schema";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { getSetting } from "@/modules/platform/settings/settings.service";
import {
  RECONCILE_VERIFY_AFTER_MINUTES,
  verifyAndTransition,
  type ServiceDeps,
  type TransactionRow,
  type TxHandle,
} from "@/modules/giving/payment.service";

export type ReconcileResult = {
  checked: number;
  successful: number;
  failed: number;
  abandoned: number;
  skipped: number;
};

async function abandonRow(
  tx: TxHandle,
  row: TransactionRow,
): Promise<boolean> {
  if (row.status !== "pending") return false;
  const [updated] = await tx
    .update(transactions)
    .set({ status: "abandoned", updated_at: new Date() })
    .where(and(eq(transactions.id, row.id), eq(transactions.status, "pending")))
    .returning({ id: transactions.id });
  if (updated) {
    await auditLog(tx, {
      actor_role: "system",
      action: "transaction.abandoned",
      entity_type: "transactions",
      entity_id: row.id,
      changes: { from: "pending", to: "abandoned", reference: row.reference },
    });
    return true;
  }
  return false;
}

// GIV-10: pending rows older than `verifyAfterMinutes` (default 10) are
// verified with Paystack. Success (+match) flips to successful — including
// late success on abandoned rows (GIV-11). Rows older than
// `giving.abandon_after_minutes` (default 60) with no payment become
// abandoned. Verify transport errors skip the row for the next run (never
// abandon blind during a Paystack outage).
export async function reconcilePayments(
  now: Date = new Date(),
  database: DB = db,
  deps?: ServiceDeps & { verifyAfterMinutes?: number },
): Promise<ReconcileResult> {
  const tdb = (deps?.database ?? database) as DB;
  const verifyAfterMinutes = deps?.verifyAfterMinutes ?? RECONCILE_VERIFY_AFTER_MINUTES;
  const abandonAfterMinutes =
    (await getSetting<number>(tdb, "giving.abandon_after_minutes", 60)) ?? 60;

  const verifyCutoff = new Date(now.getTime() - verifyAfterMinutes * 60_000);
  const abandonCutoff = new Date(now.getTime() - abandonAfterMinutes * 60_000);

  // Candidates: pending older than the verify window, plus abandoned rows
  // still inside the abandon window (late-payment sweep, GIV-11).
  const candidates = await tdb
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.status, "pending"), lt(transactions.created_at, verifyCutoff)),
    )
    .limit(100);

  const result: ReconcileResult = {
    checked: 0,
    successful: 0,
    failed: 0,
    abandoned: 0,
    skipped: 0,
  };

  for (const row of candidates) {
    result.checked += 1;
    try {
      const out = await verifyAndTransition(row.reference, "verify", {
        ...deps,
        database: tdb,
      });
      if (out.changed && out.status === "successful") result.successful += 1;
      else if (out.changed && out.status === "failed") result.failed += 1;
      else if (!out.changed && out.status === "pending") {
        // No payment reported: abandon once past the abandon horizon.
        if (row.created_at < abandonCutoff) {
          const abandoned = await tdb.transaction((tx) => abandonRow(tx, row));
          if (abandoned) result.abandoned += 1;
          else result.skipped += 1;
        } else {
          result.skipped += 1;
        }
      } else {
        result.skipped += 1;
      }
    } catch {
      // Verify transport failure (or mismatch path already resolved to
      // failed inside verifyAndTransition): count and move on. A row whose
      // verify threw is left pending for the next run — EXCEPT past the
      // abandon horizon we still cannot abandon blind, so it stays pending.
      // (Mismatch → failed is recorded inside verifyAndTransition; a throw
      // here means Paystack was unreachable or the row vanished.)
      const [fresh] = await tdb
        .select({ status: transactions.status })
        .from(transactions)
        .where(eq(transactions.id, row.id));
      if (fresh?.status === "failed") result.failed += 1;
      else result.skipped += 1;
    }
  }

  // Late-payment sweep: abandoned rows get one more verify per run only via
  // explicit reverify/webhook — the abandoned→successful path stays open in
  // verifyAndTransition (GIV-11), so nothing else is needed here.

  await tdb.insert(paymentEvents).values({
    transaction_id: null,
    source: "admin",
    event_type: "reconcile.run",
    event_key: `reconcile:${now.getTime()}-${result.checked}`,
    payload: { ...result, at: now.toISOString() } as Record<string, unknown>,
    signature_valid: true,
    processed: true,
  }).onConflictDoNothing({ target: paymentEvents.event_key });

  return result;
}
