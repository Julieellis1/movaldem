"use client";

import * as React from "react";
import { ImageGrid, type GalleryImageData } from "@/components/content/image-grid";
import { Lightbox, type LightboxImage } from "@/components/content/lightbox";

// PRD 05 §12: responsive grid + lightbox (keyboard arrows/Esc, lazy images).
// Reuses ImageGrid (as-is) for the grid and Lightbox (as-is) for viewing.
// Tiles open the lightbox via event delegation; an effect progressively
// enhances tiles with keyboard operability (tabIndex + Enter/Space).
export function GalleryViewer({
  images,
  albumTitle,
}: {
  images: Array<GalleryImageData & LightboxImage>;
  albumTitle: string;
}) {
  const [index, setIndex] = React.useState<number | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const root = gridRef.current;
    if (!root) return;
    const tiles = root.querySelectorAll("li");
    const cleanups: Array<() => void> = [];
    tiles.forEach((li, i) => {
      const image = images[i];
      li.setAttribute("tabindex", "0");
      li.setAttribute("role", "button");
      li.setAttribute(
        "aria-label",
        `Open image ${i + 1} of ${images.length}${image ? `: ${image.alt}` : ""}`,
      );
      li.style.cursor = "pointer";
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIndex(i);
        }
      };
      li.addEventListener("keydown", onKeyDown);
      cleanups.push(() => li.removeEventListener("keydown", onKeyDown));
    });
    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [images]);

  if (images.length === 0) return null;

  const openFromEvent = (e: React.MouseEvent) => {
    const li = (e.target as HTMLElement).closest("li");
    if (!li || !gridRef.current) return;
    const tiles = [...gridRef.current.querySelectorAll("li")];
    const i = tiles.indexOf(li as HTMLLIElement);
    if (i >= 0) setIndex(i);
  };

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div ref={gridRef} onClick={openFromEvent} aria-label={`${albumTitle} images`}>
        <ImageGrid images={images} />
      </div>
      {index !== null && (
        <Lightbox images={images} index={index} onNavigate={setIndex} onClose={() => setIndex(null)} />
      )}
    </>
  );
}

export default GalleryViewer;
