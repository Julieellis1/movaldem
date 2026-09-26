// /api/admin/projects/[id] — project detail/update/soft-delete (PRJ-04).
//
// GET returns the row + progress (404s soft-deleted rows). PUT applies
// updateProject (target/status/date changes audit-logged). DELETE
// soft-deletes (transactions are never touched). Guards: projects.read /
// projects.update / projects.delete.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { givingProjects, roles, userRoles } from "@/db/schema";
import {
  getProject,
  getProjectProgress,
  updateProject,
  type UpdateProjectInput,
} from "@/modules/giving/project.service";
import { auditLog } from "@/modules/platform/audit/audit.service";

async function actorRole(userId: string): Promise<string> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userId));
  return rows[0]?.key ?? "";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "projects.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const row = await getProject(decodeURIComponent(id));
  if (!row || row.deleted_at) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const progress = await getProjectProgress(row.id);
  return NextResponse.json({ row, progress });
}

export async function PUT(
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
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  try {
    const role = await actorRole(user.id);
    const row = await updateProject(
      decodeURIComponent(id),
      body as unknown as UpdateProjectInput,
      { role, userId: user.id },
    );
    return NextResponse.json({ row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "projects.delete");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const key = decodeURIComponent(id);
  const row = await getProject(key);
  if (!row || row.deleted_at) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  await db
    .update(givingProjects)
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where(eq(givingProjects.id, row.id));
  await auditLog(db, {
    actor_user_id: user.id,
    actor_role: await actorRole(user.id),
    action: "project.delete",
    entity_type: "giving_projects",
    entity_id: row.id,
    changes: { title: row.title, slug: row.slug },
    ip: req.headers.get("x-forwarded-for"),
    user_agent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}
