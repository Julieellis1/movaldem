// GET /api/giving/status?reference= — public confirmation polling.
// Returns `{ status }` ONLY — never donor name, email or amount.

import { NextResponse } from "next/server";
import {
  getPublicStatus,
  PaymentValidationError,
} from "@/modules/giving/payment.service";

export async function GET(req: Request) {
  const reference = new URL(req.url).searchParams.get("reference")?.trim() ?? "";
  if (!reference) {
    return NextResponse.json({ error: "reference is required" }, { status: 400 });
  }
  try {
    const out = await getPublicStatus(reference);
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof PaymentValidationError) {
      return NextResponse.json({ error: "transaction not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not fetch status" }, { status: 500 });
  }
}
