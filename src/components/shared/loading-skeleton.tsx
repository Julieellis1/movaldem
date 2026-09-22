import { cn } from "@/lib/utils";

export function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <div
      data-slot="loading-skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-xl bg-surface-elevated", className)}
    />
  );
}

export function TableSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div data-slot="table-skeleton" className={cn("space-y-3", className)} aria-hidden="true">
      <LoadingSkeleton className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <LoadingSkeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
