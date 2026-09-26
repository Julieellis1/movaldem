import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { EventCard } from "@/components/content/event-card";
import { Pagination } from "@/components/content/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { canonicalUrl, parsePage, firstParam } from "@/modules/content/spotlight";
import { listFeatured, listPast, listUpcoming, type EventRow } from "@/modules/content/event.service";
import { cn } from "@/lib/utils";

// PRD 04 §4 (LST-01..05): upcoming default, past + featured filters reflected
// in the URL (?filter=), real ?page= URLs, 12 per page, empty state + reset.
// PRD 05 §10: upcoming ascending, past descending, featured.
export const metadata: Metadata = {
  title: "Events | MOVALDEM",
  description: "Upcoming and past events at MOVALDEM. Find service times, venues and add events to your calendar.",
  alternates: { canonical: canonicalUrl("/events") },
};

const PAGE_SIZE = 12;
type EventsFilter = "upcoming" | "past" | "featured";

function parseFilter(raw: string | string[] | undefined): EventsFilter {
  const v = firstParam(raw);
  if (v === "past" || v === "featured") return v;
  return "upcoming";
}

function filterHref(filter: EventsFilter): string {
  return filter === "upcoming" ? "/events" : `/events?filter=${filter}`;
}

async function thumbnailMap(rows: EventRow[]): Promise<Map<string, { url: string; alt: string }>> {
  const ids = [...new Set(rows.map((r) => r.featured_media_id).filter((v): v is string => Boolean(v)))];
  if (ids.length === 0) return new Map();
  const mediaRows = await db.select().from(media).where(inArray(media.id, ids));
  return new Map(
    mediaRows.map((m) => [m.id, { url: m.public_url, alt: m.alt_text?.trim() || m.title?.trim() || "" }]),
  );
}

async function EventsView({ filter, page }: { filter: EventsFilter; page: number }) {
  let rows: EventRow[];
  try {
    const now = new Date();
    rows =
      filter === "past"
        ? await listPast(now, 200)
        : filter === "featured"
          ? await listFeatured(now, 200)
          : await listUpcoming(now, 200);
  } catch {
    return (
      <ErrorState
        title="Could not load events"
        description="Something went wrong while loading events. Please try again."
        action={
          <Link
            href="/events"
            className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
          >
            Reset filters
          </Link>
        }
      />
    );
  }
  const thumbs = await thumbnailMap(rows);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const items = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const tabs: Array<{ key: EventsFilter; label: string }> = [
    { key: "upcoming", label: "Upcoming" },
    { key: "past", label: "Past" },
    { key: "featured", label: "Featured" },
  ];
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Event filters" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            role="tab"
            aria-selected={filter === t.key}
            href={filterHref(t.key)}
            className={cn(
              "rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === t.key && "bg-surface-elevated font-semibold",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState
          title={filter === "past" ? "No past events" : filter === "featured" ? "No featured events" : "No upcoming events"}
          description="Check back soon or reset the filter to browse all events."
          action={
            <Link
              href="/events"
              className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
            >
              Reset filters
            </Link>
          }
        />
      ) : (
        <>
          <div role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((e) => {
              const thumb = e.featured_media_id ? thumbs.get(e.featured_media_id) : undefined;
              return (
                <div key={e.id} role="listitem">
                  <EventCard
                    event={{
                      slug: e.slug,
                      title: e.title,
                      start_date: e.start_date,
                      end_date: e.end_date,
                      start_time: e.start_time,
                      end_time: e.end_time,
                      venue: e.venue,
                      address: e.address,
                      is_featured: e.is_featured,
                      isPast: filter === "past",
                      thumbnailUrl: thumb?.url ?? null,
                      thumbnailAlt: thumb?.alt ?? e.title,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <Pagination
            page={safePage}
            totalPages={totalPages}
            basePath="/events"
            searchParams={filter === "upcoming" ? {} : { filter }}
          />
        </>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <LoadingSkeleton key={i} className="h-10 w-28 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <LoadingSkeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    </div>
  );
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = parseFilter(sp.filter);
  const page = parsePage(sp.page);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 max-w-2xl">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">Events</h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Services, revivals and special occasions at MOVALDEM.
        </p>
      </header>
      <Suspense fallback={<ListSkeleton />}>
        <EventsView filter={filter} page={page} />
      </Suspense>
    </main>
  );
}
