import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { auth } from "@/modules/auth/auth.config";
import { getHomeAudience } from "@/modules/auth/home-target";
import { ContentCard } from "@/components/content/content-card";
import { EventCard } from "@/components/content/event-card";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { getSetting } from "@/modules/platform/settings/settings.service";
import { listUpcoming } from "@/modules/content/event.service";
import { getAlbumWithImages, listAlbums } from "@/modules/content/gallery.service";
import { getSitePage } from "@/modules/content/page.service";
import {
  canonicalUrl,
  excerptOf,
  getFeaturedSermon,
  getLatestBibleStudy,
  getLatestSundaySchoolLesson,
} from "@/modules/content/spotlight";

// Phase 3 homepage (PRD 04 §3, all 10 sections; §10 footer info is the global
// site footer). C14 dispatch kept: staff → /admin. Members and guests render
// the public homepage (no auth required) instead of redirecting.
export const metadata: Metadata = {
  title: "MOVALDEM | Mountain of Victory at the Last Day Evangelical Ministry",
  description:
    "Welcome to MOVALDEM: sermons, Bible studies, Sunday school lessons, events, programmes and photo galleries.",
  alternates: { canonical: canonicalUrl("/") },
};

async function mediaUrlMap(ids: Array<string | null | undefined>): Promise<Map<string, { url: string; alt: string }>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))] as string[];
  if (unique.length === 0) return new Map();
  const rows = await db.select().from(media).where(inArray(media.id, unique));
  return new Map(
    rows
      .filter((m) => m.public_url?.trim())
      .map((m) => [m.id, { url: m.public_url.trim(), alt: m.alt_text?.trim() || m.title?.trim() || "" }]),
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-headline-sm text-headline-sm text-text-primary">{title}</h2>
        {action && (
          <Link href={action.href} className="text-sm font-medium hover:underline">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

async function AboutTeaser() {
  const page = await getSitePage("about.history");
  const excerpt = excerptOf(page?.body, 220);
  if (!excerpt) return null;
  return (
    <Section title="About Our Ministry" action={{ href: "/about", label: "Learn More" }}>
      <p className="max-w-2xl font-body-md text-body-md text-on-surface-variant">{excerpt}</p>
    </Section>
  );
}

async function FeaturedSermon() {
  const sermon = await getFeaturedSermon();
  if (!sermon) return null;
  return (
    <Section title="Featured Sermon" action={{ href: "/sermons", label: "All Sermons" }}>
      <div className="max-w-md">
        <ContentCard
          title={sermon.title}
          href={sermon.href}
          thumbnailUrl={sermon.thumbnailUrl}
          thumbnailAlt={sermon.thumbnailAlt || sermon.title}
          date={sermon.dateLabel}
          metadata={[sermon.preacher, sermon.scriptureReference].filter(Boolean).join(" · ")}
          audioUrl={sermon.audioUrl}
          videoUrl={sermon.videoUrl}
          videoEmbedUrl={sermon.videoEmbedUrl}
          pdfUrl={sermon.pdfUrl}
          downloadEnabled={sermon.downloadEnabled}
        />
      </div>
    </Section>
  );
}

async function LatestStudy() {
  const study = await getLatestBibleStudy();
  if (!study) return null;
  return (
    <Section title="Latest Bible Study" action={{ href: "/bible-study", label: "View Study" }}>
      <div className="max-w-md">
        <ContentCard
          title={study.title}
          href={study.href}
          thumbnailUrl={study.thumbnailUrl}
          thumbnailAlt={study.thumbnailAlt || study.title}
          date={study.dateLabel}
          metadata={[study.teacher, study.scriptureReference].filter(Boolean).join(" · ")}
          audioUrl={study.audioUrl}
          videoUrl={study.videoUrl}
          videoEmbedUrl={study.videoEmbedUrl}
          pdfUrl={study.pdfUrl}
          downloadEnabled={study.downloadEnabled}
        />
      </div>
    </Section>
  );
}

async function LatestLesson() {
  const lesson = await getLatestSundaySchoolLesson();
  if (!lesson) return null;
  return (
    <Section title="Latest Sunday School" action={{ href: "/sunday-school", label: "View Lesson" }}>
      <div className="max-w-md">
        <ContentCard
          title={lesson.title}
          href={lesson.href}
          thumbnailUrl={lesson.thumbnailUrl}
          thumbnailAlt={lesson.thumbnailAlt || lesson.title}
          date={lesson.dateLabel}
          metadata={[`Lesson ${lesson.lessonNumber}`, lesson.topic].filter(Boolean).join(" · ")}
          audioUrl={lesson.audioUrl}
          videoUrl={lesson.videoUrl}
          videoEmbedUrl={lesson.videoEmbedUrl}
          pdfUrl={lesson.pdfUrl}
          downloadEnabled={lesson.downloadEnabled}
        />
      </div>
    </Section>
  );
}

async function UpcomingEvents() {
  const rows = await listUpcoming(new Date(), 3);
  if (rows.length === 0) return null;
  const thumbs = await mediaUrlMap(rows.map((r) => r.featured_media_id));
  return (
    <Section title="Upcoming Events" action={{ href: "/events", label: "All Events" }}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((e) => {
          const thumb = e.featured_media_id ? thumbs.get(e.featured_media_id) : undefined;
          return (
            <EventCard
              key={e.id}
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
                thumbnailUrl: thumb?.url ?? null,
                thumbnailAlt: thumb?.alt ?? e.title,
              }}
            />
          );
        })}
      </div>
    </Section>
  );
}

