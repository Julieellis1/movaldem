export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  action,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div role="alert" className="rounded-xl bg-surface-card p-10 text-center">
      <p className="font-headline-sm text-headline-sm text-text-primary">{title}</p>
      {description && (
        <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
          {description}
        </p>
      )}
      {(onRetry || action) && (
        <div className="mt-4 flex justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Try again
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
