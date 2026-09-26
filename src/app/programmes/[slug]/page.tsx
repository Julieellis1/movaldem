import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { AgendaView } from "@/components/content/agenda-view";
import {
  getAgenda,
  getProgrammeBySlug,
  type ProgrammeRow,
} from "@/modules/content/programme.service";
import { isPubliclyVisible } from "@/modules/content/lifecycle";
import { canonicalUrl, excerptOf, findRedirect, formatLagosDate } from "@/modules/content/spotlight";

// PRD 04 §5 detail + 05 §11: title, metadata, description, featured image and
// the public agenda grouped by day. SEO basics: title/description + canonical.
async function loadProgramme(slug: string): Promise<ProgrammeRow> {
  const row = await getProgrammeBySlug(slug);
  if (!row) {
    const redirected = await findRedirect(`/programmes/${slug}`);
    if (redirected) redirect(redirected);
    notFound();
  }
  if (!isPubliclyVisible(row)) {
    const redirected = await findRedirect(`/programmes/${slug}`);
    if (redirected) redirect(redirected);
    notFound();
  }
  return row;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const canonical = canonicalUrl(`/programmes/${slug}`);
  const row = await getProgrammeBySlug(slug);
  if (!row || !isPubliclyVisible(row)) {
    return { title: "Programme not found | MOVALDEM", alternates: { canonical } };
  }
  const generated = excerptOf(row.description);
  const description =
    row.seo_description ?? (generated === "" ? `Programme at MOVALDEM: ${row.title}` : generated);
  return {
    title: `${row.seo_title ?? row.title} | MOVALDEM`,
    description,
    alternates: { canonical },
    openGraph: { title: row.seo_title ?? row.title, description, url: canonical, type: "article" },
    twitter: { card: "summary_large_image", title: row.seo_title ?? row.title, description },
  };
}

export default async function ProgrammeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await loadProgramme(slug);
  const agenda = await getAgenda(row.id);
  const sessions = agenda.flatMap((day) => day.sessions);
  let thumbnailUrl: string | null = null;
  let thumbnailAlt = row.title;
  if (row.featured_media_id) {
    const [m] = await db.select().from(media).where(inArray(media.id, [row.featured_media_id]));
    if (m?.public_url?.trim()) {
      thumbnailUrl = m.public_url.trim();
      thumbnailAlt = m.alt_text?.trim() || m.title?.trim() || row.title;
    }
  }
  const range =
    row.end_date === row.start_date
      ? formatLagosDate(row.start_date)
      : `${formatLagosDate(row.start_date)} – ${formatLagosDate(row.end_date)}`;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-on-surface-variant">
        <Link href="/programmes" className="hover:underline">
          Programmes
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{row.title}</span>
      </nav>
      <h1 className="font-headline-lg text-headline-lg text-text-primary">{row.title}</h1>
      <p className="mt-2 font-body-md text-body-md text-on-surface-variant">{range}</p>
      {row.venue && <p className="mt-1 text-sm text-on-surface-variant">{row.venue}</p>}
      {thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt={thumbnailAlt}
          loading="lazy"
          className="mt-6 aspect-video w-full rounded-xl object-cover"
        />
      )}
      {row.description && (
        <div
          className="mt-6 max-w-none font-body-md text-body-md text-text-primary"
          dangerouslySetInnerHTML={{ __html: row.description }}
        />
      )}
      <section aria-label="Programme agenda" className="mt-10">
        <h2 className="mb-4 font-headline-sm text-headline-sm text-text-primary">Agenda</h2>
        <AgendaView sessions={sessions} />
      </section>
    </main>
  );
}
