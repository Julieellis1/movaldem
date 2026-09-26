import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { givingProjects } from "@/db/schema";
import { auth } from "@/modules/auth/auth.config";
import { getSetting } from "@/modules/platform/settings/settings.service";
import { canonicalUrl, excerptOf } from "@/modules/content/spotlight";
import {
  getActiveProject,
  getProjectBySlug,
  getProjectProgress,
  lagosDateString,
} from "@/modules/giving/project.service";
import { GivingForm } from "@/components/giving/giving-form";
import { ProjectProgress } from "@/components/giving/project-progress";
import { EmptyState } from "@/components/shared/empty-state";

// PRD 06 §5: public project page — card + progress (PRJ-01, no donor names
// PRJ-03) + prefilled GivingForm. Non-active projects render a "closed"
// message instead of the form (PRJ-02).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const canonical = canonicalUrl(`/give/project/${slug}`);
  const project = await getProjectBySlug(slug).catch(() => null);
  if (!project)
    return { title: "Project not found | MOVALDEM", alternates: { canonical } };
  return {
    title: `${project.title} | Give | MOVALDEM`,
    description:
      excerptOf(project.description) ||
      `Support ${project.title} with a secure online gift.`,
    alternates: { canonical },
  };
}

export default async function ProjectGivePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug).catch(() => null);
  if (!project) notFound();

  // PRJ-02 gate: only active + within date range accepts gifts.
  const active = await getActiveProject(slug).catch(() => null);

  const progress = await getProjectProgress(project.id).catch(() => null);

  const [siblings, requirePhone, session] = await Promise.all([
    db
      .select({
        id: givingProjects.id,
        slug: givingProjects.slug,
        title: givingProjects.title,
        start_date: givingProjects.start_date,
        end_date: givingProjects.end_date,
      })
      .from(givingProjects)
      .where(
        and(
          eq(givingProjects.status, "active"),
          isNull(givingProjects.deleted_at),
        ),
      )
      .then((rows) => {
        const today = lagosDateString(new Date());
        return rows
          .filter(
            (r) =>
              (!r.start_date || r.start_date <= today) &&
              (!r.end_date || r.end_date >= today),
          )
          .map(({ id, slug, title }) => ({ id, slug, title }));
      })
      .catch(() => []),
    getSetting<boolean>(db, "giving.require_phone", false).catch(() => false),
    auth.api.getSession({ headers: await headers() }).catch(() => null),
  ]);

  const sessionUser = session?.user as
    | { id?: string; name?: string | null; email?: string | null }
    | undefined;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-on-surface-variant">
        <Link href="/give" className="hover:underline">
          Give
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{project.title}</span>
      </nav>

      <article className="rounded-xl border border-border-subtle bg-surface-card p-5 sm:p-6">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">
          {project.title}
        </h1>
        {project.description && (
          <div
            className="mt-3 max-w-none font-body-md text-body-md text-text-primary"
            dangerouslySetInnerHTML={{ __html: project.description }}
          />
        )}
        {progress && (
          <div className="mt-5">
            <ProjectProgress
              raisedKobo={progress.raisedKobo}
              targetKobo={progress.targetKobo}
              percent1dp={progress.percent1dp}
            />
          </div>
        )}
        <div className="mt-5">
          {active ? (
            <GivingForm
              initialType="project"
              initialProjectId={project.id}
              projects={
                siblings.some((s) => s.id === project.id)
                  ? siblings
                  : [
                      ...siblings,
                      {
                        id: project.id,
                        slug: project.slug,
                        title: project.title,
                      },
                    ]
              }
              requirePhone={requirePhone ?? false}
              prefill={{
                name: sessionUser?.name ?? undefined,
                email: sessionUser?.email ?? undefined,
                userId: sessionUser?.id,
              }}
            />
          ) : (
            <EmptyState
              title="This project is closed to giving"
              description="This project is no longer accepting gifts. You can still give a tithe, offering or general gift."
              action={
                <Link
                  href="/give"
                  className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Give another way
                </Link>
              }
            />
          )}
        </div>
      </article>
    </main>
  );
}
