import { db, type DB } from "@/db/client";
import {
  sermons,
  bibleStudies,
  sundaySchoolLessons,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { getSetting } from "@/modules/platform/settings/settings.service";
import {
  assertTransition,
  buildSlug,
  canPublish,
  ensureUniqueSlug,
  saveSlugWithRedirect,
  type ContentStatus,
  type ContentType,
} from "./lifecycle";

export type { ContentType, ContentStatus };
export type Actor = { role: string; userId?: string | null };

export type ContentInput = Record<string, unknown>;

const TABLE_BY_TYPE = {
  sermon: sermons,
  bible_study: bibleStudies,
  sunday_school: sundaySchoolLessons,
} as const;

const ENTITY_BY_TYPE: Record<ContentType, string> = {
  sermon: "sermons",
  bible_study: "bible_studies",
  sunday_school: "sunday_school_lessons",
};

async function getRequireReview(database: DB, override?: boolean): Promise<boolean> {
  if (override !== undefined) return override;
  const v = await getSetting<unknown>(database, "content.require_review", false);
  return v === true || v === "true" || v === "on" || v === 1 || v === "1";
}

function isAdminRole(role: string): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "admin" || r === "super_admin";
}

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" ? v.trim().length > 0 : v !== null && v !== undefined && v !== "";
}

function validateForType(type: ContentType, row: ContentInput, opts?: { partial?: boolean }): void {
  const fail = (msg: string): never => {
    throw new Error(msg);
  };
  if (!opts?.partial && !nonEmpty(row.title)) fail("title is required");
  if (type === "sermon") {
    if (!opts?.partial || row.preacher !== undefined) {
      if (!nonEmpty(row.preacher)) fail("preacher is required (CMS sermon)");
    }
    if (!opts?.partial || row.sermon_date !== undefined) {
      if (!nonEmpty(row.sermon_date)) fail("sermon_date is required (CMS sermon)");
    }
  }
  if (type === "bible_study") {
    if (!opts?.partial || row.teacher !== undefined) {
      if (!nonEmpty(row.teacher)) fail("teacher is required (CMS bible study)");
    }
    if (!opts?.partial || row.study_date !== undefined) {
      if (!nonEmpty(row.study_date)) fail("study_date is required (CMS bible study)");
    }
  }
  if (type === "sunday_school") {
    for (const f of ["series_id", "lesson_number", "lesson_date", "topic"] as const) {
      if (!opts?.partial || row[f] !== undefined) {
        if (!nonEmpty(row[f])) fail(`${f} is required (CMS sunday school)`);
      }
    }
  }
}

function toDbError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (/sunday_school_series_lesson_unique|duplicate key|unique constraint/i.test(msg)) {
    throw new Error("lesson_number already exists in this series (duplicate lesson_number)");
  }
  if (/unique|duplicate/i.test(msg) && /slug/i.test(msg)) {
    throw new Error("slug already exists for this content type (duplicate slug)");
  }
  throw err instanceof Error ? err : new Error(msg);
}

type RowOf<T extends ContentType> = T extends "sermon"
  ? typeof sermons.$inferSelect
  : T extends "bible_study"
    ? typeof bibleStudies.$inferSelect
    : typeof sundaySchoolLessons.$inferSelect;

async function fetchRow(type: ContentType, id: string) {
  const table = TABLE_BY_TYPE[type];
  const [row] = await db.select().from(table).where(eq(table.id, id));
  if (!row) throw new Error(`${ENTITY_BY_TYPE[type]} not found: ${id}`);
  return row as Record<string, unknown> & { id: string; slug: string; status: ContentStatus };
}

function pickWritable(input: ContentInput): Record<string, unknown> {
  const allowed = [
    "title", "slug", "description", "featured_media_id", "audio_media_id",
    "video_media_id", "document_media_id", "download_enabled", "series_id",
    "category_id", "is_featured", "seo_title", "seo_description", "og_media_id",
    "preacher", "sermon_date", "scripture_reference",
    "teacher", "study_date", "lesson_number",
    "lesson_date", "topic", "memory_verse", "introduction",
  ];
  const out: Record<string, unknown> = {};
  for (const k of allowed) {
    if (input[k] !== undefined) out[k] = input[k] === "" ? null : input[k];
  }
  return out;
}

