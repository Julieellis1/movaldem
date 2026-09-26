import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db/client";
import { getSetting } from "@/modules/platform/settings/settings.service";
import { EmptyState } from "@/components/shared/empty-state";
import { getSitePage, listVisibleBranches, SITE_PAGE_KEYS } from "@/modules/content/page.service";
import { canonicalUrl, excerptOf } from "@/modules/content/spotlight";

// PRD 04 §10 + 05 §13: history, vision, mission, beliefs from site_pages
// (CMS-editable, no code changes). Each section hidden when empty.
export const metadata: Metadata = {
  title: "About Us | MOVALDEM",
  description: "Learn about MOVALDEM: our history, vision, mission and beliefs.",
  alternates: { canonical: canonicalUrl("/about") },
};

export default async function AboutPage() {
  const [pages, churchName, branches] = await Promise.all([
    Promise.all(SITE_PAGE_KEYS.map((key) => getSitePage(key))),
    getSetting<string>(db, "church.name", "Mountain of Victory at the Last Day Evangelical Ministry"),
    listVisibleBranches(),
  ]);
  const sections = pages.filter(
    (p): p is NonNullable<typeof p> => Boolean(p && p.body?.trim()),
  );
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-8 max-w-2xl">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">About Us</h1>
        {churchName && (
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">{churchName}</p>
        )}
      </header>
      {sections.length === 0 ? (
        <EmptyState
          title="About content coming soon"
          description="Our story, vision, mission and beliefs will appear here shortly."
        />
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map((p) => (
            <section key={p.key} aria-labelledby={`about-${p.key}`}>
              <h2
                id={`about-${p.key}`}
                className="font-headline-sm text-headline-sm text-text-primary"
              >
                {p.title}
              </h2>
              <div
                className="mt-3 max-w-none font-body-md text-body-md text-text-primary"
                dangerouslySetInnerHTML={{ __html: p.body }}
              />
            </section>
          ))}
        </div>
      )}
      {branches.length > 0 && (
        <section aria-label="Branches teaser" className="mt-10 rounded-xl border border-border-subtle bg-surface-card p-6">
          <h2 className="font-headline-sm text-headline-sm text-text-primary">Our branches</h2>
          <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
            {excerptOf(branches.map((b) => b.name).join(", "), 160)}
          </p>
          <p className="mt-3">
            <Link href="/branches" className="text-sm font-medium hover:underline">
              View all branches
            </Link>
            {" · "}
            <Link href="/leadership" className="text-sm font-medium hover:underline">
              Meet our leadership
            </Link>
          </p>
        </section>
      )}
    </main>
  );
}
