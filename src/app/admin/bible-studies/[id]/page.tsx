import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { bibleStudies, contentCategories, series, taggables, tags } from "@/db/schema";
import { ContentForm } from "@/components/admin/content-form";

export default async function EditBibleStudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "bible_studies.read");
  requirePermission(permissions, "bible_studies.update");
  const canPublish = permissions.has("bible_studies.publish");

  const [row] = await db.select().from(bibleStudies).where(eq(bibleStudies.id, id));
  if (!row) notFound();

  const [seriesRows, categoryRows, tagRows] = await Promise.all([
    db.select({ id: series.id, title: series.title }).from(series).where(eq(series.type, "bible_study")).orderBy(asc(series.title)),
    db
      .select({ id: contentCategories.id, name: contentCategories.name })
      .from(contentCategories)
      .where(eq(contentCategories.type, "bible_study"))
      .orderBy(asc(contentCategories.name)),
    db
      .select({ name: tags.name })
      .from(taggables)
      .innerJoin(tags, eq(tags.id, taggables.tag_id))
      .where(eq(taggables.taggable_id, id)),
  ]);

  const initial: Record<string, string | number | boolean | null> = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    featured_media_id: row.featured_media_id,
    audio_media_id: row.audio_media_id,
    video_media_id: row.video_media_id,
    document_media_id: row.document_media_id,
    download_enabled: row.download_enabled,
    series_id: row.series_id,
    category_id: row.category_id,
    is_featured: row.is_featured,
    status: row.status,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    og_media_id: row.og_media_id,
    teacher: row.teacher,
    study_date: row.study_date,
    scripture_reference: row.scripture_reference,
    lesson_number: row.lesson_number,
    deleted_at: row.deleted_at?.toISOString() ?? null,
  };

  return (
    <ContentForm
      type="bible_study"
      basePath="/admin/bible-studies"
      initial={initial}
      initialTags={tagRows.map((t) => t.name)}
      seriesOptions={seriesRows.map((s) => ({ id: s.id, label: s.title }))}
      categoryOptions={categoryRows.map((c) => ({ id: c.id, label: c.name }))}
      showPublishControls={canPublish}
    />
  );
}
