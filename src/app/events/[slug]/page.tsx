import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { AddToCalendarButton, icsHrefFor } from "@/components/content/add-to-calendar-button";
import { ShareButtons } from "@/components/content/share-buttons";
import { formatEventDateTime, lagosInstant } from "@/components/content/event-card";
import { getEventBySlug, type EventRow } from "@/modules/content/event.service";
import { isPubliclyVisible } from "@/modules/content/lifecycle";
import { canonicalUrl, excerptOf, findRedirect } from "@/modules/content/spotlight";

// PRD 04 §5 detail + 05 §10: title, metadata, description, featured image,
// registration link, Event JSON-LD (SEO-05), AddToCalendar (.ics), share
// buttons (§8). SEO basics: title/description + canonical (full sitemap
// deferred to Phase 7).
async function loadEvent(slug: string): Promise<EventRow> {
  const row = await getEventBySlug(slug);
  if (!row) {
    const redirected = await findRedirect(`/events/${slug}`);
    if (redirected) redirect(redirected);
    notFound();
  }
  if (!isPubliclyVisible(row)) {
    const redirected = await findRedirect(`/events/${slug}`);
    if (redirected) redirect(redirected);
    notFound();
  }
  return row;
}

function eventJsonLd(row: EventRow, url: string) {
  const start = lagosInstant(row.start_date, row.start_time);
  const endDate = row.end_date ?? row.start_date;
  const end = lagosInstant(endDate, row.end_time ?? row.start_time);
  const location = [row.venue, row.address].filter(Boolean).join(", ");
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: row.title,
    url,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    ...(location ? { location: { "@type": "Place", name: row.venue ?? location, address: location } } : {}),
    ...(row.description ? { description: excerptOf(row.description) } : {}),
    eventStatus: "https://schema.org/EventScheduled",
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const canonical = canonicalUrl(`/events/${slug}`);
  const row = await getEventBySlug(slug);
  if (!row || !isPubliclyVisible(row)) {
    return { title: "Event not found | MOVALDEM", alternates: { canonical } };
  }
  const generated = excerptOf(row.description);
  const description = row.seo_description ?? (generated === "" ? `Event at MOVALDEM on ${row.start_date}` : generated);
  let thumbnailUrl: string | null = null;
  if (row.featured_media_id) {
    const [m] = await db.select().from(media).where(inArray(media.id, [row.featured_media_id]));
    thumbnailUrl = m?.public_url?.trim() || null;
  }
  return {
    title: `${row.seo_title ?? row.title} | MOVALDEM`,
    description,
    alternates: { canonical },
    openGraph: {
      title: row.seo_title ?? row.title,
      description,
      url: canonical,
      type: "article",
      ...(thumbnailUrl ? { images: [{ url: thumbnailUrl }] } : {}),
    },
    twitter: { card: "summary_large_image", title: row.seo_title ?? row.title, description },
  };
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await loadEvent(slug);
  const shareUrl = canonicalUrl(`/events/${row.slug}`);
  let thumbnailUrl: string | null = null;
  let thumbnailAlt = row.title;
  if (row.featured_media_id) {
    const [m] = await db.select().from(media).where(inArray(media.id, [row.featured_media_id]));
    if (m?.public_url?.trim()) {
      thumbnailUrl = m.public_url.trim();
      thumbnailAlt = m.alt_text?.trim() || m.title?.trim() || row.title;
    }
  }
  const venue = [row.venue, row.address].filter(Boolean).join(", ");
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd(row, shareUrl)) }}
      />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-on-surface-variant">
        <Link href="/events" className="hover:underline">
          Events
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{row.title}</span>
      </nav>
      <h1 className="font-headline-lg text-headline-lg text-text-primary">{row.title}</h1>
      <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
        <time dateTime={row.start_date}>{formatEventDateTime(row)}</time>
      </p>
      {venue && <p className="mt-1 text-sm text-on-surface-variant">{venue}</p>}
      {(row.organizer || row.contact_phone) && (
        <p className="mt-1 text-sm text-on-surface-variant">
          {[row.organizer, row.contact_phone].filter(Boolean).join(" · ")}
        </p>
      )}
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
      <div className="mt-8 flex flex-wrap gap-2">
        <AddToCalendarButton href={icsHrefFor(row.slug)} />
        {row.registration_enabled && row.registration_url && (
          <a
            href={row.registration_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Register
          </a>
        )}
      </div>
      <div className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-on-surface-variant">Share this event</h2>
        <ShareButtons url={shareUrl} title={row.title} text={`${row.title} — ${formatEventDateTime(row)}`} />
      </div>
    </main>
  );
}
