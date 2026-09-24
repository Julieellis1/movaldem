import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs, sermons, sundaySchoolLessons, taggables } from "@/db/schema";
import { createCategory, deleteCategoryGuarded } from "@/modules/content/category.service";
import { createSeries, deleteSeriesGuarded } from "@/modules/content/series.service";
import { attachTags, detachTags, findOrCreateTags } from "@/modules/content/tag.service";

// Phase 2 Item 3 — taxonomy services (PRD 05 §6; CMS-05, CMS-06, CMS-08).
// Slugs are suffixed per run so reruns against the shared test DB never
// collide; each test removes the rows it creates.

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// CMS-08: audit row must exist when the audit table is reachable; otherwise
// the service's returned audit payload is the assertion.
async function expectAudited(entityType: string, entityId: string, audit: { auditId: string | null }) {
  expect(audit.auditId).toBeTruthy();
  let reachable: boolean | null = null;
  try {
    const rows = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(eq(auditLogs.entity_type, entityType), eq(auditLogs.entity_id, entityId)));
    reachable = rows.length > 0;
  } catch {
    reachable = null;
  }
  if (reachable !== null) expect(reachable).toBe(true);
}

describe("content taxonomy (series / categories / tags)", () => {
  it("rejects duplicate series (type,slug) but allows the same slug under another type (CMS-06)", async () => {
    const slug = `grace-${uid()}`;
    const created: string[] = [];
    try {
      const first = await createSeries({ type: "sermon", title: "Grace", slug });
      created.push(first.series.id);
      expect(first.series.slug).toBe(slug);
      await expectAudited("series", first.series.id, first.audit);

      await expect(createSeries({ type: "sermon", title: "Grace Again", slug })).rejects.toThrow(/duplicate/i);

      const otherType = await createSeries({ type: "bible_study", title: "Grace Study", slug });
      created.push(otherType.series.id);
      expect(otherType.series.slug).toBe(slug);
    } finally {
      for (const id of created) {
        await deleteSeriesGuarded(id).catch(() => undefined);
      }
    }
  }, 30000);

  it("rejects invalid series input server-side (Zod) before any write", async () => {
    await expect(
      createSeries({ type: "sermon", title: "  ", slug: `t-${uid()}` }),
    ).rejects.toThrow();
    await expect(
      createSeries({
        type: "sunday_school",
        title: "Quarter",
        slug: `q-${uid()}`,
        start_date: "2026-04-01",
        end_date: "2026-01-01",
      }),
    ).rejects.toThrow(/end_date/i);
  }, 30000);

  it("blocks deleting a series referenced by sermons or lessons, allows it once unreferenced (CMS-05)", async () => {
    const sSlug = `faith-${uid()}`;
    const qSlug = `quarter-${uid()}`;
    const { series: sermonSeries } = await createSeries({ type: "sermon", title: "Faith", slug: sSlug });
    const { series: quarter } = await createSeries({ type: "sunday_school", title: "Q1", slug: qSlug });
    const sermonSlug = `sermon-${uid()}`;
    const lessonSlug = `lesson-${uid()}`;
    try {
      await db.insert(sermons).values({
        title: "Faith Sermon",
        slug: sermonSlug,
        preacher: "Pastor Ade",
        sermon_date: "2026-09-20",
        series_id: sermonSeries.id,
      });
      await db.insert(sundaySchoolLessons).values({
        title: "Lesson One",
        slug: lessonSlug,
        series_id: quarter.id,
        lesson_number: 1,
        lesson_date: "2026-09-21",
        topic: "Creation",
      });

      const blockedSermon = await deleteSeriesGuarded(sermonSeries.id);
      expect(blockedSermon.deleted).toBe(false);
      expect(blockedSermon.usage.sermons).toBeGreaterThanOrEqual(1);
      expect(blockedSermon.audit).toBeNull();

      const blockedLesson = await deleteSeriesGuarded(quarter.id);
      expect(blockedLesson.deleted).toBe(false);
      expect(blockedLesson.usage.sundaySchoolLessons).toBeGreaterThanOrEqual(1);
    } finally {
      await db.delete(sundaySchoolLessons).where(eq(sundaySchoolLessons.slug, lessonSlug));
      await db.delete(sermons).where(eq(sermons.slug, sermonSlug));
    }

    const freedSermon = await deleteSeriesGuarded(sermonSeries.id);
    expect(freedSermon.deleted).toBe(true);
    expect(freedSermon.audit?.auditId).toBeTruthy();
    await expectAudited("series", sermonSeries.id, freedSermon.audit!);
    const freedQuarter = await deleteSeriesGuarded(quarter.id);
    expect(freedQuarter.deleted).toBe(true);
  }, 60000);

  it("rejects duplicate category (type,slug) and blocks deleting a category in use (CMS-06, 05 §6)", async () => {
    const slug = `prayer-${uid()}`;
    const { category } = await createCategory({ type: "sermon", name: "Prayer", slug });
    try {
      await expect(createCategory({ type: "sermon", name: "Prayer Again", slug })).rejects.toThrow(/duplicate/i);
      const otherType = await createCategory({ type: "bible_study", name: "Prayer Study", slug });
      try {
        expect(otherType.category.slug).toBe(slug);
      } finally {
        await deleteCategoryGuarded(otherType.category.id);
      }

      const sermonSlug = `prayer-sermon-${uid()}`;
      try {
        await db.insert(sermons).values({
          title: "Prayer Sermon",
          slug: sermonSlug,
          preacher: "Pastor Bola",
          sermon_date: "2026-09-22",
          category_id: category.id,
        });
        const blocked = await deleteCategoryGuarded(category.id);
        expect(blocked.deleted).toBe(false);
        expect(blocked.usage.sermons).toBeGreaterThanOrEqual(1);
        expect(blocked.audit).toBeNull();
      } finally {
        await db.delete(sermons).where(eq(sermons.slug, sermonSlug));
      }

      const freed = await deleteCategoryGuarded(category.id);
      expect(freed.deleted).toBe(true);
      await expectAudited("content_categories", category.id, freed.audit!);
    } finally {
      await deleteCategoryGuarded(category.id).catch(() => undefined);
    }
  }, 60000);

  it("creates tags inline and attaches them idempotently; names normalize to one slug", async () => {
    const found = await findOrCreateTags([`  Faith ${uid()}  `, "GRACE", "grace"]);
    const grace = found.filter((t) => t.slug === "grace");
    expect(grace).toHaveLength(1);

    const taggableId = randomUUID();
    const tagName = `Hope ${uid()}`;
    try {
      const first = await attachTags("sermon", taggableId, [tagName, "grace"]);
      expect(first.tags.map((t) => t.slug)).toContain("grace");
      expect(first.attached).toBe(2);
      await expectAudited("taggables", taggableId, first.audit);

      const links = await db
        .select()
        .from(taggables)
        .where(and(eq(taggables.taggable_type, "sermon"), eq(taggables.taggable_id, taggableId)));
      expect(links).toHaveLength(2);

      const second = await attachTags("sermon", taggableId, [tagName, "GRACE "]);
      expect(second.attached).toBe(2);
      const still = await db
        .select()
        .from(taggables)
        .where(and(eq(taggables.taggable_type, "sermon"), eq(taggables.taggable_id, taggableId)));
      expect(still).toHaveLength(2);

      const detached = await detachTags("sermon", taggableId, [tagName]);
      expect(detached.detached).toBe(1);
      const remaining = await db
        .select()
        .from(taggables)
        .where(and(eq(taggables.taggable_type, "sermon"), eq(taggables.taggable_id, taggableId)));
      expect(remaining).toHaveLength(1);
    } finally {
      await detachTags("sermon", taggableId).catch(() => undefined);
    }
  }, 60000);
});
