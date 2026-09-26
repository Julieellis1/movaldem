"use client";

import type { ReceiptPayload } from "@/modules/giving/receipt.service";
import { cn } from "@/lib/utils";

// PRD 06 §6 RCP-02: receipt payload display + print (window.print) + PDF
// download link. The PDF bytes come from the sibling pdf route
// (/give/receipt/[reference]/pdf), which enforces the same signed-token /
// owner gate as the receipt page (RCP-04).

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-on-surface-variant">{label}</dt>
      <dd className="text-sm font-medium text-text-primary sm:text-right">
        {value}
      </dd>
    </div>
  );
}

export function ReceiptView({
  payload,
  pdfUrl,
  className,
}: {
  payload: ReceiptPayload;
  pdfUrl: string;
  className?: string;
}) {
  const givingLine = payload.projectName
    ? `${payload.givingType} — ${payload.projectName}`
    : payload.givingType;
  return (
    <section
      aria-label="Giving receipt"
      className={cn(
        "rounded-xl border border-border-subtle bg-surface-card p-6 print:border-0 print:p-0",
        className,
      )}
    >
      <header className="border-b border-border-subtle pb-4 text-center">
        <p className="font-headline-sm text-headline-sm text-text-primary">
          {payload.churchName}
        </p>
        <p className="mt-1 text-sm font-medium text-on-surface-variant">
          Giving Receipt
        </p>
        <p className="mt-1 font-mono text-xs text-on-surface-variant">
          {payload.receiptNumber}
        </p>
      </header>
      <dl className="divide-y divide-border-subtle">
        <Row label="Donor" value={payload.donorName} />
        <Row label="Amount" value={payload.amountFormatted} />
        <Row label="Giving type" value={givingLine} />
        <Row label="Transaction reference" value={payload.reference} />
        <Row
          label="Paystack reference"
          value={payload.paystackReference ?? "—"}
        />
        <Row label="Date and time" value={payload.watDatetime} />
        <Row label="Payment status" value={payload.status} />
        <Row label="Payment method" value={payload.paymentMethod ?? "—"} />
      </dl>
      <p className="mt-4 text-xs text-on-surface-variant">
        This receipt is an informational acknowledgement of your gift. It is
        not a tax document unless MOVALDEM configures otherwise.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Print receipt
        </button>
        <a
          href={pdfUrl}
          download
          className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Download PDF
        </a>
      </div>
    </section>
  );
}

export default ReceiptView;
