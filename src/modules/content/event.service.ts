import { z } from "zod";
import { and, asc, desc, eq, gte, isNull, lt, lte, ne } from "drizzle-orm";
import { db, type DB } from "@/db/client";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { getSetting } from "@/modules/platform/settings/settings.service";
import { events } from "@/db/schema";
import { redirects } from "@/db/schema";
import {
  assertTransition,
  buildSlug,
  canPublish,
  type ContentStatus,
} from "./lifecycle";

// PRD 05 §10: events. Follows Phase 2 `content.service.ts` conventions — Zod
// server-side validation, writes inside a transaction with an AuditService row
// (CMS-08), slug uniqueness + 301 redirect on published slug change (CMS-06),
// lifecycle transitions via `lifecycle.ts` helpers (CMS-01), and the
// `content.require_review` publish gate (CMS-04).
//
// Dates are `YYYY-MM-DD`; times are text `HH:MM` interpreted as Africa/Lagos
// (WAT, UTC+1, no DST) wall-clock. `buildIcs` lives in this file (rather than
// a separate `ics.ts`) so the event shape and its calendar rendering stay in
// one place next to the queries that serve the public detail page.

export type Actor = { role: string; userId?: string | null };
export type EventRow = typeof events.$inferSelect;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// WAT is UTC+1 year-round (no DST), so Lagos wall-clock date is UTC + 1h.
export function todayInLagos(now: Date = new Date()): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

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

const eventFields = {
  title: z.string().trim().min(1, "title is required").max(200),
  slug: z.string().trim().min(1).max(160).nullish(),
  description: textNull(20000),
  featured_media_id: uuidNull,
  start_date: dateSchema,
  end_date: z.preprocess(
    (v) => (v === "" ? null : v),
    dateSchema.nullish(),
  ),
  start_time: z.preprocess(
    (v) => (v === "" ? null : v),
    timeSchema.nullish(),
  ),
  end_time: z.preprocess(
    (v) => (v === "" ? null : v),
    timeSchema.nullish(),
  ),
  venue: textNull(300),
  address: textNull(500),
  organizer: textNull(200),
  contact_phone: textNull(50),
  is_featured: z.boolean().default(false),
  registration_enabled: z.boolean().default(false),
  registration_url: textNull(500),
  programme_id: uuidNull,
  seo_title: textNull(200),
  seo_description: textNull(500),
  og_media_id: uuidNull,
};

export const createEventSchema = z
  .object(eventFields)
  .refine((d) => (d.end_date ?? d.start_date) >= d.start_date, {
    message: "end_date must be on or after start_date (05 §10)",
    path: ["end_date"],
  })
  .refine(
    (d) => {
      const end = d.end_date ?? d.start_date;
      if (end !== d.start_date) return true;
      if (!d.start_time || !d.end_time) return true;
      return d.end_time > d.start_time;
    },
    {
      message: "end_time must be after start_time on the same day (05 §10)",
      path: ["end_time"],
    },
  );

export type CreateEventInput = z.input<typeof createEventSchema>;

// NOTE: like Phase 2 `updateSeriesSchema`, the update schema is declared
// field-by-field (zod `.partial()` rejects schemas carrying refinements); the
// merged row is re-validated with the full date-range rules in `updateEvent`.
export const updateEventSchema = z.object({
  title: eventFields.title.optional(),
  slug: z.string().trim().min(1).max(160).nullish(),
  description: textNull(20000),
  featured_media_id: uuidNull,
  start_date: dateSchema.optional(),
  end_date: z.preprocess(
    (v) => (v === "" ? null : v),
    dateSchema.nullish(),
  ),
  start_time: z.preprocess(
    (v) => (v === "" ? null : v),
    timeSchema.nullish(),
  ),
  end_time: z.preprocess(
    (v) => (v === "" ? null : v),
    timeSchema.nullish(),
  ),
  venue: textNull(300),
  address: textNull(500),
  organizer: textNull(200),
  contact_phone: textNull(50),
  is_featured: z.boolean().optional(),
  registration_enabled: z.boolean().optional(),
  registration_url: textNull(500),
  programme_id: uuidNull,
  seo_title: textNull(200),
  seo_description: textNull(500),
  og_media_id: uuidNull,
});