async function GalleryPreview() {
  const albums = await listAlbums({ publishedOnly: true });
  const recent = albums.slice(0, 4);
  if (recent.length === 0) return null;
  const coverIds = recent.map((a) => a.cover_media_id);
  // Fall back to the first image when an album has no cover.
  const withoutCover = recent.filter((a) => !a.cover_media_id);
  const firstImages = new Map<string, string>();
  if (withoutCover.length > 0) {
    const withImages = await Promise.all(withoutCover.map((a) => getAlbumWithImages(a.id)));
    for (const { album, images } of withImages) {
      if (images[0]) firstImages.set(album.id, images[0].media_id);
    }
  }
  const thumbs = await mediaUrlMap([
    ...coverIds,
    ...recent.map((a) => firstImages.get(a.id)),
  ]);
  return (
    <Section title="Gallery" action={{ href: "/gallery", label: "View Gallery" }}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {recent.map((a) => {
          const mediaId = a.cover_media_id ?? firstImages.get(a.id);
          const thumb = mediaId ? thumbs.get(mediaId) : undefined;
          return (
            <Link
              key={a.id}
              href={`/gallery/${a.slug}`}
              className="group overflow-hidden rounded-xl border border-border-subtle bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
              aria-label={a.title}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb.url} alt={thumb.alt || a.title} loading="lazy" className="aspect-square w-full object-cover" />
              ) : (
                <div className="aspect-square w-full bg-surface-elevated" aria-hidden="true" />
              )}
              <p className="p-2 text-xs font-medium text-text-primary group-hover:underline">{a.title}</p>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-10 sm:px-6" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-4">
          <LoadingSkeleton className="h-8 w-56" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, j) => (
              <LoadingSkeleton key={j} className="h-64 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function Home() {
  // C14 dispatch (kept exactly): staff land on /admin.
  const session = await auth.api.getSession({ headers: await headers() });
  if (session && (await getHomeAudience(session.user.id)) === "staff") {
    redirect("/admin");
  }
  // Members and guests get the public marketing homepage (no auth required).
  const churchName = await getSetting<string>(
    db,
    "church.name",
    "Mountain of Victory at the Last Day Evangelical Ministry",
  );
  return (
    <main>
      <section aria-label="Welcome" className="border-b border-border-subtle bg-surface-elevated">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-sm font-medium text-on-surface-variant">Welcome to</p>
          <h1 className="mt-2 max-w-2xl font-headline-lg text-headline-lg text-text-primary">
            {churchName ?? "MOVALDEM"}
          </h1>
          <p className="mt-3 max-w-xl font-body-md text-body-md text-on-surface-variant">
            A place of worship, the Word and fellowship — join us for sermons, Bible
            study, Sunday school and life-changing programmes.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/sermons"
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Watch Sermons
            </Link>
            <Link
              href="/events"
              className="rounded-full border border-input px-5 py-2.5 text-sm font-medium hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Upcoming Events
            </Link>
          </div>
        </div>
      </section>
      <Suspense fallback={<HomeSkeleton />}>
        <AboutTeaser />
        <FeaturedSermon />
        <LatestStudy />
        <LatestLesson />
        <UpcomingEvents />
      </Suspense>
      <section aria-label="Bible quiz" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="rounded-xl border border-border-subtle bg-surface-card p-6 sm:p-8">
          <h2 className="font-headline-sm text-headline-sm text-text-primary">Bible Quiz</h2>
          <p className="mt-2 max-w-xl font-body-md text-body-md text-on-surface-variant">
            Test your Bible knowledge. Challenge yourself with our weekly Bible quiz.
          </p>
          <p className="mt-3 text-sm text-on-surface-variant">Opening soon — watch this space.</p>
        </div>
      </section>
      <section aria-label="Giving" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="rounded-xl border border-border-subtle bg-surface-card p-6 sm:p-8">
          <h2 className="font-headline-sm text-headline-sm text-text-primary">Support the Work of God</h2>
          <p className="mt-2 max-w-xl font-body-md text-body-md text-on-surface-variant">
            Your giving fuels ministry — tithes, offerings and project support.
          </p>
          <p className="mt-3 text-sm text-on-surface-variant">Online giving opens soon.</p>
        </div>
      </section>
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6" aria-hidden="true">
            <LoadingSkeleton className="h-8 w-56" />
          </div>
        }
      >
        <GalleryPreview />
      </Suspense>
    </main>
  );
}
