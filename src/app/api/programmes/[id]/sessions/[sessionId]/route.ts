import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { roles, userRoles } from "@/db/schema";
import { removeSession, updateSession } from "@/modules/content/programme.service";

// PRD 05 §11 single session edit / remove.
async function actorRole(userId: string): Promise<string> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userId));
  return rows[0]?.key ?? "";
}

function errStatus(message: string): number {
  if (/not found/i.test(message)) return 404;
  return 400;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; sessionId: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { sessionId } = await ctx.params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "programmes.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  try {
    const role = await actorRole(user.id);
    const row = await updateSession(sessionId, body, { role, userId: user.id });
    return NextResponse.json({ row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; sessionId: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { sessionId } = await ctx.params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "programmes.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const role = await actorRole(user.id);
    const result = await removeSession(sessionId, { role, userId: user.id });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}
