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
import { listProgrammes, type ProgrammeRow } from "@/modules/content/programme.service";

// PRD 04 §4 (LST-01..05) + 05 §11: published programmes, start_date ascending,
// 12 per page with real ?page= URLs, empty state with reset.
export const metadata: Metadata = {
  title: "Programmes | MOVALDEM",
  description: "Ministry programmes at MOVALDEM: conventions, revivals, conferences and special sessions.",
  alternates: { canonical: canonicalUrl("/programmes") },
};

const PAGE_SIZE = 12;

function formatRange(p: ProgrammeRow): string {
  const start = formatLagosDate(p.start_date);
  const end = formatLagosDate(p.end_date);
  return p.end_date === p.start_date ? start : `${start} – ${end}`;
}

async function ProgrammesView({ page }: { page: number }) {
  let rows: ProgrammeRow[];
  try {
    rows = await listProgrammes(new Date(), 200);
  } catch {
    return (
      <ErrorState
        title="Could not load programmes"
        description="Something went wrong while loading programmes. Please try again."
        action={
          <Link
            href="/programmes"
            className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
          >
            Try again
          </Link>
        }
      />
    );
  }
  const ids = [...new Set(rows.map((r) => r.featured_media_id).filter((v): v is string => Boolean(v)))];
  const thumbs = new Map<string, { url: string; alt: string }>();
  if (ids.length > 0) {
    const mediaRows = await db.select().from(media).where(inArray(media.id, ids));
    for (const m of mediaRows) {
      thumbs.set(m.id, { url: m.public_url, alt: m.alt_text?.trim() || m.title?.trim() || "" });
    }
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const items = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <EmptyState
          title="No programmes yet"
          description="Ministry programmes will appear here once they are published."
          action={
            <Link
              href="/programmes"
              className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
            >
              Reset filters
            </Link>
          }
        />
      ) : (
        <>
          <div role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => {
              const thumb = p.featured_media_id ? thumbs.get(p.featured_media_id) : undefined;
              return (
                <div key={p.id} role="listitem">
                  <ContentCard
                    title={p.title}
                    href={`/programmes/${p.slug}`}
                    thumbnailUrl={thumb?.url ?? null}
                    thumbnailAlt={thumb?.alt || p.title}
                    date={formatRange(p)}
                    metadata={p.venue ?? undefined}
                  />
                </div>
              );
            })}
          </div>
          <Pagination page={safePage} totalPages={totalPages} basePath="/programmes" />
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

export default async function ProgrammesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const page = parsePage(sp.page);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 max-w-2xl">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">Programmes</h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Conventions, revivals, conferences and multi-session ministry occasions.
        </p>
      </header>
      <Suspense fallback={<ListSkeleton />}>
        <ProgrammesView page={page} />
      </Suspense>
    </main>
  );
}
