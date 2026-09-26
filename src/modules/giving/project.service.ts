import { z } from "zod";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db, type DB } from "@/db/client";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { givingProjects, redirects } from "@/db/schema";
import { buildSlug } from "@/modules/content/lifecycle";

// Phase 4 giving projects (PRD 06 §5: PRJ-01..PRJ-05; 5.5 journey).
//
// Conventions follow Phase 1-3 services (`src/modules/content/`):
// Zod server-side validation, writes inside `db.transaction` with an
// AuditService row, slug uniqueness + 301 redirect on slug change.
//
// Money is integer kobo end-to-end. `amount_raised_cached` is derived only
// (PRD 06 §5: never manually edited) — it moves exclusively via
// `incrementRaised` / `reverseRefundedPayment`, which `PaymentService` must
// call inside the SAME database transaction that flips the transaction
// status (see the idempotency note on `applySuccessfulPayment`).

export type Actor = { role: string; userId?: string | null };
export type ProjectRow = typeof givingProjects.$inferSelect;
export type ProjectStatus = "draft" | "active" | "completed" | "closed";

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "draft",
  "active",
  "completed",
  "closed",
];

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateSchema = z.string().regex(DATE_RE, "date must be YYYY-MM-DD");
const uuidNull = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().uuid("must be a UUID").nullish(),
);
const textNull = (max: number) =>
  z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().trim().max(max).nullish(),
  );

// Target is entered in naira, stored as integer kobo (PRD 06 §5, global
// currency rule). Positive, max 2 decimals.
export function nairaToKoboInt(naira: number): number {
  if (!Number.isFinite(naira) || naira <= 0) {
    throw new Error("target must be a positive number of naira (PRJ target)");
  }
  const kobo = Math.round(naira * 100);
  if (!Number.isSafeInteger(kobo) || kobo <= 0) {
    throw new Error("target must be a positive number of naira (PRJ target)");
  }
  if (Math.abs(naira * 100 - kobo) > 1e-6) {
    throw new Error("target supports at most 2 decimal places");
  }
  return kobo;
}

const projectFields = {
  title: z.string().trim().min(1, "title is required").max(200),
  slug: z.string().trim().min(1).max(160).nullish(),
  description: textNull(20000),
  featured_media_id: uuidNull,
  target_naira: z.number(),
  start_date: z.preprocess(
    (v) => (v === "" ? null : v),
    dateSchema.nullish(),
  ),
  end_date: z.preprocess(
    (v) => (v === "" ? null : v),
    dateSchema.nullish(),
  ),
};

export const createProjectSchema = z.object(projectFields);

export type CreateProjectInput = z.input<typeof createProjectSchema>;

// Declared field-by-field (zod `.partial()` rejects schemas carrying
// refinements); the merged row is re-validated in `updateProject`.
export const updateProjectSchema = z.object({
  title: projectFields.title.optional(),
  slug: z.string().trim().min(1).max(160).nullish(),
  description: textNull(20000),
  featured_media_id: uuidNull,
  target_naira: z.number().optional(),
  start_date: z.preprocess(
    (v) => (v === "" ? null : v),
    dateSchema.nullish(),
  ),
  end_date: z.preprocess(
    (v) => (v === "" ? null : v),
    dateSchema.nullish(),
  ),
});

export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

export const projectStatusSchema = z.enum(PROJECT_STATUSES);

export function projectPath(slug: string): string {
  return `/give/project/${slug}`;
}

// Africa/Lagos calendar date (global timezone rule) for PRJ-02 range checks.
export function lagosDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Slug uniqueness across giving_projects (content CMS-06 pattern).
async function ensureUniqueProjectSlug(
  database: DB,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const base = buildSlug(desired) || "untitled";
  let candidate = base;
  for (let i = 2; i < 200; i++) {
    const rows = excludeId
      ? await database
          .select({ id: givingProjects.id })
          .from(givingProjects)
          .where(and(eq(givingProjects.slug, candidate), ne(givingProjects.id, excludeId)))
      : await database
          .select({ id: givingProjects.id })
          .from(givingProjects)
          .where(eq(givingProjects.slug, candidate));
    if (rows.length === 0) return candidate;
    candidate = `${base}-${i}`;
  }
  throw new Error(`Could not generate a unique slug for ${base} (PRJ slug)`);
}

// Slug change on an ACTIVE project creates a 301 redirect row (content
// CMS-06 pattern, scoped to the giving path; draft/completed/closed renames
// do not create redirects).
async function saveProjectSlugWithRedirect(
  database: DB,
  id: string,
  oldSlug: string | null,
  desiredSlug: string,
  wasActive: boolean,
): Promise<string> {
  const finalSlug = await ensureUniqueProjectSlug(database, desiredSlug, id);
  if (wasActive && oldSlug && oldSlug !== finalSlug) {
    await database
      .insert(redirects)
      .values({
        from_path: projectPath(oldSlug),
        to_path: projectPath(finalSlug),
        status_code: 301,
      })
      .onConflictDoNothing({ target: redirects.from_path });
  }
  return finalSlug;
}

