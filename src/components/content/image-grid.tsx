import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// PRD 05 §12 gallery; PRD 04 §11 catalogue (ImageGrid).
// Presentational only: no db imports, no fetch.

export type GalleryImageData = {
  id: string;
  src: string;
  alt: string;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
};

export function ImageGrid({
  images,
  pagination,
  className,
}: {
  images: GalleryImageData[];
  /** Album pagination slot (renders below the grid). */
  pagination?: ReactNode;
  className?: string;
}) {
  if (images.length === 0) return null;
  return (
    <div className={className}>
      <ul
        aria-label="Gallery images"
        className={cn(
          "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4",
        )}
      >
        {images.map((image) => (
          <li
            key={image.id}
            className="overflow-hidden rounded-xl border border-border-subtle bg-surface-card"
          >
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.src}
                alt={image.alt}
                loading="lazy"
                decoding="async"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                width={image.width ?? undefined}
                height={image.height ?? undefined}
                className="aspect-square w-full object-cover"
              />
              {image.caption && (
                <figcaption className="p-2 text-xs text-on-surface-variant">
                  {image.caption}
                </figcaption>
              )}
            </figure>
          </li>
        ))}
      </ul>
      {pagination && <div className="mt-4 flex justify-center">{pagination}</div>}
    </div>
  );
}

export default ImageGrid;
