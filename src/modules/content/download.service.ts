// DownloadService (PRD 05 §9 DL-02/DL-03/DL-04).
// Server-only: owns all writes to `media_downloads` plus the bot filter,
// per-IP rate-limit hook and the most-downloaded report query. The route
// handler stays thin and delegates here. Raw IPs never reach this module —
// callers pass the salted `ip_hash` (DL-02 privacy).

import { z } from "zod";
import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { mediaDownloads } from "@/db/schema";
import { RateLimitError, rateLimit, rateLimitKey } from "@/lib/ratelimit";

export const DOWNLOAD_CONTENT_TYPES = ["sermon", "bible_study", "sunday_school"] as const;
export type DownloadContentType = (typeof DOWNLOAD_CONTENT_TYPES)[number];

/** DL-03: max downloads per IP per hour. Enforced via `src/lib/ratelimit`
 *  (Upstash sliding window in prod, clearly-marked in-memory dev-fallback). */
export const DOWNLOAD_RATE_LIMIT = { limit: 30, window: "60 m" } as const;

/** DL-03: basic bot/crawler signature filter (case-insensitive substring). */
const BOT_PATTERNS = [
  "bot",
  "crawler",
  "spider",
  "crawl",
  "slurp",
  "scraper",
  "archiver",
  "curl",
  "wget",
  "python-requests",
  "python-httpx",
  "httpx",
  "httrack",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "discordbot",
  "telegrambot",
  "whatsapp",
  "googlebot",
  "bingbot",
  "yandex",
  "baidu",
  "duckduckbot",
  "semrush",
  "ahrefs",
  "mj12bot",
  "dotbot",
  "petalbot",
  "bytespider",
  "gptbot",
  "ccbot",
  "anthropic-ai",
  "claudebot",
  "oai-searchbot",
  "perplexity",
  "headlesschrome",
  "phantomjs",
];

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((p) => ua.includes(p));
}

/** DL-03: thrown when a bot/crawler attempts a tracked download. The route
 *  maps this to 403 and records no row, so counts are not inflated. */
export class BotDownloadBlockedError extends Error {
  readonly status = 403;
  constructor(message = "Downloads from automated clients are not counted.") {
    super(message);
    this.name = "BotDownloadBlockedError";
  }
}

const recordDownloadSchema = z.object({
  contentType: z.enum(DOWNLOAD_CONTENT_TYPES),
  contentId: z.string().uuid(),
  mediaId: z.string().uuid(),
  userId: z.string().uuid().nullish(),
  /** Salted hash (`IP_HASH_SALT`) — never the raw IP (DL-02). */
  ipHash: z.string().min(1).max(128).nullish(),
  userAgent: z.string().max(1024).nullish(),
});

export type RecordDownloadInput = z.infer<typeof recordDownloadSchema>;

/**
 * DL-02: append one row to `media_downloads`. Rejects bots (DL-03) before
 * writing. Callers must run `checkDownloadRateLimit` first; this keeps the
 * rate check (shared Upstash budget) separate from the pure DB write so the
 * report path and tests can record without consuming budget.
 */
export async function recordDownload(
  database: DB,
  rawInput: RecordDownloadInput,
) {
  const input = recordDownloadSchema.parse(rawInput);
  if (isBot(input.userAgent)) throw new BotDownloadBlockedError();
  const [row] = await database
    .insert(mediaDownloads)
    .values({
      content_type: input.contentType,
      content_id: input.contentId,
      media_id: input.mediaId,
      user_id: input.userId ?? null,
      ip_hash: input.ipHash ?? null,
      user_agent: input.userAgent ?? null,
    })
    .returning();
  return row;
}

/** DL-03: per-IP download budget. Throws RateLimitError (429) when exhausted. */
export async function checkDownloadRateLimit(ipHash: string | null): Promise<void> {
  const key = rateLimitKey("downloads", [ipHash ?? "anonymous"]);
  const { success } = await rateLimit(key, {
    limit: DOWNLOAD_RATE_LIMIT.limit,
    window: DOWNLOAD_RATE_LIMIT.window,
  });
  if (!success) {
    throw new RateLimitError("Too many downloads. Try again later.");
  }
}

export type TopDownloadRow = {
  contentId: string;
  downloads: number;
};

/**
 * DL-04: most-downloaded content of one type within `[from, to]`,
 * ordered by download count desc. Used by admin reports
 * (most downloaded sermons / studies / lessons by period).
 */
export async function getTopDownloads(
  database: DB,
  contentType: DownloadContentType,
  from: Date,
  to: Date,
  limit: number,
): Promise<TopDownloadRow[]> {
  const rows = await database
    .select({
      contentId: mediaDownloads.content_id,
      downloads: count(),
    })
    .from(mediaDownloads)
    .where(
      and(
        eq(mediaDownloads.content_type, contentType),
        gte(mediaDownloads.downloaded_at, from),
        lte(mediaDownloads.downloaded_at, to),
      ),
    )
    .groupBy(mediaDownloads.content_id)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
  return rows;
}
