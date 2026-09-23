import { getDashboardStats } from "@/modules/platform/users/users.service";
import { Card } from "@/components/admin/card";

// Foundation dashboard: people + operational health only. Content, giving and
// quiz cards are placeholders that activate in their phases (ADM-03).
export default async function AdminHomePage() {
  const stats = await getDashboardStats();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Members" value={String(stats.totalMembers)}>
          <p className="text-xs text-text-tertiary">
            {stats.verifiedMembers} verified · {stats.unverifiedMembers} pending
          </p>
        </Card>
        <Card label="Staff accounts" value={String(stats.staffCount)} />
        <Card label="Email failures" value={String(stats.failedNotifications)}>
          <p className="text-xs text-text-tertiary">
            {stats.failedNotifications ? "Review the notifications queue" : "All deliveries healthy"}
          </p>
        </Card>
        <Card label="Last cron run" value="—">
          <p className="text-xs text-text-tertiary">Scheduled jobs land in a later task</p>
        </Card>
      </div>

      <section className="rounded-xl bg-surface-card p-5">
        <h2 className="font-headline-sm text-headline-sm text-text-primary">Recent registrations</h2>
        <div className="mt-3 divide-y divide-border">
          {stats.recent.length ? (
            stats.recent.map((user) => (
              <div key={user.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-text-primary">{user.full_name}</p>
                  <p className="text-xs text-text-tertiary">{user.email}</p>
                </div>
                <span className="text-xs text-text-tertiary">
                  {new Date(user.created_at).toLocaleDateString()}
                </span>
              </div>
            ))
          ) : (
            <p className="py-4 text-sm text-text-tertiary">No registrations yet.</p>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Sermons", phase: "Phase 2" },
          { label: "Giving", phase: "Phase 3" },
          { label: "Quizzes", phase: "Phase 5" },
        ].map((placeholder) => (
          <section
            key={placeholder.label}
            className="rounded-xl border border-dashed border-border bg-surface-base p-5"
          >
            <h3 className="font-headline-sm text-headline-sm text-text-primary">{placeholder.label}</h3>
            <p className="mt-1 text-sm text-text-tertiary">Available after {placeholder.phase}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
