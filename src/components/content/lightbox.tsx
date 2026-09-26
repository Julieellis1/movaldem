"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// PRD 05 §12 gallery: lightbox with keyboard arrows + Esc.
// Presentational only: no db imports, no fetch.

export type LightboxImage = {
  src: string;
  alt: string;
  caption?: string | null;
};

/** Pure index helpers (unit-tested). Wrap around at the ends. */
export function nextIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  return (current + 1) % length;
}

export function prevIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  return (current - 1 + length) % length;
}

/** Keyboard map for the lightbox (unit-tested). */
export function lightboxKeyAction(key: string): "next" | "prev" | "close" | null {
  if (key === "ArrowRight") return "next";
  if (key === "ArrowLeft") return "prev";
  if (key === "Escape") return "close";
  return null;
}

export function Lightbox({
  images,
  index,
  onNavigate,
  onClose,
  className,
}: {
  images: LightboxImage[];
  index: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
  className?: string;
}) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = React.useRef<Element | null>(null);
  const current = images.length > 0 ? images[index] : undefined;

  // Focus the dialog on open; return focus to the opener on close.
  React.useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      const el = previouslyFocusedRef.current;
      if (el instanceof HTMLElement) el.focus();
    };
  }, []);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = lightboxKeyAction(e.key);
      if (action === "next") {
        e.preventDefault();
        onNavigate(nextIndex(index, images.length));
      } else if (action === "prev") {
        e.preventDefault();
        onNavigate(prevIndex(index, images.length));
      } else if (action === "close") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [index, images.length, onNavigate, onClose]);

  if (!current) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4",
        className,
      )}
      onClick={onClose}
      aria-hidden={false}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Image viewer: ${current.alt}`}
        tabIndex={-1}
        className="flex max-h-full w-full max-w-3xl flex-col gap-3 rounded-xl bg-surface-card p-4 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-on-surface-variant" aria-live="off">
            {index + 1} of {images.length}
          </p>
          <Button variant="outline" size="sm" onClick={onClose} aria-label="Close viewer">
            Close
          </Button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.src}
          alt={current.alt}
          className="max-h-[60vh] w-full rounded-lg object-contain"
        />
        <p aria-live="polite" className="min-h-5 text-sm text-on-surface-variant">
          {current.caption ?? current.alt}
        </p>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate(prevIndex(index, images.length))}
            aria-label="Previous image"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate(nextIndex(index, images.length))}
            aria-label="Next image"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export default Lightbox;
