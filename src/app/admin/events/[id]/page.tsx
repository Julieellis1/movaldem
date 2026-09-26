import { notFound } from "next/navigation";
import { asc, eq, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { events, programmes } from "@/db/schema";
import { EventForm } from "@/components/admin/event-form";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "events.read");
  requirePermission(permissions, "events.update");
  const canPublish = permissions.has("events.publish") || permissions.has("*");

  const [row] = await db.select().from(events).where(eq(events.id, id));
  if (!row) notFound();

  const programmeRows = await db
    .select({ id: programmes.id, title: programmes.title })
    .from(programmes)
    .where(isNull(programmes.deleted_at))
    .orderBy(asc(programmes.title));

  const initial: Record<string, string | boolean | null> = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    featured_media_id: row.featured_media_id,
    start_date: row.start_date,
    end_date: row.end_date,
    start_time: row.start_time,
    end_time: row.end_time,
    venue: row.venue,
    address: row.address,
    organizer: row.organizer,
    contact_phone: row.contact_phone,
    is_featured: row.is_featured,
    registration_enabled: row.registration_enabled,
    registration_url: row.registration_url,
    programme_id: row.programme_id,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    status: row.status,
  };

  return (
    <EventForm
      basePath="/admin/events"
      initial={initial}
      programmeOptions={programmeRows.map((p) => ({ id: p.id, label: p.title }))}
      showPublishControls={canPublish}
    />
  );
}
