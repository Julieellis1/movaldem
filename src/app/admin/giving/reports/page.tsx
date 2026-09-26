// Admin → Giving → Reports (08 §5.1, RPT-01/02).
//
// Server-gated on `giving_reports.read`. All date boundaries use
// Africa/Lagos. RPT-01: every money total counts successful transactions
// only; refunded amounts are shown on their own line. The status filter
// narrows the breakdown + trend; totals stay successful-only by definition.
// Export buttons reuse the audited transactions export (RPT-02).

import Link from "next/link";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { givingProjects, transactions } from "@/db/schema";
import { lagosDateString } from "@/modules/giving/project.service";
import { formatNaira } from "@/lib/money";

const TYPES = ["tithe", "offering", "general", "project"] as const;
const STATUSES = ["pending", "successful", "failed", "abandoned", "refunded"] as const;
const PERIODS = ["today", "week", "month", "year", "custom"] as const;
const REPORT_LIMIT = 10000;

function lagosMidnightUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 3600_000);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 3600_000);
}

/** Monday (Lagos) of the week containing `lagosToday` (YYYY-MM-DD). */
function lagosWeekStart(lagosToday: string): string {
  const base = lagosMidnightUTC(lagosToday);
  // Lagos midnight ≈ UTC-1h; weekday from the Lagos wall date instead.
  const [y, m, d] = lagosToday.split("-").map(Number);
  const wall = new Date(Date.UTC(y, m - 1, d));
  const dow = (wall.getUTCDay() + 6) % 7; // Monday = 0
  return lagosDateString(addDays(base, -dow));
}

type SP = {
  period?: string;
  from?: string;
  to?: string;
  type?: string;
  projectId?: string;
  status?: string;
};