export type UpdateEventInput = z.input<typeof updateEventSchema>;

export function eventPath(slug: string): string {
  return `/events/${slug}`;
}

// CMS-06: slugs unique within events.
async function ensureUniqueEventSlug(
  database: DB,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const base = buildSlug(desired) || "untitled";
  let candidate = base;
  for (let i = 2; i < 200; i++) {
    const rows = excludeId
      ? await database
          .select({ id: events.id })
          .from(events)
          .where(and(eq(events.slug, candidate), ne(events.id, excludeId)))
      : await database
          .select({ id: events.id })
          .from(events)
          .where(eq(events.slug, candidate));
    if (rows.length === 0) return candidate;
    candidate = `${base}-${i}`;
  }
  throw new Error(`Could not generate a unique slug for ${base} (CMS-06)`);
}

// CMS-06: slug change on a published event creates a 301 redirect row.
async function saveEventSlugWithRedirect(
  database: DB,
  id: string,
  oldSlug: string | null,
  desiredSlug: string,
  wasPublished: boolean,
): Promise<string> {
  const finalSlug = await ensureUniqueEventSlug(database, desiredSlug, id);
  if (wasPublished && oldSlug && oldSlug !== finalSlug) {
    await database
      .insert(redirects)
      .values({
        from_path: eventPath(oldSlug),
        to_path: eventPath(finalSlug),
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

async function writeAudit(
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
    entity_type: "events",
    entity_id: id,
    changes,
  });
}

const WRITABLE = [
  "title",
  "description",
  "featured_media_id",
  "start_date",
  "end_date",
  "start_time",
  "end_time",
  "venue",
  "address",
  "organizer",
  "contact_phone",
  "is_featured",
  "registration_enabled",
  "registration_url",
  "programme_id",
  "seo_title",
  "seo_description",
  "og_media_id",
] as const;

export async function createEvent(
  input: CreateEventInput,
  actor: Actor,
): Promise<EventRow> {
  const data = createEventSchema.parse(input);
  const desired = data.slug ? buildSlug(data.slug) : buildSlug(data.title);
  const writable: Record<string, unknown> = {};
  for (const k of WRITABLE) writable[k] = (data as Record<string, unknown>)[k] ?? null;
  const created = await db.transaction(async (tx) => {
    const slug = await ensureUniqueEventSlug(tx as unknown as DB, desired);
    const [row] = await tx
      .insert(events)
      .values({
        ...writable,
        slug,
        status: "draft",
        created_by: actor.userId ?? null,
        updated_by: actor.userId ?? null,
      } as typeof events.$inferInsert)
      .returning();
    await writeAudit(tx, actor, "event.create", row.id, { after: writable, slug });
    return row;
  });
  return created;
}

async function fetchIn(tx: Tx, id: string) {
  const t = tx as unknown as DB;
  const [row] = await t.select().from(events).where(eq(events.id, id));
  if (!row) throw new Error(`events not found: ${id}`);
  return row;
}

export async function updateEvent(
  id: string,
  input: UpdateEventInput,
  actor: Actor,
): Promise<EventRow> {
  const data = updateEventSchema.parse(input);
  const updated = await db.transaction(async (tx) => {
    const tdb = tx as unknown as DB;
    const old = await fetchIn(tx, id);
    const writable: Record<string, unknown> = {};
    for (const k of WRITABLE) {
      if (data[k] !== undefined) writable[k] = data[k] ?? null;
    }
    const merged = { ...old, ...writable };
    if (!String(merged.title ?? "").trim()) throw new Error("title is required");
    if (!DATE_RE.test(String(merged.start_date ?? "")))
      throw new Error("start_date must be YYYY-MM-DD");
    // Full date-range re-validation on the merged row (05 §10).
    const range = {
      start_date: String(merged.start_date),
      end_date: (merged.end_date as string | null) ?? null,
      start_time: (merged.start_time as string | null) ?? null,
      end_time: (merged.end_time as string | null) ?? null,
    };
    if ((range.end_date ?? range.start_date) < range.start_date)
      throw new Error("end_date must be on or after start_date (05 §10)");
    if (
      (range.end_date ?? range.start_date) === range.start_date &&
      range.start_time &&
      range.end_time &&
      range.end_time <= range.start_time
    )
      throw new Error("end_time must be after start_time on the same day (05 §10)");
    let slug = old.slug;
    if (data.slug !== undefined && data.slug !== null) {
      const desired = buildSlug(String(data.slug));
      if (desired !== old.slug) {
        slug = await saveEventSlugWithRedirect(
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
        slug = await saveEventSlugWithRedirect(
          tdb,
          id,
          old.slug,
          desired,
          old.status === "published",
        );
      }
    }
    const [row] = await tx
      .update(events)
      .set({
        ...writable,
        slug,
        updated_by: actor.userId ?? null,
        updated_at: new Date(),
      } as Partial<typeof events.$inferInsert>)
      .where(eq(events.id, id))
      .returning();
    if (!row) throw new Error(`events not found: ${id}`);
    await writeAudit(tx, actor, "event.update", id, {
      before: { slug: old.slug },
      after: { slug, ...writable },
    });
    return row;
  });
  return updated;
}

async function fetchRow(id: string) {
  const [row] = await db.select().from(events).where(eq(events.id, id));
  if (!row) throw new Error(`events not found: ${id}`);
  return row;
}

async function setStatus(
  id: string,
  to: ContentStatus,
  actor: Actor,
  patch: Partial<typeof events.$inferInsert>,
  action: string,
): Promise<EventRow> {
  const updated = await db.transaction(async (tx) => {
    const old = await fetchIn(tx, id);
    assertTransition(old.status as ContentStatus, to);
    const [row] = await tx
      .update(events)
      .set({
        ...patch,
        status: to,
        updated_by: actor.userId ?? null,
        updated_at: new Date(),
      })
      .where(eq(events.id, id))
      .returning();
    await writeAudit(tx, actor, action, id, { from: old.status, to, ...patch });
    return row;
  });
  return updated;
}

function assertPublishable(row: EventRow): void {
  if (!String(row.title ?? "").trim()) throw new Error("title is required");
  if (!DATE_RE.test(String(row.start_date ?? "")))
    throw new Error("start_date must be YYYY-MM-DD");
  const end = row.end_date ?? row.start_date;
  if (end < row.start_date)
    throw new Error("end_date must be on or after start_date (05 §10)");
  if (
    end === row.start_date &&
    row.start_time &&
    row.end_time &&
    row.end_time <= row.start_time
  )
    throw new Error("end_time must be after start_time on the same day (05 §10)");
}

export async function publishEvent(
  id: string,
  actor: Actor,
  opts?: { requireReview?: boolean; now?: Date },
): Promise<EventRow> {
  const requireReview = await getRequireReview(opts?.requireReview);
  if (!canPublish(actor.role, requireReview)) {
    throw new Error(
      "Content Manager cannot publish when content.require_review is on (CMS-04)",
    );
  }
  const row = await fetchRow(id);
  assertPublishable(row);
  return setStatus(id, "published", actor, { published_at: opts?.now ?? new Date() }, "event.publish");
}

// Alias matching the Phase 2 `publishNow(type, id, …)` naming used in the plan.
export const publishNow = publishEvent;

export async function scheduleEvent(
  id: string,
  publishedAt: Date,
  actor: Actor,
  opts?: { requireReview?: boolean },
): Promise<EventRow> {
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
  const row = await fetchRow(id);
  assertPublishable(row);
  return setStatus(id, "scheduled", actor, { published_at: publishedAt }, "event.schedule");
}

// Alias matching the plan's `schedule` name.
export const schedule = scheduleEvent;

export async function unpublishEvent(id: string, actor: Actor): Promise<EventRow> {
  return setStatus(id, "draft", actor, {}, "event.unpublish");
}

// Alias matching the plan's `unpublish` name.
export const unpublish = unpublishEvent;

export async function archiveEvent(id: string, actor: Actor): Promise<EventRow> {
  return setStatus(id, "archived", actor, {}, "event.archive");
}

// Alias matching the plan's `archive` name.
export const archive = archiveEvent;

export async function softDeleteEvent(id: string, actor: Actor): Promise<EventRow> {
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(events)
      .set({
        deleted_at: new Date(),
        updated_by: actor.userId ?? null,
        updated_at: new Date(),
      })
      .where(eq(events.id, id))
      .returning();
    if (!row) throw new Error(`events not found: ${id}`);
    await writeAudit(tx, actor, "event.delete", id, { deleted: true });
    return row;
  });
  return deleted;
}

// Alias matching the plan's `softDelete` name.
export const softDelete = softDeleteEvent;

export async function restoreEvent(id: string, actor: Actor): Promise<EventRow> {
  // CMS-05: only Admin / Super Admin can restore soft-deleted items.
  if (!isAdminRole(actor.role)) {
    throw new Error("Only Admin or Super Admin can restore deleted content (CMS-05)");
  }
  const restored = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(events)
      .set({
        deleted_at: null,
        updated_by: actor.userId ?? null,
        updated_at: new Date(),
      })
      .where(eq(events.id, id))
      .returning();
    if (!row) throw new Error(`events not found: ${id}`);
    await writeAudit(tx, actor, "event.restore", id, { restored: true });
    return row;
  });
  return restored;
}

