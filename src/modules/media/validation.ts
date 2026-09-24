// Server-side upload validation (PRD 05 MED-02/03, PRD 02 UPL-01..07).
// Pure module: no node/DB imports so it runs in unit tests and edge routes.

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "video/mp4",
  "video/webm",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export type MediaKind = "image" | "audio" | "video" | "document" | "external_video";

// UPL-05 defaults. Treat as settings-overridable at the route layer;
// these constants are the documented fallbacks.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

export const UPLOAD_SIZE_LIMITS: Record<Exclude<MediaKind, "external_video">, number> = {
  image: MAX_IMAGE_BYTES,
  document: MAX_PDF_BYTES,
  audio: MAX_AUDIO_BYTES,
  video: MAX_VIDEO_BYTES,
};

// UPL-02: only these extensions are ever accepted.
export const EXTENSION_TO_MIME: Record<string, AllowedMimeType> = {
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// UPL-03: executables and scripts are rejected even before allowlist checks.
export const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".php",
  ".phtml",
  ".exe",
  ".msi",
  ".dll",
  ".sh",
  ".bash",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".ps1",
  ".js",
  ".mjs",
  ".cjs",
  ".html",
  ".htm",
  ".xhtml",
  ".svg",
  ".svgz",
  ".xml",
  ".jar",
  ".py",
  ".rb",
  ".pl",
  ".elf",
  ".apk",
]);

// CMS-11: external video may only come from these hosts (bare domains;
// subdomains such as www./m./player. are accepted at validation time).
export const ALLOWED_VIDEO_HOSTS = [
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "facebook.com",
  "fb.watch",
] as const;

export type ExternalVideoProvider = "youtube" | "vimeo" | "facebook";

export type ValidateUploadInput = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Raw leading bytes for magic-byte sniffing (UPL-01). Omit only when the caller cannot provide them. */
  bytes?: Uint8Array | Buffer;
};

export type ValidateUploadResult =
  | { ok: true; kind: Exclude<MediaKind, "external_video">; mimeType: AllowedMimeType; extension: string }
  | { ok: false; error: string; code: string };

export type ExternalVideoResult =
  | { ok: true; provider: ExternalVideoProvider }
  | { ok: false; error: string };

export function getExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

export function mimeToKind(mime: AllowedMimeType): Exclude<MediaKind, "external_video"> {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

type Sniffed = "pdf" | "png" | "jpeg" | "webp" | "mp3" | "mp4-container" | "ebml" | null;

function startsWith(bytes: Uint8Array, pattern: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + pattern.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (bytes[offset + i] !== pattern[i]) return false;
  }
  return true;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) {
    const b = bytes[offset + i];
    if (b === undefined) return s;
    s += String.fromCharCode(b);
  }
  return s;
}

/** UPL-01: detect the true container from leading magic bytes. */
export function sniffMime(bytes: Uint8Array | Buffer): Sniffed {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 4) return null;
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "jpeg";
  if (b.length >= 12 && asciiAt(b, 0, 4) === "RIFF" && asciiAt(b, 8, 4) === "WEBP") return "webp";
  if (startsWith(b, [0x49, 0x44, 0x33])) return "mp3"; // ID3
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return "mp3"; // MPEG frame sync
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return "ebml"; // WebM / Matroska
  if (b.length >= 8 && asciiAt(b, 4, 4) === "ftyp") return "mp4-container"; // MP4 / M4A
  return null;
}

function sniffMatchesMime(sniffed: Sniffed, mime: AllowedMimeType): boolean {
  switch (mime) {
    case "application/pdf":
      return sniffed === "pdf";
    case "image/jpeg":
      return sniffed === "jpeg";
    case "image/png":
      return sniffed === "png";
    case "image/webp":
      return sniffed === "webp";
    case "audio/mpeg":
      return sniffed === "mp3";
    case "audio/mp4":
    case "video/mp4":
      // MP4 audio (M4A) and MP4 video share the ISO BMFF/ftyp container.
      return sniffed === "mp4-container";
    case "video/webm":
      return sniffed === "ebml";
  }
}

/**
 * UPL-01..05: validate an upload by extension, declared MIME, size and
 * magic bytes. Returns a discriminated result (no throw) so API routes can
 * map failures to 400 responses with the requirement code attached.
 */
