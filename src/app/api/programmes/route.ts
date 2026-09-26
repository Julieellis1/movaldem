import { NextResponse } from "next/server";
import { desc, eq, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { programmes, roles, userRoles } from "@/db/schema";
import { createProgramme, type CreateProgrammeInput } from "@/modules/content/programme.service";

// PRD 05 §11 programmes admin API (thin guarded routes; CMS-08 audit inside service).
async function actorRole(userId: string): Promise<string> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userId));
  return rows[0]?.key ?? "";
}

// Admin list (excludes soft-deleted; newest first).
export async function GET() {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "programmes.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(programmes)
    .where(isNull(programmes.deleted_at))
    .orderBy(desc(programmes.created_at))
    .limit(100);
  return NextResponse.json({ rows });
}

// Create as draft (CMS-01).
export async function POST(req: Request) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "programmes.create");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  try {
    const role = await actorRole(user.id);
    // Validated server-side inside the service (Zod, 05 §11).
    const row = await createProgramme(body as unknown as CreateProgrammeInput, { role, userId: user.id });
    return NextResponse.json({ row }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