// Alias matching the plan's `restore` name.
export const restore = restoreEvent;

export async function getEvent(id: string): Promise<EventRow | null> {
  const [row] = await db.select().from(events).where(eq(events.id, id));
  return row ?? null;
}

export async function getEventBySlug(slug: string): Promise<EventRow | null> {
  const [row] = await db.select().from(events).where(eq(events.slug, slug));
  return row ?? null;
}

// CMS-03: public queries only return status=published AND published_at<=now,
// excluding soft-deleted rows (CMS-05).
function publicFilter(now: Date) {
  return and(
    eq(events.status, "published"),
    lte(events.published_at, now),
    isNull(events.deleted_at),
  );
}

// 05 §10: upcoming ascending — start_date >= today in Africa/Lagos.
export async function listUpcoming(now: Date = new Date(), limit = 50): Promise<EventRow[]> {
  const today = todayInLagos(now);
  return db
    .select()
    .from(events)
    .where(and(publicFilter(now), gte(events.start_date, today)))
    .orderBy(asc(events.start_date))
    .limit(limit);
}

// 05 §10: past descending.
export async function listPast(now: Date = new Date(), limit = 50): Promise<EventRow[]> {
  const today = todayInLagos(now);
  return db
    .select()
    .from(events)
    .where(and(publicFilter(now), lt(events.start_date, today)))
    .orderBy(desc(events.start_date))
    .limit(limit);
}

