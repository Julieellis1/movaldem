import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { roles, userRoles } from "@/db/schema";
import {
  archive,
  publishNow,
  restore,
  schedule,
  unpublish,
  type ContentType,
} from "@/modules/content/content.service";

const RESOURCE = { sermon: "sermons", bible_study: "bible_studies", sunday_school: "sunday_school" } as const;

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
  if (/invalid status transition/i.test(message)) return 409;
  if (/cannot|only admin/i.test(message)) return 403;
  return 400;
}

// Lifecycle transitions (CMS-01/02/04/05): publish, schedule, unpublish, archive, restore.
export async function POST(req: Request, ctx: { params: Promise<{ type: string; id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  const { type: rawType, id } = await ctx.params;
  const type = parseType(rawType);
  if (!type) return NextResponse.json({ error: "Unknown content type" }, { status: 404 });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { action?: string; publishedAt?: string } | null;
  const action = body?.action ?? "";
  // Publish/schedule need the publish grant (CMS-04); the rest are updates.
  const needed =
    action === "publish" || action === "schedule" ? `${RESOURCE[type]}.publish` : `${RESOURCE[type]}.update`;
  try {
    requirePermission(permissions, needed);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const role = await actorRole(user.id);
    const actor = { role, userId: user.id };
    switch (action) {
      case "publish": {
        const row = await publishNow(type, id, actor);
        return NextResponse.json({ row });
      }
      case "schedule": {
        if (!body?.publishedAt) {
          return NextResponse.json({ error: "publishedAt is required for schedule (CMS-02)" }, { status: 400 });
        }
        const at = new Date(body.publishedAt);
        const row = await schedule(type, id, at, actor);
        return NextResponse.json({ row });
      }
      case "unpublish": {
        const row = await unpublish(type, id, actor);
        return NextResponse.json({ row });
      }
      case "archive": {
        const row = await archive(type, id, actor);
        return NextResponse.json({ row });
      }
      case "restore": {
        const row = await restore(type, id, actor);
        return NextResponse.json({ row });
      }
      default:
        return NextResponse.json(
          { error: "action must be one of publish, schedule, unpublish, archive, restore" },
          { status: 400 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transition failed";
    return NextResponse.json({ error: message }, { status: errStatus(message) });
  }
}
