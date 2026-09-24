import { describe, expect, it } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_VIDEO_BYTES,
  toSafeEmbedUrl,
  validateExternalVideoUrl,
  validateUpload,
} from "@/modules/media/validation";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]);
const MP4_FTYP = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
]);
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82]);
const EXE_MZ = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);

describe("media validation (MED-02/MED-03)", () => {
  it.each([
    ["application/pdf", "notes.pdf", PDF],
    ["audio/mpeg", "sermon.mp3", MP3],
    ["audio/mp4", "sermon.m4a", MP4_FTYP],
    ["video/mp4", "service.mp4", MP4_FTYP],
    ["video/webm", "service.webm", WEBM],
    ["image/jpeg", "cover.jpg", JPEG],
    ["image/png", "cover.png", PNG],
    ["image/webp", "cover.webp", WEBP],
  ])("[MED-02] accepts allowlisted type %s", (mime, filename, bytes) => {
    expect(ALLOWED_MIME_TYPES).toContain(mime);
    const r = validateUpload({ filename, mimeType: mime, sizeBytes: 1024, bytes });
    expect(r).toMatchObject({ ok: true });
  });

  it("[MED-03] exact allowlist has 8 entries", () => {
    expect(ALLOWED_MIME_TYPES).toHaveLength(8);
  });
});

describe("upload attack surface (UPL-01/UPL-02/UPL-03)", () => {
  it("[UPL-03] rejects .php even with an allowlisted MIME", () => {
    const r = validateUpload({
      filename: "shell.php",
      mimeType: "application/pdf",
      sizeBytes: 100,
      bytes: PDF,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UPL-03");
  });

  it.each([["drop.exe"], ["run.sh"], ["s.js"], ["page.html"], ["icon.svg"]])(
    "[UPL-03] rejects executable/script %s",
    (filename) => {
      const r = validateUpload({ filename, mimeType: "image/png", sizeBytes: 100, bytes: PNG });
      expect(r.ok).toBe(false);
    },
  );

  it("[UPL-01/UPL-02] rejects .exe renamed to .mp3 (MZ header fails magic sniff)", () => {
    const r = validateUpload({
      filename: "payload.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 512,
      bytes: EXE_MZ,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UPL-01");
  });

  it("[UPL-01] rejects .pdf carrying a PNG body (mismatched magic bytes)", () => {
    const r = validateUpload({
      filename: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 512,
      bytes: PNG,
    });
    expect(r.ok).toBe(false);
  });

  it("[UPL-01] rejects .png carrying JPEG bytes (mismatched magic bytes)", () => {
    const r = validateUpload({
      filename: "cover.png",
      mimeType: "image/png",
      sizeBytes: 512,
      bytes: JPEG,
    });
    expect(r.ok).toBe(false);
  });

  it("[UPL-01] rejects extension/MIME mismatch (.png claiming image/jpeg)", () => {
    const r = validateUpload({
      filename: "cover.png",
      mimeType: "image/jpeg",
      sizeBytes: 512,
      bytes: JPEG,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UPL-01");
  });

  it("[UPL-02] rejects non-allowlisted MIME (text/csv)", () => {
    const r = validateUpload({ filename: "data.csv", mimeType: "text/csv", sizeBytes: 10 });
    expect(r.ok).toBe(false);
  });
});

describe("size limits (UPL-05)", () => {
  it("[UPL-05] enforces image 5MB default", () => {
    expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    expect(
      validateUpload({ filename: "a.jpg", mimeType: "image/jpeg", sizeBytes: MAX_IMAGE_BYTES }).ok,
    ).toBe(true);
    const over = validateUpload({
      filename: "a.jpg",
      mimeType: "image/jpeg",
      sizeBytes: MAX_IMAGE_BYTES + 1,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe("UPL-05");
  });

  it("[UPL-05] enforces pdf 25MB default", () => {
    expect(MAX_PDF_BYTES).toBe(25 * 1024 * 1024);
    const over = validateUpload({
      filename: "n.pdf",
      mimeType: "application/pdf",
      sizeBytes: MAX_PDF_BYTES + 1,
    });
    expect(over.ok).toBe(false);
  });

  it("[UPL-05] enforces audio 100MB default", () => {
    expect(MAX_AUDIO_BYTES).toBe(100 * 1024 * 1024);
    const over = validateUpload({
      filename: "s.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: MAX_AUDIO_BYTES + 1,
    });
    expect(over.ok).toBe(false);
  });

  it("[UPL-05] enforces video 500MB default", () => {
    expect(MAX_VIDEO_BYTES).toBe(500 * 1024 * 1024);
    const over = validateUpload({
      filename: "v.mp4",
      mimeType: "video/mp4",
      sizeBytes: MAX_VIDEO_BYTES + 1,
    });
    expect(over.ok).toBe(false);
  });
});

describe("external video hosts (CMS-11)", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://vimeo.com/123456789",
    "https://www.facebook.com/watch/?v=12345",
    "https://fb.watch/abc123XYZ/",
  ])("[CMS-11] accepts allowlisted host %s", (url) => {
    expect(validateExternalVideoUrl(url).ok).toBe(true);
    expect(toSafeEmbedUrl(url)).not.toBeNull();
  });

  it.each(["https://evil.example.com/v/1", "https://dailymotion.com/video/x1", "not a url"])(
    "[CMS-11] rejects non-allowlisted video host %s",
    (url) => {
      expect(validateExternalVideoUrl(url).ok).toBe(false);
      expect(toSafeEmbedUrl(url)).toBeNull();
    },
  );

  it("[CMS-11/UPL-07] converts YouTube watch URL to a safe embed URL", () => {
    expect(toSafeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    expect(toSafeEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("[CMS-11/UPL-07] converts Vimeo URL to the player embed URL", () => {
    expect(toSafeEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });
});
