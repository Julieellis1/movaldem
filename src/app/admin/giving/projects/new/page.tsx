// Admin → Giving → New project (PRJ-04: creation audit-logged in service).
//
// Server-gated on `projects.create`. The form posts to a server action that
// calls createProject with its exact signature, then redirects to the list.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { createProject } from "@/modules/giving/project.service";

async function create(formData: FormData) {
  "use server";
  const { user } = await getCurrentSession();
  if (!user) throw new Error("Unauthorized");
  const target = Number(formData.get("target_naira"));
  const opt = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? undefined : v;
  };
  try {
    await createProject(
      {
        title: String(formData.get("title") ?? "").trim(),
        slug: opt("slug"),
        description: opt("description"),
        target_naira: target,
        start_date: opt("start_date"),
        end_date: opt("end_date"),
      },
      { role: "admin", userId: user.id },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    redirect(`/admin/giving/projects/new?error=${encodeURIComponent(message)}`);
  }
  redirect("/admin/giving/projects?created=1");
}

const inputCls =
  "h-10 w-full rounded-full border border-border bg-surface-elevated px-4 text-sm";

export default async function AdminNewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "projects.create");
  const { error } = await searchParams;

  return (
    <div className="max-w-xl space-y-6">
      <Link
        href="/admin/giving/projects"
        className="text-sm text-text-secondary hover:text-text-primary"
      >
        ← Projects
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
        New project
      </h1>
      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <form action={create} className="space-y-4 rounded-xl bg-surface-card p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Title *
          </span>
          <input name="title" required maxLength={200} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Slug (optional)
          </span>
          <input name="slug" maxLength={160} placeholder="auto from title" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Description
          </span>
          <textarea
            name="description"
            rows={4}
            className="w-full rounded-2xl border border-border bg-surface-elevated px-4 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Target (₦) *
          </span>
          <input
            name="target_naira"
            type="number"
            required
            min="0.01"
            step="0.01"
            placeholder="1000000.00"
            className={inputCls}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Start date
            </span>
            <input name="start_date" type="date" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              End date
            </span>
            <input name="end_date" type="date" className={inputCls} />
          </label>
        </div>
        <button
          type="submit"
          className="inline-flex h-10 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create project
        </button>
      </form>
    </div>
  );
}
