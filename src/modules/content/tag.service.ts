import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { auditLogs, taggables, tags } from "@/db/schema";

// PRD 05 §6: free-form tags shared across content types, created inline while
// editing content. Taggable types mirror the three teaching tables.

export const taggableTypes = ["sermon", "bible_study", "sunday_school_lesson"] as const;
export type TaggableType = (typeof taggableTypes)[number];
export type TagRow = typeof tags.$inferSelect;

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

// Shared slug normalizer (also used by series/category services so every
// taxonomy type applies identical rules): lowercase, spaces/underscores to
// hyphens, strip anything outside [a-z0-9-], collapse repeats.
export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

const taggableTypeSchema = z.enum(taggableTypes);
const taggableIdSchema = z.string().uuid("taggableId must be a UUID");

const tagNameSchema = z
  .string()
  .trim()
  .min(1, "tag name is required")
  .max(80, "tag name must be 80 characters or fewer")
  .transform((s) => normalizeTagName(s))
  .refine((s) => normalizeSlug(s).length > 0, {
    message: "tag name must contain at least one letter or number",
  });

function auditFields(opts: AuditOpts) {
  return {
    actor_user_id: opts.actorId ?? null,
    actor_role: opts.actorRole ?? null,
    ip: opts.ip ?? null,
    user_agent: opts.userAgent ?? null,
  };
}

// Find existing tags by normalized slug, creating the missing ones, and
// return the full set. Names that differ only by case/spacing resolve to one
// tag (e.g. "Faith", "faith " and "FAITH" all attach `faith`).
export async function findOrCreateTags(names: string[], opts: AuditOpts = {}): Promise<TagRow[]> {
  const parsed = z.array(tagNameSchema).min(1, "at least one tag name is required").parse(names);
  const bySlug = new Map<string, string>();
  for (const name of parsed) {
    const slug = normalizeSlug(name);
    if (!bySlug.has(slug)) bySlug.set(slug, name);
  }
  const slugs = [...bySlug.keys()];

  return db.transaction(async (tx) => {
    const existing = await tx.select().from(tags).where(inArray(tags.slug, slugs));
    const seen = new Set(existing.map((t) => t.slug));
    const missing = slugs.filter((s) => !seen.has(s));
    let created: TagRow[] = [];
    if (missing.length > 0) {
      created = await tx
        .insert(tags)
        .values(missing.map((slug) => ({ name: bySlug.get(slug)!, slug })))
        .returning();
      await auditLog(tx, {
        ...auditFields(opts),
        action: "tag.create",
        entity_type: "tags",
        changes: { names: created.map((t) => t.name) },
      });
    }
    const bySlugRow = new Map([...existing, ...created].map((t) => [t.slug, t]));
    return slugs.map((s) => bySlugRow.get(s)!);
  });
}

// Attach tags to a content item, creating tags inline (PRD 05 §6). Idempotent:
// re-attaching an already-attached tag is a no-op (MED-style unique guard).
export async function attachTags(
  taggableType: TaggableType,
  taggableId: string,
  names: string[],
  opts: AuditOpts = {},
): Promise<{ tags: TagRow[]; attached: number; audit: AuditPayload }> {
  const parsed = z
    .object({
      taggableType: taggableTypeSchema,
      taggableId: taggableIdSchema,
      names: z.array(tagNameSchema).min(1, "at least one tag name is required"),
    })
    .parse({ taggableType, taggableId, names });

  const found = await findOrCreateTags(parsed.names, opts);
  const auditId = await db.transaction(async (tx) => {
    const inserted =
      found.length > 0
        ? await tx
            .insert(taggables)
            .values(
              found.map((t) => ({
                tag_id: t.id,
                taggable_type: parsed.taggableType,
                taggable_id: parsed.taggableId,
              })),
            )
            .onConflictDoNothing()
            .returning({ id: taggables.id })
        : [];
    return auditLog(tx, {
      ...auditFields(opts),
      action: "tag.attach",
      entity_type: "taggables",
      entity_id: parsed.taggableId,
      changes: {
        taggable_type: parsed.taggableType,
        taggable_id: parsed.taggableId,
        tag_ids: found.map((t) => t.id),
        newly_attached: inserted.length,
      },
    });
  });

  const fresh = await db
    .select()
    .from(taggables)
    .where(and(eq(taggables.taggable_type, parsed.taggableType), eq(taggables.taggable_id, parsed.taggableId)));

  return {
    tags: found,
    attached: fresh.length,
    audit: { action: "tag.attach", entityType: "taggables", entityId: parsed.taggableId, auditId },
  };
}

// Detach tags from a content item. With `names` only those tags are removed;
// without it every tag on the item is removed. Returns the detached count.
export async function detachTags(
  taggableType: TaggableType,
  taggableId: string,
  names?: string[],
  opts: AuditOpts = {},
): Promise<{ detached: number; audit: AuditPayload }> {
  const parsed = z
    .object({
      taggableType: taggableTypeSchema,
      taggableId: taggableIdSchema,
      names: z.array(tagNameSchema).min(1).optional(),
    })
    .parse({ taggableType, taggableId, names });

  const { removed, auditId } = await db.transaction(async (tx) => {
    let removed: { id: string }[];
    if (parsed.names) {
      const slugs = [...new Set(parsed.names.map((n) => normalizeSlug(n)))];
      const matched = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.slug, slugs));
      removed =
        matched.length === 0
          ? []
          : await tx
        .delete(taggables)
        .where(
          and(
            eq(taggables.taggable_type, parsed.taggableType),
            eq(taggables.taggable_id, parsed.taggableId),
            inArray(
              taggables.tag_id,
              matched.map((t) => t.id),
            ),
          ),
        )
        .returning({ id: taggables.id });
    } else {
      removed = await tx
        .delete(taggables)
        .where(
          and(
            eq(taggables.taggable_type, parsed.taggableType),
            eq(taggables.taggable_id, parsed.taggableId),
          ),
        )
        .returning({ id: taggables.id });
    }
    // The audit row is written even when nothing matched, so the detach
    // attempt itself is recorded (CMS-08); callers that need strict counts
    // use `detached`.
    const auditId = await auditLog(tx, {
      ...auditFields(opts),
      action: "tag.detach",
      entity_type: "taggables",
      entity_id: parsed.taggableId,
      changes: {
        taggable_type: parsed.taggableType,
        taggable_id: parsed.taggableId,
        detached: removed.length,
      },
    });
    return { removed, auditId };
  });

  return {
    detached: removed.length,
    audit: {
      action: "tag.detach",
      entityType: "taggables",
      entityId: parsed.taggableId,
      auditId,
    },
  };
}

// Test helper: confirm an audit row exists for an entity (null when the audit
// table is unreachable — callers then fall back to the service payload).
export async function findAuditRow(entityType: string, entityId: string) {
  try {
    const [row] = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(eq(auditLogs.entity_type, entityType), eq(auditLogs.entity_id, entityId)));
    return row ?? null;
  } catch {
    return null;
  }
}
