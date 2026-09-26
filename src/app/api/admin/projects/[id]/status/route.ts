// POST /api/admin/projects/[id]/status — project status change (PRJ-04).
//
// Body: { status: draft|active|completed|closed }. Audit-logged inside
// setProjectStatus. Guard: projects.update.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { roles, userRoles } from "@/db/schema";
import {
  PROJECT_STATUSES,
  setProjectStatus,
} from "@/modules/giving/project.service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "projects.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  const status = typeof body?.status === "string" ? body.status : "";
  if (!(PROJECT_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: "status must be one of draft, active, completed, closed" },
      { status: 400 },
    );
  }
  const { id } = await params;
  const roleRows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, user.id));
  try {
    const row = await setProjectStatus(
      decodeURIComponent(id),
      status as (typeof PROJECT_STATUSES)[number],
      { role: roleRows[0]?.key ?? "", userId: user.id },
    );
    return NextResponse.json({ row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status change failed";
    const code = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status: code });
  }
}
