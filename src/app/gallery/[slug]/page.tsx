import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { EmptyState } from "@/components/shared/empty-state";
import { canonicalUrl, excerptOf, findRedirect, formatLagosDate } from "@/modules/content/spotlight";
import { getAlbumWithImages, listAlbums } from "@/modules/content/gallery.service";
import { GalleryViewer } from "./gallery-viewer";

// PRD 04 §5 detail + 05 §12: album title/metadata, responsive ImageGrid,
// Lightbox (arrows/Esc), lazy images. SEO basics: title/description + canonical.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const canonical = canonicalUrl(`/gallery/${slug}`);
  const albums = await listAlbums({ publishedOnly: true });
  const album = albums.find((a) => a.slug === slug);
  if (!album) {
    return { title: "Album not found | MOVALDEM", alternates: { canonical } };
  }
  const generated = excerptOf(album.description);
  const description = generated === "" ? `Photo album: ${album.title}` : generated;
  return {
    title: `${album.title} | MOVALDEM Gallery`,
    description,
    alternates: { canonical },
    openGraph: { title: album.title, description, url: canonical, type: "article" },
    twitter: { card: "summary_large_image", title: album.title, description },
  };
}

export default async function AlbumDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const albums = await listAlbums({ publishedOnly: true });
  const found = albums.find((a) => a.slug === slug);
  if (!found) {
    const redirected = await findRedirect(`/gallery/${slug}`);
    if (redirected) redirect(redirected);
    notFound();
  }
  const { album, images } = await getAlbumWithImages(found.id);
  const mediaIds = [...new Set(images.map((i) => i.media_id))];
  const mediaMap = new Map<string, { url: string; alt: string; width: number | null; height: number | null }>();
  if (mediaIds.length > 0) {
    const rows = await db.select().from(media).where(inArray(media.id, mediaIds));
    for (const m of rows) {
      if (m.public_url?.trim()) {
        mediaMap.set(m.id, {
          url: m.public_url.trim(),
          alt: m.alt_text?.trim() || m.title?.trim() || album.title,
          width: m.width,
          height: m.height,
        });
      }
    }
  }
  const viewerImages = images
    .map((i) => {
      const m = mediaMap.get(i.media_id);
      if (!m) return null;
      const alt = i.alt_text?.trim() || m.alt || album.title;
      return { id: i.id, src: m.url, alt, caption: i.caption, width: m.width, height: m.height };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-on-surface-variant">
        <Link href="/gallery" className="hover:underline">
          Gallery
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{album.title}</span>
      </nav>
      <h1 className="font-headline-lg text-headline-lg text-text-primary">{album.title}</h1>
      {album.album_date && (
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          <time dateTime={album.album_date}>{formatLagosDate(album.album_date)}</time>
        </p>
      )}
      {album.description && (
        <div
          className="mt-4 max-w-2xl font-body-md text-body-md text-on-surface-variant"
          dangerouslySetInnerHTML={{ __html: album.description }}
        />
      )}
      <div className="mt-6">
        {viewerImages.length === 0 ? (
          <EmptyState
            title="No photos in this album yet"
            description="Photos will appear here once they are added to this album."
            action={
              <Link
                href="/gallery"
                className="rounded-full border border-input px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
              >
                Back to gallery
              </Link>
            }
          />
        ) : (
          <GalleryViewer images={viewerImages} albumTitle={album.title} />
        )}
      </div>
    </main>
  );
}
