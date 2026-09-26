import { z } from "zod";
import { and, asc, eq, isNull, lte, ne } from "drizzle-orm";
import { db, type DB } from "@/db/client";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { getSetting } from "@/modules/platform/settings/settings.service";
import { programmes, programmeSessions, redirects } from "@/db/schema";
import {
  assertTransition,
  buildSlug,
  canPublish,
  type ContentStatus,
} from "./lifecycle";

// PRD 05 §11: programmes (multi-session ministry occasions) with inline
// sessions. Follows Phase 2 `content.service.ts` conventions — Zod
// server-side validation, writes inside a transaction with an AuditService row
// (CMS-08), slug uniqueness + 301 redirect on published slug change (CMS-06),
// lifecycle transitions via `lifecycle.ts` helpers (CMS-01), and the
// `content.require_review` publish gate (CMS-04).
//
// Session dates must fall within the parent programme [start_date, end_date].
// Sessions are child rows with no `deleted_at` column, so `removeSession` is
// a hard delete (the parent programme itself uses soft delete, CMS-05).

export type Actor = { role: string; userId?: string | null };
export type ProgrammeRow = typeof programmes.$inferSelect;
export type SessionRow = typeof programmeSessions.$inferSelect;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const dateSchema = z.string().regex(DATE_RE, "date must be YYYY-MM-DD");
const timeSchema = z
  .string()
  .regex(TIME_RE, "time must be HH:MM 24-hour (Africa/Lagos wall-clock)");
const uuidNull = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().uuid("must be a UUID").nullish(),
);
const textNull = (max: number) =>
  z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().trim().max(max).nullish(),
  );

const programmeFields = {
  title: z.string().trim().min(1, "title is required").max(200),
  slug: z.string().trim().min(1).max(160).nullish(),
  description: textNull(20000),
  start_date: dateSchema,
  end_date: dateSchema,
  venue: textNull(300),
  featured_media_id: uuidNull,
  seo_title: textNull(200),
  seo_description: textNull(500),
  og_media_id: uuidNull,
};

export const createProgrammeSchema = z
  .object(programmeFields)
  .refine((d) => d.end_date >= d.start_date, {
    message: "end_date must be on or after start_date (05 §11)",
    path: ["end_date"],
  });

export type CreateProgrammeInput = z.input<typeof createProgrammeSchema>;

// NOTE: declared field-by-field (zod `.partial()` rejects schemas carrying
// refinements); the merged row is re-validated in `updateProgramme`.
export const updateProgrammeSchema = z.object({
  title: programmeFields.title.optional(),
  slug: z.string().trim().min(1).max(160).nullish(),
  description: textNull(20000),
  start_date: dateSchema.optional(),
  end_date: dateSchema.optional(),
  venue: textNull(300),
  featured_media_id: uuidNull,
  seo_title: textNull(200),
  seo_description: textNull(500),
  og_media_id: uuidNull,
});

export type UpdateProgrammeInput = z.input<typeof updateProgrammeSchema>;

const sessionFields = {
  title: z.string().trim().min(1, "title is required").max(200),
  date: dateSchema,
  start_time: z.preprocess(
    (v) => (v === "" ? null : v),
    timeSchema.nullish(),
  ),
  end_time: z.preprocess(
    (v) => (v === "" ? null : v),
    timeSchema.nullish(),
  ),
  speaker: textNull(200),
  description: textNull(10000),
  sort_order: z.number().int().min(0).optional(),
};

export const addSessionSchema = z.object(sessionFields).refine(
  (d) => {
    if (!d.start_time || !d.end_time) return true;
    return d.end_time > d.start_time;
  },
  {
    message: "end_time must be after start_time on the same day (05 §11)",
    path: ["end_time"],
  },
);

export type AddSessionInput = z.input<typeof addSessionSchema>;

