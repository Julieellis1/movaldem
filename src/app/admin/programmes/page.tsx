import { desc, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { programmes } from "@/db/schema";
import { LifecycleList } from "@/components/admin/lifecycle-list";

// Server-owned permission gate before any row renders (PERM-01).
export default async function AdminProgrammesPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "programmes.read");
  const can = (key: string) => permissions.has(key) || permissions.has("*");

  const rows = await db
    .select({
      id: programmes.id,
      title: programmes.title,
      slug: programmes.slug,
      status: programmes.status,
      start_date: programmes.start_date,
      end_date: programmes.end_date,
      venue: programmes.venue,
    })
    .from(programmes)
    .where(isNull(programmes.deleted_at))
    .orderBy(desc(programmes.created_at))
    .limit(100);

  return (
    <LifecycleList
      apiBase="/api/programmes"
      basePath="/admin/programmes"
      title="Programmes"
      newLabel="New programme"
      rows={rows.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        status: r.status,
        meta: `${r.start_date} – ${r.end_date}${r.venue ? ` · ${r.venue}` : ""}`,
      }))}
      canCreate={can("programmes.create")}
      canUpdate={can("programmes.update")}
      canDelete={can("programmes.delete")}
      canPublish={can("programmes.publish")}
    />
  );
}
