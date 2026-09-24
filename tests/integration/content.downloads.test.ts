// Download tracking (PRD 05 §9 DL-01..DL-04).
// Covers: tracking endpoint records the event then 302-redirects (DL-01/02),
// download_enabled / bot / rate-limit guards (DL-01/DL-03), and the
// most-downloaded report query (DL-04).
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { media, mediaDownloads, sermons } from "@/db/schema";
import { hashIp } from "@/lib/ip-hash";
import {
  DOWNLOAD_RATE_LIMIT,
  checkDownloadRateLimit,
  recordDownload,
} from "@/modules/content/download.service";
import { GET } from "@/app/api/downloads/route";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function unique(suffix: string) {
  return `${suffix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

async function createPdfMedia(tag: string) {
  const [row] = await db
    .insert(media)
    .values({
      kind: "document",
      source: "uploaded",
      title: `dl-test ${tag}`,
      public_url: `https://cdn.example.com/files/dl-test-${tag}.pdf`,
      mime_type: "application/pdf",
    })
    .returning();
  return row;
}

async function createSermon(tag: string, opts?: { downloadEnabled?: boolean }) {
  const m = await createPdfMedia(tag);
  const [s] = await db
    .insert(sermons)
    .values({
      title: `DL Test ${tag}`,
      slug: unique(`dl-test-${tag}`),
      preacher: "Test Preacher",
      sermon_date: "2026-09-01",
      status: "published",
      published_at: new Date(Date.now() - 60_000),
      download_enabled: opts?.downloadEnabled ?? true,
      document_media_id: m.id,
    })
    .returning();
  return { sermon: s, pdf: m };
}

function downloadRequest(contentId: string, mediaId: string, opts?: { ip?: string; ua?: string }) {
  const url =
    `http://localhost:3000/api/downloads` +
    `?content=sermon&id=${contentId}&media=${mediaId}`;
  return new Request(url, {
    headers: {
      "user-agent": opts?.ua ?? BROWSER_UA,
      "x-forwarded-for": opts?.ip ?? "203.0.113.11",
    },
  });
}

async function downloadRows(contentId: string, mediaId: string) {
  return db
    .select()
    .from(mediaDownloads)
    .where(
      and(
        eq(mediaDownloads.content_id, contentId),
        eq(mediaDownloads.media_id, mediaId),
      ),
    );
}

describe("content downloads", () => {
  it("DL-01/DL-02 valid download records a row then 302-redirects to the file URL", async () => {
    const tag = unique("valid");
    const ip = "203.0.113.21";
    const { sermon, pdf } = await createSermon(tag);

    const res = await GET(downloadRequest(sermon.id, pdf.id, { ip }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(pdf.public_url);

    const rows = await downloadRows(sermon.id, pdf.id);
    expect(rows.length).toBe(1);
    expect(rows[0].content_type).toBe("sermon");
    expect(rows[0].content_id).toBe(sermon.id);
    expect(rows[0].media_id).toBe(pdf.id);
    expect(rows[0].user_id).toBeNull();
    // DL-02 privacy: salted hash stored, never the raw IP.
    expect(rows[0].ip_hash).toBe(hashIp(ip));
    expect(rows[0].ip_hash).not.toContain(ip);
    expect(rows[0].user_agent).toBe(BROWSER_UA);
    expect(rows[0].downloaded_at).toBeInstanceOf(Date);
  });

  it("DL-01 download_disabled content is rejected and records nothing", async () => {
    const tag = unique("disabled");
    const { sermon, pdf } = await createSermon(tag, { downloadEnabled: false });

    const res = await GET(
      downloadRequest(sermon.id, pdf.id, { ip: "203.0.113.22" }),
    );

    expect(res.status).toBe(403);
    expect(await downloadRows(sermon.id, pdf.id)).toHaveLength(0);
  });

  it("DL-03 bot user-agent is rejected without recording a row", async () => {
    const tag = unique("bot");
    const { sermon, pdf } = await createSermon(tag);

    const res = await GET(
      downloadRequest(sermon.id, pdf.id, {
        ip: "203.0.113.23",
        ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      }),
    );

    expect(res.status).toBe(403);
    expect(await downloadRows(sermon.id, pdf.id)).toHaveLength(0);
  });

  it("DL-03 rate-limited IP is rejected without recording a row", async () => {
    const tag = unique("ratelimited");
    const ip = "203.0.113.24";
    const { sermon, pdf } = await createSermon(tag);

    const ipHash = hashIp(ip)!;
    for (let i = 0; i < DOWNLOAD_RATE_LIMIT.limit; i++) {
      await checkDownloadRateLimit(ipHash);
    }

    const res = await GET(downloadRequest(sermon.id, pdf.id, { ip }));

    expect(res.status).toBe(429);
    expect(await downloadRows(sermon.id, pdf.id)).toHaveLength(0);
  });

  it("DL-04 getTopDownloads orders content by download count within the period", async () => {
    const { getTopDownloads } = await import("@/modules/content/download.service");
    // ±60s headroom: the shared remote DB's clock runs ~2s ahead of the app
    // clock, so just-written downloaded_at stamps can fall outside a tight
    // [from, to] window and flake the report query (DL-04).
    const from = new Date(Date.now() - 60_000);
    const a = await createSermon(unique("top-a"));
    const b = await createSermon(unique("top-b"));

    for (let i = 0; i < 3; i++) {
      await recordDownload(db, {
        contentType: "sermon",
        contentId: a.sermon.id,
        mediaId: a.pdf.id,
        userId: null,
        ipHash: `top-hash-a-${i}`,
        userAgent: BROWSER_UA,
      });
    }
    await recordDownload(db, {
      contentType: "sermon",
      contentId: b.sermon.id,
      mediaId: b.pdf.id,
      userId: null,
      ipHash: "top-hash-b",
      userAgent: BROWSER_UA,
    });

    const top = await getTopDownloads(db, "sermon", from, new Date(Date.now() + 60_000), 10);
    const ours = top.filter((r) =>
      [a.sermon.id, b.sermon.id].includes(r.contentId),
    );
    expect(ours.map((r) => r.contentId)).toEqual([a.sermon.id, b.sermon.id]);
    expect(ours[0].downloads).toBe(3);
    expect(ours[1].downloads).toBe(1);
  });
});
