import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import {
  CategoryNotFoundError,
  deleteCategoryGuarded,
  DuplicateCategorySlugError,
  getCategory,
  updateCategory,
} from "@/modules/content/category.service";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "content_categories.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const row = await getCategory(id);
  if (!row) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  return NextResponse.json({ row });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "content_categories.update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  try {
    const { category: row } = await updateCategory(id, body, { actorId: user.id });
    return NextResponse.json({ row });
  } catch (err) {
    if (err instanceof DuplicateCategorySlugError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof CategoryNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 400 });
  }
}

// Guarded delete (PRD 05 §6): 409 + usage when in use — archive/reassign instead.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "content_categories.delete");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const result = await deleteCategoryGuarded(id, { actorId: user.id });
    if (!result.deleted) {
      return NextResponse.json(
        { error: "Category is in use — reassign content or archive it instead", usage: result.usage },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if (err instanceof CategoryNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed" }, { status: 400 });
  }
}
