import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { roles, userRoles } from "@/db/schema";
import { getSitePage, upsertSitePage } from "@/modules/content/page.service";

// PRD 05 §13 site pages (key-based: about.history/vision/mission/beliefs).
// No delete endpoint — pages are edited in place (no delete UI).
async function actorRole(userId: string): Promise<string | null> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userId));
  return rows[0]?.key ?? null;
}
export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { permissions } = await getCurrentSession();
  const { key } = await ctx.params;
  try {
    requirePermission(permissions, "pages.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const row = await getSitePage(key);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ row });
}

export async function PUT(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { key } = await ctx.params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "pages.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { title?: unknown; body?: unknown } | null;
  if (!body || typeof body.title !== "string" || typeof body.body !== "string") {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }
  try {
    const role = await actorRole(user.id);
    const row = await upsertSitePage(key, body.title, body.body, { role, userId: user.id });
    return NextResponse.json({ row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
