import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentCard } from "@/components/content/content-card";
import { EmptyState } from "@/components/shared/empty-state";
import { canonicalUrl, excerptOf, getSundaySchoolSeriesBySlug } from "@/modules/content/spotlight";

// PRD 04 sitemap + 05 §5: public quarter (series) page lists lessons in order
// with previous/next navigation. Lessons published+due only (CMS-03 via
// isPubliclyVisible in spotlight). SEO basics: title/description + canonical.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getSundaySchoolSeriesBySlug(slug);
  const canonical = canonicalUrl(`/sunday-school/series/${slug}`);
  if (!page) return { title: "Quarter not found | MOVALDEM", alternates: { canonical } };
  const description = excerptOf(page.description) ?? `Sunday school lessons for ${page.title}`;
  return {
    title: `${page.title} | Sunday School | MOVALDEM`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${page.title} | Sunday School | MOVALDEM`,
      description,
      url: canonical,
      type: "website",
      ...(page.coverUrl ? { images: [{ url: page.coverUrl }] } : {}),
    },
    twitter: { card: "summary_large_image", title: page.title, description },
  };
}

export default async function SundaySchoolSeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getSundaySchoolSeriesBySlug(slug);
  if (!page) notFound();
  const range =
    page.startDate || page.endDate
      ? `${page.startDate ?? ""}${page.startDate && page.endDate ? " – " : ""}${page.endDate ?? ""}`
      : null;
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-on-surface-variant">
        <Link href="/sunday-school" className="hover:underline">
          Sunday School
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{page.title}</span>
      </nav>
      <header className="mb-6 max-w-2xl">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">{page.title}</h1>
        {range && <p className="mt-2 text-sm text-on-surface-variant">{range}</p>}
        {page.description && (
          <div
            className="mt-3 font-body-md text-body-md text-on-surface-variant"
            dangerouslySetInnerHTML={{ __html: page.description }}
          />
        )}
      </header>
      {page.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={page.coverUrl}
          alt={page.title}
          loading="lazy"
          className="mb-6 aspect-video w-full max-w-3xl rounded-xl object-cover"
        />
      )}
      {page.lessons.length === 0 ? (
        <EmptyState
          title="No lessons published in this quarter yet"
          description="Please check back later for lessons in this quarter."
          action={
            <Link
              href="/sunday-school"
              className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
            >
              All lessons
            </Link>
          }
        />
      ) : (
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.lessons.map((l, i) => (
            <li key={l.id} className="flex flex-col gap-2">
              <ContentCard
                title={`Lesson ${l.lessonNumber}: ${l.title}`}
                href={l.href}
                thumbnailUrl={l.thumbnailUrl}
                thumbnailAlt={l.thumbnailAlt || l.title}
                date={l.dateLabel}
                metadata={[l.topic, l.teacher].filter(Boolean).join(" · ")}
                audioUrl={l.audioUrl}
                videoUrl={l.videoUrl}
                videoEmbedUrl={l.videoEmbedUrl}
                pdfUrl={l.pdfUrl}
                downloadEnabled={l.downloadEnabled}
              />
              <div className="flex justify-between text-sm">
                {i > 0 ? (
                  <Link
                    href={page.lessons[i - 1].href}
                    className="text-on-surface-variant hover:underline"
                    aria-label={`Previous lesson: ${page.lessons[i - 1].title}`}
                  >
                    Previous
                  </Link>
                ) : (
                  <span />
                )}
                {i < page.lessons.length - 1 && (
                  <Link
                    href={page.lessons[i + 1].href}
                    className="text-on-surface-variant hover:underline"
                    aria-label={`Next lesson: ${page.lessons[i + 1].title}`}
                  >
                    Next
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
