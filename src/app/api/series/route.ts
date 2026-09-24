import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { series } from "@/db/schema";
import { createSeries, DuplicateSlugError } from "@/modules/content/series.service";

export async function GET() {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "series.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await db.select().from(series).orderBy(asc(series.sort_order), asc(series.title));
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "series.create");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  try {
    const { series: row } = await createSeries(body, { actorId: user.id });
    return NextResponse.json({ row }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateSlugError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Create failed" }, { status: 400 });
  }
}
