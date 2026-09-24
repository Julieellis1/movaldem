// MediaService (PRD 05 §7 MED-04/05/06/09, PRD 02 ARC-02/03).
// Server-only: owns all reads/writes on the `media` table. Route handlers
// stay thin and delegate here. File bytes live in storage/CDN and are never
// persisted in the database (MED-09).

import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { db, type DB } from "@/db/client";
import {
  bibleStudies,
  media,
  series,
  sermons,
  sundaySchoolLessons,
} from "@/db/schema";
import {
  getExtension,
  toSafeEmbedUrl,
  validateExternalVideoUrl,
  validateUpload,
  type AllowedMimeType,
  type MediaKind,
} from "./validation";
import { resolvePublicUrl, saveUpload } from "./storage";

export type MediaRow = typeof media.$inferSelect;

export type MediaUsageItem = {
  entityType: "sermon" | "bible_study" | "sunday_school_lesson" | "series";
  entityId: string;
  title: string;
  field: string;
};

const mediaKindSchema = z.enum(["image", "audio", "video", "document", "external_video"]);

const createMediaRecordSchema = z.object({
  kind: mediaKindSchema,
  source: z.enum(["uploaded", "external_url"]).default("uploaded"),
  title: z.string().max(255).nullish(),
  altText: z.string().max(500).nullish(),
  originalFilename: z.string().max(255).nullish(),
  mimeType: z.string().max(127).nullish(),
  sizeBytes: z.number().int().nonnegative().nullish(),
  storageKey: z.string().max(1024).nullish(),
  externalUrl: z.string().url().max(2048).nullish(),
  durationSeconds: z.number().int().nonnegative().nullish(),
  width: z.number().int().positive().nullish(),
  height: z.number().int().positive().nullish(),
  uploadedBy: z.string().uuid().nullish(),
  /** Optional raw leading bytes for server-side magic-byte verification (UPL-01). */
  bytes: z.instanceof(Uint8Array).optional(),
});

export type CreateMediaRecordInput = z.infer<typeof createMediaRecordSchema>;

const replaceFileSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  sizeBytes: z.number().int().nonnegative(),
  bytes: z.instanceof(Uint8Array),
});

export type ReplaceFileInput = z.infer<typeof replaceFileSchema>;

