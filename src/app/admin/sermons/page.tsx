import { desc, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { sermons } from "@/db/schema";
import { ContentList } from "@/components/admin/content-list";

// Server-owned permission gate before any row renders (PERM-01).
export default async function AdminSermonsPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "sermons.read");
  const can = (key: string) => permissions.has(key);

  const rows = await db
    .select({
      id: sermons.id,
      title: sermons.title,
      slug: sermons.slug,
      status: sermons.status,
      published_at: sermons.published_at,
      deleted_at: sermons.deleted_at,
      preacher: sermons.preacher,
      sermon_date: sermons.sermon_date,
    })
    .from(sermons)
    .where(isNull(sermons.deleted_at))
    .orderBy(desc(sermons.created_at))
    .limit(100);

  return (
    <ContentList
      type="sermon"
      apiType="sermon"
      basePath="/admin/sermons"
      title="Sermons"
      newLabel="New sermon"
      rows={rows.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        status: r.status,
        published_at: r.published_at?.toISOString() ?? null,
        deleted_at: r.deleted_at?.toISOString() ?? null,
        meta: `${r.preacher} · ${r.sermon_date}`,
      }))}
      canCreate={can("sermons.create")}
      canUpdate={can("sermons.update")}
      canDelete={can("sermons.delete")}
      canPublish={can("sermons.publish")}
    />
  );
}