async function writeProjectAudit(
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
    entity_type: "giving_projects",
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
] as const;

export async function createProject(
  input: CreateProjectInput,
  actor: Actor,
): Promise<ProjectRow> {
  const data = createProjectSchema.parse(input);
  const targetKobo = nairaToKoboInt(data.target_naira);
  const start = data.start_date ?? null;
  const end = data.end_date ?? null;
  if (start && end && end < start) {
    throw new Error("end_date must be on or after start_date (PRJ)");
  }
  const desired = data.slug ? buildSlug(data.slug) : buildSlug(data.title);
  const writable: Record<string, unknown> = {
    title: data.title,
    description: data.description ?? null,
    featured_media_id: data.featured_media_id ?? null,
    start_date: start,
    end_date: end,
  };
  const created = await db.transaction(async (tx) => {
    const tdb = tx as unknown as DB;
    const slug = await ensureUniqueProjectSlug(tdb, desired);
    const [row] = await tx
      .insert(givingProjects)
      .values({
        ...writable,
        slug,
        target_amount: targetKobo,
        status: "draft",
      } as typeof givingProjects.$inferInsert)
      .returning();
    await writeProjectAudit(tx, actor, "project.create", row.id, {
      after: { ...writable, slug, target_amount: targetKobo },
    });
    return row;
  });
  return created;
}

async function fetchProjectIn(tx: Tx, id: string) {
  const t = tx as unknown as DB;
  const [row] = await t
    .select()
    .from(givingProjects)
    .where(eq(givingProjects.id, id));
  if (!row) throw new Error(`giving_projects not found: ${id}`);
  return row;
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
  actor: Actor,
): Promise<ProjectRow> {
  const data = updateProjectSchema.parse(input);
  const updated = await db.transaction(async (tx) => {
    const tdb = tx as unknown as DB;
    const old = await fetchProjectIn(tx, id);
    const writable: Record<string, unknown> = {};
    for (const k of WRITABLE) {
      if ((data as Record<string, unknown>)[k] !== undefined) {
        writable[k] = (data as Record<string, unknown>)[k] ?? null;
      }
    }
    let targetKobo = old.target_amount;
    if (data.target_naira !== undefined) {
      targetKobo = nairaToKoboInt(data.target_naira);
    }
    const merged = { ...old, ...writable, target_amount: targetKobo };
    if (!String(merged.title ?? "").trim()) throw new Error("title is required");
    if (merged.start_date && merged.end_date && merged.end_date < merged.start_date) {
      throw new Error("end_date must be on or after start_date (PRJ)");
    }
    let slug = old.slug;
    if (data.slug !== undefined && data.slug !== null) {
      const desired = buildSlug(String(data.slug));
      if (desired !== old.slug) {
        slug = await saveProjectSlugWithRedirect(
          tdb,
          id,
          old.slug,
          desired,
          old.status === "active",
        );
      }
    } else if (
      writable.title !== undefined &&
      String(writable.title) !== String(old.title)
    ) {
      const desired = buildSlug(String(writable.title));
      if (desired !== old.slug) {
        slug = await saveProjectSlugWithRedirect(
          tdb,
          id,
          old.slug,
          desired,
          old.status === "active",
        );
      }
    }
    const [row] = await tx
      .update(givingProjects)
      .set({
        ...writable,
        slug,
        target_amount: targetKobo,
        updated_at: new Date(),
      } as Partial<typeof givingProjects.$inferInsert>)
      .where(eq(givingProjects.id, id))
      .returning();
    if (!row) throw new Error(`giving_projects not found: ${id}`);
    // PRJ-04: target / status / date changes are audit-logged.
    await writeProjectAudit(tx, actor, "project.update", id, {
      before: {
        slug: old.slug,
        target_amount: old.target_amount,
        start_date: old.start_date,
        end_date: old.end_date,
      },
      after: { slug, target_amount: targetKobo, ...writable },
    });
    return row;
  });
  return updated;
}

// PRJ-04: status changes are audit-logged. PRD 06 §5 defines no transition
// machine for projects (unlike CMS-01), so every status is reachable; the
// audit row is the guardrail.
export async function setProjectStatus(
  id: string,
  to: ProjectStatus,
  actor: Actor,
): Promise<ProjectRow> {
  const status = projectStatusSchema.parse(to);
  const updated = await db.transaction(async (tx) => {
    const old = await fetchProjectIn(tx, id);
    const [row] = await tx
      .update(givingProjects)
      .set({ status, updated_at: new Date() })
      .where(eq(givingProjects.id, id))
      .returning();
    if (!row) throw new Error(`giving_projects not found: ${id}`);
    await writeProjectAudit(tx, actor, "project.status", id, {
      from: old.status,
      to: status,
    });
    return row;
  });
  return updated;
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  const [row] = await db
    .select()
    .from(givingProjects)
    .where(eq(givingProjects.id, id));
  return row ?? null;
}

