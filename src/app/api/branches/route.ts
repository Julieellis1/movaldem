import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { branches, roles, userRoles } from "@/db/schema";
import { createBranch, reorderBranches, type CreateBranchInput } from "@/modules/content/page.service";

// PRD 05 §13 branches admin API. Guarded by the pages.* keys
// (pages.create/read/update; there is no delete UI and no separate branch key).
async function actorRole(userId: string): Promise<string | null> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userId));
  return rows[0]?.key ?? null;
}

// Admin list: all branches in display order (visible + hidden).
export async function GET() {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "pages.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(branches)
    .orderBy(asc(branches.sort_order), asc(branches.name));
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "pages.create");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  try {
    // Validated server-side inside the service (Zod, 05 §13).
    const { branch } = await createBranch(body as unknown as CreateBranchInput, {
      role: await actorRole(user.id),
      userId: user.id,
    });
    return NextResponse.json({ row: branch }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// Reorder: { orderedIds: string[] } becomes sort_order 0..n.
export async function PUT(req: Request) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "pages.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { orderedIds?: unknown } | null;
  if (!body || !Array.isArray(body.orderedIds)) {
    return NextResponse.json({ error: "orderedIds must be an array of branch ids" }, { status: 400 });
  }
  try {
    const rows = await reorderBranches(body.orderedIds, {
      role: await actorRole(user.id),
      userId: user.id,
    });
    return NextResponse.json({ rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reorder failed";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
