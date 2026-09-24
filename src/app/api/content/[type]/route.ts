import { NextResponse } from "next/server";
import { and, desc, ilike, isNull, sql } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { bibleStudies, roles, sermons, sundaySchoolLessons, userRoles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { attachTags, type TaggableType } from "@/modules/content/tag.service";
import { createContent, type ContentType } from "@/modules/content/content.service";

const TABLES = { sermon: sermons, bible_study: bibleStudies, sunday_school: sundaySchoolLessons } as const;
const RESOURCE = { sermon: "sermons", bible_study: "bible_studies", sunday_school: "sunday_school" } as const;
const TAGGABLE: Record<ContentType, TaggableType> = { sermon: "sermon", bible_study: "bible_study", sunday_school: "sunday_school_lesson" };

function parseType(raw: string): ContentType | null {
  return raw === "sermon" || raw === "bible_study" || raw === "sunday_school" ? raw : null;
}

async function actorRole(userId: string): Promise<string> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userId));
  return rows[0]?.key ?? "";
}

// Admin list: status filter + title search + pagination (server-side).
export async function GET(req: Request, ctx: { params: Promise<{ type: string }> }) {
  const { permissions } = await getCurrentSession();
  const { type: rawType } = await ctx.params;
  const type = parseType(rawType);
  if (!type) return NextResponse.json({ error: "Unknown content type" }, { status: 404 });
  try {
    requirePermission(permissions, `${RESOURCE[type]}.read`);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const table = TABLES[type];
  const url = new URL(req.url);
  const status = url.searchParams.get("status")?.trim() || "";
  const q = url.searchParams.get("q")?.trim() || "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("per_page") ?? 20) || 20));

  const filters = [isNull(table.deleted_at)];
  if (status) filters.push(eq(table.status, status as "draft"));
  if (q) filters.push(ilike(table.title, `%${q}%`));
  const where = and(...filters);

  const [countRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(table)
    .where(where);
  const rows = await db
    .select()
    .from(table)
    .where(where)
    .orderBy(desc(table.created_at))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return NextResponse.json({ rows, total: countRow?.c ?? 0, page, perPage });
}

// Create as draft (CMS-01); optional inline tags via `tags: string[]`.
export async function POST(req: Request, ctx: { params: Promise<{ type: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { type: rawType } = await ctx.params;
  const type = parseType(rawType);
  if (!type) return NextResponse.json({ error: "Unknown content type" }, { status: 404 });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, `${RESOURCE[type]}.create`);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as (Record<string, unknown> & { tags?: string[] }) | null;
  if (!body || typeof body.title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  // CMS-11: video is one of uploaded file or external URL, not both.
  if (body.video_media_id && body.video_external_url) {
    return NextResponse.json(
      { error: "Video must be either an uploaded file or an external URL, not both (CMS-11)" },
      { status: 400 },
    );
  }
  try {
    const role = await actorRole(user.id);
    const { tags: tagNames, ...input } = body;
    const row = await createContent(type, input, { role, userId: user.id });
    let attached: string[] = [];
    if (Array.isArray(tagNames) && tagNames.length > 0) {
      const res = await attachTags(TAGGABLE[type], (row as { id: string }).id, tagNames.map(String), {
        actorId: user.id,
        actorRole: role,
      });
      attached = res.tags.map((t) => t.name);
    }
    return NextResponse.json({ row, tags: attached }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    const status = /already exists|duplicate/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
