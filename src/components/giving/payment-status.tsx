import Link from "next/link";
import { cn } from "@/lib/utils";

// PRD 06 §2 step 5 + §8: renders pending/success/failed/abandoned with an
// accessible live region and clear next steps. Status-only: never renders
// donor name, email or amount (GET /api/giving/status returns status only).

export type PaymentStatusValue =
  | "pending"
  | "successful"
  | "failed"
  | "abandoned"
  | "refunded"
  | (string & {});

const TITLE: Record<string, string> = {
  pending: "Payment pending",
  successful: "Payment successful",
  failed: "Payment failed",
  abandoned: "Payment not completed",
  refunded: "Payment refunded",
};

export function PaymentStatus({
  status,
  reference,
  className,
}: {
  status: PaymentStatusValue;
  reference: string;
  className?: string;
}) {
  const title = TITLE[status] ?? "Payment status";
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${title} for ${reference}`}
      className={cn(
        "rounded-xl border border-border-subtle bg-surface-card p-6 text-center",
        className,
      )}
    >
      <p
        aria-hidden="true"
        className={cn(
          "mx-auto flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold",
          status === "successful" && "bg-green-100 text-green-800",
          status === "pending" && "bg-amber-100 text-amber-800",
          (status === "failed" || status === "abandoned") &&
            "bg-red-100 text-red-800",
          status === "refunded" && "bg-surface-elevated text-on-surface-variant",
        )}
      >
        {status === "successful" ? "✓" : status === "pending" ? "…" : "!"}
      </p>
      <p className="mt-3 font-headline-sm text-headline-sm text-text-primary">
        {title}
      </p>
      <p className="mt-1 text-sm text-on-surface-variant">
        Reference: <span className="font-mono">{reference}</span>
      </p>

      {status === "pending" && (
        <p className="mx-auto mt-3 max-w-md font-body-sm text-body-sm text-on-surface-variant">
          We are confirming your payment with the provider. Please keep this
          page open — it updates automatically. If you already paid and this
          page does not change, your payment will still be recorded
          automatically.
        </p>
      )}
      {status === "successful" && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link
            href={`/give/receipt/${encodeURIComponent(reference)}`}
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View receipt
          </Link>
        </div>
      )}
      {(status === "failed" || status === "abandoned") && (
        <>
          <p className="mx-auto mt-3 max-w-md font-body-sm text-body-sm text-on-surface-variant">
            {status === "failed"
              ? "Your payment did not go through. No receipt was issued."
              : "You did not complete this payment. No money was taken."}{" "}
            You can try again or contact us for help.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/give"
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Try again
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Contact us
            </Link>
          </div>
        </>
      )}
      {status === "refunded" && (
        <p className="mx-auto mt-3 max-w-md font-body-sm text-body-sm text-on-surface-variant">
          This payment was refunded. If you have questions, please{" "}
          <Link href="/contact" className="underline hover:no-underline">
            contact us
          </Link>
          .
        </p>
      )}
    </div>
  );
}

export default PaymentStatus;
