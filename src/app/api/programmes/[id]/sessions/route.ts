import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { roles, userRoles } from "@/db/schema";
import { addSession, getAgenda, reorderSessions, type AddSessionInput } from "@/modules/content/programme.service";

// PRD 05 §11 inline sessions: list agenda (grouped by day), add, reorder.
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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { permissions } = await getCurrentSession();
  const { id } = await ctx.params;
  try {
    requirePermission(permissions, "programmes.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const agenda = await getAgenda(id);
    return NextResponse.json({ agenda });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Load failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}

// Add a session inline (date must fall within the programme range — 05 §11).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { id } = await ctx.params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "programmes.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  try {
    const role = await actorRole(user.id);
    // Validated server-side inside the service (Zod + programme range, 05 §11).
    const row = await addSession(id, body as unknown as AddSessionInput, { role, userId: user.id });
    return NextResponse.json({ row }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Add failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}

// Reorder: { orderedIds: string[] } must contain exactly the session ids.
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { id } = await ctx.params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "programmes.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { orderedIds?: unknown } | null;
  if (!body || !Array.isArray(body.orderedIds)) {
    return NextResponse.json({ error: "orderedIds must be an array of session ids" }, { status: 400 });
  }
  try {
    const role = await actorRole(user.id);
    const rows = await reorderSessions(id, body.orderedIds, { role, userId: user.id });
    return NextResponse.json({ rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reorder failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}
