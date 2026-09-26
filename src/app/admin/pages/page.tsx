import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import {
  BranchesManager,
  LeadersManager,
  SitePagesEditor,
} from "@/components/admin/pages-admin";

// PRD 05 §13 church information: site pages editor + leaders + branches.
// Guarded by pages.read; managers receive create/update capability flags.
// No delete UI anywhere on this page.
export default async function AdminPagesPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "pages.read");
  const can = (key: string) => permissions.has(key) || permissions.has("*");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Pages</h1>
      <SitePagesEditor canUpdate={can("pages.update")} />
      <LeadersManager canCreate={can("pages.create")} canUpdate={can("pages.update")} />
      <BranchesManager canCreate={can("pages.create")} canUpdate={can("pages.update")} />
    </div>
  );
}
