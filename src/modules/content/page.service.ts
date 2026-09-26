// PageService (PRD 05 §13: About, Leadership and Branches).
// Server-only: owns all writes to `site_pages`, `leaders` and `branches`.
// Follows Phase 2 service patterns (series.service.ts): Zod server-side
// validation, writes inside a transaction with an AuditService row (CMS-08).

import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { branches, leaders, sitePages } from "@/db/schema";
import { auditLog } from "@/modules/platform/audit/audit.service";

// 05-§13: the only site page keys the CMS manages. Anything else is rejected
// so public routes can rely on a fixed set of editable church-info pages.
export const SITE_PAGE_KEYS = [
  "about.history",
  "about.vision",
  "about.mission",
  "about.beliefs",
] as const;
export type SitePageKey = (typeof SITE_PAGE_KEYS)[number];

export type Actor = {
  role?: string | null;
  userId?: string | null;
};

export type SitePageRow = typeof sitePages.$inferSelect;
export type LeaderRow = typeof leaders.$inferSelect;
export type BranchRow = typeof branches.$inferSelect;

function auditFields(actor: Actor = {}) {
  return {
    actor_user_id: actor.userId ?? null,
    actor_role: actor.role ?? null,
  };
}

function isKnownPageKey(key: string): key is SitePageKey {
  return (SITE_PAGE_KEYS as readonly string[]).includes(key);
}

// Empty form fields arrive as "" — store NULL for nullable columns.
function emptyToNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v as string;
}

const sitePageSchema = z.object({
  key: z.string(),
  title: z.string().trim().min(1, "title is required").max(200),
  body: z.string().max(100000),
});

export async function upsertSitePage(
  key: string,
  title: string,
  body: string,
  actor: Actor = {},
): Promise<SitePageRow> {
  if (!isKnownPageKey(key)) {
    throw new Error(
      `unknown site page key "${key}" (05-§13: expected one of ${SITE_PAGE_KEYS.join(", ")})`,
    );
  }
  const data = sitePageSchema.parse({ key, title, body });
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(sitePages)
      .values({
        key: data.key,
        title: data.title,
        body: data.body,
        updated_by: actor.userId ?? null,
      })
      .onConflictDoUpdate({
        target: sitePages.key,
        set: {
          title: data.title,
          body: data.body,
          updated_by: actor.userId ?? null,
          updated_at: new Date(),
        },
      })
      .returning();
    await auditLog(tx, {
      ...auditFields(actor),
      action: "site_page.upsert",
      entity_type: "site_pages",
      entity_id: row.key,
      changes: { after: data },
    });
    return row;
  });
}

export async function getSitePage(key: string): Promise<SitePageRow | null> {
  const [row] = await db.select().from(sitePages).where(eq(sitePages.key, key));
  return row ?? null;
}

// ---- Leaders (05-§13) ----

const leaderFieldDefs = {
  name: z.string().trim().min(1, "name is required").max(200),
  title: z.string().trim().min(1, "title/office is required").max(200),
  bio: z.string().trim().max(20000).nullish(),
  photo_media_id: z.string().uuid("photo_media_id must be a UUID").nullish(),
  sort_order: z.number().int().default(0),
  is_visible: z.boolean().default(true),
};

export const createLeaderSchema = z.object(leaderFieldDefs);
export type CreateLeaderInput = z.input<typeof createLeaderSchema>;

export const updateLeaderSchema = z.object({
  name: leaderFieldDefs.name.optional(),
  title: leaderFieldDefs.title.optional(),
  bio: leaderFieldDefs.bio,
  photo_media_id: leaderFieldDefs.photo_media_id,
  sort_order: z.number().int().optional(),
  is_visible: z.boolean().optional(),
});
export type UpdateLeaderInput = z.input<typeof updateLeaderSchema>;

function normalizeLeaderNullable<T extends { bio?: unknown; photo_media_id?: unknown }>(input: T): T {
  return {
    ...input,
    ...(input.bio !== undefined ? { bio: emptyToNull(input.bio) } : {}),
    ...(input.photo_media_id !== undefined ? { photo_media_id: emptyToNull(input.photo_media_id) } : {}),
  };
}

