// Client actions for the transaction detail view.
// Reverify is Super Admin only (enforced API-side); resend needs Admin+.

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

async function post(url: string) {
  const res = await fetch(url, { method: "POST" });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & Record<
    string,
    unknown
  >;
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export function TxActions({
  id,
  status,
  canReverify,
  canResend,
}: {
  id: string;
  status: string;
  canReverify: boolean;
  canResend: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  async function run(kind: "reverify" | "resend", label: string) {
    setPending(kind);
    setNote(null);
    try {
      const out = await post(
        kind === "reverify"
          ? `/api/admin/transactions/${id}/reverify`
          : `/api/admin/transactions/${id}/resend-receipt`,
      );
      setNote(
        kind === "reverify"
          ? `Reverified: status is ${String(out.status)}${out.changed ? " (changed)" : " (unchanged)"}.`
          : `Receipt ${String(out.receiptNumber)} queued for delivery.`,
      );
      router.refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="ml-auto flex flex-wrap items-center gap-2">
      {canReverify && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={pending !== null}
          onClick={() => void run("reverify", "Reverify")}
          title="Force server verification with Paystack (Super Admin)"
        >
          {pending === "reverify" ? "Reverifying…" : "Reverify"}
        </Button>
      )}
      {canResend && status === "successful" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={pending !== null}
          onClick={() => void run("resend", "Resend receipt")}
          title="Resend the giving receipt (RCP-05)"
        >
          {pending === "resend" ? "Sending…" : "Resend receipt"}
        </Button>
      )}
      {note && (
        <p role="status" aria-live="polite" className="w-full text-sm text-text-secondary">
          {note}
        </p>
      )}
    </div>
  );
}
