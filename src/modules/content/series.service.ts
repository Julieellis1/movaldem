import { z } from "zod";
import { and, count, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { bibleStudies, series, sermons, sundaySchoolLessons } from "@/db/schema";
import { normalizeSlug } from "./tag.service";

// PRD 05 §6: series are typed (sermon | bible_study | sunday_school) with
// title, slug, description, cover image, optional date range and sort order.
// Slugs are unique per (type, slug) — the same slug may exist under different
// types. Follows Phase 1 service patterns: Zod server-side validation, writes
// inside a transaction with an AuditService row (CMS-08).

export const seriesTypes = ["sermon", "bible_study", "sunday_school"] as const;
export type SeriesType = (typeof seriesTypes)[number];
export type SeriesRow = typeof series.$inferSelect;

export class DuplicateSlugError extends Error {}
export class SeriesNotFoundError extends Error {}

export type AuditOpts = {
  actorId?: string | null;
  actorRole?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type AuditPayload = {
  action: string;
  entityType: string;
  entityId: string | null;
  auditId: string | null;
};

const slugSchema = z
  .string()
  .trim()
  .min(1, "slug is required")
  .max(160, "slug must be 160 characters or fewer")
  .transform((s) => normalizeSlug(s))
  .refine((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s), {
    message: "slug must be lowercase letters, numbers and hyphens",
  });

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

const seriesFieldDefs = {
  type: z.enum(seriesTypes),
  title: z.string().trim().min(1, "title is required").max(200),
  slug: slugSchema,
  description: z.string().trim().max(5000).nullish(),
  cover_media_id: z.string().uuid("cover_media_id must be a UUID").nullish(),
  start_date: dateSchema.nullish(),
  end_date: dateSchema.nullish(),
  sort_order: z.number().int().default(0),
};

function dateRangeOk(d: { start_date?: string | null; end_date?: string | null }): boolean {
  return !d.start_date || !d.end_date || d.end_date >= d.start_date;
}

export const createSeriesSchema = z.object(seriesFieldDefs).refine(dateRangeOk, {
  message: "end_date must be on or after start_date",
  path: ["end_date"],
});

export type CreateSeriesInput = z.input<typeof createSeriesSchema>;

// NOTE: zod-4 `.partial()` rejects object schemas carrying refinements, so the
// update schema is declared field-by-field with the same date-range rule.
export const updateSeriesSchema = z
  .object({
    type: seriesFieldDefs.type.optional(),
    title: z.string().trim().min(1, "title is required").max(200).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(5000).nullish(),
    cover_media_id: z.string().uuid("cover_media_id must be a UUID").nullish(),
    start_date: dateSchema.nullish(),
    end_date: dateSchema.nullish(),
    sort_order: z.number().int().optional(),
  })
  .refine(dateRangeOk, {
    message: "end_date must be on or after start_date",
    path: ["end_date"],
  });
export type UpdateSeriesInput = z.input<typeof updateSeriesSchema>;

function auditFields(opts: AuditOpts) {
  return {
    actor_user_id: opts.actorId ?? null,
    actor_role: opts.actorRole ?? null,
    ip: opts.ip ?? null,
    user_agent: opts.userAgent ?? null,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "23505";
}

function duplicateMessage(type: string, slug: string): string {
  return `duplicate slug "${slug}" for series type "${type}"`;
}

export async function createSeries(
  input: CreateSeriesInput,
  opts: AuditOpts = {},
): Promise<{ series: SeriesRow; audit: AuditPayload }> {
  const data = createSeriesSchema.parse(input);
  const [existing] = await db
    .select({ id: series.id })
    .from(series)
    .where(and(eq(series.type, data.type), eq(series.slug, data.slug)));
  if (existing) throw new DuplicateSlugError(duplicateMessage(data.type, data.slug));

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(series)
        .values({
          type: data.type,
          title: data.title,
          slug: data.slug,
          description: data.description ?? null,
          cover_media_id: data.cover_media_id ?? null,
          start_date: data.start_date ?? null,
          end_date: data.end_date ?? null,
          sort_order: data.sort_order,
        })
        .returning();
      const auditId = await auditLog(tx, {
        ...auditFields(opts),
        action: "series.create",
        entity_type: "series",
        entity_id: row.id,
        changes: { after: data },
      });
      return {
        series: row,
        audit: { action: "series.create", entityType: "series", entityId: row.id, auditId },
      };
    });
  } catch (err) {
    // Race guard: the pre-check above can lose to a concurrent insert.
    if (isUniqueViolation(err)) throw new DuplicateSlugError(duplicateMessage(data.type, data.slug));
    throw err;
  }
}

