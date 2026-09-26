import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { transactions } from "@/db/schema";
import { auth } from "@/modules/auth/auth.config";
import {
  issueReceipt,
  receiptPayload,
  receiptPdfBuffer,
  verifySignedReceiptUrl,
} from "@/modules/giving/receipt.service";

// The one route-handler exception owned by the UI worker (plan Item 4):
// GET /give/receipt/[reference]/pdf returns the RCP-02 PDF bytes
// (Content-Disposition: attachment) behind the SAME signed-token / owner
// gate as the receipt page (RCP-04). Expected-by-UI contract: if the API
// worker later ships GET /api/giving/receipt/[reference]?format=pdf, point
// ReceiptView's pdfUrl there instead.

// ?exp=&sig= (ReceiptService.createSignedReceiptUrl) or ?token=<exp>.<sig>.
function signedTokenOk(reference: string, url: URL): boolean {
  let exp = url.searchParams.get("exp")?.trim() ?? "";
  let sig = url.searchParams.get("sig")?.trim() ?? "";
  const token = url.searchParams.get("token")?.trim() ?? "";
  if ((!exp || !sig) && token) {
    const parts = token.split(".");
    if (parts.length === 2 && parts[0] && parts[1]) {
      exp = parts[0];
      sig = parts[1];
    }
  }
  if (!exp || !sig) return false;
  try {
    const check = `https://receipt.local/give/receipt/${encodeURIComponent(reference)}?exp=${encodeURIComponent(exp)}&sig=${encodeURIComponent(sig)}`;
    return verifySignedReceiptUrl(check) === reference;
  } catch {
    return false;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference: rawReference } = await params;
  const reference = decodeURIComponent(rawReference ?? "").trim();
  if (!reference) {
    return NextResponse.json({ error: "reference is required" }, { status: 400 });
  }
  const url = new URL(req.url);

  const [tx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.reference, reference));
  if (!tx) {
    return NextResponse.json({ error: "receipt not found" }, { status: 404 });
  }

  let allowed = signedTokenOk(reference, url);
  if (!allowed) {
    const session = await auth.api
      .getSession({ headers: req.headers })
      .catch(() => null);
    const uid = (session?.user as { id?: string } | undefined)?.id;
    if (uid && tx.user_id && tx.user_id === uid) allowed = true;
  }
  if (!allowed) {
    return NextResponse.json(
      { error: "receipt link expired or invalid" },
      { status: 403 },
    );
  }
  if (tx.status !== "successful" || !tx.receipt_number) {
    if (tx.status !== "successful") {
      return NextResponse.json(
        { error: "receipt not ready yet" },
        { status: 409 },
      );
    }
  }

  const receiptNumber = tx.receipt_number ?? (await issueReceipt(tx.id));
  const payload = await receiptPayload(tx.id);
  const pdf = await receiptPdfBuffer(payload);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receiptNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