export function validateUpload(input: ValidateUploadInput): ValidateUploadResult {
  const mime = input.mimeType.toLowerCase().trim();
  const ext = getExtension(input.filename);

  // UPL-03: executables/scripts rejected first, regardless of claimed MIME.
  if (!ext || BLOCKED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `File type "${ext || "(none)"}" is not allowed`, code: "UPL-03" };
  }

  // UPL-02: extension allowlist.
  const expectedMime = EXTENSION_TO_MIME[ext];
  if (!expectedMime) {
    return { ok: false, error: `Extension "${ext}" is not in the upload allowlist`, code: "UPL-02" };
  }

  // UPL-02: MIME allowlist.
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
    return { ok: false, error: `MIME type "${input.mimeType}" is not allowed`, code: "UPL-02" };
  }

  // UPL-01: extension must agree with the declared MIME (catches naive renames).
  if (expectedMime !== mime) {
    return {
      ok: false,
      error: `Extension "${ext}" does not match MIME type "${input.mimeType}"`,
      code: "UPL-01",
    };
  }

  // UPL-05: per-kind size limit.
  const kind = mimeToKind(mime as AllowedMimeType);
  const limit = UPLOAD_SIZE_LIMITS[kind];
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 0) {
    return { ok: false, error: "Invalid file size", code: "UPL-05" };
  }
  if (input.sizeBytes > limit) {
    return {
      ok: false,
      error: `File exceeds the ${kind} size limit of ${limit} bytes`,
      code: "UPL-05",
    };
  }

  // UPL-01: magic-byte sniffing for pdf/audio/image (and video containers
  // when the caller supplies bytes). A renamed executable (MZ header) or a
  // mismatched image fails here even when ext+MIME agree.
  if (input.bytes && input.bytes.length > 0) {
    const sniffed = sniffMime(input.bytes);
    if (!sniffMatchesMime(sniffed, mime as AllowedMimeType)) {
      return {
        ok: false,
        error: "File contents do not match the declared file type",
        code: "UPL-01",
      };
    }
  }

  return { ok: true, kind, mimeType: mime as AllowedMimeType, extension: ext };
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().trim();
}

function hostAllowed(host: string): boolean {
  const h = host.startsWith("www.") ? host.slice(4) : host;
  for (const base of ALLOWED_VIDEO_HOSTS) {
    if (h === base) return true;
    // Subdomains of the multi-host providers (m.youtube.com,
    // player.vimeo.com, web.facebook.com, ...). Short domains
    // (youtu.be, fb.watch) must match exactly.
    if ((base === "youtube.com" || base === "vimeo.com" || base === "facebook.com") && h.endsWith(`.${base}`)) {
      return true;
    }
    if ((base === "youtube.com" && h === "youtube-nocookie.com") || h.endsWith(".youtube-nocookie.com")) {
      return true;
    }
  }
  return false;
}

function providerForHost(host: string): ExternalVideoProvider | null {
  const h = host.startsWith("www.") ? host.slice(4) : host;
  if (h === "youtu.be" || h === "youtube.com" || h.endsWith(".youtube.com") || h === "youtube-nocookie.com" || h.endsWith(".youtube-nocookie.com")) {
    return "youtube";
  }
  if (h === "vimeo.com" || h.endsWith(".vimeo.com")) return "vimeo";
  if (h === "fb.watch" || h === "facebook.com" || h.endsWith(".facebook.com")) return "facebook";
  return null;
}

/** CMS-11: host allowlist check for external video URLs. */
export function validateExternalVideoUrl(url: string): ExternalVideoResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid video URL" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Video URL must use http(s)" };
  }
  const host = normalizeHost(parsed.hostname);
  if (!hostAllowed(host)) {
    return { ok: false, error: `Video host "${parsed.hostname}" is not allowlisted` };
  }
  const provider = providerForHost(host);
  if (!provider) return { ok: false, error: `Video host "${parsed.hostname}" is not allowlisted` };
  return { ok: true, provider };
}

function youtubeId(parsed: URL): string | null {
  const host = normalizeHost(parsed.hostname);
  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0];
    return id ?? null;
  }
  const v = parsed.searchParams.get("v");
  if (v) return v;
  const parts = parsed.pathname.split("/").filter(Boolean);
  const embedIdx = parts.indexOf("embed");
  if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
  for (const seg of ["shorts", "live"]) {
    const i = parts.indexOf(seg);
    if (i >= 0 && parts[i + 1]) return parts[i + 1];
  }
  return null;
}

function vimeoId(parsed: URL): string | null {
  const parts = parsed.pathname.split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) return parts[i];
  }
  return null;
}

/**
 * CMS-11: convert an allowlisted watch/share URL into a safe embed URL for
 * iframe rendering. Returns null when the host is not allowlisted or no ID
 * can be extracted. Facebook has no bare-ID embed; the plugin player URL
 * (with the original URL as the encoded href) is the safe form.
 */
export function toSafeEmbedUrl(url: string): string | null {
  const check = validateExternalVideoUrl(url);
  if (!check.ok) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (check.provider === "youtube") {
    const id = youtubeId(parsed);
    if (!id || !/^[\w-]{6,64}$/.test(id)) return null;
    return `https://www.youtube.com/embed/${id}`;
  }
  if (check.provider === "vimeo") {
    const id = vimeoId(parsed);
    if (!id) return null;
    return `https://player.vimeo.com/video/${id}`;
  }
  // facebook / fb.watch
  const original = parsed.toString();
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(original)}`;
}
