// Admin → Giving → Project detail/edit (PRJ-01/04).
//
// Server-gated on `projects.read`. Shows progress (raised/target/percent,
// capped bar), then edit / status / soft-delete forms backed by server
// actions that call ProjectService with exact signatures. Delete is a
// soft-delete + audit row; transactions are never touched.

import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { givingProjects, roles, userRoles } from "@/db/schema";
import {
  getProject,
  getProjectProgress,
  PROJECT_STATUSES,
  setProjectStatus,
  updateProject,
} from "@/modules/giving/project.service";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { formatNaira } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

const inputCls =
  "h-10 w-full rounded-full border border-border bg-surface-elevated px-4 text-sm";
const btnPrimary =
  "inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90";
const btnDanger =
  "inline-flex h-10 items-center justify-center rounded-full border border-destructive/40 px-5 text-sm font-medium text-destructive hover:bg-destructive/10";

export default async function AdminProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "projects.read");
  const canUpdate = permissions.has("projects.update") || permissions.has("*");
  const canDelete = permissions.has("projects.delete") || permissions.has("*");

  const { id } = await params;
  const sp = await searchParams;
  const row = await getProject(decodeURIComponent(id));
  if (!row || row.deleted_at) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-text-primary">Project</h1>
        <p className="rounded-xl bg-surface-card p-6 text-sm text-text-tertiary">
          Project not found.{" "}
          <Link href="/admin/giving/projects" className="text-primary hover:underline">
            Back to list
          </Link>
        </p>
      </div>
    );
  }
  const progress = await getProjectProgress(row.id);

  // Captured for the server actions below (plain strings — closures over the
  // nullable `row` don't narrow, and only serializable values may cross).
  const projectId = row.id;
  const projectTitle = row.title;
  const projectSlug = row.slug;

  async function save(formData: FormData) {
    "use server";
    const s = await getCurrentSession();
    if (!s.user) throw new Error("Unauthorized");
    const opt = (k: string) => {
      const v = String(formData.get(k) ?? "").trim();
      return v === "" ? null : v;
    };
    const targetRaw = String(formData.get("target_naira") ?? "").trim();
    try {
      await updateProject(
        projectId,
        {
          title: opt("title") ?? undefined,
          slug: opt("slug") ?? undefined,
          description: formData.has("description") ? opt("description") : undefined,
          target_naira: targetRaw === "" ? undefined : Number(targetRaw),
          start_date: formData.has("start_date") ? opt("start_date") : undefined,
          end_date: formData.has("end_date") ? opt("end_date") : undefined,
        },
        { role: "admin", userId: s.user.id },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      redirect(`/admin/giving/projects/${projectId}?error=${encodeURIComponent(message)}`);
    }
    redirect(`/admin/giving/projects/${projectId}?saved=1`);
  }

  async function changeStatus(formData: FormData) {
    "use server";
    const s = await getCurrentSession();
    if (!s.user) throw new Error("Unauthorized");
    const to = String(formData.get("status") ?? "");
    try {
      await setProjectStatus(
        projectId,
        to as (typeof PROJECT_STATUSES)[number],
        { role: "admin", userId: s.user.id },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Status change failed";
      redirect(`/admin/giving/projects/${projectId}?error=${encodeURIComponent(message)}`);
    }
    redirect(`/admin/giving/projects/${projectId}?saved=1`);
  }

  async function remove() {
    "use server";
    const s = await getCurrentSession();
    if (!s.user) throw new Error("Unauthorized");
    await db
      .update(givingProjects)
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where(eq(givingProjects.id, projectId));
    const roleRows = await db
      .select({ key: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.role_id))
      .where(eq(userRoles.user_id, s.user.id));
    await auditLog(db, {
      actor_user_id: s.user.id,
      actor_role: roleRows.map((r) => r.key).join(",") || null,
      action: "project.delete",
      entity_type: "giving_projects",
      entity_id: projectId,
      changes: { title: projectTitle, slug: projectSlug },
    });
    redirect("/admin/giving/projects");
  }

  return (
    <div className="max-w-xl space-y-6">
      <Link
        href="/admin/giving/projects"
        className="text-sm text-text-secondary hover:text-text-primary"
      >
        ← Projects
      </Link>
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {row.title}
        </h1>
        <Badge variant="secondary">{row.status}</Badge>
      </div>
      {sp.error && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {sp.error}
        </p>
      )}
      {sp.saved && (
        <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm text-primary">
          Saved.
        </p>
      )}

      <section className="rounded-xl bg-surface-card p-4" aria-label="Progress">
        <p className="text-sm text-text-secondary">
          Raised {formatNaira(progress.raisedKobo)} of {formatNaira(progress.targetKobo)} ·{" "}
          {progress.percent1dp}%
        </p>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-elevated"
          role="progressbar"
          aria-valuenow={progress.barPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${row.title} progress`}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progress.barPercent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          Derived from successful transactions only; never edited by hand.
        </p>
      </section>

      {canUpdate && (
        <>
          <form action={save} className="space-y-4 rounded-xl bg-surface-card p-4">
            <h2 className="font-medium text-text-primary">Edit</h2>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Title
              </span>
              <input name="title" defaultValue={row.title} maxLength={200} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Slug
              </span>
              <input name="slug" defaultValue={row.slug} maxLength={160} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Description
              </span>
              <textarea
                name="description"
                rows={4}
                defaultValue={row.description ?? ""}
                className="w-full rounded-2xl border border-border bg-surface-elevated px-4 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Target (₦)
              </span>
              <input
                name="target_naira"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={(row.target_amount / 100).toFixed(2)}
                className={inputCls}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Start date
                </span>
                <input
                  name="start_date"
                  type="date"
                  defaultValue={row.start_date ?? ""}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  End date
                </span>
                <input
                  name="end_date"
                  type="date"
                  defaultValue={row.end_date ?? ""}
                  className={inputCls}
                />
              </label>
            </div>
            <button type="submit" className={btnPrimary}>
              Save changes
            </button>
          </form>

          <form action={changeStatus} className="flex flex-wrap items-end gap-3 rounded-xl bg-surface-card p-4">
            <h2 className="w-full font-medium text-text-primary">Status</h2>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Set status
              </span>
              <select name="status" defaultValue={row.status} className={inputCls}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={btnPrimary}>
              Apply
            </button>
          </form>
        </>
      )}

      {canDelete && (
        <form action={remove} className="rounded-xl bg-surface-card p-4">
          <h2 className="font-medium text-text-primary">Danger zone</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Soft-delete only. Recorded transactions stay untouched.
          </p>
          <button type="submit" className={`${btnDanger} mt-3`}>
            Delete project
          </button>
        </form>
      )}
    </div>
  );
}
