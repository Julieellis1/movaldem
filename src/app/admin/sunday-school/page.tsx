import { desc, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { sundaySchoolLessons } from "@/db/schema";
import { ContentList } from "@/components/admin/content-list";

export default async function AdminSundaySchoolPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "sunday_school.read");
  const can = (key: string) => permissions.has(key);

  const rows = await db
    .select({
      id: sundaySchoolLessons.id,
      title: sundaySchoolLessons.title,
      slug: sundaySchoolLessons.slug,
      status: sundaySchoolLessons.status,
      published_at: sundaySchoolLessons.published_at,
      deleted_at: sundaySchoolLessons.deleted_at,
      lesson_number: sundaySchoolLessons.lesson_number,
      topic: sundaySchoolLessons.topic,
      lesson_date: sundaySchoolLessons.lesson_date,
    })
    .from(sundaySchoolLessons)
    .where(isNull(sundaySchoolLessons.deleted_at))
    .orderBy(desc(sundaySchoolLessons.created_at))
    .limit(100);

  return (
    <ContentList
      type="sunday_school"
      apiType="sunday_school"
      basePath="/admin/sunday-school"
      title="Sunday school"
      newLabel="New lesson"
      rows={rows.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        status: r.status,
        published_at: r.published_at?.toISOString() ?? null,
        deleted_at: r.deleted_at?.toISOString() ?? null,
        meta: `Lesson ${r.lesson_number} · ${r.topic} · ${r.lesson_date}`,
      }))}
      canCreate={can("sunday_school.create")}
      canUpdate={can("sunday_school.update")}
      canDelete={can("sunday_school.delete")}
      canPublish={can("sunday_school.publish")}
    />
  );
}
