import type { Metadata } from "next";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { listVisibleBranches } from "@/modules/content/page.service";
import { canonicalUrl } from "@/modules/content/spotlight";

// PRD 04 §10 + 05 §13: branches (name, address, phone, service times) from the
// CMS. Only visible branches, display order.
export const metadata: Metadata = {
  title: "Branches | MOVALDEM",
  description: "Find a MOVALDEM branch near you: addresses, phone numbers and service times.",
  alternates: { canonical: canonicalUrl("/branches") },
};

export default async function BranchesPage() {
  let branches;
  try {
    branches = await listVisibleBranches();
  } catch {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <ErrorState
          title="Could not load branches"
          description="Something went wrong while loading branches. Please try again."
        />
      </main>
    );
  }
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 max-w-2xl">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">Branches</h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Worship with us at any of our branches.
        </p>
      </header>
      {branches.length === 0 ? (
        <EmptyState
          title="Branch information coming soon"
          description="Our branch addresses and service times will appear here shortly."
        />
      ) : (
        <div role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((branch) => (
            <article
              key={branch.id}
              role="listitem"
              aria-label={branch.name}
              className="flex flex-col gap-1.5 rounded-xl border border-border-subtle bg-surface-card p-4"
            >
              <h2 className="font-headline-sm text-headline-sm text-text-primary">{branch.name}</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{branch.address}</p>
              {branch.service_times && (
                <p className="mt-1 text-sm text-on-surface-variant">
                  <span className="font-medium text-text-primary">Service times: </span>
                  {branch.service_times}
                </p>
              )}
              {(branch.phone || branch.email) && (
                <p className="mt-1 text-sm text-on-surface-variant">
                  {branch.phone && (
                    <a href={`tel:${branch.phone}`} className="hover:underline">
                      {branch.phone}
                    </a>
                  )}
                  {branch.phone && branch.email && " · "}
                  {branch.email && (
                    <a href={`mailto:${branch.email}`} className="hover:underline">
                      {branch.email}
                    </a>
                  )}
                </p>
              )}
              {branch.map_url && (
                <p className="mt-2">
                  <a
                    href={branch.map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:underline"
                  >
                    View on map
                  </a>
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
