"use client";

import * as React from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";

type MediaRow = {
  id: string;
  kind: string;
  source: string;
  title: string | null;
  alt_text: string | null;
  original_filename: string | null;
  storage_key: string | null;
  external_url: string | null;
  public_url: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

type UsageItem = { entityType: string; entityId: string; title: string; field: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; usage?: UsageItem[] };
  if (!res.ok) {
    const err = new Error(json.error || `Request failed (${res.status})`) as Error & { usage?: UsageItem[] };
    err.usage = json.usage;
    throw err;
  }
  return json;
}

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const KINDS = ["", "image", "audio", "video", "document", "external_video"] as const;

// MED-01 library grid/list (type filter, name search, pagination) with
// MED-04 upload/replace/delete/copy-URL/edit + MED-05 guarded delete.
export function MediaLibrary({
  initialRows,
  canCreate,
  canUpdate,
  canDelete,
}: {
  initialRows: MediaRow[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const [rows, setRows] = React.useState<MediaRow[]>(initialRows);
  const [total, setTotal] = React.useState<number | null>(null);
  const [kind, setKind] = React.useState<string>("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const [loading, setLoading] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [editing, setEditing] = React.useState<MediaRow | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editAlt, setEditAlt] = React.useState("");
  const [usageFor, setUsageFor] = React.useState<MediaRow | null>(null);
  const [usage, setUsage] = React.useState<UsageItem[] | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const perPage = 24;

  const load = React.useCallback(async (nextPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), per_page: String(perPage) });
      if (kind) params.set("kind", kind);
      const s = search.trim();
      if (s) params.set("q", s);
      const json = await api<{ rows: MediaRow[]; total: number }>(`/api/media?${params.toString()}`);
      setRows(json.rows);
      setTotal(json.total);
      setPage(nextPage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load media");
    } finally {
      setLoading(false);
    }
  }, [kind, search]);

  function uploadRequest(url: string, form: FormData): Promise<{ row: MediaRow }> {
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

  async function handleUpload(file: File) {
    const form = new FormData();
    form.append("file", file);
    setProgress(0);
    try {
      await uploadRequest("/api/media", form);
      toast.success("Upload complete");
      await load(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleReplace(row: MediaRow, file: File) {
    const form = new FormData();
    form.append("file", file);
    setProgress(0);
    try {
      await uploadRequest(`/api/media/${row.id}/replace`, form);
      toast.success("File replaced (same ID)");
      await load(page);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Replace failed");
    }
  }

  async function handleDelete(row: MediaRow) {
    try {
      await api(`/api/media/${row.id}`, { method: "DELETE" });
      toast.success("Media deleted");
      setConfirmDelete(null);
      await load(page);
    } catch (err) {
      const usage = (err as Error & { usage?: UsageItem[] }).usage;
      if (usage) {
        setUsageFor(row);
        setUsage(usage);
        toast.error("Attached to content — detach first (MED-05)");
      } else {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
      setConfirmDelete(null);
    }
  }

  async function openUsage(row: MediaRow) {
    setUsageFor(row);
    setUsage(null);
    try {
      const json = await api<{ usage: UsageItem[] }>(`/api/media/${row.id}/usage`);
      setUsage(json.usage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load usage");
    }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      const json = await api<{ row: MediaRow }>(`/api/media/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: editTitle || null, altText: editAlt || null }),
      });
      setRows((rs) => rs.map((r) => (r.id === editing.id ? json.row : r)));
      setEditing(null);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  function copyUrl(row: MediaRow) {
    const url = row.source === "external_url" && row.external_url ? row.external_url : row.public_url;
    void navigator.clipboard?.writeText(url).then(
      () => toast.success("URL copied"),
      () => toast.error("Copy failed"),
    );
  }

  const totalPages = total !== null ? Math.max(1, Math.ceil(total / perPage)) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Media library</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            {total !== null ? `${total} items` : "Uploads and external video links (MED-01)."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-border p-0.5" role="group" aria-label="View">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded-full px-3 py-1 text-sm capitalize ${view === v ? "bg-primary/10 font-medium text-primary" : "text-text-secondary"}`}
              >
                {v}
              </button>
            ))}
          </div>
          {canCreate && (
            <label className="inline-flex cursor-pointer items-center rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Upload
              <input
                type="file"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Filter by type"
          className="h-10 rounded-full border border-input bg-surface-elevated px-3 text-sm text-text-primary"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>{k === "" ? "All types" : k.replace("_", " ")}</option>
          ))}
        </select>
        <Input
          type="search"
          placeholder="Search by name"
          aria-label="Search media"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void load(1);
            }
          }}
          className="max-w-xs rounded-full bg-surface-elevated"
        />
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void load(1)} disabled={loading}>
          {loading ? "…" : "Search"}
        </Button>
      </div>

      {progress !== null && (
        <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
          <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-text-tertiary">{progress}%</p>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No media yet" description="Upload the first file to build the library." />
      ) : view === "grid" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-border p-3">
              <MediaCard
                row={row}
                canUpdate={canUpdate}
                canDelete={canDelete}
                confirmDelete={confirmDelete === row.id}
                onCopy={() => copyUrl(row)}
                onEdit={() => {
                  setEditing(row);
                  setEditTitle(row.title ?? "");
                  setEditAlt(row.alt_text ?? "");
                }}
                onUsage={() => void openUsage(row)}
                onReplace={(f) => void handleReplace(row, f)}
                onDeleteAsk={() => setConfirmDelete(row.id)}
                onDeleteCancel={() => setConfirmDelete(null)}
                onDeleteConfirm={() => void handleDelete(row)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                {row.title || row.original_filename || row.id}
              </span>
              <Badge variant="secondary">{row.kind}</Badge>
              <span className="text-xs text-text-tertiary">{formatBytes(row.size_bytes)}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => copyUrl(row)}>Copy URL</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => void openUsage(row)}>Usage</Button>
              {canUpdate && (
                <Button type="button" variant="ghost" size="sm" onClick={() => {
                  setEditing(row);
                  setEditTitle(row.title ?? "");
                  setEditAlt(row.alt_text ?? "");
                }}>
                  Edit
                </Button>
              )}
              {canDelete && (
                confirmDelete === row.id ? (
                  <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void handleDelete(row)}>
                    Confirm
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(row.id)}>
                    Delete
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages !== null && totalPages > 1 && (
        <nav aria-label="Media pages" className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={page <= 1} onClick={() => void load(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-text-tertiary" aria-live="polite">Page {page} of {totalPages}</span>
          <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={page >= totalPages} onClick={() => void load(page + 1)}>
            Next
          </Button>
        </nav>
      )}

      {editing && (
        <div role="dialog" aria-modal="true" aria-label="Edit media" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-surface-base p-4 md:p-6">
            <h2 className="text-base font-semibold text-text-primary">Edit alt text / title</h2>
            <div className="space-y-1.5">
              <Label htmlFor="media-edit-title">Title</Label>
              <Input id="media-edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="rounded-full" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="media-edit-alt">Alt text</Label>
              <Input id="media-edit-alt" value={editAlt} onChange={(e) => setEditAlt(e.target.value)} className="rounded-full" />
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" className="rounded-full" onClick={() => void saveEdit()}>Save</Button>
              <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {usageFor && (
        <div role="dialog" aria-modal="true" aria-label="Media usage" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setUsageFor(null); setUsage(null); } }}>
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-surface-base p-4 md:p-6">
            <h2 className="text-base font-semibold text-text-primary">Where this media is used</h2>
            {usage === null ? (
              <p className="text-sm text-text-tertiary">Loading…</p>
            ) : usage.length === 0 ? (
              <p className="text-sm text-text-tertiary">Not attached to any content. Safe to delete.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {usage.map((u, i) => (
                  <li key={`${u.entityId}-${u.field}-${i}`} className="rounded-xl bg-surface-elevated px-3 py-2">
                    <span className="font-medium text-text-primary">{u.title}</span>
                    <span className="text-text-tertiary"> — {u.entityType} · {u.field}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => { setUsageFor(null); setUsage(null); }}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MediaCard({
  row, canUpdate, canDelete, confirmDelete,
  onCopy, onEdit, onUsage, onReplace, onDeleteAsk, onDeleteCancel, onDeleteConfirm,
}: {
  row: MediaRow;
  canUpdate: boolean;
  canDelete: boolean;
  confirmDelete: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onUsage: () => void;
  onReplace: (file: File) => void;
  onDeleteAsk: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex h-20 items-center justify-center rounded-xl bg-surface-elevated text-xs uppercase tracking-wider text-text-tertiary" aria-hidden="true">
        {row.kind.replace("_", " ")}
      </div>
      <p className="truncate text-sm font-medium text-text-primary" title={row.title || row.original_filename || row.id}>
        {row.title || row.original_filename || row.id}
      </p>
      <div className="flex items-center gap-1">
        <Badge variant="secondary">{row.kind}</Badge>
        <span className="text-xs text-text-tertiary">{formatBytes(row.size_bytes)}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCopy}>Copy URL</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onUsage}>Usage</Button>
        {canUpdate && (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
            {row.source === "uploaded" && (
              <label className="inline-flex cursor-pointer items-center rounded-full px-2 py-1 text-xs text-text-secondary hover:bg-surface-elevated">
                Replace
                <input type="file" className="sr-only" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onReplace(file);
                  e.target.value = "";
                }} />
              </label>
            )}
          </>
        )}
        {canDelete && (
          confirmDelete ? (
            <span className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={onDeleteConfirm}>Confirm</Button>
              <Button type="button" variant="ghost" size="sm" onClick={onDeleteCancel}>Keep</Button>
            </span>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={onDeleteAsk}>Delete</Button>
          )
        )}
      </div>
    </div>
  );
}
