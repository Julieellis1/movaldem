import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { roles, userRoles } from "@/db/schema";
import { createAlbum, listAlbums, type CreateAlbumInput } from "@/modules/content/gallery.service";

// PRD 05 §12 gallery albums admin API (thin guarded routes).
// Album publish toggle is guarded by `gallery.update` (no separate publish key).

async function actorRole(userId: string): Promise<string | null> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userId));
  return rows[0]?.key ?? null;
}

export async function GET() {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "gallery.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await listAlbums();
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "gallery.create");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  try {
    // Validated server-side inside the service (Zod, 05 §12).
    const { album } = await createAlbum(body as unknown as CreateAlbumInput, { actorId: user.id, actorRole: await actorRole(user.id) });
    return NextResponse.json({ row: album }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    const status = /duplicate slug/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
