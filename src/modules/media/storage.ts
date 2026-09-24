// Storage driver: local disk for development, S3-compatible bucket otherwise.
// Server-only module (node:fs, process.env). File bytes live in object/disk
// storage and are served from the CDN/storage URL — never through the
// application database (MED-09).

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type StorageDriver = "local" | "s3";

export type SavedUpload = {
  storageKey: string;
  publicUrl: string;
};

export type PublicUrlMedia = {
  source?: string | null;
  external_url?: string | null;
  public_url?: string | null;
  storage_key?: string | null;
};

export function getStorageDriver(): StorageDriver {
  return process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
}

/** UPL-04: generated object names (UUID), never user-supplied paths. */
export function buildStorageKey(filename: string, prefix = "uploads"): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  const safePrefix = prefix.replace(/[^a-z0-9/_-]/gi, "") || "uploads";
  return `${safePrefix}/${randomUUID()}${ext}`;
}

function cdnBaseUrl(): string | null {
  const v = process.env.CDN_BASE_URL?.trim().replace(/\/+$/, "");
  return v ? v : null;
}

/** Public URL for an S3-compatible object key. */
export function buildS3PublicUrl(storageKey: string): string {
  const cdn = cdnBaseUrl();
  if (cdn) return `${cdn}/${storageKey}`;
  const endpoint = process.env.STORAGE_ENDPOINT?.trim().replace(/\/+$/, "");
  const bucket = process.env.STORAGE_BUCKET?.trim();
  if (endpoint && bucket) return `${endpoint}/${bucket}/${storageKey}`;
  return storageKey;
}

/**
 * UPL-06: persist an upload. Local driver writes under ./storage (gitignored);
 * the S3 driver resolves the key/URL — the route layer uploads bytes
 * direct-to-storage (presigned PUT) so large files never transit the app
 * server more than necessary and never touch the database (MED-09).
 */
export async function saveUpload(input: {
  bytes: Uint8Array | Buffer;
  filename: string;
  prefix?: string;
  storageKey?: string;
}): Promise<SavedUpload> {
  const driver = getStorageDriver();
  const storageKey = input.storageKey ?? buildStorageKey(input.filename, input.prefix);

  if (driver === "s3") {
    if (!process.env.STORAGE_BUCKET || !process.env.STORAGE_ENDPOINT) {
      throw new Error("S3 storage is not configured (STORAGE_BUCKET/STORAGE_ENDPOINT)");
    }
    // Bytes are delivered via presigned direct-to-storage upload at the route
    // layer (UPL-06); this resolves deterministic naming + public URL.
    void input.bytes;
    return { storageKey, publicUrl: buildS3PublicUrl(storageKey) };
  }

  const root = process.env.STORAGE_LOCAL_DIR?.trim() || join(process.cwd(), "storage");
  const dest = join(root, storageKey);
  const dir = dest.split(/[\\/]/).slice(0, -1).join("/");
  await mkdir(dir || root, { recursive: true });
  await writeFile(dest, input.bytes);

  const cdn = cdnBaseUrl();
  const shortKey = storageKey.replace(/^uploads\//, "");
  return { storageKey, publicUrl: cdn ? `${cdn}/${storageKey}` : `/uploads/${shortKey}` };
}

/**
 * MED-09: resolve the servable URL for a media row. External rows serve the
 * embed URL; uploaded rows serve the CDN/storage URL. File bytes are never
 * routed through the database.
 */
export function resolvePublicUrl(media: PublicUrlMedia): string {
  if (media.source === "external_url" && media.external_url) return media.external_url;
  if (media.public_url) return media.public_url;
  if (media.storage_key) {
    const cdn = cdnBaseUrl();
    if (cdn) return `${cdn}/${media.storage_key}`;
    if (getStorageDriver() === "s3") return buildS3PublicUrl(media.storage_key);
    return `/uploads/${media.storage_key.replace(/^uploads\//, "")}`;
  }
  return "";
}
