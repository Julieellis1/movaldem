// Admin → Giving → Transaction detail (06 §10).
//
// Server-gated on `transactions.read`. Shows donor, amounts (formatNaira),
// Paystack references and the payment_events history. Actions (reverify /
// resend receipt) live in the client component below and call the guarded
// API routes.

import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { givingProjects, paymentEvents, transactions } from "@/db/schema";
import { formatNaira } from "@/lib/money";
import { TxActions } from "./tx-actions";

export default async function AdminTransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "transactions.read");
  const can = (key: string) => permissions.has(key) || permissions.has("*");

  const { id } = await params;
  const key = decodeURIComponent(id).trim();
  const [row] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, key));
  if (!row) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-text-primary">Transaction</h1>
        <p className="rounded-xl bg-surface-card p-6 text-sm text-text-tertiary">
          Transaction not found.{" "}
          <Link href="/admin/giving/transactions" className="text-primary hover:underline">
            Back to list
          </Link>
        </p>
      </div>
    );
  }

  const [project] = row.project_id
    ? await db
        .select({ title: givingProjects.title, slug: givingProjects.slug })
        .from(givingProjects)
        .where(eq(givingProjects.id, row.project_id))
    : [];

  const events = await db
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.transaction_id, row.id))
    .orderBy(asc(paymentEvents.received_at));

  const facts: Array<[string, string]> = [
    ["Reference", row.reference],
    ["Paystack reference", row.paystack_reference ?? "—"],
    ["Donor", `${row.name} (${row.email})${row.phone ? ` · ${row.phone}` : ""}`],
    ["Amount", `${formatNaira(row.amount)} ${row.currency}`],
    ["Type", row.project_id ? `${row.type} — ${project?.title ?? row.project_id}` : row.type],
    ["Status", row.status],
    ["Payment method", row.payment_method ?? "—"],
    ["Failure reason", row.failure_reason ?? "—"],
    ["Receipt number", row.receipt_number ?? "—"],
    ["Paid at", row.paid_at ? new Date(row.paid_at).toLocaleString() : "—"],
    ["Created", new Date(row.created_at).toLocaleString()],
  ];
  if (row.message) facts.splice(4, 0, ["Message", row.message]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/admin/giving/transactions"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          ← Transactions
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {row.reference}
        </h1>
        <TxActions
          id={row.id}
          status={row.status}
          canReverify={can("transactions.reverify")}
          canResend={can("transactions.read")}
        />
      </div>

      <dl className="grid gap-3 rounded-xl bg-surface-card p-4 md:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {k}
            </dt>
            <dd className="break-words text-sm text-text-primary">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">
          Payment events ({events.length})
        </h2>
        {events.length === 0 ? (
          <p className="rounded-xl bg-surface-card p-4 text-sm text-text-tertiary">
            No payment events recorded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li
                key={e.id}
                className="rounded-xl bg-surface-card p-3 text-sm text-text-secondary"
              >
                <span className="font-medium text-text-primary">
                  {e.event_type}
                </span>{" "}
                · {e.source} · signature {e.signature_valid ? "valid" : "INVALID"} ·{" "}
                {e.processed ? "processed" : "pending"}
                {e.error ? ` · error: ${e.error}` : ""} ·{" "}
                {new Date(e.received_at).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
