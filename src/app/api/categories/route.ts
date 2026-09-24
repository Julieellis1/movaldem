import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { contentCategories } from "@/db/schema";
import { createCategory, DuplicateCategorySlugError } from "@/modules/content/category.service";

export async function GET() {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "content_categories.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(contentCategories)
    .orderBy(asc(contentCategories.type), asc(contentCategories.sort_order), asc(contentCategories.name));
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "content_categories.create");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  try {
    const { category: row } = await createCategory(body, { actorId: user.id });
    return NextResponse.json({ row }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateCategorySlugError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Create failed" }, { status: 400 });
  }
}
