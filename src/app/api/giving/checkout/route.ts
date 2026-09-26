// POST /api/giving/checkout — public, rate-limited (GIV-12 inside the
// service, per IP + per email). Validates, creates the pending transaction
// (GIV-01) and returns the Paystack checkout URL.

import { NextResponse } from "next/server";
import {
  createCheckout,
  PaymentValidationError,
} from "@/modules/giving/payment.service";
import { PaystackError } from "@/modules/giving/paystack.client";
import { RateLimitError } from "@/lib/ratelimit";

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  try {
    const out = await createCheckout({
      type: body.type as "tithe" | "offering" | "general" | "project",
      projectId: (body.projectId as string | undefined) ?? undefined,
      amountNaira: body.amountNaira as number,
      name: body.name as string,
      email: body.email as string,
      phone: (body.phone as string | undefined) ?? undefined,
      message: (body.message as string | undefined) ?? undefined,
      userId: (body.userId as string | undefined) ?? undefined,
      ip: clientIp(req),
    });
    return NextResponse.json(out, { status: 201 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof PaymentValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json(
        { error: "Check the highlighted fields and try again." },
        { status: 400 },
      );
    }
    if (err instanceof PaystackError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: "Could not start the payment. Please try again." },
      { status: 400 },
    );
  }
}
