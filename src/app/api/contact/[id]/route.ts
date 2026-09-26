import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { contactMessages, roles, userRoles } from "@/db/schema";
import {
  CONTACT_STATUSES,
  deleteContactMessage,
  setContactStatus,
} from "@/modules/content/contact.service";

// PRD 08 §4 single contact message: view, mark read/unread, archive,
// delete (Admin+ only — enforced in the service, 08-§4).
async function actor(userId: string): Promise<{ role: string | null; userId: string }> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userId));
  return { role: rows[0]?.key ?? null, userId };
}

function errStatus(message: string): number {
  if (/not found/i.test(message)) return 404;
  if (/only admin/i.test(message)) return 403;
  return 400;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { permissions } = await getCurrentSession();
  const { id } = await ctx.params;
  try {
    requirePermission(permissions, "contact_messages.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [row] = await db.select().from(contactMessages).where(eq(contactMessages.id, id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ row });
}

// { status: "new" | "read" | "archived" } — mark read/unread (back to new) or archive.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { id } = await ctx.params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "contact_messages.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  const parsed = CONTACT_STATUSES.find((s) => s === body?.status);
  if (!parsed) {
    return NextResponse.json(
      { error: "status must be one of new, read, archived" },
      { status: 400 },
    );
  }
  try {
    const row = await setContactStatus(id, parsed, await actor(user.id));
    return NextResponse.json({ row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}

// Soft delete — the row is kept with deleted_at set (08-§4).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { id } = await ctx.params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "contact_messages.delete");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await deleteContactMessage(id, await actor(user.id));
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}
