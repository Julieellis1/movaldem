import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { tags } from "@/db/schema";
import { findOrCreateTags } from "@/modules/content/tag.service";

// Free-form tags shared across content types (PRD 05 §6) — usually created
// inline from the content form; this route also serves picker suggestions.
export async function GET() {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "tags.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await db.select().from(tags).orderBy(asc(tags.name)).limit(200);
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "tags.create");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { names?: string[] } | null;
  if (!body || !Array.isArray(body.names) || body.names.length === 0) {
    return NextResponse.json({ error: "names[] is required" }, { status: 400 });
  }
  try {
    const rows = await findOrCreateTags(body.names.map(String), { actorId: user.id });
    return NextResponse.json({ rows }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Create failed" }, { status: 400 });
  }
}
