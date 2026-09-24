import { asc } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { contentCategories } from "@/db/schema";
import { CategoriesManager } from "./categories-manager";

export default async function AdminCategoriesPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "content_categories.read");
  const can = (key: string) => permissions.has(key);

  const rows = await db
    .select()
    .from(contentCategories)
    .orderBy(asc(contentCategories.type), asc(contentCategories.sort_order), asc(contentCategories.name));

  return (
    <CategoriesManager
      initialRows={rows}
      canCreate={can("content_categories.create")}
      canUpdate={can("content_categories.update")}
      canDelete={can("content_categories.delete")}
    />
  );
}
