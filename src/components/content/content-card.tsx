import Link from "next/link";
import { MediaAvailability } from "@/components/content/media-availability";
import { cn } from "@/lib/utils";

// PRD 04 LST-03: thumbnail, title, date, key metadata, media availability badges.

export type ContentCardProps = {
  title: string;
  href: string;
  thumbnailUrl?: string | null;
  thumbnailAlt?: string;
  date: string;
  metadata?: string;
  audioUrl?: string | null;
  videoUrl?: string | null;
  videoEmbedUrl?: string | null;
  pdfUrl?: string | null;
  downloadEnabled?: boolean;
  className?: string;
};

export function ContentCard({
  title,
  href,
  thumbnailUrl,
  thumbnailAlt,
  date,
  metadata,
  audioUrl,
  videoUrl,
  videoEmbedUrl,
  pdfUrl,
  downloadEnabled,
  className,
}: ContentCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-card",
        className,
      )}
    >
      <Link
        href={href}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
        aria-label={title}
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={thumbnailAlt ?? ""}
            loading="lazy"
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div className="aspect-video w-full bg-surface-elevated" aria-hidden="true" />
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="text-xs text-on-surface-variant">
          <time>{date}</time>
        </p>
        <h3 className="font-headline-sm text-headline-sm text-text-primary">
          <Link
            href={href}
            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            {title}
          </Link>
        </h3>
        {metadata && (
          <p className="font-body-sm text-body-sm text-on-surface-variant">{metadata}</p>
        )}
        <div className="mt-auto pt-2">
          <MediaAvailability
            variant="card"
            audioUrl={audioUrl}
            videoUrl={videoUrl}
            videoEmbedUrl={videoEmbedUrl}
            pdfUrl={pdfUrl}
            downloadEnabled={downloadEnabled}
          />
        </div>
      </div>
    </article>
  );
}

export default ContentCard;
