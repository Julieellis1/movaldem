import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "@/modules/platform/users/users.service";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { restoreMember, suspendMember } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Profile fields are read-only here; mutation stays in the list/actions layer
// so permission checks live in exactly one place (PERM-01).
export default async function AdminMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "members.read");

  const member = await getMember(id);
  if (!member) notFound();
  const suspended = member.status !== "active";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/users" className="text-sm text-primary hover:underline">
          ← Back to members
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{member.full_name}</h1>
          <Badge variant={suspended ? "secondary" : "default"}>{member.status}</Badge>
        </div>
        <p className="text-sm text-text-tertiary">{member.email}</p>
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Phone" value={member.phone || "—"} />
        <Detail label="Church" value={member.church || "—"} />
        <Detail label="Age range" value={member.age_range || "—"} />
        <Detail label="Gender" value={member.gender || "—"} />
        <Detail label="Email verified" value={member.email_verified ? "Yes" : "No"} />
        <Detail label="Consent" value={member.consent_at ? "Given" : "—"} />
        <Detail label="Last login" value={member.last_login_at ? member.last_login_at.toLocaleString() : "Never"} />
        <Detail label="Joined" value={member.created_at.toLocaleString()} />
        <Detail label="Quiz attempts" value={String(member.quiz_attempts)} />
        <Detail label="Giving total" value={String(member.transactions_total)} />
      </dl>

      {canSuspend(permissions) && (
        <form
          action={async (formData) => {
            "use server";
            if (suspended) await restoreMember(formData);
            else await suspendMember(formData);
          }}
          className="flex gap-3"
        >
          <input type="hidden" name="id" value={member.id} />
          <Button type="submit" variant={suspended ? "default" : "destructive"}>
            {suspended ? "Restore member" : "Suspend member"}
          </Button>
        </form>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-card p-4">
      <dt className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{label}</dt>
      <dd className="mt-1 text-sm text-text-primary">{value}</dd>
    </div>
  );
}

function canSuspend(permissions: Set<string>) {
  return permissions.has("members.suspend") || permissions.has("*");
}
