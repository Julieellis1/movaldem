// POST /api/cron/reconcile-payments — CRON_SECRET-guarded reconciler
// (external scheduler per C15, every 10 minutes). Same guard shape as the
// other cron routes.

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { db } from "@/db/client";
import { reconcilePayments } from "@/jobs/payment-reconciler";
import { resendReceipt } from "@/modules/giving/receipt.service";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env().CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await reconcilePayments(new Date(), db, {
    onPaymentSucceeded: async (row) => {
      // Receipt hook point: number + outbox email, post-commit.
      await resendReceipt(row.id);
    },
  });
  return NextResponse.json(result);
}