async function writeAudit(
  tx: Parameters<Parameters<DB["transaction"]>[0]>[0],
  actor: Actor,
  action: string,
  type: ContentType,
  id: string,
  changes: unknown,
) {
  await auditLog(tx, {
    actor_user_id: actor.userId ?? null,
    actor_role: actor.role,
    action,
    entity_type: ENTITY_BY_TYPE[type],
    entity_id: id,
    changes,
  });
}

export async function createContent<T extends ContentType>(
  type: T,
  input: ContentInput,
  actor: Actor,
): Promise<RowOf<T>> {
  validateForType(type, input);
  const table = TABLE_BY_TYPE[type];
  const desired = input.slug ? buildSlug(String(input.slug)) : buildSlug(String(input.title));
  try {
    const created = await db.transaction(async (tx) => {
      const slug = await ensureUniqueSlug(tx as unknown as DB, type, desired);
      const writable = pickWritable(input);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (await (tx.insert as any)(table).values({
        ...writable,
        slug,
        status: "draft",
        created_by: actor.userId ?? null,
        updated_by: actor.userId ?? null,
      }).returning()) as { id: string }[];
      const [row] = rows;
      await writeAudit(tx, actor, `${type}.create`, type, (row as { id: string }).id, {
        type,
        input: writable,
        slug,
      });
      return row;
    });
    return created as RowOf<T>;
  } catch (err) {
    return toDbError(err);
  }
}

