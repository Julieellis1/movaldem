// GET /api/admin/transactions/[id] — transaction detail (06 §10).
//
// Returns donor + amounts + Paystack refs + payment_events history.
// Guard: `transactions.read`. Accepts the row id or the human reference.

import { NextResponse } from "next/server";
import { asc, eq, or } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { givingProjects, paymentEvents, transactions } from "@/db/schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "transactions.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const key = decodeURIComponent(id).trim();
  if (!key) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const [row] = await db
    .select()
    .from(transactions)
    .where(
      UUID_RE.test(key)
        ? or(eq(transactions.id, key), eq(transactions.reference, key))
        : eq(transactions.reference, key),
    );
  if (!row) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  const [project] = row.project_id
    ? await db
        .select({ id: givingProjects.id, title: givingProjects.title, slug: givingProjects.slug })
        .from(givingProjects)
        .where(eq(givingProjects.id, row.project_id))
    : [];

  const events = await db
    .select({
      id: paymentEvents.id,
      source: paymentEvents.source,
      event_type: paymentEvents.event_type,
      signature_valid: paymentEvents.signature_valid,
      processed: paymentEvents.processed,
      error: paymentEvents.error,
      received_at: paymentEvents.received_at,
    })
    .from(paymentEvents)
    .where(eq(paymentEvents.transaction_id, row.id))
    .orderBy(asc(paymentEvents.received_at));

  return NextResponse.json({
    transaction: {
      ...row,
      paid_at: row.paid_at?.toISOString() ?? null,
      receipt_sent_at: row.receipt_sent_at?.toISOString() ?? null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    },
    project: project ?? null,
    events: events.map((e) => ({ ...e, received_at: e.received_at.toISOString() })),
  });
}
