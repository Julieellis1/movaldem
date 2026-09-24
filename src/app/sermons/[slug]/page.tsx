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
  getSermonBySlug,
} from "@/modules/content/spotlight";

// PRD 04 §5 detail: title, metadata, description, featured image, media
// section (audio/video/PDF honoring download_enabled), share buttons,
// related items (same series/category). SEO basics: title/description +
// canonical (full JSON-LD/sitemap deferred to Phase 7).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await getSermonBySlug(slug);
  const canonical = canonicalUrl(`/sermons/${slug}`);
  if (!item) return { title: "Sermon not found | MOVALDEM", alternates: { canonical } };
  const generated = excerptOf(item.description);
  const description = item.seoDescription ?? (generated === "" ? `Sermon by ${item.preacher}` : generated);
  return {
    title: `${item.seoTitle ?? item.title} | MOVALDEM`,
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

export default async function SermonDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const redirected = await findRedirect(`/sermons/${slug}`);
  if (redirected) redirect(redirected);
  const item = await getSermonBySlug(slug);
  if (!item) notFound();
  const shareUrl = canonicalUrl(`/sermons/${item.slug}`);
  const metadata = [item.preacher, item.dateLabel, item.scriptureReference].filter(Boolean).join(" · ");
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-on-surface-variant">
        <Link href="/sermons" className="hover:underline">
          Sermons
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{item.title}</span>
      </nav>
      <h1 className="font-headline-lg text-headline-lg text-text-primary">{item.title}</h1>
      <p className="mt-2 font-body-md text-body-md text-on-surface-variant">{metadata}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-sm text-on-surface-variant">
        {item.series && (
          <span className="rounded-full border border-input px-3 py-1">Series: {item.series.title}</span>
        )}
        {item.category && (
          <span className="rounded-full border border-input px-3 py-1">{item.category.name}</span>
        )}
      </div>
      {item.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnailUrl}
          alt={item.thumbnailAlt || item.title}
          loading="lazy"
          className="mt-6 aspect-video w-full rounded-xl object-cover"
        />
      )}
      {item.description && (
        <div
          className="mt-6 max-w-none font-body-md text-body-md text-text-primary"
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
      <div className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-on-surface-variant">Share this sermon</h2>
        <ShareButtons url={shareUrl} title={item.title} text={`${item.title} — ${metadata}`} />
      </div>
      {item.related.length > 0 && (
        <section aria-label="Related sermons" className="mt-10">
          <h2 className="mb-4 font-headline-sm text-headline-sm text-text-primary">Related sermons</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {item.related.map((r) => (
              <ContentCard
                key={r.id}
                title={r.title}
                href={r.href}
                thumbnailUrl={r.thumbnailUrl}
                thumbnailAlt={r.thumbnailAlt || r.title}
                date={r.dateLabel}
                metadata={[r.preacher, r.scriptureReference].filter(Boolean).join(" · ")}
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
