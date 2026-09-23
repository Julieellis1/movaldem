import { listRolesWithPermissions } from "@/modules/platform/users/users.service";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { Badge } from "@/components/ui/badge";

// Read-only view of the RBAC matrix; editing a role's permission set is a
// later-phase concern (USR-04). The keys are shown verbatim so admins can map
// what a role can do to the permission checks enforced in code.
export default async function AdminRolesPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "roles.read");
  const roles = await listRolesWithPermissions();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Roles</h1>
      <div className="space-y-4">
        {roles.map((role) => (
          <section key={role.id} className="rounded-xl bg-surface-card p-5">
            <div className="flex items-center gap-2">
              <h2 className="font-headline-sm text-headline-sm text-text-primary">{role.name}</h2>
              {role.is_system && <Badge variant="secondary">system</Badge>}
            </div>
            {role.description && <p className="mt-1 text-sm text-text-tertiary">{role.description}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {role.permissions.length ? (
                role.permissions.map((key) => (
                  <Badge key={key} variant="outline" className="font-mono text-xs">
                    {key}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-text-tertiary">No permissions</span>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
