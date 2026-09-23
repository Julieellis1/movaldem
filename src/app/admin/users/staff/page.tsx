import { listStaff } from "@/modules/platform/users/users.service";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { inviteStaffAction } from "../actions";
import { StaffTable } from "@/components/admin/staff-table";
import { ROLE_KEYS } from "../../../../../drizzle/seeders/roles";

// super_admin only: middleware redirects viewers without staff.read, and the
// invite action re-checks staff.invite server-side (PERM-01/USR-03).
export default async function AdminStaffPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "staff.read");
  const canInvite = permissions.has("staff.invite") || permissions.has("*");
  const staff = await listStaff();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Staff</h1>

      {canInvite ? (
        <form action={inviteStaffAction} className="flex flex-wrap items-end gap-3 rounded-xl bg-surface-card p-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Email</span>
            <input
              name="email"
              type="email"
              required
              placeholder="staff@church.org"
              className="h-10 rounded-full border border-border bg-surface-elevated px-4 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Role</span>
            <select
              name="role"
              required
              className="h-10 rounded-full border border-border bg-surface-elevated px-4 text-sm"
            >
              {Object.entries(ROLE_KEYS)
                .filter(([key]) => key !== "member")
                .map(([key, name]) => (
                  <option key={key} value={key}>
                    {String(name)}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Invite
          </button>
        </form>
      ) : (
        <p className="text-sm text-text-tertiary">You can view staff but cannot send invitations.</p>
      )}

      <StaffTable staff={staff} />
    </div>
  );
}
