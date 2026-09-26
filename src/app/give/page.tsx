import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { givingProjects } from "@/db/schema";
import { auth } from "@/modules/auth/auth.config";
import { getSetting } from "@/modules/platform/settings/settings.service";
import { canonicalUrl } from "@/modules/content/spotlight";
import { lagosDateString } from "@/modules/giving/project.service";
import {
  GivingForm,
  GIVING_TYPES,
  type GivingProjectOption,
  type GivingTypeOption,
} from "@/components/giving/giving-form";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

// PRD 06 §2 (GIV-01/02/12): public giving entry. ?type= pre-selects the mode
// (homepage teasers link here). Projects prop carries ACTIVE projects only
// (PRJ-02 gate); checkout POSTs to /api/giving/checkout.
export const metadata: Metadata = {
  title: "Give | MOVALDEM",
  description:
    "Give your tithe, offering or support a project securely online. Every gift receives an emailed receipt.",
  alternates: { canonical: canonicalUrl("/give") },
};

function isGivingType(v: string | undefined): v is GivingTypeOption {
  return (
    typeof v === "string" &&
    (GIVING_TYPES as readonly string[]).includes(v)
  );
}

async function loadActiveProjects(): Promise<GivingProjectOption[]> {
  const rows = await db
    .select({
      id: givingProjects.id,
      slug: givingProjects.slug,
      title: givingProjects.title,
      start_date: givingProjects.start_date,
      end_date: givingProjects.end_date,
    })
    .from(givingProjects)
    .where(
      and(
        eq(givingProjects.status, "active"),
        isNull(givingProjects.deleted_at),
      ),
    );
  // PRJ-02 date-range gate on the Africa/Lagos calendar date.
  const today = lagosDateString(new Date());
  return rows
    .filter(
      (r) =>
        (!r.start_date || r.start_date <= today) &&
        (!r.end_date || r.end_date >= today),
    )
    .map(({ id, slug, title }) => ({ id, slug, title }));
}

export default async function GivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawType = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  const initialType: GivingTypeOption = isGivingType(rawType)
    ? rawType
    : "general";

  const [projects, requirePhone, session] = await Promise.all([
    loadActiveProjects(),
    getSetting<boolean>(db, "giving.require_phone", false).catch(() => false),
    auth.api.getSession({ headers: await headers() }).catch(() => null),
  ]);

  const sessionUser = session?.user as
    | { id?: string; name?: string | null; email?: string | null }
    | undefined;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 max-w-2xl">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">
          Give
        </h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Your generosity fuels worship, outreach and care. Give your tithe,
          offering or support a project below.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <section
          aria-label="Giving form"
          className="rounded-xl border border-border-subtle bg-surface-card p-5 sm:p-6"
        >
          <Suspense
            fallback={
              <div className="space-y-3" aria-hidden="true">
                <LoadingSkeleton className="h-10 w-full rounded-full" />
                <LoadingSkeleton className="h-10 w-full rounded-full" />
                <LoadingSkeleton className="h-24 w-full" />
              </div>
            }
          >
            <GivingForm
              initialType={initialType}
              projects={projects}
              requirePhone={requirePhone ?? false}
              prefill={{
                name: sessionUser?.name ?? undefined,
                email: sessionUser?.email ?? undefined,
                userId: sessionUser?.id,
              }}
            />
          </Suspense>
        </section>
        <aside
          aria-label="Why give with us"
          className="h-fit rounded-xl border border-border-subtle bg-surface-card p-5 sm:p-6"
        >
          <h2 className="font-headline-sm text-headline-sm text-text-primary">
            Give with confidence
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body-sm text-body-sm text-on-surface-variant">
            <li>Secure payment processed by Paystack — we never see your card details.</li>
            <li>Every successful gift receives an emailed receipt you can view, print or download.</li>
            <li>Project gifts go only to active projects and show live progress.</li>
            <li>Guests are welcome; members are signed in automatically.</li>
          </ul>
        </aside>
      </div>
    </main>
  );
}
