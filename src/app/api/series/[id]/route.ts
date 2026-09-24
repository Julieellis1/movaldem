import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import {
  deleteSeriesGuarded,
  DuplicateSlugError,
  getSeries,
  SeriesNotFoundError,
  updateSeries,
} from "@/modules/content/series.service";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "series.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const row = await getSeries(id);
  if (!row) return NextResponse.json({ error: "Series not found" }, { status: 404 });
  return NextResponse.json({ row });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "series.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  try {
    const { series: row } = await updateSeries(id, body, { actorId: user.id });
    return NextResponse.json({ row });
  } catch (err) {
    if (err instanceof DuplicateSlugError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof SeriesNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 400 });
  }
}

// Guarded delete: 409 + usage when referenced by teaching content.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "series.delete");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const result = await deleteSeriesGuarded(id, { actorId: user.id });
    if (!result.deleted) {
      return NextResponse.json(
        { error: "Series is referenced by content — reassign or archive first", usage: result.usage },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if (err instanceof SeriesNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed" }, { status: 400 });
  }
}
