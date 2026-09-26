import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { transactions } from "@/db/schema";
import { auth } from "@/modules/auth/auth.config";
import {
  issueReceipt,
  receiptPayload,
  verifySignedReceiptUrl,
} from "@/modules/giving/receipt.service";
import { ReceiptView } from "@/components/giving/receipt-view";
import { EmptyState } from "@/components/shared/empty-state";

// PRD 06 §6 RCP-04: gate = signed expiring link (?exp=&sig= per
// ReceiptService.createSignedReceiptUrl, ?token=<exp>.<sig> shorthand) OR
// the logged-in owner (transactions.user_id match, checked here in the page
// server component via a direct read — no new API). Receipts are private:
// not indexable, no donor names leak to public pages (PRJ-03).

export const metadata: Metadata = {
  title: "Your giving receipt | MOVALDEM",
  description: "View, print or download your giving receipt.",
  robots: { index: false, follow: false },
};

function firstParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function signedTokenOk(
  reference: string,
  sp: Record<string, string | string[] | undefined>,
): boolean {
  let exp = firstParam(sp.exp);
  let sig = firstParam(sp.sig);
  const token = firstParam(sp.token);
  if ((!exp || !sig) && token) {
    const parts = token.split(".");
    if (parts.length === 2 && parts[0] && parts[1]) {
      exp = parts[0];
      sig = parts[1];
    }
  }
  if (!exp || !sig) return false;
  try {
    const url = `https://receipt.local/give/receipt/${encodeURIComponent(reference)}?exp=${encodeURIComponent(exp)}&sig=${encodeURIComponent(sig)}`;
    return verifySignedReceiptUrl(url) === reference;
  } catch {
    return false;
  }
}

export function receiptQueryString(
  sp: Record<string, string | string[] | undefined>,
): string {
  const exp = firstParam(sp.exp);
  const sig = firstParam(sp.sig);
  const token = firstParam(sp.token);
  const qp = new URLSearchParams();
  if (exp && sig) {
    qp.set("exp", exp);
    qp.set("sig", sig);
  } else if (token) {
    qp.set("token", token);
  }
  const qs = qp.toString();
  return qs ? `?${qs}` : "";
}

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { reference: rawReference } = await params;
  const reference = decodeURIComponent(rawReference ?? "").trim();
  const sp = await searchParams;
  if (!reference) notFound();

  const [tx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.reference, reference))
    .catch(() => []);
  if (!tx) notFound();

  let allowed = signedTokenOk(reference, sp);
  if (!allowed) {
    const session = await auth.api
      .getSession({ headers: await headers() })
      .catch(() => null);
    const uid = (
      session?.user as { id?: string } | undefined
    )?.id;
    if (uid && tx.user_id && tx.user_id === uid) allowed = true;
  }

  if (!allowed) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
        <EmptyState
          title="Receipt link expired or invalid"
          description="This receipt link is no longer valid. Members can sign in to view their receipts; otherwise request a fresh receipt link from your email."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/sign-in"
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Sign in
              </Link>
              <Link
                href="/contact"
                className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
              >
                Contact us
              </Link>
            </div>
          }
        />
      </main>
    );
  }

  if (tx.status !== "successful") {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
        <EmptyState
          title="Receipt not ready yet"
          description="A receipt is issued once your payment is confirmed. Check the confirmation page for the latest status."
          action={
            <Link
              href={`/give/confirmation?reference=${encodeURIComponent(reference)}`}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Check payment status
            </Link>
          }
        />
      </main>
    );
  }

  const receiptNumber = tx.receipt_number ?? (await issueReceipt(tx.id));
  const payload = await receiptPayload(tx.id);
  const pdfUrl = `/give/receipt/${encodeURIComponent(reference)}/pdf${receiptQueryString(sp)}`;

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
      <header className="mb-6 text-center print:hidden">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">
          Giving receipt
        </h1>
        <p className="mt-1 font-mono text-xs text-on-surface-variant">
          {receiptNumber}
        </p>
      </header>
      <ReceiptView payload={payload} pdfUrl={pdfUrl} />
    </main>
  );
}
