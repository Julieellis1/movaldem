import { listMembers } from "@/modules/platform/users/users.service";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { MembersTable } from "@/components/admin/members-table";
import { restoreMember, suspendMember } from "./actions";

// Server-owned permission gate runs before any row is rendered (PERM-01); the
// middleware check is the fast path, this is the authoritative one.
export default async function AdminUsersPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "members.read");
  const { rows, total } = await listMembers({ limit: 100 });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Members</h1>
        <p className="text-sm text-text-tertiary">{total} total</p>
      </div>
      <MembersTable rows={rows} onSuspend={suspendMember} onRestore={restoreMember} />
    </div>
  );
}
