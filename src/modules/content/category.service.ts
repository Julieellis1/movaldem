import { z } from "zod";
import { and, count, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { bibleStudies, contentCategories, sermons } from "@/db/schema";
import { normalizeSlug } from "./tag.service";

// PRD 05 §6: content categories are typed by content (sermon | bible_study)
// with name, slug, sort order and an active flag. A category in use cannot be
// deleted (archive/reassign instead). Follows Phase 1 service patterns: Zod
// server-side validation, writes inside a transaction with an AuditService row
// (CMS-08).

export const categoryTypes = ["sermon", "bible_study"] as const;
export type CategoryType = (typeof categoryTypes)[number];
export type CategoryRow = typeof contentCategories.$inferSelect;

export class DuplicateCategorySlugError extends Error {}
export class CategoryNotFoundError extends Error {}

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

export const createCategorySchema = z.object({
  type: z.enum(categoryTypes),
  name: z.string().trim().min(1, "name is required").max(120),
  slug: slugSchema,
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;

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
  return `duplicate slug "${slug}" for category type "${type}"`;
}

export async function createCategory(
  input: CreateCategoryInput,
  opts: AuditOpts = {},
): Promise<{ category: CategoryRow; audit: AuditPayload }> {
  const data = createCategorySchema.parse(input);
  const [existing] = await db
    .select({ id: contentCategories.id })
    .from(contentCategories)
    .where(and(eq(contentCategories.type, data.type), eq(contentCategories.slug, data.slug)));
  if (existing) throw new DuplicateCategorySlugError(duplicateMessage(data.type, data.slug));

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contentCategories)
        .values({
          type: data.type,
          name: data.name,
          slug: data.slug,
          sort_order: data.sort_order,
          is_active: data.is_active,
        })
        .returning();
      const auditId = await auditLog(tx, {
        ...auditFields(opts),
        action: "category.create",
        entity_type: "content_categories",
        entity_id: row.id,
        changes: { after: data },
      });
      return {
        category: row,
        audit: { action: "category.create", entityType: "content_categories", entityId: row.id, auditId },
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateCategorySlugError(duplicateMessage(data.type, data.slug));
    throw err;
  }
}

export async function updateCategory(
  id: string,
  patch: UpdateCategoryInput,
  opts: AuditOpts = {},
): Promise<{ category: CategoryRow; audit: AuditPayload }> {
  const data = updateCategorySchema.parse(patch);
  if (Object.keys(data).length === 0) throw new Error("no fields to update");

  const [current] = await db.select().from(contentCategories).where(eq(contentCategories.id, id));
  if (!current) throw new CategoryNotFoundError(`category ${id} not found`);

  const nextType = data.type ?? current.type;
  const nextSlug = data.slug ?? current.slug;
  if (nextType !== current.type || nextSlug !== current.slug) {
    const [clash] = await db
      .select({ id: contentCategories.id })
      .from(contentCategories)
      .where(
        and(
          eq(contentCategories.type, nextType),
          eq(contentCategories.slug, nextSlug),
          ne(contentCategories.id, id),
        ),
      );
    if (clash) throw new DuplicateCategorySlugError(duplicateMessage(nextType, nextSlug));
  }

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .update(contentCategories)
        .set({
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.slug !== undefined ? { slug: data.slug } : {}),
          ...(data.sort_order !== undefined ? { sort_order: data.sort_order } : {}),
          ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
        })
        .where(eq(contentCategories.id, id))
        .returning();
      const auditId = await auditLog(tx, {
        ...auditFields(opts),
        action: "category.update",
        entity_type: "content_categories",
        entity_id: id,
        changes: { before: current, after: data },
      });
      return {
        category: row,
        audit: { action: "category.update", entityType: "content_categories", entityId: id, auditId },
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateCategorySlugError(duplicateMessage(nextType, nextSlug));
    throw err;
  }
}

export type CategoryUsage = {
  sermons: number;
  bibleStudies: number;
};

export async function getCategoryUsage(id: string): Promise<CategoryUsage> {
  const [[s], [b]] = await Promise.all([
    db
      .select({ c: count() })
      .from(sermons)
      .where(and(eq(sermons.category_id, id), isNull(sermons.deleted_at))),
    db
      .select({ c: count() })
      .from(bibleStudies)
      .where(and(eq(bibleStudies.category_id, id), isNull(bibleStudies.deleted_at))),
  ]);
  return { sermons: s?.c ?? 0, bibleStudies: b?.c ?? 0 };
}

// Guarded delete (PRD 05 §6): a category in use cannot be deleted — the caller
// gets the usage breakdown to offer archive/reassign instead. Returns
// `deleted: false` (no throw) when blocked.
export async function deleteCategoryGuarded(
  id: string,
  opts: AuditOpts = {},
): Promise<{ deleted: boolean; usage: CategoryUsage; audit: AuditPayload | null }> {
  const usage = await getCategoryUsage(id);
  if (usage.sermons + usage.bibleStudies > 0) {
    return { deleted: false, usage, audit: null };
  }
  const auditId = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: contentCategories.id })
      .from(contentCategories)
      .where(eq(contentCategories.id, id));
    if (!row) throw new CategoryNotFoundError(`category ${id} not found`);
    await tx.delete(contentCategories).where(eq(contentCategories.id, id));
    return auditLog(tx, {
      ...auditFields(opts),
      action: "category.delete",
      entity_type: "content_categories",
      entity_id: id,
    });
  });
  return {
    deleted: true,
    usage,
    audit: { action: "category.delete", entityType: "content_categories", entityId: id, auditId },
  };
}

export async function getCategory(id: string): Promise<CategoryRow | null> {
  const [row] = await db.select().from(contentCategories).where(eq(contentCategories.id, id));
  return row ?? null;
}
