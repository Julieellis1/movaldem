// POST /api/admin/transactions/[id]/reverify — Super Admin only (06 §9).
//
// Forces server-to-server verification via verifyAndTransition source=admin
// (GIV-03/04). The receipt hook is wired so a late success still issues the
// number + outbox email, exactly like the webhook path. Status flips are
// audit-logged inside the service (GIV-11).

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { roles, transactions, userRoles } from "@/db/schema";
import { verifyAndTransition } from "@/modules/giving/payment.service";
import { resendReceipt } from "@/modules/giving/receipt.service";
import { PaystackError } from "@/modules/giving/paystack.client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "transactions.reverify");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // 06 §9 scopes reverify to Super Admin even though the admin role carries
  // the transactions.reverify key in the matrix.
  const roleRows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, user.id));
  if (!roleRows.some((r) => r.key === "super_admin")) {
    return NextResponse.json({ error: "Super Admin only" }, { status: 403 });
  }

  const { id } = await params;
  const key = decodeURIComponent(id).trim();
  if (!key) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const [row] = await db
    .select({ id: transactions.id, reference: transactions.reference })
    .from(transactions)
    .where(
      UUID_RE.test(key)
        ? eq(transactions.id, key)
        : eq(transactions.reference, key),
    );
  if (!row) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  try {
    const result = await verifyAndTransition(row.reference, "admin", {
      onPaymentSucceeded: async (succeeded) => {
        await resendReceipt(succeeded.id);
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PaystackError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Reverification failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
