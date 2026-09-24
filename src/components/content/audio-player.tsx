import { cn } from "@/lib/utils";

// PRD 04 §11: lazy, accessible, responsive audio playback.

export function AudioPlayer({
  src,
  title = "Audio",
  className,
}: {
  src: string;
  title?: string;
  className?: string;
}) {
  if (!src || src.trim().length === 0) return null;
  return (
    <section id="audio-player" aria-label={title} className={cn("w-full", className)}>
      <h2 className="sr-only">{title}</h2>
      <audio controls preload="none" src={src} className="w-full">
        Your browser does not support the audio element.
      </audio>
    </section>
  );
}

export default AudioPlayer;
