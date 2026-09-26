// POST /api/admin/transactions/[id]/resend-receipt — Admin+ (RCP-05).
//
// Calls resendReceipt with its exact signature (issues a number if missing,
// re-enqueues via the outbox so NTF-01 retries cover failures), then writes
// one audit row. Guard: `transactions.read` (held by admin + super_admin).

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { transactions } from "@/db/schema";
import { resendReceipt } from "@/modules/giving/receipt.service";
import { auditLog } from "@/modules/platform/audit/audit.service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "transactions.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const key = decodeURIComponent(id).trim();
  if (!key) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const [row] = await db
    .select({ id: transactions.id, reference: transactions.reference, status: transactions.status })
    .from(transactions)
    .where(
      UUID_RE.test(key)
        ? eq(transactions.id, key)
        : eq(transactions.reference, key),
    );
  if (!row) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  try {
    const out = await resendReceipt(row.id);
    await auditLog(db, {
      actor_user_id: user.id,
      actor_role: "admin",
      action: "transaction.receipt_resend",
      entity_type: "transactions",
      entity_id: row.id,
      changes: { reference: row.reference, receiptNumber: out.receiptNumber },
      ip: req.headers.get("x-forwarded-for"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Resend failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
