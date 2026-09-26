import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { events, galleryAlbums, galleryImages, media, redirects } from "@/db/schema";
import { normalizeSlug } from "./tag.service";
import { assertTransition, buildSlug } from "./lifecycle";

// PRD 05 §12: gallery albums with ordered image links. The `gallery_images`
// rows are link rows — removing them never touches the `media` rows themselves
// (MED-05). Albums use the shared `contentStatus` lifecycle for
// publish/unpublish but have no `published_at`, so there is no scheduler flip:
// public reads filter `status = published` only (CMS-03, album variant).
// Mutations write an AuditService row (CMS-08) and slugs are unique per album
// with a 301 redirect when a published album is renamed (CMS-06).

export type AlbumStatus = "draft" | "review" | "scheduled" | "published" | "archived";
export type AlbumRow = typeof galleryAlbums.$inferSelect;
export type GalleryImageRow = typeof galleryImages.$inferSelect;

export class DuplicateAlbumSlugError extends Error {}
export class AlbumNotFoundError extends Error {}
export class GalleryImageNotFoundError extends Error {}

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

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "albumDate must be YYYY-MM-DD");
const uuidSchema = z.string().uuid();

const createAlbumSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(200),
  slug: slugSchema.optional(),
  description: z.string().trim().max(10000).nullish(),
  eventId: uuidSchema.nullish(),
  albumDate: dateSchema.nullish(),
});
export type CreateAlbumInput = z.input<typeof createAlbumSchema>;

const updateAlbumSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(200).optional(),
  slug: slugSchema.optional(),
  description: z.string().trim().max(10000).nullish(),
  eventId: uuidSchema.nullish(),
  albumDate: dateSchema.nullish(),
});
export type UpdateAlbumInput = z.input<typeof updateAlbumSchema>;

const updateImageSchema = z.object({
  caption: z.string().trim().max(2000).nullish(),
  altText: z.string().trim().max(500).nullish(),
});
export type UpdateImageInput = z.input<typeof updateImageSchema>;

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

function duplicateMessage(slug: string): string {
  return `duplicate slug "${slug}" for gallery album`;
}

async function requireAlbum(id: string): Promise<AlbumRow> {
  const [row] = await db.select().from(galleryAlbums).where(eq(galleryAlbums.id, id));
  if (!row || row.deleted_at) throw new AlbumNotFoundError(`gallery album ${id} not found`);
  return row;
}

async function requireEventIfGiven(eventId: string | null | undefined): Promise<void> {
  if (eventId == null) return;
  const [row] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId));
  if (!row) throw new Error(`event ${eventId} not found`);
}

export async function createAlbum(
  input: CreateAlbumInput,
  opts: AuditOpts = {},
): Promise<{ album: AlbumRow; audit: AuditPayload }> {
  const data = createAlbumSchema.parse(input);
  const slug = data.slug ?? buildSlug(data.title);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("slug must be lowercase letters, numbers and hyphens");
  }
  const [existing] = await db.select({ id: galleryAlbums.id }).from(galleryAlbums).where(eq(galleryAlbums.slug, slug));
  if (existing) throw new DuplicateAlbumSlugError(duplicateMessage(slug));
  await requireEventIfGiven(data.eventId);

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(galleryAlbums)
        .values({
          title: data.title,
          slug,
          description: data.description ?? null,
          event_id: data.eventId ?? null,
          album_date: data.albumDate ?? null,
          status: "draft",
        })
        .returning();
      const auditId = await auditLog(tx, {
        ...auditFields(opts),
        action: "gallery_album.create",
        entity_type: "gallery_albums",
        entity_id: row.id,
        changes: { after: { title: data.title, slug } },
      });
      return {
        album: row,
        audit: { action: "gallery_album.create", entityType: "gallery_albums", entityId: row.id, auditId },
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateAlbumSlugError(duplicateMessage(slug));
    throw err;
  }
}