// 05 §10: featured (published + is_featured, start_date ascending).
export async function listFeatured(now: Date = new Date(), limit = 20): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(and(publicFilter(now), eq(events.is_featured, true)))
    .orderBy(asc(events.start_date))
    .limit(limit);
}

// --- .ics builder (PRD 05 §10: "Add to calendar" SHOULD be provided) ---

export type IcsEventInput = {
  id: string;
  title: string;
  description?: string | null;
  start_date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  venue?: string | null;
  address?: string | null;
};

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Floating local time in Africa/Lagos (no TZID/Z suffix — the consumer
// interprets it as Lagos wall-clock, per the plan's documented convention).
function toLocalStamp(date: string, time?: string | null): string {
  const d = date.replace(/-/g, "");
  if (!time) return d;
  return `${d}T${time.replace(":", "")}00`;
}

function toUtcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function buildIcs(event: IcsEventInput, now: Date = new Date()): string {
  const endDate = event.end_date ?? event.start_date;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//movaldem//Events//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@movaldem`,
    `DTSTAMP:${toUtcStamp(now)}`,
    `DTSTART:${toLocalStamp(event.start_date, event.start_time)}`,
    `DTEND:${toLocalStamp(endDate, event.end_time ?? event.start_time)}`,
    `SUMMARY:${icsEscape(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
  const location = [event.venue, event.address].filter(Boolean).join(", ");
  if (location) lines.push(`LOCATION:${icsEscape(location)}`);
  if (event.venue) lines.push(`X-VENUE:${icsEscape(event.venue)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
