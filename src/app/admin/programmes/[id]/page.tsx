import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { programmes } from "@/db/schema";
import { getAgenda } from "@/modules/content/programme.service";
import { ProgrammeForm } from "@/components/admin/programme-form";

export default async function EditProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "programmes.read");
  requirePermission(permissions, "programmes.update");
  const canPublish = permissions.has("programmes.publish") || permissions.has("*");

  const [row] = await db.select().from(programmes).where(eq(programmes.id, id));
  if (!row) notFound();

  const agenda = await getAgenda(id);

  const initial: Record<string, string | boolean | null> = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    start_date: row.start_date,
    end_date: row.end_date,
    venue: row.venue,
    featured_media_id: row.featured_media_id,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    status: row.status,
  };

  return (
    <ProgrammeForm
      basePath="/admin/programmes"
      initial={initial}
      initialSessions={agenda.flatMap((d) => d.sessions)}
      showPublishControls={canPublish}
    />
  );
}