export async function updateAlbum(
  id: string,
  patch: UpdateAlbumInput,
  opts: AuditOpts = {},
): Promise<{ album: AlbumRow; audit: AuditPayload }> {
  const data = updateAlbumSchema.parse(patch);
  if (Object.keys(data).length === 0) throw new Error("no fields to update");
  const current = await requireAlbum(id);
  await requireEventIfGiven(data.eventId);

  const nextSlug = data.slug ?? current.slug;
  if (nextSlug !== current.slug) {
    const [clash] = await db
      .select({ id: galleryAlbums.id })
      .from(galleryAlbums)
      .where(and(eq(galleryAlbums.slug, nextSlug), ne(galleryAlbums.id, id)));
    if (clash) throw new DuplicateAlbumSlugError(duplicateMessage(nextSlug));
  }

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .update(galleryAlbums)
        .set({
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.slug !== undefined ? { slug: data.slug } : {}),
          ...(data.description !== undefined ? { description: data.description ?? null } : {}),
          ...(data.eventId !== undefined ? { event_id: data.eventId ?? null } : {}),
          ...(data.albumDate !== undefined ? { album_date: data.albumDate ?? null } : {}),
          updated_at: new Date(),
        })
        .where(eq(galleryAlbums.id, id))
        .returning();
      // CMS-06: renaming a published album leaves a 301 redirect.
      if (data.slug !== undefined && current.slug !== nextSlug && current.status === "published") {
        await tx
          .insert(redirects)
          .values({
            from_path: `/gallery/${current.slug}`,
            to_path: `/gallery/${nextSlug}`,
            status_code: 301,
          })
          .onConflictDoNothing({ target: redirects.from_path });
      }
      const auditId = await auditLog(tx, {
        ...auditFields(opts),
        action: "gallery_album.update",
        entity_type: "gallery_albums",
        entity_id: id,
        changes: { before: current, after: data },
      });
      return {
        album: row,
        audit: { action: "gallery_album.update", entityType: "gallery_albums", entityId: id, auditId },
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateAlbumSlugError(duplicateMessage(nextSlug));
    throw err;
  }
}

async function setAlbumStatus(
  id: string,
  to: AlbumStatus,
  action: string,
  opts: AuditOpts,
): Promise<{ album: AlbumRow; audit: AuditPayload }> {
  const current = await requireAlbum(id);
  assertTransition(current.status as AlbumStatus, to);
  const [row] = await db
    .update(galleryAlbums)
    .set({ status: to, updated_at: new Date() })
    .where(eq(galleryAlbums.id, id))
    .returning();
  const auditId = await db.transaction(async (tx) => {
    return auditLog(tx, {
      ...auditFields(opts),
      action,
      entity_type: "gallery_albums",
      entity_id: id,
      changes: { from: current.status, to },
    });
  });
  return { album: row, audit: { action, entityType: "gallery_albums", entityId: id, auditId } };
}

// Albums carry no published_at, so publish/unpublish are direct status moves
// (CMS-01) with no scheduler involvement.
export async function publishAlbum(id: string, opts: AuditOpts = {}) {
  return setAlbumStatus(id, "published", "gallery_album.publish", opts);
}

export async function unpublishAlbum(id: string, opts: AuditOpts = {}) {
  return setAlbumStatus(id, "draft", "gallery_album.unpublish", opts);
}

export type AddImagesResult = {
  images: GalleryImageRow[];
  added: number;
  skipped: string[];
  audit: AuditPayload;
};

// Bulk-append media to an album (05 §12). Sort order continues past the
// current maximum; already-attached media are skipped; every medium must be an
// image (kind = image).
export async function addImages(
  albumId: string,
  mediaIds: string[],
  opts: AuditOpts = {},
): Promise<AddImagesResult> {
  const parsed = z.object({ albumId: uuidSchema, mediaIds: z.array(uuidSchema).min(1) }).parse({ albumId, mediaIds });
  await requireAlbum(parsed.albumId);

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const mid of parsed.mediaIds) {
    if (!seen.has(mid)) {
      seen.add(mid);
      deduped.push(mid);
    }
  }

  const existingLinks = await db
    .select()
    .from(galleryImages)
    .where(eq(galleryImages.album_id, parsed.albumId));
  const attached = new Set(existingLinks.map((l) => l.media_id));
  const maxOrder = existingLinks.reduce((m, l) => Math.max(m, l.sort_order), -1);

  const candidates = deduped.filter((mid) => !attached.has(mid));
  const skipped = deduped.filter((mid) => attached.has(mid));

  const mediaRows =
    candidates.length > 0
      ? await db.select().from(media).where(inArray(media.id, candidates))
      : [];
  const byId = new Map(mediaRows.map((m) => [m.id, m]));
  for (const mid of candidates) {
    const m = byId.get(mid);
    if (!m || m.deleted_at) throw new Error(`media ${mid} not found`);
    if (m.kind !== "image") throw new Error(`media ${mid} is not an image (kind=${m.kind})`);
  }

  let inserted: GalleryImageRow[] = [];
  const auditId = await db.transaction(async (tx) => {
    if (candidates.length > 0) {
      inserted = await tx
        .insert(galleryImages)
        .values(candidates.map((mid, i) => ({ album_id: parsed.albumId, media_id: mid, sort_order: maxOrder + 1 + i })))
        .returning();
    }
    return auditLog(tx, {
      ...auditFields(opts),
      action: "gallery_image.add",
      entity_type: "gallery_images",
      entity_id: parsed.albumId,
      changes: { album_id: parsed.albumId, added_media_ids: candidates, skipped_media_ids: skipped },
    });
  });

  return {
    images: inserted,
    added: inserted.length,
    skipped,
    audit: { action: "gallery_image.add", entityType: "gallery_images", entityId: parsed.albumId, auditId },
  };
}

