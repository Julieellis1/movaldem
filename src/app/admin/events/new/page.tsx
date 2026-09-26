import { asc, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { programmes } from "@/db/schema";
import { EventForm } from "@/components/admin/event-form";

export default async function NewEventPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "events.create");
  const canPublish = permissions.has("events.publish") || permissions.has("*");

  const programmeRows = await db
    .select({ id: programmes.id, title: programmes.title })
    .from(programmes)
    .where(isNull(programmes.deleted_at))
    .orderBy(asc(programmes.title));

  return (
    <EventForm
      basePath="/admin/events"
      programmeOptions={programmeRows.map((p) => ({ id: p.id, label: p.title }))}
      showPublishControls={canPublish}
    />
  );
}
