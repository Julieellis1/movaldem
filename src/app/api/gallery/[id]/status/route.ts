import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { roles, userRoles } from "@/db/schema";
import {
  publishAlbum,
  unpublishAlbum,
  type AuditOpts,
} from "@/modules/content/gallery.service";

// PRD 05 §12 album publish toggle, guarded by `gallery.update`
// (there is no separate gallery.publish key).
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
  if (/invalid status transition/i.test(message)) return 409;
  return 400;
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
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action ?? "";
  try {
    const opts = await actorOpts(user.id);
    if (action === "publish") {
      const { album } = await publishAlbum(id, opts);
      return NextResponse.json({ row: album });
    }
    if (action === "unpublish") {
      const { album } = await unpublishAlbum(id, opts);
      return NextResponse.json({ row: album });
    }
    return NextResponse.json(
      { error: "action must be one of publish, unpublish" },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transition failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}
