import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// PRD 05 §8 MediaAvailability + 04 §11 catalogue.
// Pure helpers are unit-tested in tests/unit/content.media-availability.test.ts;
// the component below is a thin renderer over them.

export type MediaAvailabilityInput = {
  audioUrl?: string | null;
  videoUrl?: string | null;
  videoEmbedUrl?: string | null;
  pdfUrl?: string | null;
  downloadEnabled?: boolean;
  /** DL-01: tracked-download URL. When present, the Download action points at
   *  the tracking endpoint instead of the raw file so the event is recorded. */
  downloadUrl?: string | null;
};

export type DetailAction = "listen" | "watch" | "download";
export type CardBadge = "Audio" | "Video" | "PDF";

function isPresent(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasAudio(input: MediaAvailabilityInput): boolean {
  return isPresent(input.audioUrl);
}

export function hasVideo(input: MediaAvailabilityInput): boolean {
  return isPresent(input.videoUrl) || isPresent(input.videoEmbedUrl);
}

export function hasPdf(input: MediaAvailabilityInput): boolean {
  return isPresent(input.pdfUrl);
}

export function canDownload(input: MediaAvailabilityInput): boolean {
  return hasPdf(input) && input.downloadEnabled === true;
}

export function hasAnyMedia(input: MediaAvailabilityInput): boolean {
  return hasAudio(input) || hasVideo(input) || hasPdf(input);
}

/** Detail-page actions. Download appears only if PDF exists AND downloadEnabled. */
export function getDetailActions(input: MediaAvailabilityInput): DetailAction[] {
  const actions: DetailAction[] = [];
  if (hasAudio(input)) actions.push("listen");
  if (hasVideo(input)) actions.push("watch");
  if (canDownload(input)) actions.push("download");
  return actions;
}

/** Card badges reflect media existence (PDF badge independent of downloadEnabled). */
export function getCardBadges(input: MediaAvailabilityInput): CardBadge[] {
  const badges: CardBadge[] = [];
  if (hasAudio(input)) badges.push("Audio");
  if (hasVideo(input)) badges.push("Video");
  if (hasPdf(input)) badges.push("PDF");
  return badges;
}

export type MediaAvailabilityProps = MediaAvailabilityInput & {
  variant?: "card" | "detail";
  className?: string;
};

/**
 * Renders only available actions per 05 §8 matrix.
 * - card: compact labelled badges ("Audio", "Video", "PDF").
 * - detail: full-size buttons (Listen to Audio / Watch Video / Download PDF).
 * - none: renders null (CMS-12).
 * Text labels only, no emoji.
 */
export function MediaAvailability({
  audioUrl,
  videoUrl,
  videoEmbedUrl,
  pdfUrl,
  downloadEnabled,
  downloadUrl,
  variant = "card",
  className,
}: MediaAvailabilityProps) {
  const input: MediaAvailabilityInput = {
    audioUrl,
    videoUrl,
    videoEmbedUrl,
    pdfUrl,
    downloadEnabled,
    downloadUrl,
  };
  const trackedHref = isPresent(downloadUrl) ? downloadUrl.trim() : null;

  if (!hasAnyMedia(input)) return null;

  if (variant === "detail") {
    const actions = getDetailActions(input);
    if (actions.length === 0) return null;
    return (
      <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap", className)} aria-label="Available media">
        {actions.includes("listen") && (
          <Button asChild size="lg" className="w-full sm:w-auto">
            <a href="#audio-player">Listen to Audio</a>
          </Button>
        )}
        {actions.includes("watch") && (
          <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
            <a href="#video-player">Watch Video</a>
          </Button>
        )}
        {actions.includes("download") && isPresent(pdfUrl) && (
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            {trackedHref ? (
              <a href={trackedHref}>Download PDF</a>
            ) : (
              <a href={pdfUrl.trim()} download>
                Download PDF
              </a>
            )}
          </Button>
        )}
      </div>
    );
  }

  const badges = getCardBadges(input);
  if (badges.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Available media">
      {badges.map((badge) => (
        <li key={badge}>
          <Badge variant="secondary">{badge}</Badge>
        </li>
      ))}
    </ul>
  );
}

export default MediaAvailability;