// NOTE: declared field-by-field; the merged session is re-validated against
// the parent programme range in `updateSession`.
export const updateSessionSchema = z.object({
  title: sessionFields.title.optional(),
  date: dateSchema.optional(),
  start_time: z.preprocess(
    (v) => (v === "" ? null : v),
    timeSchema.nullish(),
  ),
  end_time: z.preprocess(
    (v) => (v === "" ? null : v),
    timeSchema.nullish(),
  ),
  speaker: textNull(200),
  description: textNull(10000),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdateSessionInput = z.input<typeof updateSessionSchema>;

export function programmePath(slug: string): string {
  return `/programmes/${slug}`;
}

// CMS-06: slugs unique within programmes.
async function ensureUniqueProgrammeSlug(
  database: DB,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const base = buildSlug(desired) || "untitled";
  let candidate = base;
  for (let i = 2; i < 200; i++) {
    const rows = excludeId
      ? await database
          .select({ id: programmes.id })
          .from(programmes)
          .where(and(eq(programmes.slug, candidate), ne(programmes.id, excludeId)))
      : await database
          .select({ id: programmes.id })
          .from(programmes)
          .where(eq(programmes.slug, candidate));
    if (rows.length === 0) return candidate;
    candidate = `${base}-${i}`;
  }
  throw new Error(`Could not generate a unique slug for ${base} (CMS-06)`);
}

// CMS-06: slug change on a published programme creates a 301 redirect row.
async function saveProgrammeSlugWithRedirect(
  database: DB,
  id: string,
  oldSlug: string | null,
  desiredSlug: string,
  wasPublished: boolean,
): Promise<string> {
  const finalSlug = await ensureUniqueProgrammeSlug(database, desiredSlug, id);
  if (wasPublished && oldSlug && oldSlug !== finalSlug) {
    await database
      .insert(redirects)
      .values({
        from_path: programmePath(oldSlug),
        to_path: programmePath(finalSlug),
        status_code: 301,
      })
      .onConflictDoNothing({ target: redirects.from_path });
  }
  return finalSlug;
}

async function getRequireReview(override?: boolean): Promise<boolean> {
  if (override !== undefined) return override;
  const v = await getSetting<unknown>(db, "content.require_review", false);
  return v === true || v === "true" || v === "on" || v === 1 || v === "1";
}

function isAdminRole(role: string): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "admin" || r === "super_admin";
}

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

async function writeProgrammeAudit(
  tx: Tx,
  actor: Actor,
  action: string,
  id: string,
  changes: unknown,
) {
  await auditLog(tx, {
    actor_user_id: actor.userId ?? null,
    actor_role: actor.role,
    action,
    entity_type: "programmes",
    entity_id: id,
    changes,
  });
}

async function writeSessionAudit(
  tx: Tx,
  actor: Actor,
  action: string,
  id: string,
  changes: unknown,
) {
  await auditLog(tx, {
    actor_user_id: actor.userId ?? null,
    actor_role: actor.role,
    action,
    entity_type: "programme_sessions",
    entity_id: id,
    changes,
  });
}

const WRITABLE = [
  "title",
  "description",
  "start_date",
  "end_date",
  "venue",
  "featured_media_id",
  "seo_title",
  "seo_description",
  "og_media_id",
] as const;

const SESSION_WRITABLE = [
  "title",
  "date",
  "start_time",
  "end_time",
  "speaker",
  "description",
  "sort_order",
] as const;

// 05 §11: session dates must fall within the programme date range.
function assertSessionInRange(
  programme: Pick<ProgrammeRow, "start_date" | "end_date">,
  date: string,
): void {
  if (date < programme.start_date || date > programme.end_date) {
    throw new Error(
      `session date ${date} is outside the programme range ${programme.start_date}..${programme.end_date} (05 §11)`,
    );
  }
}

export async function createProgramme(
  input: CreateProgrammeInput,
  actor: Actor,
): Promise<ProgrammeRow> {
  const data = createProgrammeSchema.parse(input);
  const desired = data.slug ? buildSlug(data.slug) : buildSlug(data.title);
  const writable: Record<string, unknown> = {};
  for (const k of WRITABLE) writable[k] = (data as Record<string, unknown>)[k] ?? null;
  const created = await db.transaction(async (tx) => {
    const slug = await ensureUniqueProgrammeSlug(tx as unknown as DB, desired);
    const [row] = await tx
      .insert(programmes)
      .values({
        ...writable,
        slug,
        status: "draft",
        created_by: actor.userId ?? null,
        updated_by: actor.userId ?? null,
      } as typeof programmes.$inferInsert)
      .returning();
    await writeProgrammeAudit(tx, actor, "programme.create", row.id, {
      after: writable,
      slug,
    });
    return row;
  });
  return created;
}

async function fetchProgrammeIn(tx: Tx, id: string) {
  const t = tx as unknown as DB;
  const [row] = await t.select().from(programmes).where(eq(programmes.id, id));
  if (!row) throw new Error(`programmes not found: ${id}`);
  return row;
}

export async function updateProgramme(
  id: string,
  input: UpdateProgrammeInput,
  actor: Actor,
): Promise<ProgrammeRow> {
  const data = updateProgrammeSchema.parse(input);
  const updated = await db.transaction(async (tx) => {
    const tdb = tx as unknown as DB;
    const old = await fetchProgrammeIn(tx, id);
    const writable: Record<string, unknown> = {};
    for (const k of WRITABLE) {
      if ((data as Record<string, unknown>)[k] !== undefined)
        writable[k] = (data as Record<string, unknown>)[k] ?? null;
    }
    const merged = { ...old, ...writable };
    if (!String(merged.title ?? "").trim()) throw new Error("title is required");
    if (String(merged.end_date) < String(merged.start_date))
      throw new Error("end_date must be on or after start_date (05 §11)");
    // Shrinking the programme range must not orphan existing sessions.
    const kids = await tdb
      .select({ id: programmeSessions.id, date: programmeSessions.date })
      .from(programmeSessions)
      .where(eq(programmeSessions.programme_id, id));
    const orphan = kids.find(
      (s) => s.date < String(merged.start_date) || s.date > String(merged.end_date),
    );
    if (orphan) {
      throw new Error(
        `cannot shrink programme range: session ${orphan.id} on ${orphan.date} would fall outside (05 §11)`,
      );
    }
    let slug = old.slug;
    if (data.slug !== undefined && data.slug !== null) {
      const desired = buildSlug(String(data.slug));
      if (desired !== old.slug) {
        slug = await saveProgrammeSlugWithRedirect(
          tdb,
          id,
          old.slug,
          desired,
          old.status === "published",
        );
      }
    } else if (
      writable.title !== undefined &&
      String(writable.title) !== String(old.title)
    ) {
      const desired = buildSlug(String(writable.title));
      if (desired !== old.slug) {
        slug = await saveProgrammeSlugWithRedirect(
          tdb,
          id,
          old.slug,
          desired,
          old.status === "published",
        );
      }
    }
    const [row] = await tx
      .update(programmes)
      .set({
        ...writable,
        slug,
        updated_by: actor.userId ?? null,
        updated_at: new Date(),
      } as Partial<typeof programmes.$inferInsert>)
      .where(eq(programmes.id, id))
      .returning();
    if (!row) throw new Error(`programmes not found: ${id}`);
    await writeProgrammeAudit(tx, actor, "programme.update", id, {
      before: { slug: old.slug },
      after: { slug, ...writable },
    });
    return row;
  });
  return updated;
}

async function fetchProgrammeRow(id: string) {
  const [row] = await db.select().from(programmes).where(eq(programmes.id, id));
  if (!row) throw new Error(`programmes not found: ${id}`);
  return row;
}

async function setProgrammeStatus(
  id: string,
  to: ContentStatus,
  actor: Actor,
  patch: Partial<typeof programmes.$inferInsert>,
  action: string,
): Promise<ProgrammeRow> {
  const updated = await db.transaction(async (tx) => {
    const old = await fetchProgrammeIn(tx, id);
    assertTransition(old.status as ContentStatus, to);
    const [row] = await tx
      .update(programmes)
      .set({
        ...patch,
        status: to,
        updated_by: actor.userId ?? null,
        updated_at: new Date(),
      })
      .where(eq(programmes.id, id))
      .returning();
    await writeProgrammeAudit(tx, actor, action, id, {
      from: old.status,
      to,
      ...patch,
    });
    return row;
  });
  return updated;
}

function assertProgrammePublishable(row: ProgrammeRow): void {
  if (!String(row.title ?? "").trim()) throw new Error("title is required");
  if (row.end_date < row.start_date)
    throw new Error("end_date must be on or after start_date (05 §11)");
}

export async function publishProgramme(
  id: string,
  actor: Actor,
  opts?: { requireReview?: boolean; now?: Date },
): Promise<ProgrammeRow> {
  const requireReview = await getRequireReview(opts?.requireReview);
  if (!canPublish(actor.role, requireReview)) {
    throw new Error(
      "Content Manager cannot publish when content.require_review is on (CMS-04)",
    );
  }
  const row = await fetchProgrammeRow(id);
  assertProgrammePublishable(row);
  return setProgrammeStatus(
    id,
    "published",
    actor,
    { published_at: opts?.now ?? new Date() },
    "programme.publish",
  );
}

// Alias matching the plan's lifecycle naming.
export const publishNow = publishProgramme;

export async function scheduleProgramme(
  id: string,
  publishedAt: Date,
  actor: Actor,
  opts?: { requireReview?: boolean },
): Promise<ProgrammeRow> {
  const requireReview = await getRequireReview(opts?.requireReview);
  if (!canPublish(actor.role, requireReview)) {
    throw new Error(
      "Content Manager cannot schedule when content.require_review is on (CMS-04)",
    );
  }
  if (!(publishedAt instanceof Date) || Number.isNaN(publishedAt.getTime())) {
    throw new Error("publishedAt must be a valid Date (CMS-02)");
  }
  if (publishedAt.getTime() <= Date.now()) {
    throw new Error("publishedAt must be in the future (CMS-02)");
  }
  const row = await fetchProgrammeRow(id);
  assertProgrammePublishable(row);
  return setProgrammeStatus(
    id,
    "scheduled",
    actor,
    { published_at: publishedAt },
    "programme.schedule",
  );
}

// Alias matching the plan's `schedule` name.
export const schedule = scheduleProgramme;

export async function unpublishProgramme(id: string, actor: Actor): Promise<ProgrammeRow> {
  return setProgrammeStatus(id, "draft", actor, {}, "programme.unpublish");
}

// Alias matching the plan's `unpublish` name.
export const unpublish = unpublishProgramme;

export async function archiveProgramme(id: string, actor: Actor): Promise<ProgrammeRow> {
  return setProgrammeStatus(id, "archived", actor, {}, "programme.archive");
}

// Alias matching the plan's `archive` name.
export const archive = archiveProgramme;

export async function softDeleteProgramme(id: string, actor: Actor): Promise<ProgrammeRow> {
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(programmes)
      .set({
        deleted_at: new Date(),
        updated_by: actor.userId ?? null,
        updated_at: new Date(),
      })
      .where(eq(programmes.id, id))
      .returning();
    if (!row) throw new Error(`programmes not found: ${id}`);
    await writeProgrammeAudit(tx, actor, "programme.delete", id, { deleted: true });
    return row;
  });
  return deleted;
}

