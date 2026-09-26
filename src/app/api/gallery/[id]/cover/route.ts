import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { roles, userRoles } from "@/db/schema";
import { setCover, type AuditOpts } from "@/modules/content/gallery.service";

// PRD 05 §12 set (or clear) the album cover. A non-null cover must reference
// media attached to the album.
async function actorOpts(userId: string): Promise<AuditOpts> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userId));
  return { actorId: userId, actorRole: rows[0]?.key ?? null };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { id } = await ctx.params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "gallery.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { mediaId?: unknown } | null;
  if (!body || (body.mediaId !== null && typeof body.mediaId !== "string")) {
    return NextResponse.json({ error: "mediaId must be a media id or null to clear" }, { status: 400 });
  }
  try {
    const { album } = await setCover(id, body.mediaId ?? null, await actorOpts(user.id));
    return NextResponse.json({ row: album });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Set cover failed";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
