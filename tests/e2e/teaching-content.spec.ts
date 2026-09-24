import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { loginAsStaff } from "./helpers";

// Phase 2 teaching-content acceptance: PRD 10 §5.1 (sermon), §5.2 (bible
// study), §5.3 (sunday school) plus the CMS-03 draft-hidden variant.
// Item 11 (e2e half) of docs/superpowers/plans/2026-09-24-phase2-teaching-content.md.
//
// Strategy (kept serial + generous timeouts like acceptance.spec.ts — cold
// `next dev` compile is slow):
// - Staff setup goes through the real backend the admin UI uses: true UI
//   uploads in 5.1 (Media library Upload control, MED-01/MED-04/MED-08,
//   UPL-01 magic bytes), API creation via /api/content + /api/series +
//   .../status publish (CMS-02) elsewhere to keep runtime sane.
// - Visitor assertions are all real browser navigations of the public pages
//   (/sermons, /bible-study, /sunday-school, series page, detail slugs).
// - Download tracking (DL-01/DL-02) is asserted with a direct
//   /api/downloads GET (302) + a media_downloads DB row. The hit uses plain
//   node fetch on purpose: download.service isBot() blocks the
//   "HeadlessChrome" UA substring (DL-03), so a Playwright-context request
//   would 403 and record nothing.
// - FilterBar check (5.2): /bible-study exposes Teacher/Category/Series/Year
//   selects only — no free-text search box exists there, so only the teacher
//   filter (+ negative filter) is asserted. The topic search input lives on
//   /sunday-school, not /bible-study.
// - Homepage hooks are NOT asserted (Phase 3 scope).
// - Unique Date.now+random stamps everywhere; nothing is cleaned up.

const BASE = "http://localhost:3000";

type FixtureKind = "pdf" | "mp3";
const FIXTURES: Record<FixtureKind, { file: "sample.pdf" | "sample.mp3"; mimeType: string }> = {
  pdf: { file: "sample.pdf", mimeType: "application/pdf" },
  mp3: { file: "sample.mp3", mimeType: "audio/mpeg" },
};

function stamp(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function fixtureBuffer(name: "sample.pdf" | "sample.mp3"): Buffer {
  return readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", name));
}

async function uploadViaApi(
  request: APIRequestContext,
  kind: FixtureKind,
  name: string,
  title: string,
): Promise<{ id: string; public_url: string }> {
  const meta = FIXTURES[kind];
  const res = await request.post("/api/media", {
    timeout: 180_000,
    multipart: {
      file: { name, mimeType: meta.mimeType, buffer: fixtureBuffer(meta.file) },
      title,
    },
  });
  expect(res.ok(), `upload ${name} failed: ${res.status()} ${await res.text()}`).toBe(true);
  const json = (await res.json()) as { row: { id: string; public_url: string } };
  return json.row;
}

async function createContent(
  request: APIRequestContext,
  type: string,
  body: Record<string, unknown>,
): Promise<{ id: string; slug: string }> {
  const res = await request.post(`/api/content/${type}`, {
    timeout: 180_000,
    data: body,
  });
  expect(res.ok(), `create ${type} failed: ${res.status()} ${await res.text()}`).toBe(true);
  const json = (await res.json()) as { row: { id: string; slug: string } };
  return json.row;
}

async function publishContent(
  request: APIRequestContext,
  type: string,
  id: string,
): Promise<{ id: string; slug: string }> {
  const res = await request.post(`/api/content/${type}/${id}/status`, {
    timeout: 180_000,
    data: { action: "publish" },
  });
  expect(res.ok(), `publish ${type} failed: ${res.status()} ${await res.text()}`).toBe(true);
  const json = (await res.json()) as { row: { id: string; slug: string } };
  return json.row;
}

async function createSeries(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ id: string; slug: string }> {
  const res = await request.post("/api/series", { timeout: 180_000, data: body });
  expect(res.ok(), `create series failed: ${res.status()} ${await res.text()}`).toBe(true);
  const json = (await res.json()) as { row: { id: string; slug: string } };
  return json.row;
}

async function downloadRowCount(contentId: string, mediaId: string): Promise<number> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(`SELECT count(*)::int AS c FROM media_downloads WHERE content_id = $1 AND media_id = $2`, [
      contentId,
      mediaId,
    ]);
    return (r.rows[0] as { c: number }).c;
  } finally {
    await pool.end();
  }
}