// Alias matching the plan's `softDelete` name.
export const softDelete = softDeleteProgramme;

export async function restoreProgramme(id: string, actor: Actor): Promise<ProgrammeRow> {
  // CMS-05: only Admin / Super Admin can restore soft-deleted items.
  if (!isAdminRole(actor.role)) {
    throw new Error("Only Admin or Super Admin can restore deleted content (CMS-05)");
  }
  const restored = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(programmes)
      .set({
        deleted_at: null,
        updated_by: actor.userId ?? null,
        updated_at: new Date(),
      })
      .where(eq(programmes.id, id))
      .returning();
    if (!row) throw new Error(`programmes not found: ${id}`);
    await writeProgrammeAudit(tx, actor, "programme.restore", id, { restored: true });
    return row;
  });
  return restored;
}

// Alias matching the plan's `restore` name.
export const restore = restoreProgramme;

export async function getProgramme(id: string): Promise<ProgrammeRow | null> {
  const [row] = await db.select().from(programmes).where(eq(programmes.id, id));
  return row ?? null;
}

export async function getProgrammeBySlug(slug: string): Promise<ProgrammeRow | null> {
  const [row] = await db.select().from(programmes).where(eq(programmes.slug, slug));
  return row ?? null;
}

// CMS-03: public programme list (status=published AND published_at<=now,
// excluding soft-deleted rows), start_date ascending.
export async function listProgrammes(now: Date = new Date(), limit = 50): Promise<ProgrammeRow[]> {
  return db
    .select()
    .from(programmes)
    .where(
      and(
        eq(programmes.status, "published"),
        lte(programmes.published_at, now),
        isNull(programmes.deleted_at),
      ),
    )
    .orderBy(asc(programmes.start_date))
    .limit(limit);
}

