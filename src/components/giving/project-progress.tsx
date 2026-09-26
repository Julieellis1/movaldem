import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

// PRD 06 §5 PRJ-01: percentage to 1 decimal; the bar caps visually at 100%
// while the numeric amount may exceed target. Pure presentational component
// (no donor names — PRJ-03).

export function ProjectProgress({
  raisedKobo,
  targetKobo,
  percent1dp,
  className,
  compact = false,
}: {
  raisedKobo: number;
  targetKobo: number;
  percent1dp: number;
  className?: string;
  compact?: boolean;
}) {
  const barPercent = Math.min(100, Math.max(0, percent1dp));
  const label = `${percent1dp.toFixed(1)}%`;
  return (
    <div className={cn("space-y-2", className)}>
      <dl
        className={
          compact
            ? "flex flex-wrap gap-x-4 gap-y-1 text-sm"
            : "grid grid-cols-2 gap-2 text-sm"
        }
      >
        <div>
          <dt className="text-on-surface-variant">Raised</dt>
          <dd className="font-semibold text-text-primary">
            {formatNaira(raisedKobo)}
          </dd>
        </div>
        <div className={compact ? "" : "text-right"}>
          <dt className="text-on-surface-variant">Target</dt>
          <dd className="font-semibold text-text-primary">
            {formatNaira(targetKobo)}
          </dd>
        </div>
      </dl>
      <div
        role="progressbar"
        aria-label="Fundraising progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(barPercent * 10) / 10}
        aria-valuetext={label}
        className="h-2.5 w-full overflow-hidden rounded-full bg-surface-elevated"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${barPercent}%` }}
        />
      </div>
      <p className="text-sm font-medium text-text-primary">{label} raised</p>
    </div>
  );
}

export default ProjectProgress;
