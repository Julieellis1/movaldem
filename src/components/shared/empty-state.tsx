export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-surface-card p-10 text-center">
      <p className="font-headline-sm text-headline-sm text-text-primary">{title}</p>
      {description && (
        <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
