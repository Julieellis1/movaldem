// GET /api/admin/transactions/export — financial export (RPT-02).
//
// `?format=csv|xlsx` (default csv). Same filters as the list endpoint.
// RPT-02: the payload opens with generated datetime (Lagos), filters applied
// and the generating admin email; every export is audit-logged.
// Cap: 5,000 rows per export (V1 guard; the count is reported + logged).

import { NextResponse } from "next/server";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { givingProjects, transactions } from "@/db/schema";
import { auditLog } from "@/modules/platform/audit/audit.service";

const EXPORT_LIMIT = 5000;

const STATUSES = ["pending", "successful", "failed", "abandoned", "refunded"] as const;
const TYPES = ["tithe", "offering", "general", "project"] as const;

function lagosDateTime(d: Date = new Date()): string {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${s} WAT`;
}

function lagosMidnightUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 3600_000);
}

function lagosStamp(d: Date | null): string {
  if (!d) return "";
  return lagosDateTime(d);
}

function csvCell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "transactions.export");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = new URL(req.url).searchParams;
  const format = (q.get("format")?.trim() || "csv").toLowerCase();
  if (format !== "csv" && format !== "xlsx") {
    return NextResponse.json({ error: "format must be csv or xlsx" }, { status: 400 });
  }

  const status = q.get("status")?.trim() || "";
  const type = q.get("type")?.trim() || "";
  const projectId = q.get("projectId")?.trim() || "";
  const from = q.get("from")?.trim() || "";
  const to = q.get("to")?.trim() || "";
  const search = q.get("search")?.trim() || "";
  const minRaw = q.get("minAmount")?.trim() || "";
  const maxRaw = q.get("maxAmount")?.trim() || "";
  const minAmount = minRaw === "" ? null : Number(minRaw);
  const maxAmount = maxRaw === "" ? null : Number(maxRaw);

  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "invalid status filter" }, { status: 400 });
  }
  if (type && !(TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "invalid type filter" }, { status: 400 });
  }
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    return NextResponse.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
  }
  if (
    (minAmount !== null && (!Number.isInteger(minAmount) || minAmount < 0)) ||
    (maxAmount !== null && (!Number.isInteger(maxAmount) || maxAmount < 0))
  ) {
    return NextResponse.json({ error: "amount filters must be integer kobo" }, { status: 400 });
  }

  const conds = [];
  if (status) conds.push(eq(transactions.status, status as (typeof STATUSES)[number]));
  if (type) conds.push(eq(transactions.type, type as (typeof TYPES)[number]));
  if (projectId) conds.push(eq(transactions.project_id, projectId));
  if (from) conds.push(gte(transactions.created_at, lagosMidnightUTC(from)));
  if (to) {
    const end = lagosMidnightUTC(to);
    end.setTime(end.getTime() + 24 * 3600_000);
    conds.push(lte(transactions.created_at, end));
  }
  if (minAmount !== null) conds.push(gte(transactions.amount, minAmount));
  if (maxAmount !== null) conds.push(lte(transactions.amount, maxAmount));
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

  const rows = await db
    .select({
      reference: transactions.reference,
      name: transactions.name,
      email: transactions.email,
      phone: transactions.phone,
      amount: transactions.amount,
      currency: transactions.currency,
      type: transactions.type,
      project_title: givingProjects.title,
      status: transactions.status,
      paystack_reference: transactions.paystack_reference,
      receipt_number: transactions.receipt_number,
      paid_at: transactions.paid_at,
      created_at: transactions.created_at,
    })
    .from(transactions)
    .leftJoin(givingProjects, eq(givingProjects.id, transactions.project_id))
    .where(where)
    .orderBy(desc(transactions.created_at))
    .limit(EXPORT_LIMIT + 1);

  const truncated = rows.length > EXPORT_LIMIT;
  const data = rows.slice(0, EXPORT_LIMIT);

  const filters: Record<string, string> = {};
  if (status) filters.status = status;
  if (type) filters.type = type;
  if (projectId) filters.projectId = projectId;
  if (from) filters.from = from;
  if (to) filters.to = to;
  if (search) filters.search = search;
  if (minRaw) filters.minAmountKobo = minRaw;
  if (maxRaw) filters.maxAmountKobo = maxRaw;
  const filtersLabel =
    Object.entries(filters)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ") || "none";

  const generated = lagosDateTime(new Date());
  const adminEmail = user.email ?? "unknown";

  // RPT-02: every financial export is audit-logged (who, what scope, how many).
  await auditLog(db, {
    actor_user_id: user.id,
    actor_role: "admin",
    action: "transactions.export",
    entity_type: "transactions",
    changes: { format, filters, count: data.length, truncated },
    ip: req.headers.get("x-forwarded-for"),
    user_agent: req.headers.get("user-agent"),
  });

  const headers = [
    "reference",
    "created_lagos",
    "donor_name",
    "email",
    "phone",
    "type",
    "project",
    "amount_naira",
    "currency",
    "status",
    "paystack_reference",
    "receipt_number",
    "paid_lagos",
  ];
  const bodyRows = data.map((r) => [
    r.reference,
    lagosStamp(r.created_at),
    r.name,
    r.email,
    r.phone ?? "",
    r.type,
    r.project_title ?? "",
    (r.amount / 100).toFixed(2),
    r.currency,
    r.status,
    r.paystack_reference ?? "",
    r.receipt_number ?? "",
    lagosStamp(r.paid_at),
  ]);

  const stamp = generated.replace(/[:,\s]/g, "-");
  if (format === "csv") {
    const lines = [
      `# MOVALDEM transactions export`,
      `# Generated: ${generated}`,
      `# Generated by: ${adminEmail}`,
      `# Filters: ${filtersLabel}`,
      `# Rows: ${data.length}${truncated ? ` (truncated at ${EXPORT_LIMIT})` : ""}`,
      headers.map(csvCell).join(","),
      ...bodyRows.map((r) => r.map(csvCell).join(",")),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="transactions-${stamp}.csv"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "MOVALDEM";
  const ws = wb.addWorksheet("Transactions");
  ws.addRow(["MOVALDEM transactions export"]);
  ws.addRow(["Generated", generated]);
  ws.addRow(["Generated by", adminEmail]);
  ws.addRow(["Filters", filtersLabel]);
  ws.addRow([`Rows: ${data.length}${truncated ? ` (truncated at ${EXPORT_LIMIT})` : ""}`]);
  ws.addRow([]);
  ws.addRow(headers);
  for (const r of bodyRows) ws.addRow(r);
  ws.columns = headers.map((h) => ({
    header: h,
    width: h === "donor_name" || h === "project" ? 24 : h === "reference" ? 26 : 18,
  }));
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(buf, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="transactions-${stamp}.xlsx"`,
    },
  });
}