export async function createLeader(
  rawInput: CreateLeaderInput,
  actor: Actor = {},
): Promise<{ leader: LeaderRow; auditId: string }> {
  const data = createLeaderSchema.parse(normalizeLeaderNullable(rawInput));
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(leaders)
      .values({
        name: data.name,
        title: data.title,
        bio: data.bio ?? null,
        photo_media_id: data.photo_media_id ?? null,
        sort_order: data.sort_order,
        is_visible: data.is_visible,
      })
      .returning();
    const auditId = await auditLog(tx, {
      ...auditFields(actor),
      action: "leader.create",
      entity_type: "leaders",
      entity_id: row.id,
      changes: { after: data },
    });
    return { leader: row, auditId };
  });
}

export async function updateLeader(
  id: string,
  rawPatch: UpdateLeaderInput,
  actor: Actor = {},
): Promise<{ leader: LeaderRow; auditId: string }> {
  const data = updateLeaderSchema.parse(normalizeLeaderNullable(rawPatch));
  if (Object.keys(data).length === 0) throw new Error("no fields to update");
  const [current] = await db.select().from(leaders).where(eq(leaders.id, id));
  if (!current) throw new Error(`leader not found: ${id}`);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(leaders)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.bio !== undefined ? { bio: data.bio ?? null } : {}),
        ...(data.photo_media_id !== undefined ? { photo_media_id: data.photo_media_id ?? null } : {}),
        ...(data.sort_order !== undefined ? { sort_order: data.sort_order } : {}),
        ...(data.is_visible !== undefined ? { is_visible: data.is_visible } : {}),
      })
      .where(eq(leaders.id, id))
      .returning();
    const auditId = await auditLog(tx, {
      ...auditFields(actor),
      action: "leader.update",
      entity_type: "leaders",
      entity_id: id,
      changes: { before: current, after: data },
    });
    return { leader: row, auditId };
  });
}

export async function setLeaderVisibility(
  id: string,
  isVisible: boolean,
  actor: Actor = {},
): Promise<LeaderRow> {
  const { leader } = await updateLeader(id, { is_visible: isVisible }, actor);
  return leader;
}

export async function reorderLeaders(
  orderedIds: string[],
  actor: Actor = {},
): Promise<LeaderRow[]> {
  return db.transaction(async (tx) => {
    const rows: LeaderRow[] = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const [row] = await tx
        .update(leaders)
        .set({ sort_order: i })
        .where(eq(leaders.id, orderedIds[i]))
        .returning();
      if (!row) throw new Error(`leader not found: ${orderedIds[i]}`);
      rows.push(row);
    }
    await auditLog(tx, {
      ...auditFields(actor),
      action: "leader.reorder",
      entity_type: "leaders",
      entity_id: null,
      changes: { order: orderedIds },
    });
    return rows;
  });
}

export async function deleteLeader(id: string, actor: Actor = {}): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ id: leaders.id }).from(leaders).where(eq(leaders.id, id));
    if (!row) throw new Error(`leader not found: ${id}`);
    await tx.delete(leaders).where(eq(leaders.id, id));
    await auditLog(tx, {
      ...auditFields(actor),
      action: "leader.delete",
      entity_type: "leaders",
      entity_id: id,
    });
  });
}

// Public read: visible leaders in display order (05-§13).
export async function listVisibleLeaders(): Promise<LeaderRow[]> {
  return db
    .select()
    .from(leaders)
    .where(eq(leaders.is_visible, true))
    .orderBy(asc(leaders.sort_order), asc(leaders.name));
}

// ---- Branches (05-§13) ----

const branchFieldDefs = {
  name: z.string().trim().min(1, "name is required").max(200),
  address: z.string().trim().min(1, "address is required").max(1000),
  phone: z.string().trim().max(50).nullish(),
  email: z.string().trim().max(320).nullish(),
  service_times: z.string().trim().max(2000).nullish(),
  map_url: z.string().trim().max(2000).nullish(),
  sort_order: z.number().int().default(0),
  is_visible: z.boolean().default(true),
};

export const createBranchSchema = z.object(branchFieldDefs);
export type CreateBranchInput = z.input<typeof createBranchSchema>;

export const updateBranchSchema = z.object({
  name: branchFieldDefs.name.optional(),
  address: branchFieldDefs.address.optional(),
  phone: branchFieldDefs.phone,
  email: branchFieldDefs.email,
  service_times: branchFieldDefs.service_times,
  map_url: branchFieldDefs.map_url,
  sort_order: z.number().int().optional(),
  is_visible: z.boolean().optional(),
});
export type UpdateBranchInput = z.input<typeof updateBranchSchema>;

