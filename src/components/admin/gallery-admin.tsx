"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

type Album = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_media_id: string | null;
  event_id: string | null;
  album_date: string | null;
  status: string;
};

type GalleryImage = {
  id: string;
  album_id: string;
  media_id: string;
  caption: string | null;
  alt_text: string | null;
  sort_order: number;
};

type MediaRow = {
  id: string;
  kind: string;
  title: string | null;
  original_filename: string | null;
  public_url: string;
};

// New album button (client): creates a draft album then navigates to it.
export function NewAlbumButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [open, setOpen] = React.useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Album title is required");
      return;
    }
    setPending(true);
    try {
      const json = await api<{ row: Album }>("/api/gallery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      toast.success("Album created");
      router.push(`/admin/gallery/${json.row.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" size="sm" className="rounded-full" onClick={() => setOpen(true)}>
        New album
      </Button>
    );
  }
  return (
    <form onSubmit={create} className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="Album title"
        placeholder="Album title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-56 rounded-full bg-surface-elevated"
      />
      <Button type="submit" size="sm" className="rounded-full" disabled={pending}>
        {pending ? "Creating…" : "Create"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}

// Album editor (PRD 05 §12): bulk image select (images only), upload progress,
// drag/click reorder, set cover, captions/alt, publish/unpublish.
export function AlbumEditor({
  initialAlbum,
  initialImages,
  canUpdate,
  canDelete,
}: {
  initialAlbum: Album;
  initialImages: GalleryImage[];
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [album, setAlbum] = React.useState<Album>(initialAlbum);
  const [images, setImages] = React.useState<GalleryImage[]>(() =>
    [...initialImages].sort((a, b) => a.sort_order - b.sort_order),
  );
  const [title, setTitle] = React.useState(initialAlbum.title);
  const [description, setDescription] = React.useState(initialAlbum.description ?? "");
  const [albumDate, setAlbumDate] = React.useState(initialAlbum.album_date ?? "");
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Bulk-select state.
  const [library, setLibrary] = React.useState<MediaRow[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loadingLib, setLoadingLib] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  async function reload() {
    const json = await api<{ row: Album; images: GalleryImage[] }>(`/api/gallery/${album.id}`);
    setAlbum(json.row);
    setImages([...json.images].sort((a, b) => a.sort_order - b.sort_order));
  }

  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function saveDetails() {
    setSaving(true);
    setServerError(null);
    try {
      const json = await api<{ row: Album }>(`/api/gallery/${album.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          albumDate: albumDate || null,
        }),
      });
      setAlbum(json.row);
      setTitle(json.row.title);
      setDirty(false);
      toast.success("Album saved");
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    const action = album.status === "published" ? "unpublish" : "publish";
    setSaving(true);
    try {
      const json = await api<{ row: Album }>(`/api/gallery/${album.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setAlbum(json.row);
      toast.success(action === "publish" ? "Published" : "Unpublished to draft");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status change failed");
    } finally {
      setSaving(false);
    }
  }

  async function loadLibrary() {
    setLoadingLib(true);
    try {
      const params = new URLSearchParams({ per_page: "48", kind: "image" });
      if (search.trim()) params.set("q", search.trim());
      const json = await api<{ rows: MediaRow[] }>(`/api/media?${params.toString()}`);
      const attached = new Set(images.map((i) => i.media_id));
      setLibrary(json.rows.filter((m) => !attached.has(m.id)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load media");
    } finally {
      setLoadingLib(false);
    }
  }

  React.useEffect(() => {
    void loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addSelected() {
    if (selected.size === 0) {
      toast.error("Select at least one image");
      return;
    }
    setAdding(true);
    try {
      const json = await api<{ added: number; skipped: string[] }>(`/api/gallery/${album.id}/images`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaIds: [...selected] }),
      });
      setSelected(new Set());
      toast.success(`Added ${json.added} image${json.added === 1 ? "" : "s"}${json.skipped.length ? ` (${json.skipped.length} already attached)` : ""}`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setProgress(0);
    try {
      const uploadedIds: string[] = [];
      let done = 0;
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/media", { method: "POST", body: form });
        const json = (await res.json().catch(() => ({}))) as { row?: { id: string; kind: string }; error?: string };
        if (!res.ok || !json.row) throw new Error(json.error || `Upload failed (${res.status})`);
        if (json.row.kind !== "image") throw new Error("Only images can be added to an album (05 §12)");
        uploadedIds.push(json.row.id);
        done += 1;
        setProgress(Math.round((done / files.length) * 100));
      }
      const result = await api<{ added: number }>(`/api/gallery/${album.id}/images`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaIds: uploadedIds }),
      });
      toast.success(`Uploaded and added ${result.added} image${result.added === 1 ? "" : "s"}`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setProgress(null);
    }
  }

  async function persistOrder(next: GalleryImage[]) {
    setImages(next);
    try {
      await api(`/api/gallery/${album.id}/images`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((i) => i.id) }),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed");
      await reload();
    }
  }

  function move(id: string, dir: -1 | 1) {
    const i = images.findIndex((im) => im.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= images.length) return;
    const next = [...images];
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved!);
    void persistOrder(next.map((im, idx) => ({ ...im, sort_order: idx })));
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const without = images.filter((im) => im.id !== dragId);
    const at = without.findIndex((im) => im.id === targetId);
    const moved = images.find((im) => im.id === dragId);
    if (!moved) return;
    without.splice(at < 0 ? without.length : at, 0, moved);
    setDragId(null);
    void persistOrder(without.map((im, idx) => ({ ...im, sort_order: idx })));
  }

  async function setCover(mediaId: string | null) {
    try {
      const json = await api<{ row: Album }>(`/api/gallery/${album.id}/cover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId }),
      });
      setAlbum(json.row);
      toast.success(mediaId ? "Cover set" : "Cover cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Set cover failed");
    }
  }

  async function saveCaption(im: GalleryImage, caption: string, altText: string) {
    try {
      await api(`/api/gallery/${album.id}/images/${im.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caption: caption || null, altText: altText || null }),
      });
      toast.success("Caption saved");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function removeImage(im: GalleryImage) {
    try {
      await api(`/api/gallery/${album.id}/images/${im.id}`, { method: "DELETE" });
      toast.success("Image removed (media file kept — MED-05)");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    }
  }

  async function deleteAlbum() {
    try {
      await api(`/api/gallery/${album.id}`, { method: "DELETE" });
      toast.success("Album deleted");
      router.push("/admin/gallery");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const inputClass = "rounded-full bg-surface-elevated";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{album.title}</h1>
        <Badge variant="secondary">{album.status}</Badge>
        {dirty && <span className="text-xs text-text-tertiary">Unsaved changes</span>}
      </div>

      {serverError && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      {canUpdate && (
        <div className="grid gap-4 rounded-2xl border border-border p-4 md:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="al-title">Title</Label>
              <Input id="al-title" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-desc">Description</Label>
              <textarea
                id="al-desc"
                value={description}
                onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
                rows={3}
                className="flex min-h-20 w-full rounded-2xl border border-input bg-surface-elevated px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-date">Album date</Label>
              <Input id="al-date" type="date" value={albumDate} onChange={(e) => { setAlbumDate(e.target.value); setDirty(true); }} className={inputClass} />
            </div>
            <Button type="button" size="sm" className="rounded-full" disabled={saving || !dirty} onClick={() => void saveDetails()}>
              {saving ? "Saving…" : "Save album"}
            </Button>
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-text-primary">Publishing</h2>
            <Button type="button" variant="outline" size="sm" className="w-full rounded-full" disabled={saving} onClick={() => void togglePublish()}>
              {album.status === "published" ? "Unpublish to draft" : "Publish"}
            </Button>
            {canDelete && !confirmDelete && (
              <Button type="button" variant="ghost" size="sm" className="w-full rounded-full" onClick={() => setConfirmDelete(true)}>
                Delete album
              </Button>
            )}
            {canDelete && confirmDelete && (
              <Button type="button" variant="ghost" size="sm" className="w-full rounded-full text-destructive" onClick={() => void deleteAlbum()}>
                Confirm delete
              </Button>
            )}
          </div>
        </div>
      )}

      {canUpdate && (
        <section aria-label="Add images" className="space-y-3 rounded-2xl border border-border p-4">
          <h2 className="text-sm font-medium text-text-primary">Add images (images only — 05 §12)</h2>
          <div className="flex flex-wrap gap-2">
            <Input
              type="search"
              placeholder="Search media library"
              aria-label="Search media library"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void loadLibrary();
                }
              }}
              className="max-w-xs rounded-full"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => void loadLibrary()} disabled={loadingLib}>
              {loadingLib ? "Loading…" : "Search"}
            </Button>
            <label className="inline-flex cursor-pointer items-center rounded-full border border-input px-3 py-1.5 text-sm text-text-primary hover:bg-surface-elevated">
              Upload new
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {progress !== null && (
            <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
              <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-xs text-text-tertiary">{progress}%</p>
            </div>
          )}
          {library.length > 0 && (
            <>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {library.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => toggleSelect(m.id)}
                      aria-pressed={selected.has(m.id)}
                      className={`w-full rounded-xl border p-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected.has(m.id) ? "border-primary" : "border-border"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.public_url} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
                      <span className="block truncate px-1 py-1 text-text-secondary">
                        {selected.has(m.id) ? "Selected — " : ""}{m.title || m.original_filename || m.id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <Button type="button" size="sm" className="rounded-full" disabled={adding || selected.size === 0} onClick={() => void addSelected()}>
                {adding ? "Adding…" : `Add ${selected.size} selected`}
              </Button>
            </>
          )}
        </section>
      )}

      <section aria-label="Album images" className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">Images ({images.length}) — drag or use Up/Down to reorder</h2>
        {images.length === 0 ? (
          <p className="text-sm text-text-tertiary">No images yet. Add some above.</p>
        ) : (
          <ol className="space-y-2">
            {images.map((im, i) => (
              <ImageRow
                key={im.id}
                image={im}
                index={i}
                isFirst={i === 0}
                isLast={i === images.length - 1}
                isCover={album.cover_media_id === im.media_id}
                canUpdate={canUpdate}
                dragActive={dragId === im.id}
                onDragStart={() => setDragId(im.id)}
                onDrop={() => dropOn(im.id)}
                onMove={(dir) => move(im.id, dir)}
                onSetCover={() => void setCover(im.media_id)}
                onClearCover={() => void setCover(null)}
                onSave={(caption, altText) => void saveCaption(im, caption, altText)}
                onRemove={() => void removeImage(im)}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function ImageRow({
  image,
  index,
  isFirst,
  isLast,
  isCover,
  canUpdate,
  dragActive,
  onDragStart,
  onDrop,
  onMove,
  onSetCover,
  onClearCover,
  onSave,
  onRemove,
}: {
  image: GalleryImage;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isCover: boolean;
  canUpdate: boolean;
  dragActive: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onMove: (dir: -1 | 1) => void;
  onSetCover: () => void;
  onClearCover: () => void;
  onSave: (caption: string, altText: string) => void;
  onRemove: () => void;
}) {
  const [caption, setCaption] = React.useState(image.caption ?? "");
  const [altText, setAltText] = React.useState(image.alt_text ?? "");
  const edited = caption !== (image.caption ?? "") || altText !== (image.alt_text ?? "");

  return (
    <li
      draggable={canUpdate}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-card p-3 ${dragActive ? "opacity-50" : ""}`}
    >
      <span className="w-6 shrink-0 text-xs text-text-tertiary" aria-hidden="true">{index + 1}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="truncate font-mono text-xs text-text-tertiary">{image.media_id}</p>
        {isCover && <Badge variant="secondary">Cover</Badge>}
        {canUpdate ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`cap-${image.id}`}>Caption</Label>
              <Input id={`cap-${image.id}`} value={caption} onChange={(e) => setCaption(e.target.value)} className="h-8 rounded-full text-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`alt-${image.id}`}>Alt text</Label>
              <Input id={`alt-${image.id}`} value={altText} onChange={(e) => setAltText(e.target.value)} className="h-8 rounded-full text-xs" />
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">{image.caption || "No caption"}</p>
        )}
      </div>
      {canUpdate && (
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" size="sm" variant="ghost" disabled={isFirst} onClick={() => onMove(-1)} aria-label={`Move image ${index + 1} up`}>
            Up
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={isLast} onClick={() => onMove(1)} aria-label={`Move image ${index + 1} down`}>
            Down
          </Button>
          {isCover ? (
            <Button type="button" size="sm" variant="ghost" onClick={onClearCover}>
              Clear cover
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={onSetCover}>
              Set cover
            </Button>
          )}
          {edited && (
            <Button type="button" size="sm" variant="outline" onClick={() => onSave(caption.trim(), altText.trim())}>
              Save caption
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={onRemove} aria-label={`Remove image ${index + 1}`}>
            Remove
          </Button>
        </div>
      )}
    </li>
  );
}
