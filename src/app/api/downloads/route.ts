// Tracking download endpoint (PRD 05 §9 DL-01/DL-02/DL-03).
// GET ?content=<type>&id=<uuid>&media=<uuid>: validates the content is
// published and downloadable and the media belongs to it, records the event
// with a salted ip_hash (never the raw IP), then 302-redirects to the file
// URL. Bots and rate-limited IPs are rejected with no row written.

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bibleStudies,
  media,
  sermons,
  sundaySchoolLessons,
} from "@/db/schema";
import { hashIp } from "@/lib/ip-hash";
import { RateLimitError } from "@/lib/ratelimit";
import {
  BotDownloadBlockedError,
  DOWNLOAD_CONTENT_TYPES,
  checkDownloadRateLimit,
  isBot,
  recordDownload,
} from "@/modules/content/download.service";
import { getCurrentSession } from "@/lib/server-session";

const querySchema = z.object({
  content: z.enum(DOWNLOAD_CONTENT_TYPES),
  id: z.string().uuid(),
  media: z.string().uuid(),
});

type ContentTables = typeof sermons | typeof bibleStudies | typeof sundaySchoolLessons;

const CONTENT_TABLES: Record<z.infer<typeof querySchema>["content"], ContentTables> = {
  sermon: sermons,
  bible_study: bibleStudies,
  sunday_school: sundaySchoolLessons,
};

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  return real || null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    content: url.searchParams.get("content"),
    id: url.searchParams.get("id"),
    media: url.searchParams.get("media"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid download link" }, { status: 400 });
  }
  const { content, id, media: mediaId } = parsed.data;
  const userAgent = req.headers.get("user-agent");

  // DL-03: reject bots before any DB write so counts are not inflated.
  if (isBot(userAgent)) {
    return NextResponse.json({ error: "Downloads from automated clients are not counted." }, { status: 403 });
  }

  // DL-03: per-IP budget, keyed by salted hash (never the raw IP).
  const ipHash = hashIp(clientIp(req));
  try {
    await checkDownloadRateLimit(ipHash);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Public visibility rule (CMS-03): published, already due, not deleted.
  const table = CONTENT_TABLES[content];
  const [item] = await db
    .select()
    .from(table)
    .where(
      and(
        eq(table.id, id),
        eq(table.status, "published"),
        lte(table.published_at, new Date()),
        isNull(table.deleted_at),
      ),
    )
    .limit(1);
  if (!item) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }
  if (!item.download_enabled) {
    return NextResponse.json({ error: "Downloads are disabled for this content" }, { status: 403 });
  }
  if (
    item.audio_media_id !== mediaId &&
    item.video_media_id !== mediaId &&
    item.document_media_id !== mediaId
  ) {
    return NextResponse.json({ error: "Media does not belong to this content" }, { status: 404 });
  }

  const [file] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, mediaId), isNull(media.deleted_at)))
    .limit(1);
  if (!file) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  // Optional signed-in attribution; failures fall back to anonymous.
  let userId: string | null = null;
  try {
    const session = await getCurrentSession();
    userId = session.user?.id ?? null;
  } catch {
    userId = null;
  }

  try {
    await recordDownload(db, {
      contentType: content,
      contentId: id,
      mediaId,
      userId,
      ipHash,
      userAgent,
    });
  } catch (err) {
    if (err instanceof BotDownloadBlockedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const target = /^https?:\/\//i.test(file.public_url)
    ? file.public_url
    : new URL(file.public_url, url.origin).toString();
  return NextResponse.redirect(target, 302);
}
