import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { roles, userRoles } from "@/db/schema";
import { addImages, reorderImages, type AuditOpts } from "@/modules/content/gallery.service";

// PRD 05 §12 album images: bulk add (images only) + persist exact order.
async function actorOpts(userId: string): Promise<AuditOpts> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userId));
  return { actorId: userId, actorRole: rows[0]?.key ?? null };
}

// Bulk-append media to an album. Only images are accepted (service enforces).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { id } = await ctx.params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "gallery.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { mediaIds?: unknown } | null;
  if (!body || !Array.isArray(body.mediaIds)) {
    return NextResponse.json({ error: "mediaIds must be an array of media ids" }, { status: 400 });
  }
  try {
    const result = await addImages(id, body.mediaIds, await actorOpts(user.id));
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Add failed";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

// Persist an exact order (orderedIds are gallery_images row ids).
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { id } = await ctx.params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "gallery.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { orderedIds?: unknown } | null;
  if (!body || !Array.isArray(body.orderedIds)) {
    return NextResponse.json({ error: "orderedIds must be an array of image ids" }, { status: 400 });
  }
  try {
    const result = await reorderImages(id, body.orderedIds, await actorOpts(user.id));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reorder failed";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
