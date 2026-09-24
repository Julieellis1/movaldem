"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// PRD 04 LST-05: filters reflected in URL (?preacher|teacher=&category=&series=&year=) so views are shareable.
// Mobile-first (360px): stacks to one column, wraps to 2/4 columns on larger screens.

export type FilterOption = { value: string; label: string };

function FilterSelect({
  id,
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: FilterOption[];
  allLabel: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-on-surface-variant">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-full border border-input bg-surface-elevated px-4 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <option value="">{allLabel}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterBar({
  personParamName = "preacher",
  personLabel = "Preacher",
  personOptions = [],
  categoryOptions = [],
  seriesOptions = [],
  yearOptions = [],
  className,
}: {
  personParamName?: "preacher" | "teacher";
  personLabel?: string;
  personOptions?: FilterOption[];
  categoryOptions?: FilterOption[];
  seriesOptions?: FilterOption[];
  yearOptions?: FilterOption[];
  className?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const get = (key: string) => searchParams.get(key) ?? "";

  const set = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    const query = params.toString();
    router.push(query ? `?${query}` : "?", { scroll: false });
  };

  const reset = () => router.push("?", { scroll: false });

  const hasActive =
    get(personParamName) !== "" ||
    get("category") !== "" ||
    get("series") !== "" ||
    get("year") !== "";

  return (
    <form
      role="search"
      aria-label="Filter content"
      className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end", className)}
      onSubmit={(e) => e.preventDefault()}
    >
      <FilterSelect
        id={`filter-${personParamName}`}
        label={personLabel}
        value={get(personParamName)}
        options={personOptions}
        allLabel={`All ${personLabel.toLowerCase()}s`}
        onChange={(v) => set(personParamName, v)}
      />
      <FilterSelect
        id="filter-category"
        label="Category"
        value={get("category")}
        options={categoryOptions}
        allLabel="All categories"
        onChange={(v) => set("category", v)}
      />
      <FilterSelect
        id="filter-series"
        label="Series"
        value={get("series")}
        options={seriesOptions}
        allLabel="All series"
        onChange={(v) => set("series", v)}
      />
      <FilterSelect
        id="filter-year"
        label="Year"
        value={get("year")}
        options={yearOptions}
        allLabel="All years"
        onChange={(v) => set("year", v)}
      />
      <div className="flex sm:col-span-2 lg:col-span-1">
        <Button
          type="button"
          variant="outline"
          onClick={reset}
          disabled={!hasActive}
          className="w-full lg:w-auto"
        >
          Reset filters
        </Button>
      </div>
    </form>
  );
}

export default FilterBar;
