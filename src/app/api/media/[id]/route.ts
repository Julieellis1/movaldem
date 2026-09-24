import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { deleteMediaGuarded, getUsage } from "@/modules/media/media.service";

function denied(err: unknown) {
  if ((err as { status?: number }).status === 403) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// MED-04: single media row (used by the picker + edit panel).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "media.read");
  } catch (err) {
    return denied(err) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const [row] = await db.select().from(media).where(eq(media.id, id));
  if (!row || row.deleted_at) return NextResponse.json({ error: "Media not found" }, { status: 404 });
  const usage = await getUsage(id);
  return NextResponse.json({ row, usage });
}

// MED-04: edit alt text / title.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "media.update");
  } catch (err) {
    return denied(err) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { title?: string; altText?: string } | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const patch: { title?: string | null; alt_text?: string | null } = {};
  if (body.title !== undefined) {
    if (body.title !== null && String(body.title).length > 255) {
      return NextResponse.json({ error: "title must be 255 characters or fewer" }, { status: 400 });
    }
    patch.title = body.title === null ? null : String(body.title);
  }
  if (body.altText !== undefined) {
    if (body.altText !== null && String(body.altText).length > 500) {
      return NextResponse.json({ error: "altText must be 500 characters or fewer" }, { status: 400 });
    }
    patch.alt_text = body.altText === null ? null : String(body.altText);
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  const [row] = await db.update(media).set(patch).where(eq(media.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Media not found" }, { status: 404 });
  return NextResponse.json({ row });
}

// MED-05: guarded delete — 409 + usage list when attached.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "media.delete");
  } catch (err) {
    return denied(err) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const result = await deleteMediaGuarded(id);
    if (!result.ok) {
      return NextResponse.json(
        { error: "Media is attached to content — detach it first (MED-05)", usage: result.usage },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, id: result.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
