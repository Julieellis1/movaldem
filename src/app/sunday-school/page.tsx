import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContentCard } from "@/components/content/content-card";
import { Pagination } from "@/components/content/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import {
  canonicalUrl,
  firstParam,
  listSundaySchoolLessons,
  parseLessonNumber,
  parsePage,
  parseYear,
  type SundaySchoolFilters,
} from "@/modules/content/spotlight";

// PRD 04 §4 (LST-01..05) + 05 §5: 12/page newest-first, real ?page= URLs,
// published+due only (CMS-03 via isPubliclyVisible in spotlight), cards with
// MediaAvailability badges, empty state with reset, URL-synced filters
// (quarter/series, lesson number, topic, date). Server-rendered GET form keeps
// every filter in the URL so views are shareable (LST-05), mobile-first 360px.
export const metadata: Metadata = {
  title: "Sunday School | MOVALDEM",
  description: "Sunday school lessons by quarter. Filter by quarter, lesson number, topic or date.",
  alternates: { canonical: canonicalUrl("/sunday-school") },
};

function ListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
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

const selectClass =
  "h-10 w-full rounded-full border border-input bg-surface-elevated px-4 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
const labelClass = "text-xs font-medium text-on-surface-variant";

async function SundaySchoolView({ filters }: { filters: SundaySchoolFilters }) {
  let result;
  try {
    result = await listSundaySchoolLessons(filters);
  } catch {
    return (
      <ErrorState
        title="Could not load Sunday school lessons"
        description="Something went wrong while loading lessons. Please try again."
        action={
          <Link
            href="/sunday-school"
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
    series: filters.series,
    teacher: filters.teacher,
    year: filters.year,
    lesson: filters.lesson !== undefined ? String(filters.lesson) : undefined,
    topic: filters.topic,
  };
  return (
    <div className="space-y-6">
      <form
        method="get"
        action="/sunday-school"
        role="search"
        aria-label="Filter Sunday school lessons"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="filter-quarter" className={labelClass}>
            Quarter
          </label>
          <select id="filter-quarter" name="series" defaultValue={filters.series ?? ""} className={selectClass}>
            <option value="">All quarters</option>
            {options.series.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="filter-teacher" className={labelClass}>
            Teacher
          </label>
          <select id="filter-teacher" name="teacher" defaultValue={filters.teacher ?? ""} className={selectClass}>
            <option value="">All teachers</option>
            {options.teachers.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="filter-lesson" className={labelClass}>
            Lesson number
          </label>
          <input
            id="filter-lesson"
            name="lesson"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="e.g. 3"
            defaultValue={filters.lesson ?? ""}
            className={selectClass}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="filter-topic" className={labelClass}>
            Topic
          </label>
          <input
            id="filter-topic"
            name="topic"
            type="search"
            placeholder="Search topic or title"
            defaultValue={filters.topic ?? ""}
            className={selectClass}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="filter-year" className={labelClass}>
            Date (year)
          </label>
          <select id="filter-year" name="year" defaultValue={filters.year ?? ""} className={selectClass}>
            <option value="">All years</option>
            {options.years.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
          <button
            type="submit"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Apply filters
          </button>
          <Link
            href="/sunday-school"
            className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
          >
            Reset filters
          </Link>
        </div>
      </form>
      {items.length === 0 ? (
        <EmptyState
          title="No Sunday school lessons match your filters"
          description="Try adjusting or resetting your filters to see more lessons."
          action={
            <Link
              href="/sunday-school"
              className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
            >
              Reset filters
            </Link>
          }
        />
      ) : (
        <>
          <div role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((l) => (
              <div key={l.id} role="listitem">
                <ContentCard
                  title={`Lesson ${l.lessonNumber}: ${l.title}`}
                  href={l.href}
                  thumbnailUrl={l.thumbnailUrl}
                  thumbnailAlt={l.thumbnailAlt || l.title}
                  date={l.dateLabel}
                  metadata={[l.topic, l.series?.title, l.teacher].filter(Boolean).join(" · ")}
                  audioUrl={l.audioUrl}
                  videoUrl={l.videoUrl}
                  videoEmbedUrl={l.videoEmbedUrl}
                  pdfUrl={l.pdfUrl}
                  downloadEnabled={l.downloadEnabled}
                />
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} basePath="/sunday-school" searchParams={params} />
        </>
      )}
    </div>
  );
}

export default async function SundaySchoolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters: SundaySchoolFilters = {
    series: firstParam(sp.series),
    teacher: firstParam(sp.teacher),
    year: parseYear(sp.year),
    lesson: parseLessonNumber(sp.lesson),
    topic: firstParam(sp.topic),
    page: parsePage(sp.page),
  };
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 max-w-2xl">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">Sunday School</h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Lessons grouped by quarter, with memory verses and study notes.
        </p>
      </header>
      <Suspense fallback={<ListSkeleton />}>
        <SundaySchoolView filters={filters} />
      </Suspense>
    </main>
  );
}