export type ReorderImagesResult = { images: GalleryImageRow[]; audit: AuditPayload };

// Persist an exact order (05 §12). `orderedIds` are gallery_images row ids and
// must contain exactly the album's current image ids — anything else is a 400.
export async function reorderImages(
  albumId: string,
  orderedIds: string[],
  opts: AuditOpts = {},
): Promise<ReorderImagesResult> {
  const parsed = z.object({ albumId: uuidSchema, orderedIds: z.array(uuidSchema).min(1) }).parse({ albumId, orderedIds });
  await requireAlbum(parsed.albumId);

  const current = await db
    .select()
    .from(galleryImages)
    .where(eq(galleryImages.album_id, parsed.albumId))
    .orderBy(asc(galleryImages.sort_order));
  const currentIds = current.map((l) => l.id);
  const currentSet = new Set(currentIds);
  const orderedSet = new Set(parsed.orderedIds);
  const exact =
    parsed.orderedIds.length === currentIds.length &&
    parsed.orderedIds.length === orderedSet.size &&
    parsed.orderedIds.every((id) => currentSet.has(id));
  if (!exact) {
    throw new Error("reorderImages: orderedIds must contain exactly the album's image ids (400)");
  }

  const auditId = await db.transaction(async (tx) => {
    for (let i = 0; i < parsed.orderedIds.length; i++) {
      await tx.update(galleryImages).set({ sort_order: i }).where(eq(galleryImages.id, parsed.orderedIds[i]!));
    }
    return auditLog(tx, {
      ...auditFields(opts),
      action: "gallery_image.reorder",
      entity_type: "gallery_images",
      entity_id: parsed.albumId,
      changes: { album_id: parsed.albumId, ordered_ids: parsed.orderedIds },
    });
  });

  const images = await db
    .select()
    .from(galleryImages)
    .where(eq(galleryImages.album_id, parsed.albumId))
    .orderBy(asc(galleryImages.sort_order));
  return {
    images,
    audit: { action: "gallery_image.reorder", entityType: "gallery_images", entityId: parsed.albumId, auditId },
  };
}

// Set (or clear) the album cover. A non-null cover must reference media that
// is attached to the album (05 §12).
export async function setCover(
  albumId: string,
  mediaId: string | null,
  opts: AuditOpts = {},
): Promise<{ album: AlbumRow; audit: AuditPayload }> {
  const parsed = z.object({ albumId: uuidSchema, mediaId: uuidSchema.nullable() }).parse({ albumId, mediaId });
  await requireAlbum(parsed.albumId);
  if (parsed.mediaId !== null) {
    const [link] = await db
      .select({ id: galleryImages.id })
      .from(galleryImages)
      .where(and(eq(galleryImages.album_id, parsed.albumId), eq(galleryImages.media_id, parsed.mediaId)));
    if (!link) throw new Error(`media ${parsed.mediaId} is not attached to album ${parsed.albumId}`);
  }

  const [row] = await db
    .update(galleryAlbums)
    .set({ cover_media_id: parsed.mediaId, updated_at: new Date() })
    .where(eq(galleryAlbums.id, parsed.albumId))
    .returning();
  const auditId = await db.transaction(async (tx) => {
    return auditLog(tx, {
      ...auditFields(opts),
      action: "gallery_album.set_cover",
      entity_type: "gallery_albums",
      entity_id: parsed.albumId,
      changes: { cover_media_id: parsed.mediaId },
    });
  });
  return {
    album: row,
    audit: { action: "gallery_album.set_cover", entityType: "gallery_albums", entityId: parsed.albumId, auditId },
  };
}

