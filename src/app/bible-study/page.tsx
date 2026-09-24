import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContentCard } from "@/components/content/content-card";
import { FilterBar } from "@/components/content/filter-bar";
import { Pagination } from "@/components/content/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import {
  canonicalUrl,
  firstParam,
  listBibleStudies,
  parsePage,
  parseYear,
  type BibleStudyFilters,
} from "@/modules/content/spotlight";

// PRD 04 §4 (LST-01..05): 12/page newest-first, real ?page= URLs, published+due
// only (CMS-03 via isPubliclyVisible in spotlight), cards with
// MediaAvailability badges, empty state with reset, URL-synced filters
// (teacher/date/category/series).
export const metadata: Metadata = {
  title: "Bible Study | MOVALDEM",
  description: "Study the Word with MOVALDEM Bible studies. Filter by teacher, date, topic or series.",
  alternates: { canonical: canonicalUrl("/bible-study") },
};

function ListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <LoadingSkeleton key={i} className="h-10 w-full rounded-full" />
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

async function BibleStudyView({ filters }: { filters: BibleStudyFilters }) {
  let result;
  try {
    result = await listBibleStudies(filters);
  } catch {
    return (
      <ErrorState
        title="Could not load Bible studies"
        description="Something went wrong while loading Bible studies. Please try again."
        action={
          <Link
            href="/bible-study"
            className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
          >
            Reset filters
          </Link>
        }
      />
    );
  }
  const { items, totalPages, page, options } = result;
  const params: Record<string, string | undefined> = {
    teacher: filters.teacher,
    year: filters.year,
    category: filters.category,
    series: filters.series,
  };
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingSkeleton className="h-10 w-full rounded-full" />}>
        <FilterBar
          personParamName="teacher"
          personLabel="Teacher"
          personOptions={options.teachers}
          categoryOptions={options.categories}
          seriesOptions={options.series}
          yearOptions={options.years}
        />
      </Suspense>
      {items.length === 0 ? (
        <EmptyState
          title="No Bible studies match your filters"
          description="Try adjusting or resetting your filters to see more studies."
          action={
            <Link
              href="/bible-study"
              className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
            >
              Reset filters
            </Link>
          }
        />
      ) : (
        <>
          <div role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((s) => (
              <div key={s.id} role="listitem">
                <ContentCard
                  title={s.title}
                  href={s.href}
                  thumbnailUrl={s.thumbnailUrl}
                  thumbnailAlt={s.thumbnailAlt || s.title}
                  date={s.dateLabel}
                  metadata={[s.teacher, s.scriptureReference, s.series?.title, s.category?.name]
                    .filter(Boolean)
                    .join(" · ")}
                  audioUrl={s.audioUrl}
                  videoUrl={s.videoUrl}
                  videoEmbedUrl={s.videoEmbedUrl}
                  pdfUrl={s.pdfUrl}
                  downloadEnabled={s.downloadEnabled}
                />
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} basePath="/bible-study" searchParams={params} />
        </>
      )}
    </div>
  );
}

export default async function BibleStudyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters: BibleStudyFilters = {
    teacher: firstParam(sp.teacher),
    year: parseYear(sp.year),
    category: firstParam(sp.category),
    series: firstParam(sp.series),
    page: parsePage(sp.page),
  };
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 max-w-2xl">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">Bible Study</h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Dig deeper into the Word with our Bible study teachings.
        </p>
      </header>
      <Suspense fallback={<ListSkeleton />}>
        <BibleStudyView filters={filters} />
      </Suspense>
    </main>
  );
}
