import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { ContentCard } from "@/components/content/content-card";
import { Pagination } from "@/components/content/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { canonicalUrl, formatLagosDate, parsePage } from "@/modules/content/spotlight";
import { listAlbums, type AlbumRow } from "@/modules/content/gallery.service";

// PRD 04 §4 (LST-01..05) + 05 §12: published albums only, newest first,
// 12 per page with real ?page= URLs, empty state with reset.
export const metadata: Metadata = {
  title: "Gallery | MOVALDEM",
  description: "Photographs from services, programmes and events at MOVALDEM.",
  alternates: { canonical: canonicalUrl("/gallery") },
};

const PAGE_SIZE = 12;

async function AlbumsView({ page }: { page: number }) {
  let rows: AlbumRow[];
  try {
    rows = await listAlbums({ publishedOnly: true });
  } catch {
    return (
      <ErrorState
        title="Could not load gallery"
        description="Something went wrong while loading the gallery. Please try again."
        action={
          <Link
            href="/gallery"
            className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
          >
            Try again
          </Link>
        }
      />
    );
  }
  const ids = [...new Set(rows.map((r) => r.cover_media_id).filter((v): v is string => Boolean(v)))];
  const covers = new Map<string, { url: string; alt: string }>();
  if (ids.length > 0) {
    const mediaRows = await db.select().from(media).where(inArray(media.id, ids));
    for (const m of mediaRows) {
      covers.set(m.id, { url: m.public_url, alt: m.alt_text?.trim() || m.title?.trim() || "" });
    }
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const items = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <EmptyState
          title="No photo albums yet"
          description="Gallery albums will appear here once they are published."
          action={
            <Link
              href="/gallery"
              className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
            >
              Reset filters
            </Link>
          }
        />
      ) : (
        <>
          <div role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a) => {
              const cover = a.cover_media_id ? covers.get(a.cover_media_id) : undefined;
              return (
                <div key={a.id} role="listitem">
                  <ContentCard
                    title={a.title}
                    href={`/gallery/${a.slug}`}
                    thumbnailUrl={cover?.url ?? null}
                    thumbnailAlt={cover?.alt || a.title}
                    date={a.album_date ? formatLagosDate(a.album_date) : ""}
                  />
                </div>
              );
            })}
          </div>
          <Pagination page={safePage} totalPages={totalPages} basePath="/gallery" />
        </>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <LoadingSkeleton key={i} className="h-64 w-full" />
      ))}
    </div>
  );
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const page = parsePage(sp.page);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 max-w-2xl">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">Gallery</h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Moments from our services, programmes and gatherings.
        </p>
      </header>
      <Suspense fallback={<ListSkeleton />}>
        <AlbumsView page={page} />
      </Suspense>
    </main>
  );
}