export default async function AdminGivingReportsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "giving_reports.read");

  const sp = await searchParams;
  const period = (PERIODS as readonly string[]).includes(sp.period ?? "")
    ? sp.period!
    : "month";
  const type = (TYPES as readonly string[]).includes(sp.type ?? "") ? sp.type! : "";
  const statusFilter = (STATUSES as readonly string[]).includes(sp.status ?? "")
    ? sp.status!
    : "";
  const projectId = sp.projectId?.trim() || "";

  const today = lagosDateString(new Date());
  let fromStr: string;
  let toStr: string;
  if (period === "today") {
    fromStr = today;
    toStr = today;
  } else if (period === "week") {
    fromStr = lagosWeekStart(today);
    toStr = today;
  } else if (period === "year") {
    fromStr = `${today.slice(0, 4)}-01-01`;
    toStr = today;
  } else if (period === "custom") {
    fromStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : today;
    toStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;
    if (toStr < fromStr) toStr = fromStr;
  } else {
    fromStr = `${today.slice(0, 7)}-01`;
    toStr = today;
  }

  const startUTC = lagosMidnightUTC(fromStr);
  const endUTC = addDays(lagosMidnightUTC(toStr), 1);

  const conds = [gte(transactions.created_at, startUTC), lte(transactions.created_at, endUTC)];
  if (type) conds.push(eq(transactions.type, type as (typeof TYPES)[number]));
  if (projectId) conds.push(eq(transactions.project_id, projectId));

  const [rows, projects] = await Promise.all([
    db
      .select({
        amount: transactions.amount,
        type: transactions.type,
        status: transactions.status,
        project_id: transactions.project_id,
        created_at: transactions.created_at,
      })
      .from(transactions)
      .where(and(...conds))
      .orderBy(desc(transactions.created_at))
      .limit(REPORT_LIMIT),
    db
      .select({ id: givingProjects.id, title: givingProjects.title })
      .from(givingProjects)
      .where(isNull(givingProjects.deleted_at)),
  ]);
  const projectName = new Map(projects.map((p) => [p.id, p.title]));

  const ok = rows.filter((r) => r.status === "successful");
  const refunded = rows.filter((r) => r.status === "refunded");
  const totalKobo = ok.reduce((s, r) => s + r.amount, 0);
  const refundedKobo = refunded.reduce((s, r) => s + r.amount, 0);
  const avgKobo = ok.length ? Math.round(totalKobo / ok.length) : 0;

  const byType = TYPES.map((t) => {
    const set = ok.filter((r) => r.type === t);
    return {
      type: t,
      count: set.length,
      total: set.reduce((s, r) => s + r.amount, 0),
    };
  }).filter((b) => b.count > 0);

  const perProject = (() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const r of ok) {
      if (r.type !== "project" || !r.project_id) continue;
      const e = map.get(r.project_id) ?? { count: 0, total: 0 };
      e.count += 1;
      e.total += r.amount;
      map.set(r.project_id, e);
    }
    return [...map.entries()].map(([pid, v]) => ({
      id: pid,
      title: projectName.get(pid) ?? pid,
      ...v,
    }));
  })();

  const breakdown = STATUSES.map((s) => ({
    status: s,
    count: rows.filter((r) => r.status === s).length,
  }));

  // Trend granularity: day (≤32d), week (≤180d), else month — Lagos buckets.
  const rangeDays = Math.max(
    1,
    Math.round((endUTC.getTime() - startUTC.getTime()) / 86_400_000),
  );
  const grain: "day" | "week" | "month" = rangeDays <= 32 ? "day" : rangeDays <= 180 ? "week" : "month";
  const bucketKey = (d: Date): string => {
    const lagos = lagosDateString(d);
    if (grain === "day") return lagos;
    if (grain === "month") return lagos.slice(0, 7);
    const monday = lagosWeekStart(lagos);
    return `w/c ${monday}`;
  };
  const trendSource = statusFilter
    ? rows.filter((r) => r.status === statusFilter)
    : ok;
  const trendMap = new Map<string, { count: number; total: number }>();
  for (const r of trendSource) {
    const k = bucketKey(r.created_at);
    const e = trendMap.get(k) ?? { count: 0, total: 0 };
    e.count += 1;
    if (!statusFilter || statusFilter === "successful") e.total += r.amount;
    trendMap.set(k, e);
  }
  const trend = [...trendMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([bucket, v]) => ({ bucket, ...v }));

  const exportBase = new URLSearchParams();
  exportBase.set("from", fromStr);
  exportBase.set("to", toStr);
  if (type) exportBase.set("type", type);
  if (projectId) exportBase.set("projectId", projectId);
  if (statusFilter) exportBase.set("status", statusFilter);
  const exportQs = exportBase.toString();

  const card = "rounded-xl bg-surface-card p-4";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          Giving reports
        </h1>
        <span className="ml-auto flex gap-2">
          <a
            href={`/api/admin/transactions/export?format=csv&${exportQs}`}
            className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm text-text-secondary hover:bg-surface-elevated"
          >
            Export CSV
          </a>
          <a
            href={`/api/admin/transactions/export?format=xlsx&${exportQs}`}
            className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm text-text-secondary hover:bg-surface-elevated"
          >
            Export XLSX
          </a>
        </span>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl bg-surface-card p-4">
        <div className="flex gap-1" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <Link
              key={p}
              role="tab"
              aria-selected={period === p}
              href={`/admin/giving/reports?period=${p}${type ? `&type=${type}` : ""}${projectId ? `&projectId=${projectId}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
              className={`rounded-full px-3 py-1.5 text-sm capitalize ${period === p ? "bg-primary/10 font-medium text-primary" : "text-text-secondary hover:bg-surface-elevated"}`}
            >
              {p}
            </Link>
          ))}
        </div>
        <input type="hidden" name="period" value={period} />
        {period === "custom" && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                From
              </span>
              <input
                name="from"
                type="date"
                defaultValue={fromStr}
                className="h-10 rounded-full border border-border bg-surface-elevated px-4 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                To
              </span>
              <input
                name="to"
                type="date"
                defaultValue={toStr}
                className="h-10 rounded-full border border-border bg-surface-elevated px-4 text-sm"
              />
            </label>
          </>
        )}
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
            Status (breakdown + trend)
          </span>
          <select
            name="status"
            defaultValue={statusFilter}
            className="h-10 rounded-full border border-border bg-surface-elevated px-4 text-sm"
          >
            <option value="">successful (default)</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Apply
        </button>
      </form>

      <p className="text-sm text-text-tertiary">
        {fromStr} → {toStr} (Africa/Lagos) · Totals count successful only (RPT-01) · Refunded shown
        separately · Exports carry the RPT-02 header and are audit-logged.
      </p>

      <div className="grid gap-4 md:grid-cols-4">
        <div className={card}>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Total giving
          </p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{formatNaira(totalKobo)}</p>
        </div>
        <div className={card}>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Gifts</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{ok.length}</p>
          <p className="text-sm text-text-tertiary">avg {formatNaira(avgKobo)}</p>
        </div>
        <div className={card}>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Refunded (excluded)
          </p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {formatNaira(refundedKobo)}
          </p>
          <p className="text-sm text-text-tertiary">{refunded.length} transaction(s)</p>
        </div>
        <div className={card}>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            In scope (all statuses)
          </p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{rows.length}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} space-y-2`}>
          <h2 className="font-medium text-text-primary">By type (successful)</h2>
          {byType.length === 0 ? (
            <p className="text-sm text-text-tertiary">No successful gifts in scope.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {byType.map((b) => (
                <li key={b.type} className="flex justify-between gap-2 text-text-secondary">
                  <span className="capitalize">{b.type} × {b.count}</span>
                  <span className="font-medium text-text-primary">{formatNaira(b.total)}</span>
                </li>
              ))}
            </ul>
          )}
          {perProject.length > 0 && (
            <>
              <h3 className="pt-2 font-medium text-text-primary">Per project</h3>
              <ul className="space-y-1 text-sm">
                {perProject.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 text-text-secondary">
                    <span>
                      {p.title} × {p.count}
                    </span>
                    <span className="font-medium text-text-primary">{formatNaira(p.total)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className={`${card} space-y-2`}>
          <h2 className="font-medium text-text-primary">Status breakdown</h2>
          <ul className="space-y-1 text-sm">
            {breakdown.map((b) => (
              <li key={b.status} className="flex justify-between gap-2 text-text-secondary">
                <span className="capitalize">{b.status}</span>
                <span className="font-medium text-text-primary">{b.count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={`${card} space-y-2`}>
        <h2 className="font-medium text-text-primary">
          Trend by {grain} ({statusFilter || "successful"})
        </h2>
        {trend.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nothing to show for this scope.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-105 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-text-tertiary">
                  <th className="py-1 pr-4">Bucket (Lagos)</th>
                  <th className="py-1 pr-4">Gifts</th>
                  <th className="py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((t) => (
                  <tr key={t.bucket} className="border-t border-border">
                    <td className="py-1 pr-4 text-text-secondary">{t.bucket}</td>
                    <td className="py-1 pr-4 text-text-secondary">{t.count}</td>
                    <td className="py-1 font-medium text-text-primary">{formatNaira(t.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
