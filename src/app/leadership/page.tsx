import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { listVisibleLeaders } from "@/modules/content/page.service";
import { canonicalUrl } from "@/modules/content/spotlight";

// PRD 04 §10 + 05 §13: leadership (name, title, photo, bio, sort order) from
// the CMS. Only visible leaders, display order.
export const metadata: Metadata = {
  title: "Leadership | MOVALDEM",
  description: "Meet the leadership of MOVALDEM.",
  alternates: { canonical: canonicalUrl("/leadership") },
};

export default async function LeadershipPage() {
  let leaders;
  try {
    leaders = await listVisibleLeaders();
  } catch {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <ErrorState
          title="Could not load leadership"
          description="Something went wrong while loading leadership. Please try again."
        />
      </main>
    );
  }
  const photoIds = [...new Set(leaders.map((l) => l.photo_media_id).filter((v): v is string => Boolean(v)))];
  const photos = new Map<string, { url: string; alt: string }>();
  if (photoIds.length > 0) {
    const rows = await db.select().from(media).where(inArray(media.id, photoIds));
    for (const m of rows) {
      if (m.public_url?.trim()) {
        photos.set(m.id, { url: m.public_url.trim(), alt: m.alt_text?.trim() || m.title?.trim() || "" });
      }
    }
  }
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 max-w-2xl">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">Leadership</h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          The men and women serving in ministry leadership at MOVALDEM.
        </p>
      </header>
      {leaders.length === 0 ? (
        <EmptyState
          title="Leadership coming soon"
          description="Our leadership profiles will appear here shortly."
        />
      ) : (
        <div role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leaders.map((leader) => {
            const photo = leader.photo_media_id ? photos.get(leader.photo_media_id) : undefined;
            return (
              <article
                key={leader.id}
                role="listitem"
                aria-label={leader.name}
                className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-card"
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt={photo.alt || leader.name} loading="lazy" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="aspect-square w-full bg-surface-elevated" aria-hidden="true" />
                )}
                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  <h2 className="font-headline-sm text-headline-sm text-text-primary">{leader.name}</h2>
                  <p className="text-sm font-medium text-on-surface-variant">{leader.title}</p>
                  {leader.bio && (
                    <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{leader.bio}</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
