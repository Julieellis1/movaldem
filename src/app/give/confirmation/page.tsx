import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl } from "@/modules/content/spotlight";
import { ConfirmationPoller } from "@/components/giving/confirmation-poller";
import { EmptyState } from "@/components/shared/empty-state";

// PRD 06 §2 step 5 (GIV-03): /give/confirmation?reference=... polls the exact
// plan contract GET /api/giving/status?reference= until the server verifies
// the transaction. Not indexable.
export const metadata: Metadata = {
  title: "Confirming your gift | MOVALDEM",
  description: "We are confirming your gift with the payment provider.",
  alternates: { canonical: canonicalUrl("/give/confirmation") },
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.reference) ? sp.reference[0] : sp.reference;
  const reference = raw?.trim() || "";

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
      <header className="mb-6 text-center">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">
          Confirming your gift
        </h1>
      </header>
      {reference ? (
        <ConfirmationPoller reference={reference} />
      ) : (
        <EmptyState
          title="No payment reference"
          description="We could not find a payment reference in this link. If you just gave, check your email for the confirmation link."
          action={
            <Link
              href="/give"
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Back to giving
            </Link>
          }
        />
      )}
    </main>
  );
}
