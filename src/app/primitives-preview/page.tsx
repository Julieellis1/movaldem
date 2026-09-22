import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingSkeleton, TableSkeleton } from "@/components/shared/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// Temporary dev-only gallery for tests/e2e/primitives.spec.ts — delete before
// the phase closes (Task 18). NOT underscore-prefixed: Next.js excludes
// `_folder` names from routing entirely.
export default function PrimitivesPreviewPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <EmptyState
        title="No items yet"
        description="Nothing to show here — create the first one."
        action={<Button>Create item</Button>}
      />
      <ErrorState title="Could not load" description="The request failed." />
      <div className="space-y-3">
        <LoadingSkeleton className="h-8 w-full" />
        <TableSkeleton rows={3} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Badge>Badge</Badge>
        <Badge variant="secondary">Queued</Badge>
      </div>
      <Input placeholder="Pill input" aria-label="Pill input" />
    </main>
  );
}
