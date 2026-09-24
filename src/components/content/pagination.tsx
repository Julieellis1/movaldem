import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// No existing Pagination in src/components — thin wrapper per plan Task 8.
// PRD 04 LST-01: pagination uses real URLs (?page=) for SEO.

export function buildPageHref(page: number, basePath?: string, searchParams?: URLSearchParams | Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  if (searchParams instanceof URLSearchParams) {
    searchParams.forEach((value, key) => {
      if (key !== "page") params.set(key, value);
    });
  } else if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (key !== "page" && value) params.set(key, value);
    }
  }
  params.set("page", String(page));
  const query = params.toString();
  return `${basePath ?? ""}?${query}`;
}

export function Pagination({
  page,
  totalPages,
  basePath,
  searchParams,
  className,
}: {
  page: number;
  totalPages: number;
  basePath?: string;
  searchParams?: URLSearchParams | Record<string, string | undefined>;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).slice(
    Math.max(0, Math.min(page - 3, totalPages - 5)),
    Math.max(5, Math.min(page + 2, totalPages)),
  );
  return (
    <nav aria-label="Pagination" className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button asChild variant="outline" size="sm" aria-disabled={page <= 1}>
        <Link
          href={buildPageHref(prev, basePath, searchParams)}
          aria-disabled={page <= 1}
          aria-label="Previous page"
          tabIndex={page <= 1 ? -1 : undefined}
        >
          Previous
        </Link>
      </Button>
      {pages.map((p) => (
        <Button key={p} asChild variant={p === page ? "default" : "outline"} size="sm">
          <Link
            href={buildPageHref(p, basePath, searchParams)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </Link>
        </Button>
      ))}
      <Button asChild variant="outline" size="sm" aria-disabled={page >= totalPages}>
        <Link
          href={buildPageHref(next, basePath, searchParams)}
          aria-disabled={page >= totalPages}
          aria-label="Next page"
          tabIndex={page >= totalPages ? -1 : undefined}
        >
          Next
        </Link>
      </Button>
    </nav>
  );
}

export default Pagination;
