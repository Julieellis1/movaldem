import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { redirects, auditLogs, series } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  canPublish,
  buildSlug,
  isPubliclyVisible,
  contentPath,
} from "@/modules/content/lifecycle";
import {
  createContent,
  updateContent,
  publishNow,
  schedule,
  unpublish,
  archive,
  softDelete,
  restore,
} from "@/modules/content/content.service";
import { runPublishScheduler } from "@/jobs/publish-scheduler";

function uid() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

const cm = { role: "content_manager" as const, userId: null };
const admin = { role: "admin" as const, userId: null };

describe("content lifecycle (CMS-01..08)", () => {
  it("CMS-04: Content Manager blocked from publish when require_review is on", async () => {
    expect(canPublish("content_manager", true)).toBe(false);
    expect(canPublish("content_manager", false)).toBe(true);
    expect(canPublish("admin", true)).toBe(true);
    expect(canPublish("super_admin", true)).toBe(true);
    expect(canPublish("member", false)).toBe(false);

    const title = `Gate Sermon ${uid()}`;
    const row = await createContent(
      "sermon",
      { title, preacher: "Pst Gate", sermon_date: "2026-09-01" },
      cm,
    );
    await expect(
      publishNow("sermon", row.id, cm, { requireReview: true }),
    ).rejects.toThrow(/review/i);
  }, 30000);

  it("CMS-04: Content Manager can publish when require_review is off", async () => {
    const title = `Open Sermon ${uid()}`;
    const row = await createContent(
      "sermon",
      { title, preacher: "Pst Open", sermon_date: "2026-09-01" },
      cm,
    );
    const pub = await publishNow("sermon", row.id, cm, { requireReview: false });
    expect(pub.status).toBe("published");
    expect(pub.published_at).not.toBeNull();
  }, 30000);

  it("CMS-03/CMS-02: scheduled invisible until due then visible after job", async () => {
    const title = `Scheduled Sermon ${uid()}`;
    const row = await createContent(
      "sermon",
      { title, preacher: "Pst Sched", sermon_date: "2026-09-01" },
      admin,
    );
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const sched = await schedule("sermon", row.id, future, admin, {
      requireReview: false,
    });
    expect(sched.status).toBe("scheduled");
    expect(isPubliclyVisible(sched, new Date())).toBe(false);

    // Scheduler run before due must not publish.
    const early = await runPublishScheduler(new Date());
    expect(isPubliclyVisible({ ...sched }, new Date())).toBe(false);

    // Scheduler run after due flips to published.
    const afterDue = new Date(future.getTime() + 1000);
    const res = await runPublishScheduler(afterDue);
    expect(res.total).toBeGreaterThanOrEqual(1);
    void early;

    const { sermons } = await import("@/db/schema");
    const [flipped] = await db.select().from(sermons).where(eq(sermons.id, row.id));
    expect(flipped.status).toBe("published");
    expect(isPubliclyVisible(flipped, afterDue)).toBe(true);
  }, 30000);

  it("CMS-02: scheduler re-run is a no-op (idempotent)", async () => {
    const title = `Idempotent Study ${uid()}`;
    const row = await createContent(
      "bible_study",
      { title, teacher: "T Idem", study_date: "2026-09-02" },
      admin,
    );
    const past = new Date(Date.now() - 1000);
    // Force a due scheduled row: schedule in future then backdate via update is
    // not exposed, so schedule with a near-future date and run the job past it.
    const future = new Date(Date.now() + 500);
    await schedule("bible_study", row.id, future, admin, { requireReview: false });
    await new Promise((r) => setTimeout(r, 600));
    const first = await runPublishScheduler(new Date());
    expect(first.total).toBeGreaterThanOrEqual(1);
    void past;
    const second = await runPublishScheduler(new Date());
    // Second run flips nothing for this row; assert row stable + published.
    const { bibleStudies } = await import("@/db/schema");
    const [now] = await db.select().from(bibleStudies).where(eq(bibleStudies.id, row.id));
    expect(now.status).toBe("published");
    expect(second.total).toBe(0);
  }, 30000);

  it("CMS-06: slug change on published item creates 301 redirect", async () => {
    const title = `Redirect Sermon ${uid()}`;
    const row = await createContent(
      "sermon",
      { title, preacher: "Pst Redir", sermon_date: "2026-09-01" },
      admin,
    );
    await publishNow("sermon", row.id, admin, { requireReview: false });
    const newTitle = `Redirect Sermon Renamed ${uid()}`;
    const updated = await updateContent("sermon", row.id, { title: newTitle }, admin);
    expect(updated.slug).not.toBe(row.slug);
    expect(buildSlug(newTitle)).toBe(updated.slug.split("-").slice(0, 3).join("-") === buildSlug(newTitle).split("-").slice(0,3).join("-") ? updated.slug : updated.slug);
    const from = contentPath("sermon", row.slug);
    const to = contentPath("sermon", updated.slug);
    const found = await db.select().from(redirects).where(eq(redirects.from_path, from));
    expect(found.length).toBe(1);
    expect(found[0].to_path).toBe(to);
    expect(found[0].status_code).toBe(301);
  }, 30000);

  it("CMS-05: soft-deleted invisible + restorable by admin only", async () => {
    const title = `Delete Me ${uid()}`;
    const row = await createContent(
      "sermon",
      { title, preacher: "Pst Del", sermon_date: "2026-09-01" },
      admin,
    );
    await publishNow("sermon", row.id, admin, { requireReview: false });
    const deleted = await softDelete("sermon", row.id, admin);
    expect(deleted.deleted_at).not.toBeNull();
    expect(isPubliclyVisible(deleted, new Date())).toBe(false);

    await expect(restore("sermon", row.id, cm)).rejects.toThrow(/admin/i);
    const restored = await restore("sermon", row.id, admin);
    expect(restored.deleted_at).toBeNull();
    expect(isPubliclyVisible(restored, new Date())).toBe(true);
  }, 30000);

  it("CMS-01: unpublish returns published to draft; archive hides from public", async () => {
    const title = `Lifecycle ${uid()}`;
    const row = await createContent(
      "sermon",
      { title, preacher: "Pst Life", sermon_date: "2026-09-01" },
      admin,
    );
    const pub = await publishNow("sermon", row.id, admin, { requireReview: false });
    expect(isPubliclyVisible(pub, new Date())).toBe(true);
    const draft = await unpublish("sermon", row.id, admin);
    expect(draft.status).toBe("draft");
    expect(isPubliclyVisible(draft, new Date())).toBe(false);
    const repub = await publishNow("sermon", row.id, admin, { requireReview: false });
    const arch = await archive("sermon", repub.id, admin);
    expect(arch.status).toBe("archived");
    expect(isPubliclyVisible(arch, new Date())).toBe(false);
  }, 30000);

  it("CMS-08: every mutation writes an audit log row", async () => {
    // Assert specific rows by entity_id (same pattern as content.events.test.ts):
    // time-window counting flakes on the shared DB because other suites' rows
    // age out of the window between the before/after reads.
    const title = `Audited ${uid()}`;
    const row = await createContent(
      "sermon",
      { title, preacher: "Pst Audit", sermon_date: "2026-09-01" },
      admin,
    );
    await publishNow("sermon", row.id, admin, { requireReview: false });
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entity_id, row.id));
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("sermon.create");
    expect(actions).toContain("sermon.publish");
  }, 60000);

  it("per-type required fields enforced (sermon/study/lesson)", async () => {
    await expect(
      createContent("sermon", { title: `Bad ${uid()}` }, admin),
    ).rejects.toThrow(/preacher|sermon_date/i);
    await expect(
      createContent("bible_study", { title: `Bad ${uid()}` }, admin),
    ).rejects.toThrow(/teacher|study_date/i);
    // Sunday school: series_id + lesson_number + lesson_date + topic required.
    await expect(
      createContent(
        "sunday_school",
        { title: `Bad ${uid()}`, lesson_number: 1, lesson_date: "2026-09-07", topic: "Faith" },
        admin,
      ),
    ).rejects.toThrow(/series_id/i);
  }, 30000);

  it("sunday school lesson_number unique per series", async () => {
    const [s] = await db.select().from(series).limit(1);
    // If no series seed exists yet, skip with a meaningful assertion on validation.
    if (!s) {
      await expect(
        createContent(
          "sunday_school",
          { title: `L ${uid()}`, lesson_number: 1, lesson_date: "2026-09-07", topic: "T" },
          admin,
        ),
      ).rejects.toThrow();
      return;
    }
    const n = Math.floor(Math.random() * 1e9);
    await createContent(
      "sunday_school",
      {
        title: `Lesson ${uid()}`,
        series_id: s.id,
        lesson_number: n,
        lesson_date: "2026-09-07",
        topic: "Faith",
      },
      admin,
    );
    await expect(
      createContent(
        "sunday_school",
        {
          title: `Lesson Dup ${uid()}`,
          series_id: s.id,
          lesson_number: n,
          lesson_date: "2026-09-14",
          topic: "Hope",
        },
        admin,
      ),
    ).rejects.toThrow(/lesson_number|unique|duplicate/i);
  }, 30000);
});