function kindForMime(mime: AllowedMimeType): Exclude<MediaKind, "external_video"> {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

/**
 * MED-06: insert the metadata row for an upload or an external video.
 * Callers persist bytes via storage.saveUpload() (or presigned direct
 * upload, UPL-06) and pass the resulting storageKey here — bytes are never
 * stored in the database (MED-09).
 */
export async function createMediaRecord(
  rawInput: CreateMediaRecordInput,
  dbOverride?: DB,
): Promise<MediaRow> {
  const input = createMediaRecordSchema.parse(rawInput);
  const database = dbOverride ?? db;

  if (input.source === "external_url") {
    if (!input.externalUrl) throw new Error("externalUrl is required for external_url media (CMS-11)");
    const check = validateExternalVideoUrl(input.externalUrl);
    if (!check.ok) throw new Error(`Invalid external video URL: ${check.error}`);
    const embed = toSafeEmbedUrl(input.externalUrl);
    if (!embed) throw new Error("Could not build a safe embed URL for the video (CMS-11)");
    const [row] = await database
      .insert(media)
      .values({
        kind: "external_video",
        source: "external_url",
        title: input.title ?? null,
        alt_text: input.altText ?? null,
        original_filename: input.originalFilename ?? null,
        storage_key: null,
        external_url: input.externalUrl,
        public_url: embed,
        mime_type: null,
        size_bytes: null,
        duration_seconds: input.durationSeconds ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        uploaded_by: input.uploadedBy ?? null,
      })
      .returning();
    return row;
  }

  if (!input.mimeType || input.sizeBytes == null || !input.originalFilename) {
    throw new Error("mimeType, sizeBytes and originalFilename are required for uploads (MED-02/UPL-01)");
  }
  const filename = input.originalFilename;
  const check = validateUpload({
    filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    bytes: input.bytes,
  });
  if (!check.ok) throw new Error(`Upload rejected (${check.code}): ${check.error}`);
  const expectedKind = kindForMime(check.mimeType);
  if (input.kind !== expectedKind) {
    throw new Error(`Declared kind "${input.kind}" does not match MIME type "${input.mimeType}" (MED-02)`);
  }
  const publicUrl =
    input.storageKey != null
      ? resolvePublicUrl({ source: "uploaded", storage_key: input.storageKey })
      : "";

  const [row] = await database
    .insert(media)
    .values({
      kind: input.kind,
      source: "uploaded",
      title: input.title ?? null,
      alt_text: input.altText ?? null,
      original_filename: filename,
      storage_key: input.storageKey ?? null,
      external_url: null,
      public_url: publicUrl,
      mime_type: check.mimeType,
      size_bytes: input.sizeBytes,
      duration_seconds: input.durationSeconds ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      uploaded_by: input.uploadedBy ?? null,
    })
    .returning();
  return row;
}

/**
 * MED-04: replace the file behind a media row while keeping the same row ID,
 * so every content reference (and public URL) keeps working. Validates the
 * new bytes server-side (UPL-01..05) before persisting to storage.
 */
export async function replaceFile(
  mediaId: string,
  rawInput: ReplaceFileInput,
  dbOverride?: DB,
): Promise<MediaRow> {
  const input = replaceFileSchema.parse(rawInput);
  const database = dbOverride ?? db;

  const [existing] = await database.select().from(media).where(eq(media.id, mediaId));
  if (!existing || existing.deleted_at) throw new Error("Media not found");
  if (existing.source === "external_url") {
    throw new Error("External video rows have no file to replace (CMS-11)");
  }

  const check = validateUpload({
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    bytes: input.bytes,
  });
  if (!check.ok) throw new Error(`Replacement rejected (${check.code}): ${check.error}`);

  const newKind = kindForMime(check.mimeType);
  const saved = await saveUpload({ bytes: input.bytes, filename: input.filename });

  const [row] = await database
    .update(media)
    .set({
      kind: newKind,
      original_filename: input.filename,
      storage_key: saved.storageKey,
      public_url: saved.publicUrl,
      mime_type: check.mimeType,
      size_bytes: input.sizeBytes,
      duration_seconds: null,
      width: null,
      height: null,
    })
    .where(eq(media.id, mediaId))
    .returning();
  if (!row) throw new Error("Media not found");
  return row;
}

const SERMON_MEDIA_FIELDS = [
  "featured_media_id",
  "audio_media_id",
  "video_media_id",
  "document_media_id",
  "og_media_id",
] as const;

/**
 * MED-04: every content/series row that references the media item, with the
 * field holding the reference. Download history (`media_downloads`) is
 * append-only and never blocks deletion (DL); it stays valid because media
 * rows are soft-deleted, never hard-removed.
 */
export async function getUsage(mediaId: string, dbOverride?: DB): Promise<MediaUsageItem[]> {
  const database = dbOverride ?? db;
  const usage: MediaUsageItem[] = [];

  const [sermonRows, studyRows, lessonRows, seriesRows] = await Promise.all([
    database
      .select({
        id: sermons.id,
        title: sermons.title,
        featured: sermons.featured_media_id,
        audio: sermons.audio_media_id,
        video: sermons.video_media_id,
        document: sermons.document_media_id,
        og: sermons.og_media_id,
      })
      .from(sermons)
      .where(
        or(
          eq(sermons.featured_media_id, mediaId),
          eq(sermons.audio_media_id, mediaId),
          eq(sermons.video_media_id, mediaId),
          eq(sermons.document_media_id, mediaId),
          eq(sermons.og_media_id, mediaId),
        ),
      ),
    database
      .select({
        id: bibleStudies.id,
        title: bibleStudies.title,
        featured: bibleStudies.featured_media_id,
        audio: bibleStudies.audio_media_id,
        video: bibleStudies.video_media_id,
        document: bibleStudies.document_media_id,
        og: bibleStudies.og_media_id,
      })
      .from(bibleStudies)
      .where(
        or(
          eq(bibleStudies.featured_media_id, mediaId),
          eq(bibleStudies.audio_media_id, mediaId),
          eq(bibleStudies.video_media_id, mediaId),
          eq(bibleStudies.document_media_id, mediaId),
          eq(bibleStudies.og_media_id, mediaId),
        ),
      ),
    database
      .select({
        id: sundaySchoolLessons.id,
        title: sundaySchoolLessons.title,
        featured: sundaySchoolLessons.featured_media_id,
        audio: sundaySchoolLessons.audio_media_id,
        video: sundaySchoolLessons.video_media_id,
        document: sundaySchoolLessons.document_media_id,
        og: sundaySchoolLessons.og_media_id,
      })
      .from(sundaySchoolLessons)
      .where(
        or(
          eq(sundaySchoolLessons.featured_media_id, mediaId),
          eq(sundaySchoolLessons.audio_media_id, mediaId),
          eq(sundaySchoolLessons.video_media_id, mediaId),
          eq(sundaySchoolLessons.document_media_id, mediaId),
          eq(sundaySchoolLessons.og_media_id, mediaId),
        ),
      ),
    database
      .select({ id: series.id, title: series.title })
      .from(series)
      .where(eq(series.cover_media_id, mediaId)),
  ]);

  const pushFields = (
    rows: { id: string; title: string; featured: string | null; audio: string | null; video: string | null; document: string | null; og: string | null }[],
    entityType: MediaUsageItem["entityType"],
  ) => {
    const labels: Record<string, string> = {
      featured: "featured_media_id",
      audio: "audio_media_id",
      video: "video_media_id",
      document: "document_media_id",
      og: "og_media_id",
    };
    for (const row of rows) {
      for (const key of ["featured", "audio", "video", "document", "og"] as const) {
        if (row[key] === mediaId) {
          usage.push({ entityType, entityId: row.id, title: row.title, field: labels[key] });
        }
      }
    }
  };

  pushFields(sermonRows, "sermon");
  pushFields(studyRows, "bible_study");
  pushFields(lessonRows, "sunday_school_lesson");
  for (const row of seriesRows) {
    usage.push({ entityType: "series", entityId: row.id, title: row.title, field: "cover_media_id" });
  }
  void SERMON_MEDIA_FIELDS;

  return usage;
}

export type DeleteMediaResult = { ok: true; id: string } | { ok: false; usage: MediaUsageItem[] };

/**
 * MED-05: delete is blocked while any sermon / bible study / sunday school
 * lesson / series references the row — the caller shows the usage list and
 * asks the editor to detach first. Unreferenced rows are soft-deleted
 * (deleted_at) so download history stays intact.
 */
export async function deleteMediaGuarded(
  mediaId: string,
  dbOverride?: DB,
): Promise<DeleteMediaResult> {
  const database = dbOverride ?? db;
  const usage = await getUsage(mediaId, database);
  if (usage.length > 0) return { ok: false, usage };

  const [row] = await database.select({ id: media.id }).from(media).where(eq(media.id, mediaId));
  if (!row) throw new Error("Media not found");
  await database.update(media).set({ deleted_at: new Date() }).where(eq(media.id, mediaId));
  return { ok: true, id: mediaId };
}

export { getExtension };
