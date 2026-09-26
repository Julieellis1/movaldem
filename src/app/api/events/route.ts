import { NextResponse } from "next/server";
import { desc, eq, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { events, roles, userRoles } from "@/db/schema";
import { createEvent, type CreateEventInput } from "@/modules/content/event.service";

// PRD 05 §10 events admin API (thin guarded routes; CMS-08 audit inside service).
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
    requirePermission(permissions, "events.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(events)
    .where(isNull(events.deleted_at))
    .orderBy(desc(events.created_at))
    .limit(100);
  return NextResponse.json({ rows });
}

// Create as draft (CMS-01).
export async function POST(req: Request) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "events.create");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  try {
    const role = await actorRole(user.id);
    // Validated server-side inside the service (Zod, 05 §10).
    const row = await createEvent(body as unknown as CreateEventInput, { role, userId: user.id });
    return NextResponse.json({ row }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
