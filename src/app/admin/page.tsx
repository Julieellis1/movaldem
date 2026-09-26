import Link from "next/link";
import { getDashboardStats } from "@/modules/platform/users/users.service";
import { getCurrentSession } from "@/lib/server-session";
import { Card } from "@/components/admin/card";

// Dashboard: flat stat cards (2-up on phones), recent activity, and quick
// links into the live sections. No placeholder chrome for shipped phases.
export default async function AdminHomePage() {
  const [stats, { permissions }] = await Promise.all([getDashboardStats(), getCurrentSession()]);
  const can = (perm: string) => permissions.has(perm) || permissions.has("*");

  const quickLinks = [
    can("sermons.read") && { href: "/admin/sermons", label: "Sermons", hint: "Teachings" },
    can("events.read") && { href: "/admin/events", label: "Events", hint: "Gatherings" },
    can("gallery.read") && { href: "/admin/gallery", label: "Gallery", hint: "Photos" },
    can("media.read") && { href: "/admin/media", label: "Media", hint: "Library" },
  ].filter((l): l is { href: string; label: string; hint: string } => Boolean(l));

  const comingSoon = [
    { label: "Giving", hint: "Phase 4" },
    { label: "Quizzes", hint: "Phase 5" },
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary md:text-2xl">Dashboard</h1>
        <p className="mt-0.5 text-sm text-text-tertiary">Ministry at a glance</p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card label="Members" value={String(stats.totalMembers)}>
          <p className="truncate text-xs text-text-tertiary">
            {stats.verifiedMembers} verified · {stats.unverifiedMembers} pending
          </p>
        </Card>
        <Card label="Staff" value={String(stats.staffCount)} />
        <Card label="Email failures" value={String(stats.failedNotifications)}>
          <p className="truncate text-xs text-text-tertiary">
            {stats.failedNotifications ? "Review the queue" : "All deliveries healthy"}
          </p>
        </Card>
        <Card label="Last cron run" value="—">
          <p className="truncate text-xs text-text-tertiary">External scheduler</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <section aria-label="Recent registrations" className="rounded-xl bg-surface-card p-4 md:p-5 lg:col-span-3">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-medium text-text-primary">Recent registrations</h2>
            {can("members.read") && (
              <Link href="/admin/users" className="shrink-0 text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            )}
          </div>
          <div className="divide-y divide-border-subtle">
            {stats.recent.length ? (
              stats.recent.map((user) => (
                <div key={user.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{user.full_name}</p>
                    <p className="truncate text-xs text-text-tertiary">{user.email}</p>
                  </div>
                  <span className="shrink-0 text-xs text-text-tertiary">
                    {new Date(user.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-4 text-sm text-text-tertiary">No registrations yet.</p>
            )}
          </div>
        </section>

        <section aria-label="Quick links" className="lg:col-span-2">
          <h2 className="mb-2 text-base font-medium text-text-primary">Manage</h2>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2">
            {quickLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-xl bg-surface-card p-4 transition-colors hover:bg-surface-elevated"
                >
                  <p className="truncate text-sm font-medium text-text-primary">{link.label}</p>
                  <p className="truncate text-xs text-text-tertiary">{link.hint}</p>
                </Link>
              </li>
            ))}
            {comingSoon.map((item) => (
              <li
                key={item.label}
                className="rounded-xl bg-surface-card p-4 opacity-60"
                aria-label={`${item.label}, coming ${item.hint}`}
              >
                <p className="truncate text-sm font-medium text-text-primary">{item.label}</p>
                <p className="truncate text-xs text-text-tertiary">{item.hint}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