async function waitForDownloadRow(contentId: string, mediaId: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    if ((await downloadRowCount(contentId, mediaId)) >= 1) return;
    if (Date.now() > deadline) throw new Error(`media_downloads row never appeared for ${contentId}/${mediaId}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

test.describe("Phase 2 teaching content (PRD 10 §5.1/5.2/5.3)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(600_000);

  test("5.1 sermon audio+PDF publishes: Listen + Download PDF, no Watch; download tracked (CMS-02 CMS-03 MED-01 MED-02 DL-01 DL-02 LST-01)", async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, "content_manager");
    const s = stamp();
    const title = `E2E Sermon ${s}`;
    const preacher = `E2E Preacher ${s}`;
    const pdfName = `e2e-sermon-${s}.pdf`;
    const mp3Name = `e2e-sermon-${s}.mp3`;

    // MED-01/MED-04/MED-08 + UPL-01: genuine UI uploads through the Media
    // library (same magic-byte validation as the API path).
    await page.goto("/admin/media");
    await expect(page.getByRole("heading", { name: /media library/i })).toBeVisible({ timeout: 90_000 });
    const uploadInput = page.locator('label:has-text("Upload") input[type="file"]').first();
    await uploadInput.setInputFiles({
      name: pdfName,
      mimeType: "application/pdf",
      buffer: fixtureBuffer("sample.pdf"),
    });
    await expect(page.getByText("Upload complete").first()).toBeVisible({ timeout: 90_000 });
    await uploadInput.setInputFiles({
      name: mp3Name,
      mimeType: "audio/mpeg",
      buffer: fixtureBuffer("sample.mp3"),
    });
    await expect(page.getByText("Upload complete").first()).toBeVisible({ timeout: 90_000 });

    // Resolve the rows the library just stored.
    const listRes = await page.request.get(
      `/api/media?q=${encodeURIComponent(`e2e-sermon-${s}`)}&per_page=10`,
      { timeout: 180_000 },
    );
    expect(listRes.ok()).toBe(true);
    const listed = (await listRes.json()) as {
      rows: { id: string; original_filename: string | null }[];
    };
    const pdfId = listed.rows.find((r) => r.original_filename === pdfName)?.id;
    const audioId = listed.rows.find((r) => r.original_filename === mp3Name)?.id;
    expect(pdfId, "uploaded PDF visible in media library").toBeTruthy();
    expect(audioId, "uploaded audio visible in media library").toBeTruthy();

    // CMS-02: sermon with audio + PDF and deliberately no video, then publish.
    const sermon = await createContent(page.request, "sermon", {
      title,
      preacher,
      sermon_date: todayInput(),
      audio_media_id: audioId,
      document_media_id: pdfId,
      download_enabled: true,
    });
    await publishContent(page.request, "sermon", sermon.id);

    let downloadHref: string | null = null;
    const visitorCtx = await browser.newContext();
    const visitor = await visitorCtx.newPage();
    try {
      // LST-01: published item appears in the public list.
      await visitor.goto("/sermons");
      await expect(visitor.getByRole("heading", { name: /^sermons$/i })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByRole("link", { name: title }).first()).toBeVisible({ timeout: 90_000 });

      // Detail: Listen + Download PDF only, never Watch (05 §8 matrix).
      await visitor.goto(`/sermons/${sermon.slug}`);
      await expect(visitor.getByRole("heading", { name: title, exact: true })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByRole("link", { name: /listen to audio/i })).toBeVisible();
      const downloadLink = visitor.getByRole("link", { name: /download pdf/i }).first();
      await expect(downloadLink).toBeVisible();
      await expect(visitor.getByRole("link", { name: /watch video/i })).toHaveCount(0);
      const audioEl = visitor.locator("#audio-player audio");
      await expect(audioEl).toBeAttached();
      expect(await audioEl.getAttribute("src")).toBeTruthy();
      // DL-01: the rendered Download action itself routes through the tracking
      // endpoint (not the raw file URL) so the visit is recorded.
      downloadHref = await downloadLink.getAttribute("href");
    } finally {
      await visitorCtx.close();
    }

    // DL-01/DL-02: tracked download 302-redirects and writes media_downloads.
    expect(downloadHref).toBeTruthy();
    expect(downloadHref).toContain("/api/downloads");
    expect(downloadHref).toContain(`id=${sermon.id}`);
    const dlRes = await fetch(new URL(downloadHref!, BASE).toString(), {
      redirect: "manual",
    });
    expect(dlRes.status).toBe(302);
    expect(dlRes.headers.get("location")).toBeTruthy();
    await waitForDownloadRow(sermon.id, pdfId!);
  });

  test("5.2 bible study publishes and is findable via list + teacher filter (CMS-02 CMS-03 LST-05)", async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, "content_manager");
    const s = stamp();
    const title = `E2E Bible Study ${s}`;
    const teacher = `E2E Teacher ${s}`;

    const pdf = await uploadViaApi(page.request, "pdf", `e2e-study-${s}.pdf`, `E2E Study PDF ${s}`);
    const audio = await uploadViaApi(page.request, "mp3", `e2e-study-${s}.mp3`, `E2E Study Audio ${s}`);
    const study = await createContent(page.request, "bible_study", {
      title,
      teacher,
      study_date: todayInput(),
      audio_media_id: audio.id,
      document_media_id: pdf.id,
      download_enabled: true,
    });
    await publishContent(page.request, "bible_study", study.id);

    const visitorCtx = await browser.newContext();
    const visitor = await visitorCtx.newPage();
    try {
      await visitor.goto("/bible-study");
      await expect(visitor.getByRole("heading", { name: /^bible study$/i })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByRole("link", { name: title }).first()).toBeVisible({ timeout: 90_000 });

      // LST-05: teacher filter is URL-synced (FilterBar has Teacher/Category/
      // Series/Year selects; no free-text search exists on this page).
      await expect(visitor.getByLabel(/teacher/i)).toBeVisible();
      await visitor.goto(`/bible-study?teacher=${encodeURIComponent(teacher)}`);
      await expect(visitor.getByRole("link", { name: title }).first()).toBeVisible({ timeout: 90_000 });

      await visitor.goto(`/bible-study?teacher=${encodeURIComponent(`No Such Teacher ${s}`)}`);
      await expect(visitor.getByText(/no bible studies match your filters/i)).toBeVisible({ timeout: 90_000 });

      await visitor.goto(`/bible-study/${study.slug}`);
      await expect(visitor.getByRole("heading", { name: title, exact: true })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.locator("#audio-player audio")).toBeAttached();
      await expect(visitor.getByRole("link", { name: /download pdf/i }).first()).toBeVisible();
    } finally {
      await visitorCtx.close();
    }
  });

  test("5.3 sunday school quarter order holds; duplicate lesson_number rejected inline (CMS-02 CMS-03 CMS-07)", async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, "content_manager");
    const s = stamp();
    const seriesTitle = `E2E Quarter ${s}`;
    const lessonTitle = `E2E Lesson One ${s}`;
    const topic = `E2E Topic ${s}`;

    const series = await createSeries(page.request, {
      type: "sunday_school",
      title: seriesTitle,
      slug: `e2e-quarter-${s}`,
    });
    const lesson = await createContent(page.request, "sunday_school", {
      title: lessonTitle,
      series_id: series.id,
      lesson_number: 1,
      lesson_date: todayInput(),
      topic,
    });
    await publishContent(page.request, "sunday_school", lesson.id);

    // Same (series, lesson_number) is rejected at the API boundary (409).
    const dup = await page.request.post("/api/content/sunday_school", {
      timeout: 180_000,
      data: {
        title: `E2E Lesson Dup ${s}`,
        series_id: series.id,
        lesson_number: 1,
        lesson_date: todayInput(),
        topic,
      },
    });
    expect(dup.status()).toBe(409);
    expect(await dup.text()).toMatch(/lesson_number already exists/i);

    // CMS-07: the admin form surfaces the same rejection as an inline error.
    await page.goto("/admin/sunday-school/new");
    await expect(page.getByRole("heading", { name: /new sunday school lesson/i })).toBeVisible({
      timeout: 90_000,
    });
    await page.getByLabel("Title", { exact: true }).fill(`E2E Lesson Dup Form ${s}`);
    await page.getByLabel(/series/i).selectOption({ label: seriesTitle });
    await page.getByLabel(/lesson number/i).fill("1");
    await page.getByLabel(/lesson date/i).fill(todayInput());
    await page.getByLabel("Topic", { exact: true }).fill(topic);
    await page.getByRole("button", { name: /save draft/i }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /already exists/i }).first(),
    ).toBeVisible({ timeout: 90_000 });

    const visitorCtx = await browser.newContext();
    const visitor = await visitorCtx.newPage();
    try {
      await visitor.goto(`/sunday-school/${lesson.slug}`);
      await expect(visitor.getByRole("heading", { name: lessonTitle })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByText(/lesson 1/i).first()).toBeVisible();
      await expect(visitor.getByText(topic).first()).toBeVisible();

      await visitor.goto(`/sunday-school/series/${series.slug}`);
      await expect(visitor.getByRole("heading", { name: seriesTitle })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByRole("link", { name: `Lesson 1: ${lessonTitle}` }).first()).toBeVisible({
        timeout: 90_000,
      });
    } finally {
      await visitorCtx.close();
    }
  });

  test("draft sermon stays invisible on the public list and detail (CMS-03)", async ({ page, browser }) => {
    await loginAsStaff(page, "content_manager");
    const s = stamp();
    const title = `E2E Draft Sermon ${s}`;

    const draft = await createContent(page.request, "sermon", {
      title,
      preacher: `E2E Preacher ${s}`,
      sermon_date: todayInput(),
    });

    const visitorCtx = await browser.newContext();
    const visitor = await visitorCtx.newPage();
    try {
      const detail = await visitor.goto(`/sermons/${draft.slug}`);
      expect(detail?.status()).toBe(404);

      await visitor.goto("/sermons");
      await expect(visitor.getByRole("heading", { name: /^sermons$/i })).toBeVisible({ timeout: 90_000 });
      const list = visitor.getByRole("list").first();
      const empty = visitor.getByText(/no sermons match your filters/i);
      await expect(list.or(empty)).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByText(title)).toHaveCount(0);
    } finally {
      await visitorCtx.close();
    }
  });
});