// --- Sessions (05 §11: add / reorder / remove inline) ---

async function fetchSession(id: string) {
  const [row] = await db.select().from(programmeSessions).where(eq(programmeSessions.id, id));
  if (!row) throw new Error(`programme_sessions not found: ${id}`);
  return row;
}

export async function addSession(
  programmeId: string,
  input: AddSessionInput,
  actor: Actor,
): Promise<SessionRow> {
  const data = addSessionSchema.parse(input);
  const created = await db.transaction(async (tx) => {
    const tdb = tx as unknown as DB;
    const programme = await fetchProgrammeIn(tx, programmeId);
    assertSessionInRange(programme, data.date);
    let sortOrder = data.sort_order;
    if (sortOrder === undefined) {
      const kids = await tdb
        .select({ sort_order: programmeSessions.sort_order })
        .from(programmeSessions)
        .where(eq(programmeSessions.programme_id, programmeId));
      sortOrder = kids.length === 0 ? 0 : Math.max(...kids.map((k) => k.sort_order)) + 1;
    }
    const [row] = await tx
      .insert(programmeSessions)
      .values({
        programme_id: programmeId,
        title: data.title,
        date: data.date,
        start_time: data.start_time ?? null,
        end_time: data.end_time ?? null,
        speaker: data.speaker ?? null,
        description: data.description ?? null,
        sort_order: sortOrder,
      })
      .returning();
    await writeSessionAudit(tx, actor, "programme_session.create", row.id, {
      programme_id: programmeId,
      after: data,
    });
    return row;
  });
  return created;
}

