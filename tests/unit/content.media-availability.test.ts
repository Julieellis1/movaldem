import { describe, it, expect } from "vitest";
import {
  getDetailActions,
  getCardBadges,
  hasAnyMedia,
} from "@/components/content/media-availability";

// PRD 05 §8 MediaAvailability matrix + 04 §11 catalogue.
// CMS-10: any combination of audio/video/PDF. CMS-12: no-media item is valid (renders null).
describe("MediaAvailability matrix (05 §8)", () => {
  it("[CMS-10] Audio+Video+PDF with download_enabled=true renders Listen, Watch, Download PDF", () => {
    expect(
      getDetailActions({
        audioUrl: "/audio.mp3",
        videoUrl: "/video.mp4",
        pdfUrl: "/notes.pdf",
        downloadEnabled: true,
      }),
    ).toEqual(["listen", "watch", "download"]);
  });

  it("[CMS-10] Audio+Video+PDF with download_enabled=false hides Download, keeps Listen+Watch", () => {
    expect(
      getDetailActions({
        audioUrl: "/audio.mp3",
        videoUrl: "/video.mp4",
        pdfUrl: "/notes.pdf",
        downloadEnabled: false,
      }),
    ).toEqual(["listen", "watch"]);
  });

  it("[CMS-10] Audio+PDF with download_enabled=true renders Listen + Download PDF", () => {
    expect(
      getDetailActions({
        audioUrl: "/audio.mp3",
        pdfUrl: "/notes.pdf",
        downloadEnabled: true,
      }),
    ).toEqual(["listen", "download"]);
  });

  it("[CMS-10] Audio+PDF with download_enabled=false renders Listen only", () => {
    expect(
      getDetailActions({
        audioUrl: "/audio.mp3",
        pdfUrl: "/notes.pdf",
        downloadEnabled: false,
      }),
    ).toEqual(["listen"]);
  });

  it("[CMS-10] Audio only renders Listen", () => {
    expect(getDetailActions({ audioUrl: "/audio.mp3" })).toEqual(["listen"]);
  });

  it("[CMS-10] Video only (videoUrl) renders Watch", () => {
    expect(getDetailActions({ videoUrl: "/video.mp4" })).toEqual(["watch"]);
  });

  it("[CMS-10] Video only (videoEmbedUrl) renders Watch", () => {
    expect(
      getDetailActions({ videoEmbedUrl: "https://www.youtube.com/embed/abc" }),
    ).toEqual(["watch"]);
  });

  it("[CMS-10] PDF only with download_enabled=true renders Download", () => {
    expect(
      getDetailActions({ pdfUrl: "/notes.pdf", downloadEnabled: true }),
    ).toEqual(["download"]);
  });

  it("[CMS-10] PDF only with download_enabled=false renders nothing (Download hidden)", () => {
    expect(
      getDetailActions({ pdfUrl: "/notes.pdf", downloadEnabled: false }),
    ).toEqual([]);
  });

  it("[CMS-10] Download never appears without a PDF, even if downloadEnabled=true", () => {
    expect(
      getDetailActions({
        audioUrl: "/a.mp3",
        videoUrl: "/v.mp4",
        downloadEnabled: true,
      }),
    ).toEqual(["listen", "watch"]);
  });

  it("[CMS-10] downloadEnabled undefined defaults to hidden Download", () => {
    expect(
      getDetailActions({ audioUrl: "/a.mp3", pdfUrl: "/p.pdf" }),
    ).toEqual(["listen"]);
  });

  it("[CMS-12] none renders null (no detail actions, no badges, hasAnyMedia=false)", () => {
    expect(getDetailActions({})).toEqual([]);
    expect(getCardBadges({})).toEqual([]);
    expect(hasAnyMedia({})).toBe(false);
  });

  it("[CMS-12] hasAnyMedia=true when any media URL present", () => {
    expect(hasAnyMedia({ audioUrl: "/a.mp3" })).toBe(true);
    expect(hasAnyMedia({ videoUrl: "/v.mp4" })).toBe(true);
    expect(
      hasAnyMedia({ videoEmbedUrl: "https://vimeo.com/123" }),
    ).toBe(true);
    expect(hasAnyMedia({ pdfUrl: "/p.pdf" })).toBe(true);
  });

  it("[05 §8 card variant] badges show compact Audio/Video/PDF labels per media present", () => {
    expect(
      getCardBadges({
        audioUrl: "/a.mp3",
        videoUrl: "/v.mp4",
        pdfUrl: "/p.pdf",
        downloadEnabled: true,
      }),
    ).toEqual(["Audio", "Video", "PDF"]);
  });

  it("[05 §8 card vs detail] card keeps PDF badge even when download disabled; detail hides Download", () => {
    expect(
      getCardBadges({
        audioUrl: "/a.mp3",
        pdfUrl: "/p.pdf",
        downloadEnabled: false,
      }),
    ).toEqual(["Audio", "PDF"]);
    expect(
      getDetailActions({
        audioUrl: "/a.mp3",
        pdfUrl: "/p.pdf",
        downloadEnabled: false,
      }),
    ).toEqual(["listen"]);
  });

  it("[05 §8 card variant] Audio-only card shows Audio badge only", () => {
    expect(getCardBadges({ audioUrl: "/a.mp3" })).toEqual(["Audio"]);
  });

  it("[05 §8 card variant] Video-only card shows Video badge only", () => {
    expect(getCardBadges({ videoUrl: "/v.mp4" })).toEqual(["Video"]);
  });
});

describe("DL-01 tracked download links", () => {
  it("[DL-01] downloadUrlFor builds the /api/downloads URL with content, id and media params", async () => {
    const { downloadUrlFor } = await import("@/modules/content/spotlight");
    expect(
      downloadUrlFor("sermon", "content-id-1", "media-id-2"),
    ).toBe("/api/downloads?content=sermon&id=content-id-1&media=media-id-2");
  });

  it("[DL-01] downloadUrlFor returns null when the document media id is missing", async () => {
    const { downloadUrlFor } = await import("@/modules/content/spotlight");
    expect(downloadUrlFor("sermon", "content-id-1", null)).toBeNull();
    expect(downloadUrlFor("sermon", null, "media-id-2")).toBeNull();
  });

  it("[DL-01] detail Download PDF points at the tracking URL when provided", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { MediaAvailability } = await import(
      "@/components/content/media-availability"
    );
    const html = renderToStaticMarkup(
      MediaAvailability({
        variant: "detail",
        pdfUrl: "https://cdn.example.com/notes.pdf",
        downloadEnabled: true,
        downloadUrl: "/api/downloads?content=sermon&id=c1&media=m2",
      }) as never,
    );
    expect(html).toContain('href="/api/downloads?content=sermon&amp;id=c1&amp;media=m2"');
    expect(html).not.toContain("https://cdn.example.com/notes.pdf");
  });

  it("[DL-01] detail Download PDF falls back to the raw file URL without a tracking URL", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { MediaAvailability } = await import(
      "@/components/content/media-availability"
    );
    const html = renderToStaticMarkup(
      MediaAvailability({
        variant: "detail",
        pdfUrl: "https://cdn.example.com/notes.pdf",
        downloadEnabled: true,
      }) as never,
    );
    expect(html).toContain('href="https://cdn.example.com/notes.pdf"');
  });
});
