// Admin → Giving → Projects list (PRJ-01 progress display).
//
// Server-gated on `projects.read`. Progress bars cap at 100% while the
// numeric raised amount may exceed target (PRJ-01). Amounts via formatNaira.

import Link from "next/link";
import { desc, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { givingProjects } from "@/db/schema";
import { formatNaira } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

function progress(raised: number, target: number) {
  const percent1dp = target > 0 ? Math.round((raised / target) * 1000) / 10 : 0;
  return { percent1dp, bar: Math.min(100, percent1dp) };
}

export default async function AdminProjectsPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "projects.read");
  const canCreate = permissions.has("projects.create") || permissions.has("*");

  const rows = await db
    .select()
    .from(givingProjects)
    .where(isNull(givingProjects.deleted_at))
    .orderBy(desc(givingProjects.created_at))
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          Giving projects
        </h1>
        {canCreate && (
          <Link
            href="/admin/giving/projects/new"
            className="ml-auto inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            New project
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-surface-card p-6 text-sm text-text-tertiary">
          No projects yet. Create one to start accepting project gifts.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((p) => {
            const { percent1dp, bar } = progress(p.amount_raised_cached, p.target_amount);
            return (
              <li key={p.id} className="rounded-xl bg-surface-card p-4">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/giving/projects/${p.id}`}
                    className="min-w-0 flex-1 truncate font-medium text-text-primary hover:underline"
                  >
                    {p.title}
                  </Link>
                  <Badge variant="secondary">{p.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  Raised {formatNaira(p.amount_raised_cached)} of {formatNaira(p.target_amount)} ·{" "}
                  {percent1dp}%
                </p>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-surface-elevated"
                  role="progressbar"
                  aria-valuenow={bar}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${p.title} progress`}
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${bar}%` }} />
                </div>
                <p className="mt-2 text-xs text-text-tertiary">
                  /{p.slug}
                  {p.end_date ? ` · ends ${p.end_date}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
