// POST /api/webhooks/paystack — Paystack event receiver (GIV-05/06/08).
//
// Reads the RAW body via `req.text()` BEFORE any JSON parse — the HMAC
// needs the raw bytes. Store-first (200 fast), then process: invalid
// signatures are stored (signature_valid=false) + 401 + logged (GIV-05).

import { NextResponse } from "next/server";
import {
  ingestWebhook,
  processWebhookEvent,
  WebhookSignatureError,
  PAYSTACK_SIGNATURE_HEADER,
} from "@/modules/giving/payment.service";
import { resendReceipt } from "@/modules/giving/receipt.service";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get(PAYSTACK_SIGNATURE_HEADER);

  let ingested;
  try {
    ingested = await ingestWebhook(rawBody, signature);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not ingest event" }, { status: 400 });
  }

  // GIV-06: the 200 is what matters; processing errors are recorded on the
  // event row and retried via re-delivery / the reconciler — never a 500.
  try {
    await processWebhookEvent(ingested.eventKey, {
      onPaymentSucceeded: async (row) => {
        // Receipt hook point: number + outbox email, post-commit.
        await resendReceipt(row.id);
      },
    });
  } catch {
    // Recorded on the payment_events row; Paystack will retry delivery.
  }

  return NextResponse.json({ received: true });
}