export async function getProjectBySlug(slug: string): Promise<ProjectRow | null> {
  const [row] = await db
    .select()
    .from(givingProjects)
    .where(eq(givingProjects.slug, slug));
  return row ?? null;
}

// PRJ-02: only `active` projects within their date range accept gifts.
// Returns null for anything else (draft/completed/closed, out of range,
// soft-deleted) — the public gate for the project selector and gift flow.
export async function getActiveProject(
  slug: string,
  now: Date = new Date(),
): Promise<ProjectRow | null> {
  const [row] = await db
    .select()
    .from(givingProjects)
    .where(
      and(eq(givingProjects.slug, slug), isNull(givingProjects.deleted_at)),
    );
  if (!row || row.status !== "active") return null;
  const today = lagosDateString(now);
  if (row.start_date && row.start_date > today) return null;
  if (row.end_date && row.end_date < today) return null;
  return row;
}

export type ProjectProgress = {
  projectId: string;
  slug: string;
  raisedKobo: number;
  targetKobo: number;
  /** PRJ-01: raised / target shown to 1 decimal; may exceed 100. */
  percent1dp: number;
  /** PRJ-01: progress bar caps visually at 100. */
  barPercent: number;
};

// PRJ-01: percentage from the cached raised amount (successful-only by
// construction — the cache moves only on successful transitions).
export async function getProjectProgress(
  idOrSlug: string,
): Promise<ProjectProgress> {
  const [row] = UUID_RE.test(idOrSlug)
    ? await db
        .select()
        .from(givingProjects)
        .where(eq(givingProjects.id, idOrSlug))
    : await db
        .select()
        .from(givingProjects)
        .where(eq(givingProjects.slug, idOrSlug));
  if (!row) throw new Error(`giving_projects not found: ${idOrSlug}`);
  const raisedKobo = row.amount_raised_cached;
  const targetKobo = row.target_amount;
  const percent1dp =
    targetKobo > 0 ? Math.round((raisedKobo / targetKobo) * 1000) / 10 : 0;
  return {
    projectId: row.id,
    slug: row.slug,
    raisedKobo,
    targetKobo,
    percent1dp,
    barPercent: Math.min(100, percent1dp),
  };
}

/** Minimal shape `PaymentService` hands over with its status-flip row. */
export type PaymentRowLike = {
  status: string;
  type: string;
  project_id: string | null;
  amount: number;
};

// Seam for `PaymentService`: unconditional cached-raised increment. MUST be
// called inside the same DB transaction that flips the transaction to
// `successful` — the flip's status guard (pending/abandoned → successful,
// GIV-11) is what makes repeat webhook/verify processing idempotent, so the
// increment runs exactly once per payment.
export async function incrementRaised(
  tx: Tx,
  projectId: string,
  amountKobo: number,
): Promise<void> {
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    throw new Error("incrementRaised requires a positive integer kobo amount");
  }
  await tx
    .update(givingProjects)
    .set({
      amount_raised_cached: sql`${givingProjects.amount_raised_cached} + ${amountKobo}`,
      updated_at: new Date(),
    })
    .where(eq(givingProjects.id, projectId));
}

// Guarded variant of the seam: increments ONLY when the row is a successful
// project gift with a project_id (failed/abandoned/pending rows and
// non-project types are no-ops). Safe to call for every transitioned row;
// idempotency still comes from running inside `PaymentService`'s guarded
// status-flip transaction — do NOT call this in its own transaction per
// webhook, or a retried event would double-count.
export async function applySuccessfulPayment(
  tx: Tx,
  row: PaymentRowLike,
): Promise<{ incremented: boolean }> {
  if (
    row.status !== "successful" ||
    row.type !== "project" ||
    !row.project_id
  ) {
    return { incremented: false };
  }
  await incrementRaised(tx, row.project_id, row.amount);
  return { incremented: true };
}

// Seam for `PaymentService`'s `successful → refunded` transition (GIV-11):
// refunded amounts are excluded from "raised" (PRD 06 §4). Call inside the
// same transaction as the refund flip; clamps at zero.
export async function reverseRefundedPayment(
  tx: Tx,
  projectId: string,
  amountKobo: number,
): Promise<void> {
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    throw new Error(
      "reverseRefundedPayment requires a positive integer kobo amount",
    );
  }
  await tx
    .update(givingProjects)
    .set({
      amount_raised_cached: sql`GREATEST(0, ${givingProjects.amount_raised_cached} - ${amountKobo})`,
      updated_at: new Date(),
    })
    .where(eq(givingProjects.id, projectId));
}