function normalizeBranchNullable<T extends Record<string, unknown>>(input: T): T {
  const out = { ...input };
  for (const k of ["phone", "email", "service_times", "map_url"] as const) {
    if (k in out) (out as Record<string, unknown>)[k] = emptyToNull(out[k]);
  }
  return out;
}

export async function createBranch(
  rawInput: CreateBranchInput,
  actor: Actor = {},
): Promise<{ branch: BranchRow; auditId: string }> {
  const data = createBranchSchema.parse(normalizeBranchNullable({ ...rawInput }));
  if (data.email) {
    const emailCheck = z.string().email().safeParse(data.email);
    if (!emailCheck.success) throw new Error("email must be a valid email address");
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(branches)
      .values({
        name: data.name,
        address: data.address,
        phone: data.phone ?? null,
        email: data.email ?? null,
        service_times: data.service_times ?? null,
        map_url: data.map_url ?? null,
        sort_order: data.sort_order,
        is_visible: data.is_visible,
      })
      .returning();
    const auditId = await auditLog(tx, {
      ...auditFields(actor),
      action: "branch.create",
      entity_type: "branches",
      entity_id: row.id,
      changes: { after: data },
    });
    return { branch: row, auditId };
  });
}

export async function updateBranch(
  id: string,
  rawPatch: UpdateBranchInput,
  actor: Actor = {},
): Promise<{ branch: BranchRow; auditId: string }> {
  const data = updateBranchSchema.parse(normalizeBranchNullable({ ...rawPatch }));
  if (Object.keys(data).length === 0) throw new Error("no fields to update");
  if (data.email) {
    const emailCheck = z.string().email().safeParse(data.email);
    if (!emailCheck.success) throw new Error("email must be a valid email address");
  }
  const [current] = await db.select().from(branches).where(eq(branches.id, id));
  if (!current) throw new Error(`branch not found: ${id}`);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(branches)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.phone !== undefined ? { phone: data.phone ?? null } : {}),
        ...(data.email !== undefined ? { email: data.email ?? null } : {}),
        ...(data.service_times !== undefined ? { service_times: data.service_times ?? null } : {}),
        ...(data.map_url !== undefined ? { map_url: data.map_url ?? null } : {}),
        ...(data.sort_order !== undefined ? { sort_order: data.sort_order } : {}),
        ...(data.is_visible !== undefined ? { is_visible: data.is_visible } : {}),
      })
      .where(eq(branches.id, id))
      .returning();
    const auditId = await auditLog(tx, {
      ...auditFields(actor),
      action: "branch.update",
      entity_type: "branches",
      entity_id: id,
      changes: { before: current, after: data },
    });
    return { branch: row, auditId };
  });
}

export async function setBranchVisibility(
  id: string,
  isVisible: boolean,
  actor: Actor = {},
): Promise<BranchRow> {
  const { branch } = await updateBranch(id, { is_visible: isVisible }, actor);
  return branch;
}

export async function reorderBranches(
  orderedIds: string[],
  actor: Actor = {},
): Promise<BranchRow[]> {
  return db.transaction(async (tx) => {
    const rows: BranchRow[] = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const [row] = await tx
        .update(branches)
        .set({ sort_order: i })
        .where(eq(branches.id, orderedIds[i]))
        .returning();
      if (!row) throw new Error(`branch not found: ${orderedIds[i]}`);
      rows.push(row);
    }
    await auditLog(tx, {
      ...auditFields(actor),
      action: "branch.reorder",
      entity_type: "branches",
      entity_id: null,
      changes: { order: orderedIds },
    });
    return rows;
  });
}

export async function deleteBranch(id: string, actor: Actor = {}): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, id));
    if (!row) throw new Error(`branch not found: ${id}`);
    await tx.delete(branches).where(eq(branches.id, id));
    await auditLog(tx, {
      ...auditFields(actor),
      action: "branch.delete",
      entity_type: "branches",
      entity_id: id,
    });
  });
}

// Public read: visible branches in display order (05-§13).
export async function listVisibleBranches(): Promise<BranchRow[]> {
  return db
    .select()
    .from(branches)
    .where(eq(branches.is_visible, true))
    .orderBy(asc(branches.sort_order), asc(branches.name));
}
