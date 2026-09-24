import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { contentCategories, series, sermons, taggables, tags } from "@/db/schema";
import { ContentForm } from "@/components/admin/content-form";

export default async function EditSermonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "sermons.read");
  requirePermission(permissions, "sermons.update");
  const canPublish = permissions.has("sermons.publish");

  const [row] = await db.select().from(sermons).where(eq(sermons.id, id));
  if (!row) notFound();
  const deletedAt = row.deleted_at;

  const [seriesRows, categoryRows, tagRows] = await Promise.all([
    db.select({ id: series.id, title: series.title }).from(series).where(eq(series.type, "sermon")).orderBy(asc(series.title)),
    db
      .select({ id: contentCategories.id, name: contentCategories.name })
      .from(contentCategories)
      .where(eq(contentCategories.type, "sermon"))
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
    preacher: row.preacher,
    sermon_date: row.sermon_date,
    scripture_reference: row.scripture_reference,
    deleted_at: deletedAt?.toISOString() ?? null,
  };

  return (
    <ContentForm
      type="sermon"
      basePath="/admin/sermons"
      initial={initial}
      initialTags={tagRows.map((t) => t.name)}
      seriesOptions={seriesRows.map((s) => ({ id: s.id, label: s.title }))}
      categoryOptions={categoryRows.map((c) => ({ id: c.id, label: c.name }))}
      showPublishControls={canPublish}
    />
  );
}