export async function updateImage(
  albumId: string,
  imageId: string,
  patch: UpdateImageInput,
  opts: AuditOpts = {},
): Promise<{ image: GalleryImageRow; audit: AuditPayload }> {
  const ids = z.object({ albumId: uuidSchema, imageId: uuidSchema }).parse({ albumId, imageId });
  const data = updateImageSchema.parse(patch);
  if (data.caption === undefined && data.altText === undefined) throw new Error("no fields to update");
  const [link] = await db
    .select()
    .from(galleryImages)
    .where(and(eq(galleryImages.id, ids.imageId), eq(galleryImages.album_id, ids.albumId)));
  if (!link) throw new GalleryImageNotFoundError(`gallery image ${ids.imageId} not found in album ${ids.albumId}`);

  const [row] = await db
    .update(galleryImages)
    .set({
      ...(data.caption !== undefined ? { caption: data.caption ?? null } : {}),
      ...(data.altText !== undefined ? { alt_text: data.altText ?? null } : {}),
    })
    .where(eq(galleryImages.id, ids.imageId))
    .returning();
  const auditId = await db.transaction(async (tx) => {
    return auditLog(tx, {
      ...auditFields(opts),
      action: "gallery_image.update",
      entity_type: "gallery_images",
      entity_id: ids.imageId,
      changes: { before: link, after: data },
    });
  });
  return {
    image: row,
    audit: { action: "gallery_image.update", entityType: "gallery_images", entityId: ids.imageId, auditId },
  };
}

// Remove the link row only — the `media` row itself is never deleted (MED-05).
// If the removed image was the album cover, the cover is cleared.
export async function removeImage(
  albumId: string,
  imageId: string,
  opts: AuditOpts = {},
): Promise<{ removed: string; audit: AuditPayload }> {
  const ids = z.object({ albumId: uuidSchema, imageId: uuidSchema }).parse({ albumId, imageId });
  const album = await requireAlbum(ids.albumId);
  const [link] = await db
    .select()
    .from(galleryImages)
    .where(and(eq(galleryImages.id, ids.imageId), eq(galleryImages.album_id, ids.albumId)));
  if (!link) throw new GalleryImageNotFoundError(`gallery image ${ids.imageId} not found in album ${ids.albumId}`);

  const auditId = await db.transaction(async (tx) => {
    await tx.delete(galleryImages).where(eq(galleryImages.id, ids.imageId));
    if (album.cover_media_id && album.cover_media_id === link.media_id) {
      await tx.update(galleryAlbums).set({ cover_media_id: null, updated_at: new Date() }).where(eq(galleryAlbums.id, ids.albumId));
    }
    return auditLog(tx, {
      ...auditFields(opts),
      action: "gallery_image.remove",
      entity_type: "gallery_images",
      entity_id: ids.imageId,
      changes: { album_id: ids.albumId, media_id: link.media_id },
    });
  });
  return {
    removed: ids.imageId,
    audit: { action: "gallery_image.remove", entityType: "gallery_images", entityId: ids.imageId, auditId },
  };
}

// Delete the album and its image link rows. Media rows themselves are never
// deleted here (MED-05).
export async function deleteAlbum(
  id: string,
  opts: AuditOpts = {},
): Promise<{ deleted: boolean; audit: AuditPayload }> {
  await requireAlbum(id);
  const auditId = await db.transaction(async (tx) => {
    await tx.delete(galleryImages).where(eq(galleryImages.album_id, id));
    await tx.delete(galleryAlbums).where(eq(galleryAlbums.id, id));
    return auditLog(tx, {
      ...auditFields(opts),
      action: "gallery_album.delete",
      entity_type: "gallery_albums",
      entity_id: id,
    });
  });
  return { deleted: true, audit: { action: "gallery_album.delete", entityType: "gallery_albums", entityId: id, auditId } };
}

export type AlbumWithImages = { album: AlbumRow; images: GalleryImageRow[] };

export async function getAlbumWithImages(id: string): Promise<AlbumWithImages> {
  const album = await requireAlbum(id);
  const images = await db
    .select()
    .from(galleryImages)
    .where(eq(galleryImages.album_id, id))
    .orderBy(asc(galleryImages.sort_order));
  return { album, images };
}

export type ListAlbumsOpts = { publishedOnly?: boolean };

// Public album listing passes `publishedOnly: true` (CMS-03 album variant:
// `status = published`; albums carry no `published_at`). Soft-deleted rows are
// always excluded.
export async function listAlbums(opts: ListAlbumsOpts = {}): Promise<AlbumRow[]> {
  if (opts.publishedOnly) {
    return db
      .select()
      .from(galleryAlbums)
      .where(and(eq(galleryAlbums.status, "published"), isNull(galleryAlbums.deleted_at)))
      .orderBy(desc(galleryAlbums.created_at));
  }
  return db
    .select()
    .from(galleryAlbums)
    .where(isNull(galleryAlbums.deleted_at))
    .orderBy(desc(galleryAlbums.created_at));
}
