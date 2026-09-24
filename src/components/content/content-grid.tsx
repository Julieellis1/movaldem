import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

// PRD 04 LST-01..04: responsive grid + empty state with reset-filters action.

export function ContentGrid({
  children,
  isEmpty,
  emptyTitle = "No items match your filters",
  emptyDescription,
  onReset,
  className,
}: {
  children?: React.ReactNode;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onReset?: () => void;
  className?: string;
}) {
  if (isEmpty) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={
          onReset ? (
            <Button variant="outline" onClick={onReset}>
              Reset filters
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <div
      role="list"
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export default ContentGrid;
