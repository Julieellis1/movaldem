import Link from "next/link";
import { cn } from "@/lib/utils";

// Borderless stat card: flat surface, compact on phones, roomier on desktop.
// Same Luminous Sanctuary tokens; structure only.
export function Card({
  label,
  value,
  children,
  href,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <p className="truncate text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold tracking-tight text-text-primary md:text-headline-md">{value}</p>
      {children && <div className="mt-1.5 min-w-0">{children}</div>}
    </>
  );
  const classes = cn(
    "block min-w-0 rounded-xl bg-surface-card p-4 md:p-5",
    href && "transition-colors hover:bg-surface-elevated",
  );
  if (href) {
    return (
      <Link href={href} className={classes} aria-label={label}>
        {body}
      </Link>
    );
  }
  return <section className={classes} aria-label={label}>{body}</section>;
}
