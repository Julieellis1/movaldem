import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { bibleStudies, roles, sermons, sundaySchoolLessons, taggables, tags, userRoles } from "@/db/schema";
import { attachTags, detachTags, type TaggableType } from "@/modules/content/tag.service";
import {
  softDelete,
  updateContent,
  type ContentType,
} from "@/modules/content/content.service";

const TABLES = { sermon: sermons, bible_study: bibleStudies, sunday_school: sundaySchoolLessons } as const;
const RESOURCE = { sermon: "sermons", bible_study: "bible_studies", sunday_school: "sunday_school" } as const;
const TAGGABLE: Record<ContentType, TaggableType> = {
  sermon: "sermon",
  bible_study: "bible_study",
  sunday_school: "sunday_school_lesson",
};

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

function errStatus(message: string): number {
  if (/not found/i.test(message)) return 404;
  if (/already exists|duplicate/i.test(message)) return 409;
  if (/forbidden|cannot|only admin/i.test(message)) return 403;
  return 400;
}

export async function GET(_req: Request, ctx: { params: Promise<{ type: string; id: string }> }) {
  const { permissions } = await getCurrentSession();
  const { type: rawType, id } = await ctx.params;
  const type = parseType(rawType);
  if (!type) return NextResponse.json({ error: "Unknown content type" }, { status: 404 });
  try {
    requirePermission(permissions, `${RESOURCE[type]}.read`);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const table = TABLES[type];
  const [row] = await db.select().from(table).where(eq(table.id, id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const tagRows = await db
    .select({ name: tags.name })
    .from(taggables)
    .innerJoin(tags, eq(tags.id, taggables.tag_id))
    .where(eq(taggables.taggable_id, id));
  return NextResponse.json({ row, tags: tagRows.map((t) => t.name) });
}

// Update fields; `tags: string[]` replaces the tag set (CMS-13/tags inline).
export async function PATCH(req: Request, ctx: { params: Promise<{ type: string; id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { type: rawType, id } = await ctx.params;
  const type = parseType(rawType);
  if (!type) return NextResponse.json({ error: "Unknown content type" }, { status: 404 });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, `${RESOURCE[type]}.update`);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as (Record<string, unknown> & { tags?: string[] }) | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  if (body.video_media_id && body.video_external_url) {
    return NextResponse.json(
      { error: "Video must be either an uploaded file or an external URL, not both (CMS-11)" },
      { status: 400 },
    );
  }
  try {
    const role = await actorRole(user.id);
    const { tags: tagNames, ...input } = body;
    const row = await updateContent(type, id, input, { role, userId: user.id });
    let attached: string[] | undefined;
    if (tagNames !== undefined) {
      await detachTags(TAGGABLE[type], id, undefined, { actorId: user.id, actorRole: role });
      if (Array.isArray(tagNames) && tagNames.length > 0) {
        const res = await attachTags(TAGGABLE[type], id, tagNames.map(String), {
          actorId: user.id,
          actorRole: role,
        });
        attached = res.tags.map((t) => t.name);
      } else {
        attached = [];
      }
    }
    return NextResponse.json({ row, tags: attached });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}

// Soft delete (CMS-05); restore via POST /status {action:"restore"}.
export async function DELETE(_req: Request, ctx: { params: Promise<{ type: string; id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { type: rawType, id } = await ctx.params;
  const type = parseType(rawType);
  if (!type) return NextResponse.json({ error: "Unknown content type" }, { status: 404 });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, `${RESOURCE[type]}.delete`);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const role = await actorRole(user.id);
    const row = await softDelete(type, id, { role, userId: user.id });
    return NextResponse.json({ row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}
