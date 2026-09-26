import { desc, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { events } from "@/db/schema";
import { LifecycleList } from "@/components/admin/lifecycle-list";

// Server-owned permission gate before any row renders (PERM-01).
export default async function AdminEventsPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "events.read");
  const can = (key: string) => permissions.has(key) || permissions.has("*");

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      status: events.status,
      start_date: events.start_date,
      end_date: events.end_date,
      venue: events.venue,
      is_featured: events.is_featured,
    })
    .from(events)
    .where(isNull(events.deleted_at))
    .orderBy(desc(events.created_at))
    .limit(100);

  return (
    <LifecycleList
      apiBase="/api/events"
      basePath="/admin/events"
      title="Events"
      newLabel="New event"
      rows={rows.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        status: r.status,
        meta: `${r.start_date}${r.end_date && r.end_date !== r.start_date ? ` – ${r.end_date}` : ""}${r.venue ? ` · ${r.venue}` : ""}${r.is_featured ? " · Featured" : ""}`,
      }))}
      canCreate={can("events.create")}
      canUpdate={can("events.update")}
      canDelete={can("events.delete")}
      canPublish={can("events.publish")}
    />
  );
}
