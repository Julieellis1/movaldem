import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { roles, userRoles } from "@/db/schema";
import {
  getAgenda,
  getProgramme,
  softDeleteProgramme,
  updateProgramme,
} from "@/modules/content/programme.service";

// PRD 05 §11 programmes admin API (thin guarded routes).
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
  if (/forbidden|cannot|only admin/i.test(message)) return 403;
  return 400;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { permissions } = await getCurrentSession();
  const { id } = await ctx.params;
  try {
    requirePermission(permissions, "programmes.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const row = await getProgramme(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const agenda = await getAgenda(id);
  return NextResponse.json({ row, agenda });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { id } = await ctx.params;
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
    const row = await updateProgramme(id, body, { role, userId: user.id });
    return NextResponse.json({ row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}

// Soft delete (CMS-05); restore via POST /status {action:"restore"}.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { id } = await ctx.params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "programmes.delete");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const role = await actorRole(user.id);
    const row = await softDeleteProgramme(id, { role, userId: user.id });
    return NextResponse.json({ row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}
