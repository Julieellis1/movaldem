export function Card({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-surface-card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
      <p className="mt-1 font-headline-md text-headline-md text-text-primary">{value}</p>
      {children && <div className="mt-2">{children}</div>}
    </section>
  );
}
