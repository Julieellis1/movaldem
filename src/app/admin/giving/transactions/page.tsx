// Admin → Giving → Transactions list (06 §10, ADM-04).
//
// Server-gated on `transactions.read` (PERM-01). Filters submit as GET so the
// URL stays shareable; sorting + pagination are plain links (tablet/phone
// friendly, no JS required). The table itself reuses DataTable.

import Link from "next/link";
import { and, asc, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { givingProjects, transactions } from "@/db/schema";
import { TxTable } from "./tx-table";

const STATUSES = ["pending", "successful", "failed", "abandoned", "refunded"] as const;
const TYPES = ["tithe", "offering", "general", "project"] as const;

function lagosMidnightUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 3600_000);
}

type SP = {
  status?: string;
  type?: string;
  projectId?: string;
  from?: string;
  to?: string;
  minAmount?: string;
  maxAmount?: string;
  search?: string;
  sort?: string;
  order?: string;
  page?: string;
};

function qs(base: SP, patch: Partial<SP>): string {
  const p = new URLSearchParams();
  const merged = { ...base, ...patch };
  for (const [k, v] of Object.entries(merged)) {
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "transactions.read");
  const canExport = permissions.has("transactions.export") || permissions.has("*");

  const sp = await searchParams;
  const status = sp.status?.trim() || "";
  const type = sp.type?.trim() || "";
  const projectId = sp.projectId?.trim() || "";
  const from = sp.from?.trim() || "";
  const to = sp.to?.trim() || "";
  const search = sp.search?.trim() || "";
  const sort = sp.sort?.trim() || "created_at";
  const order = sp.order?.trim() || "desc";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 20;
  const minKobo =
    sp.minAmount?.trim() && sp.minAmount.trim() !== ""
      ? Math.round(Number(sp.minAmount) * 100)
      : null;
  const maxKobo =
    sp.maxAmount?.trim() && sp.maxAmount.trim() !== ""
      ? Math.round(Number(sp.maxAmount) * 100)
      : null;

  const conds = [];
  if ((STATUSES as readonly string[]).includes(status)) {
    conds.push(eq(transactions.status, status as (typeof STATUSES)[number]));
  }
  if ((TYPES as readonly string[]).includes(type)) {
    conds.push(eq(transactions.type, type as (typeof TYPES)[number]));
  }
  if (projectId) conds.push(eq(transactions.project_id, projectId));
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    conds.push(gte(transactions.created_at, lagosMidnightUTC(from)));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const end = lagosMidnightUTC(to);
    end.setTime(end.getTime() + 24 * 3600_000);
    conds.push(lte(transactions.created_at, end));
  }
  if (minKobo !== null && Number.isInteger(minKobo) && minKobo >= 0) {
    conds.push(gte(transactions.amount, minKobo));
  }
  if (maxKobo !== null && Number.isInteger(maxKobo) && maxKobo >= 0) {
    conds.push(lte(transactions.amount, maxKobo));
  }
  if (search) {
    const like = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(
      or(
        ilike(transactions.name, like),
        ilike(transactions.email, like),
        ilike(transactions.reference, like),
      ),
    );
  }
  const where = conds.length ? and(...conds) : sql`TRUE`;

  const sortCol =
    sort === "amount"
      ? transactions.amount
      : sort === "status"
        ? transactions.status
        : transactions.created_at;
  const orderBy = order === "asc" ? asc(sortCol) : desc(sortCol);

  const [[{ total }], rows, projects] = await Promise.all([
    db
      .select({ total: count() })
      .from(transactions)
      .where(where),
    db
      .select({
        id: transactions.id,
        reference: transactions.reference,
        name: transactions.name,
        email: transactions.email,
        amount: transactions.amount,
        type: transactions.type,
        project_title: givingProjects.title,
        status: transactions.status,
        created_at: transactions.created_at,
      })
      .from(transactions)
      .leftJoin(givingProjects, eq(givingProjects.id, transactions.project_id))
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ id: givingProjects.id, title: givingProjects.title })
      .from(givingProjects),
  ]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const base: SP = { status, type, projectId, from, to, search, sort, order };
  if (sp.minAmount) base.minAmount = sp.minAmount;
  if (sp.maxAmount) base.maxAmount = sp.maxAmount;
  const exportQs = qs(base, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          Transactions
        </h1>
        <span className="text-sm text-text-tertiary" aria-live="polite">
          {total} result{total === 1 ? "" : "s"}
        </span>
        {canExport && (
          <span className="ml-auto flex gap-2">
            <a
              href={`/api/admin/transactions/export?format=csv${exportQs ? `&${exportQs.slice(1)}` : ""}`}
              className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm text-text-secondary hover:bg-surface-elevated"
            >
              Export CSV
            </a>
            <a
              href={`/api/admin/transactions/export?format=xlsx${exportQs ? `&${exportQs.slice(1)}` : ""}`}
              className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm text-text-secondary hover:bg-surface-elevated"
            >
              Export XLSX
            </a>
          </span>
        )}
      </div>

      <form
        method="get"
        className="grid grid-cols-2 gap-3 rounded-xl bg-surface-card p-4 md:grid-cols-4"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Status
          </span>
          <select
            name="status"
            defaultValue={status}
            className="h-10 rounded-full border border-border bg-surface-elevated px-4 text-sm"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Type
          </span>
          <select
            name="type"
            defaultValue={type}
            className="h-10 rounded-full border border-border bg-surface-elevated px-4 text-sm"
          >
            <option value="">All</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Project
          </span>
          <select
            name="projectId"
            defaultValue={projectId}
            className="h-10 rounded-full border border-border bg-surface-elevated px-4 text-sm"
          >
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Search
          </span>
          <input
            name="search"
            defaultValue={search}
            placeholder="Name, email, reference"
            className="h-10 rounded-full border border-border bg-surface-elevated px-4 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            From (Lagos)
          </span>
          <input
            name="from"
            type="date"
            defaultValue={from}
            className="h-10 rounded-full border border-border bg-surface-elevated px-4 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            To (Lagos)
          </span>
          <input
            name="to"
            type="date"
            defaultValue={to}
            className="h-10 rounded-full border border-border bg-surface-elevated px-4 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Min ₦
          </span>
          <input
            name="minAmount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={sp.minAmount ?? ""}
            placeholder="0.00"
            className="h-10 rounded-full border border-border bg-surface-elevated px-4 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Max ₦
          </span>
          <input
            name="maxAmount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={sp.maxAmount ?? ""}
            placeholder="0.00"
            className="h-10 rounded-full border border-border bg-surface-elevated px-4 text-sm"
          />
        </label>
        <div className="col-span-2 flex items-end gap-2 md:col-span-4">
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Apply filters
          </button>
          <Link
            href="/admin/giving/transactions"
            className="inline-flex h-10 items-center rounded-full px-4 text-sm text-text-secondary hover:bg-surface-elevated"
          >
            Clear
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-surface-card p-6 text-sm text-text-tertiary">
          No transactions match these filters.
        </p>
      ) : (
        <TxTable
          rows={rows.map((r) => ({
            ...r,
            project_title: r.project_title ?? null,
            created_at: r.created_at.toISOString(),
          }))}
          sort={sort}
          order={order}
          baseQs={qs(base, { page: String(page) })}
        />
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={`/admin/giving/transactions${qs(base, { page: String(page - 1) })}`}
              className="rounded-full border border-border px-4 py-2 hover:bg-surface-elevated"
            >
              ← Prev
            </Link>
          )}
          <span className="text-text-tertiary" aria-current="page">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link
              href={`/admin/giving/transactions${qs(base, { page: String(page + 1) })}`}
              className="rounded-full border border-border px-4 py-2 hover:bg-surface-elevated"
            >
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
