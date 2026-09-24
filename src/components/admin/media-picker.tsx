"use client";

import * as React from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type MediaKindFilter = "image" | "audio" | "video" | "document" | "any";

type MediaRow = {
  id: string;
  kind: string;
  source: string;
  title: string | null;
  original_filename: string | null;
  public_url: string;
  external_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

function displayUrl(row: MediaRow): string {
  return row.source === "external_url" && row.external_url ? row.external_url : row.public_url;
}

// MED-08/CMS-13: choose existing media or upload new (with progress) from a
// content form. Keyboard accessible: real buttons/inputs, Escape closes.
export function MediaPicker({
  label,
  value,
  onChange,
  kind = "any",
  allowExternal = false,
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  kind?: MediaKindFilter;
  allowExternal?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"choose" | "upload" | "external">("choose");
  const [current, setCurrent] = React.useState<MediaRow | null>(null);
  const [rows, setRows] = React.useState<MediaRow[]>([]);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [externalUrl, setExternalUrl] = React.useState("");
  const [externalTitle, setExternalTitle] = React.useState("");
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!value) {
      setCurrent(null);
      return;
    }
    let cancelled = false;
    api<{ row: MediaRow }>(`/api/media/${value}`)
      .then((json) => {
        if (!cancelled) setCurrent(json.row);
      })
      .catch(() => {
        if (!cancelled) setCurrent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  React.useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  const loadList = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ per_page: "24" });
      if (kind !== "any") params.set("kind", kind);
      if (search.trim()) params.set("q", search.trim());
      const json = await api<{ rows: MediaRow[] }>(`/api/media?${params.toString()}`);
      setRows(json.rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load media");
    } finally {
      setLoading(false);
    }
  }, [kind, search]);

  React.useEffect(() => {
    if (open && tab === "choose") void loadList();
  }, [open, tab, loadList]);

  function uploadWithProgress(url: string, form: FormData): Promise<{ row: MediaRow }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener("load", () => {
        setProgress(null);
        try {
          const json = JSON.parse(xhr.responseText) as { row?: MediaRow; error?: string };
          if (xhr.status >= 200 && xhr.status < 300 && json.row) resolve({ row: json.row });
          else reject(new Error(json.error || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      });
      xhr.addEventListener("error", () => {
        setProgress(null);
        reject(new Error("Upload failed (network error)"));
      });
      xhr.send(form);
    });
  }

  async function handleFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    setProgress(0);
    try {
      const { row } = await uploadWithProgress("/api/media", form);
      onChange(row.id);
      toast.success("Upload complete");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleExternal() {
    if (!externalUrl.trim()) {
      toast.error("Paste a YouTube, Vimeo or Facebook URL");
      return;
    }
    try {
      const json = await api<{ row: MediaRow }>("/api/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "external_url",
          externalUrl: externalUrl.trim(),
          title: externalTitle.trim() || null,
        }),
      });
      onChange(json.row.id);
      toast.success("External video attached");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not attach video URL");
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {current ? (
          <span className="min-w-0 flex-1 truncate rounded-full bg-surface-elevated px-3 py-1.5 text-sm text-text-primary">
            {current.title || current.original_filename || current.id}
            <span className="ml-2 text-xs text-text-tertiary">{current.kind}</span>
          </span>
        ) : (
          <span className="flex-1 rounded-full bg-surface-elevated px-3 py-1.5 text-sm text-text-tertiary">
            None selected
          </span>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {current ? "Change" : "Choose"}
        </Button>
        {current && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
            aria-label={`Remove ${label}`}
          >
            Remove
          </Button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface-base p-4 shadow-xl md:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">{label}</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close media picker"
                className="rounded-full px-3 py-1 text-sm text-text-secondary hover:bg-surface-elevated"
              >
                Close
              </button>
            </div>
            <div className="mb-4 flex gap-1" role="tablist" aria-label="Media source">
              {(["choose", "upload"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1.5 text-sm capitalize ${tab === t ? "bg-primary/10 font-medium text-primary" : "text-text-secondary hover:bg-surface-elevated"}`}
                >
                  {t === "choose" ? "Choose existing" : "Upload new"}
                </button>
              ))}
              {allowExternal && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "external"}
                  onClick={() => setTab("external")}
                  className={`rounded-full px-3 py-1.5 text-sm ${tab === "external" ? "bg-primary/10 font-medium text-primary" : "text-text-secondary hover:bg-surface-elevated"}`}
                >
                  External URL
                </button>
              )}
            </div>

            {tab === "choose" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    type="search"
                    placeholder="Search by name"
                    aria-label="Search media"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void loadList();
                      }
                    }}
                    className="rounded-full"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadList()}>
                    Search
                  </Button>
                </div>
                {loading ? (
                  <p className="text-sm text-text-tertiary">Loading…</p>
                ) : rows.length === 0 ? (
                  <p className="text-sm text-text-tertiary">No media found. Try the Upload tab.</p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onChange(row.id);
                            setOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="min-w-0 flex-1 truncate text-text-primary">
                            {row.title || row.original_filename || row.id}
                          </span>
                          <span className="shrink-0 text-xs text-text-tertiary">{row.kind}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === "upload" && (
              <div className="space-y-3">
                <Input
                  type="file"
                  aria-label={`Upload ${label}`}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    e.target.value = "";
                  }}
                />
                {progress !== null && (
                  <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                    <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
                      <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">{progress}%</p>
                  </div>
                )}
                <p className="text-xs text-text-tertiary">
                  Allowed: JPG, PNG, WebP, PDF, MP3, M4A, MP4, WebM. Files are validated server-side.
                </p>
              </div>
            )}

            {tab === "external" && allowExternal && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="media-external-url">Video URL (YouTube, Vimeo, Facebook)</Label>
                  <Input
                    id="media-external-url"
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    className="rounded-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="media-external-title">Title (optional)</Label>
                  <Input
                    id="media-external-title"
                    type="text"
                    value={externalTitle}
                    onChange={(e) => setExternalTitle(e.target.value)}
                    className="rounded-full"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void handleExternal()}>
                  Attach video URL
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      {current && (
        <p className="truncate text-xs text-text-tertiary">
          URL: {displayUrl(current)}
        </p>
      )}
    </div>
  );
}