export async function updateContent<T extends ContentType>(
  type: T,
  id: string,
  input: ContentInput,
  actor: Actor,
): Promise<RowOf<T>> {
  const table = TABLE_BY_TYPE[type];
  try {
    const updated = await db.transaction(async (tx) => {
      const tdb = tx as unknown as DB;
      const old = (await fetchRowIn(tx as never, type, id)) as Record<string, unknown> & {
        id: string; slug: string; status: ContentStatus;
      };
      const writable = pickWritable(input);
      const merged = { ...old, ...writable };
      validateForType(type, merged, { partial: false });
      let slug = old.slug;
      if (writable.slug !== undefined && writable.slug !== null) {
        const desired = buildSlug(String(writable.slug));
        if (desired !== old.slug) {
          slug = await saveSlugWithRedirect(tdb, type, id, old.slug, desired, old.status === "published");
        }
      } else if (writable.title !== undefined && String(writable.title) !== String(old.title)) {
        const desired = buildSlug(String(writable.title));
        if (desired !== old.slug) {
          slug = await saveSlugWithRedirect(tdb, type, id, old.slug, desired, old.status === "published");
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [row] = await (tx.update as any)(table).set({
        ...writable,
        slug,
        updated_by: actor.userId ?? null,
        updated_at: new Date(),
      }).where(eq((table as { id: unknown }).id as never, id as never)).returning();
      if (!row) throw new Error(`${ENTITY_BY_TYPE[type]} not found: ${id}`);
      await writeAudit(tx, actor, `${type}.update`, type, id, { before: { slug: old.slug }, after: { slug, ...writable } });
      return row;
    });
    return updated as RowOf<T>;
  } catch (err) {
    return toDbError(err);
  }
}

async function fetchRowIn(tx: never, type: ContentType, id: string) {
  // Transaction-scoped read so the update + audit stay atomic.
  const t = tx as unknown as DB;
  const table = TABLE_BY_TYPE[type];
  const [row] = await t.select().from(table).where(eq(table.id, id));
  if (!row) throw new Error(`${ENTITY_BY_TYPE[type]} not found: ${id}`);
  return row;
}

async function setStatus<T extends ContentType>(
  type: T,
  id: string,
  to: ContentStatus,
  actor: Actor,
  patch: Record<string, unknown>,
  action: string,
): Promise<RowOf<T>> {
  const table = TABLE_BY_TYPE[type];
  const updated = await db.transaction(async (tx) => {
    const old = (await fetchRowIn(tx as never, type, id)) as { status: ContentStatus };
    assertTransition(old.status, to);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await (tx.update as any)(table).set({
      ...patch,
      status: to,
      updated_by: actor.userId ?? null,
      updated_at: new Date(),
    }).where(eq((table as { id: unknown }).id as never, id as never)).returning();
    await writeAudit(tx, actor, action, type, id, { from: old.status, to, ...patch });
    return row;
  });
  return updated as RowOf<T>;
}

export async function publishNow<T extends ContentType>(
  type: T,
  id: string,
  actor: Actor,
  opts?: { requireReview?: boolean; now?: Date },
): Promise<RowOf<T>> {
  const requireReview = await getRequireReview(db, opts?.requireReview);
  if (!canPublish(actor.role, requireReview)) {
    throw new Error("Content Manager cannot publish when content.require_review is on (CMS-04)");
  }
  const row = await fetchRow(type, id);
  validateForType(type, row as ContentInput);
  return setStatus(type, id, "published", actor, { published_at: opts?.now ?? new Date() }, `${type}.publish`);
}

export async function schedule<T extends ContentType>(
  type: T,
  id: string,
  publishedAt: Date,
  actor: Actor,
  opts?: { requireReview?: boolean },
): Promise<RowOf<T>> {
  const requireReview = await getRequireReview(db, opts?.requireReview);
  if (!canPublish(actor.role, requireReview)) {
    throw new Error("Content Manager cannot schedule when content.require_review is on (CMS-04)");
  }
  if (!(publishedAt instanceof Date) || Number.isNaN(publishedAt.getTime())) {
    throw new Error("publishedAt must be a valid Date (CMS-02)");
  }
  if (publishedAt.getTime() <= Date.now()) {
    throw new Error("publishedAt must be in the future (CMS-02)");
  }
  const row = await fetchRow(type, id);
  validateForType(type, row as ContentInput);
  return setStatus(type, id, "scheduled", actor, { published_at: publishedAt }, `${type}.schedule`);
}

export async function unpublish<T extends ContentType>(
  type: T,
  id: string,
  actor: Actor,
): Promise<RowOf<T>> {
  return setStatus(type, id, "draft", actor, {}, `${type}.unpublish`);
}

export async function archive<T extends ContentType>(
  type: T,
  id: string,
  actor: Actor,
): Promise<RowOf<T>> {
  return setStatus(type, id, "archived", actor, {}, `${type}.archive`);
}

export async function softDelete<T extends ContentType>(
  type: T,
  id: string,
  actor: Actor,
): Promise<RowOf<T>> {
  const table = TABLE_BY_TYPE[type];
  const deleted = await db.transaction(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await (tx.update as any)(table).set({
      deleted_at: new Date(),
      updated_by: actor.userId ?? null,
      updated_at: new Date(),
    }).where(eq((table as { id: unknown }).id as never, id as never)).returning();
    if (!row) throw new Error(`${ENTITY_BY_TYPE[type]} not found: ${id}`);
    await writeAudit(tx, actor, `${type}.delete`, type, id, { deleted: true });
    return row;
  });
  return deleted as RowOf<T>;
}

export async function restore<T extends ContentType>(
  type: T,
  id: string,
  actor: Actor,
): Promise<RowOf<T>> {
  // CMS-05: only Admin / Super Admin can restore soft-deleted items.
  if (!isAdminRole(actor.role)) {
    throw new Error("Only Admin or Super Admin can restore deleted content (CMS-05)");
  }
  const table = TABLE_BY_TYPE[type];
  const restored = await db.transaction(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await (tx.update as any)(table).set({
      deleted_at: null,
      updated_by: actor.userId ?? null,
      updated_at: new Date(),
    }).where(eq((table as { id: unknown }).id as never, id as never)).returning();
    if (!row) throw new Error(`${ENTITY_BY_TYPE[type]} not found: ${id}`);
    await writeAudit(tx, actor, `${type}.restore`, type, id, { restored: true });
    return row;
  });
  return restored as RowOf<T>;
}
