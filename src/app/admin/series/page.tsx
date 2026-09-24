import { asc } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { series } from "@/db/schema";
import { SeriesManager } from "./series-manager";

export default async function AdminSeriesPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "series.read");
  const can = (key: string) => permissions.has(key);

  const rows = await db.select().from(series).orderBy(asc(series.type), asc(series.sort_order), asc(series.title));

  return (
    <SeriesManager
      initialRows={rows}
      canCreate={can("series.create")}
      canUpdate={can("series.update")}
      canDelete={can("series.delete")}
    />
  );
}
