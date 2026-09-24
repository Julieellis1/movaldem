import { desc, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { bibleStudies } from "@/db/schema";
import { ContentList } from "@/components/admin/content-list";

export default async function AdminBibleStudiesPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "bible_studies.read");
  const can = (key: string) => permissions.has(key);

  const rows = await db
    .select({
      id: bibleStudies.id,
      title: bibleStudies.title,
      slug: bibleStudies.slug,
      status: bibleStudies.status,
      published_at: bibleStudies.published_at,
      deleted_at: bibleStudies.deleted_at,
      teacher: bibleStudies.teacher,
      study_date: bibleStudies.study_date,
    })
    .from(bibleStudies)
    .where(isNull(bibleStudies.deleted_at))
    .orderBy(desc(bibleStudies.created_at))
    .limit(100);

  return (
    <ContentList
      type="bible_study"
      apiType="bible_study"
      basePath="/admin/bible-studies"
      title="Bible studies"
      newLabel="New Bible study"
      rows={rows.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        status: r.status,
        published_at: r.published_at?.toISOString() ?? null,
        deleted_at: r.deleted_at?.toISOString() ?? null,
        meta: `${r.teacher} · ${r.study_date}`,
      }))}
      canCreate={can("bible_studies.create")}
      canUpdate={can("bible_studies.update")}
      canDelete={can("bible_studies.delete")}
      canPublish={can("bible_studies.publish")}
    />
  );
}
