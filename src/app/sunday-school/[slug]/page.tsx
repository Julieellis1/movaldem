import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AudioPlayer } from "@/components/content/audio-player";
import { ContentCard } from "@/components/content/content-card";
import { MediaAvailability } from "@/components/content/media-availability";
import { PdfViewer } from "@/components/content/pdf-viewer";
import { ShareButtons } from "@/components/content/share-buttons";
import { VideoPlayer } from "@/components/content/video-player";
import {
  canonicalUrl,
  excerptOf,
  findRedirect,
  getSundaySchoolLessonBySlug,
} from "@/modules/content/spotlight";

// PRD 04 §5 + 05 §5 detail: title, metadata (lesson number, date, topic,
// memory verse, teacher), description/introduction, featured image, media
// section honoring download_enabled, share buttons, prev/next navigation
// within the quarter, related lessons. SEO basics: title/description +
// canonical.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await getSundaySchoolLessonBySlug(slug);
  const canonical = canonicalUrl(`/sunday-school/${slug}`);
  if (!item) return { title: "Lesson not found | MOVALDEM", alternates: { canonical } };
  const description =
    item.seoDescription ?? excerptOf(item.description ?? item.introduction) ?? `Sunday school lesson: ${item.topic}`;
  return {
    title: `${item.seoTitle ?? `Lesson ${item.lessonNumber}: ${item.title}`} | MOVALDEM`,
    description,
    alternates: { canonical },
    openGraph: {
      title: item.seoTitle ?? item.title,
      description,
      url: canonical,
      type: "article",
      ...(item.thumbnailUrl ? { images: [{ url: item.thumbnailUrl }] } : {}),
    },
    twitter: { card: "summary_large_image", title: item.seoTitle ?? item.title, description },
  };
}

export default async function SundaySchoolLessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const redirected = await findRedirect(`/sunday-school/${slug}`);
  if (redirected) redirect(redirected);
  const item = await getSundaySchoolLessonBySlug(slug);
  if (!item) notFound();
  const shareUrl = canonicalUrl(`/sunday-school/${item.slug}`);
  const metadata = [`Lesson ${item.lessonNumber}`, item.dateLabel, item.topic, item.teacher]
    .filter(Boolean)
    .join(" · ");
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-on-surface-variant">
        <Link href="/sunday-school" className="hover:underline">
          Sunday School
        </Link>
        {item.series && (
          <>
            <span aria-hidden="true"> / </span>
            <Link href={`/sunday-school/series/${item.series.slug}`} className="hover:underline">
              {item.series.title}
            </Link>
          </>
        )}
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Lesson {item.lessonNumber}</span>
      </nav>
      <p className="text-sm font-medium text-on-surface-variant">
        Lesson {item.lessonNumber} · {item.dateLabel}
      </p>
      <h1 className="mt-1 font-headline-lg text-headline-lg text-text-primary">{item.title}</h1>
      <p className="mt-2 font-body-md text-body-md text-on-surface-variant">Topic: {item.topic}</p>
      {item.memoryVerse && (
        <blockquote className="mt-4 rounded-xl border border-border-subtle bg-surface-card p-4">
          <p className="text-xs font-medium text-on-surface-variant">Memory verse</p>
          <p className="mt-1 font-body-md text-body-md text-text-primary">{item.memoryVerse}</p>
        </blockquote>
      )}
      {item.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnailUrl}
          alt={item.thumbnailAlt || item.title}
          loading="lazy"
          className="mt-6 aspect-video w-full rounded-xl object-cover"
        />
      )}
      {item.introduction && (
        <div
          className="mt-6 max-w-none font-body-md text-body-md text-text-primary"
          dangerouslySetInnerHTML={{ __html: item.introduction }}
        />
      )}
      {item.description && (
        <div
          className="mt-4 max-w-none font-body-md text-body-md text-text-primary"
          dangerouslySetInnerHTML={{ __html: item.description }}
        />
      )}
      <div className="mt-8 space-y-6">
        <MediaAvailability
          variant="detail"
          audioUrl={item.audioUrl}
          videoUrl={item.videoUrl}
          videoEmbedUrl={item.videoEmbedUrl}
          pdfUrl={item.pdfUrl}
          downloadEnabled={item.downloadEnabled}
          downloadUrl={item.downloadUrl}
        />
        {item.audioUrl && <AudioPlayer src={item.audioUrl} title={`${item.title} audio`} />}
        {(item.videoUrl || item.videoEmbedUrl) && (
          <VideoPlayer videoUrl={item.videoUrl} videoEmbedUrl={item.videoEmbedUrl} title={`${item.title} video`} />
        )}
        {item.pdfUrl && (
          <PdfViewer pdfUrl={item.pdfUrl} downloadEnabled={item.downloadEnabled} downloadUrl={item.downloadUrl} title={`${item.title} notes (PDF)`} />
        )}
      </div>
      <nav aria-label="Lesson navigation" className="mt-8 flex flex-wrap justify-between gap-2">
        {item.prev ? (
          <Link
            href={item.prev.href}
            className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
          >
            Previous: Lesson {item.prev.lessonNumber}
          </Link>
        ) : (
          <span />
        )}
        {item.next && (
          <Link
            href={item.next.href}
            className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
          >
            Next: Lesson {item.next.lessonNumber}
          </Link>
        )}
      </nav>
      <div className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-on-surface-variant">Share this lesson</h2>
        <ShareButtons url={shareUrl} title={item.title} text={`${item.title} — ${metadata}`} />
      </div>
      {item.related.length > 0 && (
        <section aria-label="More lessons in this quarter" className="mt-10">
          <h2 className="mb-4 font-headline-sm text-headline-sm text-text-primary">More in this quarter</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {item.related.map((r) => (
              <ContentCard
                key={r.id}
                title={`Lesson ${r.lessonNumber}: ${r.title}`}
                href={r.href}
                thumbnailUrl={r.thumbnailUrl}
                thumbnailAlt={r.thumbnailAlt || r.title}
                date={r.dateLabel}
                metadata={r.topic}
                audioUrl={r.audioUrl}
                videoUrl={r.videoUrl}
                videoEmbedUrl={r.videoEmbedUrl}
                pdfUrl={r.pdfUrl}
                downloadEnabled={r.downloadEnabled}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
