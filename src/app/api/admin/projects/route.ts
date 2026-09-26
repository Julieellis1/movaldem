// /api/admin/projects — fundraising project admin API (PRJ-04).
//
// GET lists non-deleted projects with progress (PRJ-01 math served from the
// cached raised amount). POST creates a draft. Writes are audit-logged inside
// ProjectService. Guards: projects.read / projects.create.

import { NextResponse } from "next/server";
import { desc, eq, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { givingProjects, roles, userRoles } from "@/db/schema";
import {
  createProject,
  getProjectProgress,
  type CreateProjectInput,
} from "@/modules/giving/project.service";

async function actorRole(userId: string): Promise<string> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userId));
  return rows[0]?.key ?? "";
}

function withProgress(row: typeof givingProjects.$inferSelect) {
  const percent1dp =
    row.target_amount > 0
      ? Math.round((row.amount_raised_cached / row.target_amount) * 1000) / 10
      : 0;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    target_amount: row.target_amount,
    amount_raised_cached: row.amount_raised_cached,
    percent1dp,
    barPercent: Math.min(100, percent1dp),
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function GET() {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "projects.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(givingProjects)
    .where(isNull(givingProjects.deleted_at))
    .orderBy(desc(givingProjects.created_at))
    .limit(100);
  return NextResponse.json({ rows: rows.map(withProgress) });
}

export async function POST(req: Request) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "projects.create");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string" || typeof body.target_naira !== "number") {
    return NextResponse.json(
      { error: "title (string) and target_naira (number) are required" },
      { status: 400 },
    );
  }
  try {
    const role = await actorRole(user.id);
    const row = await createProject(body as unknown as CreateProjectInput, {
      role,
      userId: user.id,
    });
    const progress = await getProjectProgress(row.id);
    return NextResponse.json({ row: withProgress(row), progress }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
