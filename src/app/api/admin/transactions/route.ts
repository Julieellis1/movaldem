// GET /api/admin/transactions — admin transaction list (06 §10).
//
// Filters: status, type, projectId, from/to (Lagos YYYY-MM-DD on created_at),
// minAmount/maxAmount (integer kobo), search (name/email/reference),
// sort (created_at|amount|status), order, page, pageSize.
// Guard: `transactions.read` (PERM-01). Never hard-deletes anything.

import { NextResponse } from "next/server";
import { and, asc, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { givingProjects, transactions } from "@/db/schema";

const STATUSES = ["pending", "successful", "failed", "abandoned", "refunded"] as const;
const TYPES = ["tithe", "offering", "general", "project"] as const;
const SORTS = ["created_at", "amount", "status"] as const;

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Lagos midnight for a YYYY-MM-DD date as UTC (WAT = UTC+1, no DST). */
function lagosMidnightUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 3600_000);
}

export async function GET(req: Request) {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "transactions.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = new URL(req.url).searchParams;
  const status = q.get("status")?.trim() || "";
  const type = q.get("type")?.trim() || "";
  const projectId = q.get("projectId")?.trim() || "";
  const from = q.get("from")?.trim() || "";
  const to = q.get("to")?.trim() || "";
  const search = q.get("search")?.trim() || "";
  const sort = q.get("sort")?.trim() || "created_at";
  const order = q.get("order")?.trim() || "desc";
  const page = Math.max(1, Number(q.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.get("pageSize")) || 20));

  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return bad("status must be one of pending, successful, failed, abandoned, refunded");
  }
  if (type && !(TYPES as readonly string[]).includes(type)) {
    return bad("type must be one of tithe, offering, general, project");
  }
  if (!(SORTS as readonly string[]).includes(sort)) {
    return bad("sort must be one of created_at, amount, status");
  }
  if (order !== "asc" && order !== "desc") return bad("order must be asc or desc");

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (from && !DATE_RE.test(from)) return bad("from must be YYYY-MM-DD");
  if (to && !DATE_RE.test(to)) return bad("to must be YYYY-MM-DD");
  if (from && to && to < from) return bad("to must be on or after from");

  const minRaw = q.get("minAmount")?.trim() || "";
  const maxRaw = q.get("maxAmount")?.trim() || "";
  const minAmount = minRaw === "" ? null : Number(minRaw);
  const maxAmount = maxRaw === "" ? null : Number(maxRaw);
  if (minAmount !== null && (!Number.isInteger(minAmount) || minAmount < 0)) {
    return bad("minAmount must be a non-negative integer (kobo)");
  }
  if (maxAmount !== null && (!Number.isInteger(maxAmount) || maxAmount < 0)) {
    return bad("maxAmount must be a non-negative integer (kobo)");
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
  const where = conds.length ? and(...conds) : undefined;

  const sortCol =
    sort === "amount"
      ? transactions.amount
      : sort === "status"
        ? transactions.status
        : transactions.created_at;
  const orderBy = order === "asc" ? asc(sortCol) : desc(sortCol);

  const [{ total }] = await db
    .select({ total: count() })
    .from(transactions)
    .where(where ?? sql`TRUE`);

  const rows = await db
    .select({
      id: transactions.id,
      reference: transactions.reference,
      name: transactions.name,
      email: transactions.email,
      amount: transactions.amount,
      currency: transactions.currency,
      type: transactions.type,
      project_id: transactions.project_id,
      project_title: givingProjects.title,
      status: transactions.status,
      receipt_number: transactions.receipt_number,
      paid_at: transactions.paid_at,
      created_at: transactions.created_at,
    })
    .from(transactions)
    .leftJoin(givingProjects, eq(givingProjects.id, transactions.project_id))
    .where(where ?? sql`TRUE`)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      paid_at: r.paid_at?.toISOString() ?? null,
      created_at: r.created_at.toISOString(),
    })),
    total,
    page,
    pageSize,
  });
}
