import { desc, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { MediaLibrary } from "./media-library";

// MED-01: library grid/list. Server gates + first paint; the client component
// owns filters, pagination, upload progress, replace/delete.
export default async function AdminMediaPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "media.read");
  const can = (key: string) => permissions.has(key);
  const canCreate = can("media.create");
  const canUpdate = can("media.update");
  const canDelete = can("media.delete");

  const initialRows = await db
    .select()
    .from(media)
    .where(isNull(media.deleted_at))
    .orderBy(desc(media.created_at))
    .limit(24);

  return (
    <MediaLibrary
      initialRows={initialRows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }))}
      canCreate={canCreate}
      canUpdate={canUpdate}
      canDelete={canDelete}
    />
  );
}
