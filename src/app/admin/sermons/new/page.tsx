import { and, asc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { contentCategories, series } from "@/db/schema";
import { ContentForm } from "@/components/admin/content-form";

export default async function NewSermonPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "sermons.create");
  const canPublish = permissions.has("sermons.publish");

  const [seriesRows, categoryRows] = await Promise.all([
    db.select({ id: series.id, title: series.title }).from(series).where(eq(series.type, "sermon")).orderBy(asc(series.title)),
    db
      .select({ id: contentCategories.id, name: contentCategories.name })
      .from(contentCategories)
      .where(and(eq(contentCategories.type, "sermon"), eq(contentCategories.is_active, true)))
      .orderBy(asc(contentCategories.name)),
  ]);

  return (
    <ContentForm
      type="sermon"
      basePath="/admin/sermons"
      seriesOptions={seriesRows.map((s) => ({ id: s.id, label: s.title }))}
      categoryOptions={categoryRows.map((c) => ({ id: c.id, label: c.name }))}
      showPublishControls={canPublish}
    />
  );
}
