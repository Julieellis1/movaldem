import type { DB } from "@/db/client";
import { sermons, bibleStudies, sundaySchoolLessons, redirects } from "@/db/schema";
import { eq, ne, and } from "drizzle-orm";

export type ContentType = "sermon" | "bible_study" | "sunday_school";
export type ContentStatus = "draft" | "review" | "scheduled" | "published" | "archived";

export const CONTENT_STATUSES: readonly ContentStatus[] = [
  "draft",
  "review",
  "scheduled",
  "published",
  "archived",
];

// CMS-01: status machine.
const TRANSITIONS: Record<ContentStatus, readonly ContentStatus[]> = {
  draft: ["review", "scheduled", "published", "archived"],
  review: ["draft", "scheduled", "published", "archived"],
  scheduled: ["published", "draft", "review", "archived"],
  published: ["draft", "archived"],
  archived: ["draft"],
};

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ContentStatus, to: ContentStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid status transition: ${from} -> ${to} (CMS-01)`);
  }
}

// CMS-04: content.require_review gate (see PRD 03).
// When requireReview is on, Content Managers may only move content up to
// `review`; publishing requires Admin or Super Admin. When off (default),
// Content Managers can publish directly.
export function canPublish(role: string, requireReview: boolean): boolean {
  const r = (role ?? "").toLowerCase();
  if (r === "admin" || r === "super_admin") return true;
  if (r === "content_manager") return !requireReview;
  return false;
}

export function buildSlug(title: string): string {
  const base = (title ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
  return base || "untitled";
}

const TYPE_PATH: Record<ContentType, string> = {
  sermon: "sermons",
  bible_study: "bible-study",
  sunday_school: "sunday-school",
};

export function contentPath(type: ContentType, slug: string): string {
  return `/${TYPE_PATH[type]}/${slug}`;
}

function tableFor(type: ContentType) {
  if (type === "sermon") return sermons;
  if (type === "bible_study") return bibleStudies;
  return sundaySchoolLessons;
}

// CMS-06: slugs unique per type.
export async function ensureUniqueSlug(
  database: DB,
  type: ContentType,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const table = tableFor(type);
  const base = buildSlug(desired) || "untitled";
  let candidate = base;
  for (let i = 2; i < 200; i++) {
    const rows = excludeId
      ? await database
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.slug, candidate), ne(table.id, excludeId)))
      : await database.select({ id: table.id }).from(table).where(eq(table.slug, candidate));
    if (rows.length === 0) return candidate;
    candidate = `${base}-${i}`;
  }
  throw new Error(`Could not generate a unique slug for ${base} (CMS-06)`);
}

// CMS-06: slug change on a published item creates a 301 redirect row.
export async function saveSlugWithRedirect(
  database: DB,
  type: ContentType,
  id: string,
  oldSlug: string | null,
  desiredSlug: string,
  wasPublished: boolean,
): Promise<string> {
  const finalSlug = await ensureUniqueSlug(database, type, desiredSlug, id);
  if (wasPublished && oldSlug && oldSlug !== finalSlug) {
    await database
      .insert(redirects)
      .values({
        from_path: contentPath(type, oldSlug),
        to_path: contentPath(type, finalSlug),
        status_code: 301,
      })
      .onConflictDoNothing({ target: redirects.from_path });
  }
  return finalSlug;
}

export type VisibilityRow = {
  status: string;
  published_at: Date | string | null;
  deleted_at?: Date | string | null;
};

// CMS-03: public queries only return status=published AND published_at<=now,
// excluding soft-deleted rows (CMS-05).
export function isPubliclyVisible(row: VisibilityRow, now: Date = new Date()): boolean {
  if (row.status !== "published") return false;
  if (row.deleted_at) return false;
  if (!row.published_at) return false;
  const publishedAt = row.published_at instanceof Date ? row.published_at : new Date(row.published_at);
  return publishedAt.getTime() <= now.getTime();
}
