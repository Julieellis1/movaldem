import { and, asc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { contentCategories, series } from "@/db/schema";
import { ContentForm } from "@/components/admin/content-form";

export default async function NewBibleStudyPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "bible_studies.create");
  const canPublish = permissions.has("bible_studies.publish");

  const [seriesRows, categoryRows] = await Promise.all([
    db.select({ id: series.id, title: series.title }).from(series).where(eq(series.type, "bible_study")).orderBy(asc(series.title)),
    db
      .select({ id: contentCategories.id, name: contentCategories.name })
      .from(contentCategories)
      .where(and(eq(contentCategories.type, "bible_study"), eq(contentCategories.is_active, true)))
      .orderBy(asc(contentCategories.name)),
  ]);

  return (
    <ContentForm
      type="bible_study"
      basePath="/admin/bible-studies"
      seriesOptions={seriesRows.map((s) => ({ id: s.id, label: s.title }))}
      categoryOptions={categoryRows.map((c) => ({ id: c.id, label: c.name }))}
      showPublishControls={canPublish}
    />
  );
}
