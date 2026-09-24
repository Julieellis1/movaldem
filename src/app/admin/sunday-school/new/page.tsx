import { asc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { contentCategories, series } from "@/db/schema";
import { ContentForm } from "@/components/admin/content-form";

export default async function NewSundaySchoolLessonPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "sunday_school.create");
  const canPublish = permissions.has("sunday_school.publish");

  // A quarter is a series of type sunday_school — series is required (§5).
  const [seriesRows, categoryRows] = await Promise.all([
    db.select({ id: series.id, title: series.title }).from(series).where(eq(series.type, "sunday_school")).orderBy(asc(series.title)),
    db
      .select({ id: contentCategories.id, name: contentCategories.name })
      .from(contentCategories)
      .where(eq(contentCategories.is_active, true))
      .orderBy(asc(contentCategories.name)),
  ]);

  return (
    <ContentForm
      type="sunday_school"
      basePath="/admin/sunday-school"
      seriesOptions={seriesRows.map((s) => ({ id: s.id, label: s.title }))}
      categoryOptions={categoryRows.map((c) => ({ id: c.id, label: c.name }))}
      showPublishControls={canPublish}
    />
  );
}