export async function updateSession(
  id: string,
  input: UpdateSessionInput,
  actor: Actor,
): Promise<SessionRow> {
  const data = updateSessionSchema.parse(input);
  const updated = await db.transaction(async (tx) => {
    const tdb = tx as unknown as DB;
    const t = tdb;
    const [old] = await t
      .select()
      .from(programmeSessions)
      .where(eq(programmeSessions.id, id));
    if (!old) throw new Error(`programme_sessions not found: ${id}`);
    const writable: Record<string, unknown> = {};
    for (const k of SESSION_WRITABLE) {
      if ((data as Record<string, unknown>)[k] !== undefined)
        writable[k] = (data as Record<string, unknown>)[k] ?? null;
    }
    const merged = { ...old, ...writable };
    if (!String(merged.title ?? "").trim()) throw new Error("title is required");
    const programme = await fetchProgrammeIn(tx, old.programme_id);
    assertSessionInRange(programme, String(merged.date));
    if (
      merged.start_time &&
      merged.end_time &&
      String(merged.end_time) <= String(merged.start_time)
    )
      throw new Error("end_time must be after start_time on the same day (05 §11)");
    const [row] = await tx
      .update(programmeSessions)
      .set(writable as Partial<typeof programmeSessions.$inferInsert>)
      .where(eq(programmeSessions.id, id))
      .returning();
    await writeSessionAudit(tx, actor, "programme_session.update", id, {
      before: { title: old.title, date: old.date },
      after: writable,
    });
    return row;
  });
  return updated;
}

export async function removeSession(id: string, actor: Actor): Promise<{ removed: true }> {
  await db.transaction(async (tx) => {
    const t = tx as unknown as DB;
    const [old] = await t
      .select()
      .from(programmeSessions)
      .where(eq(programmeSessions.id, id));
    if (!old) throw new Error(`programme_sessions not found: ${id}`);
    await tx.delete(programmeSessions).where(eq(programmeSessions.id, id));
    await writeSessionAudit(tx, actor, "programme_session.delete", id, {
      programme_id: old.programme_id,
      title: old.title,
    });
  });
  return { removed: true };
}

// Reorder by ordered ids: position in the array becomes sort_order.
export async function reorderSessions(
  programmeId: string,
  orderedIds: string[],
  actor: Actor,
): Promise<SessionRow[]> {
  const parsed = z.array(z.string().uuid()).min(1, "orderedIds must not be empty").parse(orderedIds);
  const updated = await db.transaction(async (tx) => {
    const t = tx as unknown as DB;
    const kids = await t
      .select({ id: programmeSessions.id })
      .from(programmeSessions)
      .where(eq(programmeSessions.programme_id, programmeId));
    const existing = new Set(kids.map((k) => k.id));
    if (parsed.length !== existing.size || parsed.some((id) => !existing.has(id))) {
      throw new Error("orderedIds must contain exactly the programme's session ids");
    }
    const rows: SessionRow[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const [row] = await tx
        .update(programmeSessions)
        .set({ sort_order: i })
        .where(eq(programmeSessions.id, parsed[i]))
        .returning();
      rows.push(row);
    }
    await writeSessionAudit(tx, actor, "programme_session.reorder", programmeId, {
      programme_id: programmeId,
      orderedIds: parsed,
    });
    return rows;
  });
  return updated;
}

export type AgendaDay = { date: string; sessions: SessionRow[] };

// 05 §11: public agenda grouped by day ascending; sessions within a day
// sorted by sort_order then start_time.
export async function getAgenda(programmeId: string): Promise<AgendaDay[]> {
  const kids = await db
    .select()
    .from(programmeSessions)
    .where(eq(programmeSessions.programme_id, programmeId))
    .orderBy(
      asc(programmeSessions.date),
      asc(programmeSessions.sort_order),
      asc(programmeSessions.start_time),
    );
  const days = new Map<string, SessionRow[]>();
  for (const s of kids) {
    const list = days.get(s.date);
    if (list) list.push(s);
    else days.set(s.date, [s]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, sessions]) => ({ date, sessions }));
}

export { fetchSession as getSession };