export async function updateSeries(
  id: string,
  patch: UpdateSeriesInput,
  opts: AuditOpts = {},
): Promise<{ series: SeriesRow; audit: AuditPayload }> {
  const data = updateSeriesSchema.parse(patch);
  if (Object.keys(data).length === 0) throw new Error("no fields to update");

  const [current] = await db.select().from(series).where(eq(series.id, id));
  if (!current) throw new SeriesNotFoundError(`series ${id} not found`);

  const nextType = data.type ?? current.type;
  const nextSlug = data.slug ?? current.slug;
  if (nextType !== current.type || nextSlug !== current.slug) {
    const [clash] = await db
      .select({ id: series.id })
      .from(series)
      .where(and(eq(series.type, nextType), eq(series.slug, nextSlug), ne(series.id, id)));
    if (clash) throw new DuplicateSlugError(duplicateMessage(nextType, nextSlug));
  }

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .update(series)
        .set({
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.slug !== undefined ? { slug: data.slug } : {}),
          ...(data.description !== undefined ? { description: data.description ?? null } : {}),
          ...(data.cover_media_id !== undefined ? { cover_media_id: data.cover_media_id ?? null } : {}),
          ...(data.start_date !== undefined ? { start_date: data.start_date ?? null } : {}),
          ...(data.end_date !== undefined ? { end_date: data.end_date ?? null } : {}),
          ...(data.sort_order !== undefined ? { sort_order: data.sort_order } : {}),
          updated_at: new Date(),
        })
        .where(eq(series.id, id))
        .returning();
      const auditId = await auditLog(tx, {
        ...auditFields(opts),
        action: "series.update",
        entity_type: "series",
        entity_id: id,
        changes: { before: current, after: data },
      });
      return {
        series: row,
        audit: { action: "series.update", entityType: "series", entityId: id, auditId },
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateSlugError(duplicateMessage(nextType, nextSlug));
    throw err;
  }
}

export type SeriesUsage = {
  sermons: number;
  bibleStudies: number;
  sundaySchoolLessons: number;
};

async function countRefs(
  table: typeof sermons | typeof bibleStudies | typeof sundaySchoolLessons,
  id: string,
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(table)
    .where(and(eq(table.series_id, id), isNull(table.deleted_at)));
  return row?.c ?? 0;
}

export async function getSeriesUsage(id: string): Promise<SeriesUsage> {
  const [sermonsN, bibleStudiesN, sundaySchoolLessonsN] = await Promise.all([
    countRefs(sermons, id),
    countRefs(bibleStudies, id),
    countRefs(sundaySchoolLessons, id),
  ]);
  return { sermons: sermonsN, bibleStudies: bibleStudiesN, sundaySchoolLessons: sundaySchoolLessonsN };
}

// Guarded delete (CMS-05): a series referenced by live (non-deleted) teaching
// content cannot be removed — the caller gets the usage breakdown to show a
// reassign/archive prompt instead. Returns `deleted: false` (no throw) when
// blocked so admin UI can render the usage list.
export async function deleteSeriesGuarded(
  id: string,
  opts: AuditOpts = {},
): Promise<{ deleted: boolean; usage: SeriesUsage; audit: AuditPayload | null }> {
  const usage = await getSeriesUsage(id);
  if (usage.sermons + usage.bibleStudies + usage.sundaySchoolLessons > 0) {
    return { deleted: false, usage, audit: null };
  }
  const auditId = await db.transaction(async (tx) => {
    const [row] = await tx.select({ id: series.id }).from(series).where(eq(series.id, id));
    if (!row) throw new SeriesNotFoundError(`series ${id} not found`);
    await tx.delete(series).where(eq(series.id, id));
    return auditLog(tx, {
      ...auditFields(opts),
      action: "series.delete",
      entity_type: "series",
      entity_id: id,
    });
  });
  return {
    deleted: true,
    usage,
    audit: { action: "series.delete", entityType: "series", entityId: id, auditId },
  };
}

export async function getSeries(id: string): Promise<SeriesRow | null> {
  const [row] = await db.select().from(series).where(eq(series.id, id));
  return row ?? null;
}
