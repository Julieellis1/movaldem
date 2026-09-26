import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { roles, userRoles } from "@/db/schema";
import { removeImage, updateImage, type AuditOpts } from "@/modules/content/gallery.service";

// PRD 05 §12 single gallery image: edit caption/alt, or remove the link row
// (the media row itself is never deleted — MED-05).
async function actorOpts(userId: string): Promise<AuditOpts> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userId));
  return { actorId: userId, actorRole: rows[0]?.key ?? null };
}

function errStatus(message: string): number {
  if (/not found/i.test(message)) return 404;
  return 400;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; imageId: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { id, imageId } = await ctx.params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "gallery.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  try {
    const { image } = await updateImage(id, imageId, body, await actorOpts(user.id));
    return NextResponse.json({ row: image });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; imageId: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { id, imageId } = await ctx.params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "gallery.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const result = await removeImage(id, imageId, await actorOpts(user.id));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}
