"use client";

import * as React from "react";
import Link from "next/link";
import { PaymentStatus, type PaymentStatusValue } from "./payment-status";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

// Polls the exact plan contract GET /api/giving/status?reference= (status
// only, no personal data) until a terminal state, then renders PaymentStatus.
// GIV-03: the page never marks success itself — only the server does.

const TERMINAL = new Set(["successful", "failed", "abandoned", "refunded"]);
const POLL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export function ConfirmationPoller({ reference }: { reference: string }) {
  const [status, setStatus] = React.useState<PaymentStatusValue | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const started = Date.now();

    const fetchStatus = async () => {
      try {
        const res = await fetch(
          `/api/giving/status?reference=${encodeURIComponent(reference)}`,
          { cache: "no-store" },
        );
        if (res.status === 404) {
          if (!cancelled) {
            if (timer) clearInterval(timer);
            setError("We could not find this transaction.");
          }
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { status?: string };
        if (!data.status) throw new Error("empty status");
        if (cancelled) return;
        setStatus(data.status);
        if (TERMINAL.has(data.status) && timer) clearInterval(timer);
        else if (Date.now() - started > POLL_TIMEOUT_MS && timer) {
          clearInterval(timer);
        }
      } catch {
        if (!cancelled) setError("Could not check the payment status.");
      }
    };

    void fetchStatus();
    timer = setInterval(() => void fetchStatus(), POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [reference]);

  if (error && !status) {
    return (
      <ErrorState
        title="Could not check payment status"
        description={error}
        action={
          <Link
            href="/give"
            className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
          >
            Back to giving
          </Link>
        }
      />
    );
  }

  if (!status) {
    return (
      <div className="space-y-3" aria-label="Checking payment status">
        <LoadingSkeleton className="h-48 w-full" />
        <p aria-live="polite" className="text-center text-sm text-on-surface-variant">
          Checking your payment status…
        </p>
      </div>
    );
  }

  return <PaymentStatus status={status} reference={reference} />;
}

export default ConfirmationPoller;
