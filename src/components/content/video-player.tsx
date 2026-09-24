import { cn } from "@/lib/utils";

// PRD 05 CMS-11: video is one of uploaded file or external URL (YouTube/Vimeo/Facebook).
// Only allowlisted hosts become iframes; everything else falls back to <video>.

const EMBED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "facebook.com",
  "www.facebook.com",
  "fb.watch",
]);

export function toSafeEmbedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!EMBED_HOSTS.has(host)) return null;

  // YouTube watch -> embed; youtu.be short -> embed; already-embed passthrough.
  if (host === "youtu.be") {
    const id = url.pathname.replace("/", "");
    if (!id) return null;
    return `https://www.youtube.com/embed/${id}`;
  }
  if (host === "youtube.com" || host === "www.youtube.com") {
    if (url.pathname.startsWith("/embed/")) return url.toString();
    const id = url.searchParams.get("v");
    if (id) return `https://www.youtube.com/embed/${id}`;
    return null;
  }
  // Vimeo: keep player URLs, convert watch URLs.
  if (host === "vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (!id) return null;
    return `https://player.vimeo.com/video/${id}`;
  }
  if (host === "player.vimeo.com") return url.toString();
  // Facebook: use plugin player wrapper.
  if (host === "facebook.com" || host === "www.facebook.com" || host === "fb.watch") {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url.toString())}`;
  }
  return null;
}

export function VideoPlayer({
  videoUrl,
  videoEmbedUrl,
  title = "Video",
  className,
}: {
  videoUrl?: string | null;
  videoEmbedUrl?: string | null;
  title?: string;
  className?: string;
}) {
  const external = (videoEmbedUrl ?? videoUrl ?? "").trim();
  const file = (videoUrl ?? "").trim();

  const embed = external ? toSafeEmbedUrl(external) : null;

  if (embed) {
    return (
      <section id="video-player" aria-label={title} className={cn("w-full", className)}>
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-surface-elevated">
          <iframe
            src={embed}
            title={title}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
      </section>
    );
  }

  if (file) {
    return (
      <section id="video-player" aria-label={title} className={cn("w-full", className)}>
        <video controls preload="none" src={file} className="aspect-video w-full rounded-xl bg-surface-elevated">
          Your browser does not support the video element.
        </video>
      </section>
    );
  }

  return null;
}

export default VideoPlayer;
