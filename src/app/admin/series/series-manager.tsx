"use client";

import * as React from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";

type SeriesRow = {
  id: string;
  type: string;
  title: string;
  slug: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// Series (quarters for Sunday school) admin CRUD — typed, slug unique per
// (type, slug), guarded delete with usage breakdown (PRD 05 §6).
export function SeriesManager({
  initialRows,
  canCreate,
  canUpdate,
  canDelete,
}: {
  initialRows: SeriesRow[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const [rows, setRows] = React.useState<SeriesRow[]>(initialRows);
  const [typeFilter, setTypeFilter] = React.useState("");
  const [form, setForm] = React.useState({ type: "sermon", title: "", slug: "", description: "", start_date: "", end_date: "" });
  const [editing, setEditing] = React.useState<SeriesRow | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editSlug, setEditSlug] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function refresh() {
    const json = await api<{ rows: SeriesRow[] }>("/api/series");
    setRows(json.rows);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setPending(true);
    try {
      await api("/api/series", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          title: form.title.trim(),
          slug: form.slug.trim() || form.title.trim(),
          description: form.description.trim() || null,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
        }),
      });
      toast.success("Series created");
      setForm({ type: "sermon", title: "", slug: "", description: "", start_date: "", end_date: "" });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setPending(false);
    }
  }

  async function handleUpdate() {
    if (!editing) return;
    setPending(true);
    try {
      await api(`/api/series/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim() || undefined,
          slug: editSlug.trim() || undefined,
          description: editDescription.trim() ? editDescription.trim() : null,
        }),
      });
      toast.success("Series updated");
      setEditing(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    setPending(true);
    try {
      await api(`/api/series/${id}`, { method: "DELETE" });
      toast.success("Series deleted");
      setConfirmDelete(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setConfirmDelete(null);
    } finally {
      setPending(false);
    }
  }

  const filtered = typeFilter ? rows.filter((r) => r.type === typeFilter) : rows;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Series</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Typed collections. Sunday school quarters are series of type sunday_school (§5).
          </p>
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter series by type"
          className="h-10 rounded-full border border-input bg-surface-elevated px-3 text-sm text-text-primary"
        >
          <option value="">All types</option>
          <option value="sermon">Sermon</option>
          <option value="bible_study">Bible study</option>
          <option value="sunday_school">Sunday school</option>
        </select>
      </div>

      {canCreate && (
        <form onSubmit={(e) => void handleCreate(e)} className="grid gap-3 rounded-2xl border border-border p-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="series-type">Type</Label>
            <select id="series-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="flex h-10 w-full rounded-full border border-input bg-surface-elevated px-3 text-sm text-text-primary">
              <option value="sermon">Sermon</option>
              <option value="bible_study">Bible study</option>
              <option value="sunday_school">Sunday school</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="series-title">Title</Label>
            <Input id="series-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-full" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="series-slug">Slug (optional — defaults to title)</Label>
            <Input id="series-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="rounded-full" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="series-desc">Description</Label>
            <Input id="series-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-full" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="series-start">Start date (optional)</Label>
            <Input id="series-start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="rounded-full" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="series-end">End date (optional)</Label>
            <Input id="series-end" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="rounded-full" />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" size="sm" className="rounded-full" disabled={pending}>
              {pending ? "Saving…" : "Create series"}
            </Button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <EmptyState title="No series yet" description="Create the first series above." />
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-primary">{row.title}</span>
                <span className="block truncate text-xs text-text-tertiary">{row.slug}</span>
              </span>
              <Badge variant="secondary">{row.type.replace("_", " ")}</Badge>
              {canUpdate && (
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => {
                    setEditing(row);
                    setEditTitle(row.title);
                    setEditSlug(row.slug);
                    setEditDescription(row.description ?? "");
                  }}
                >
                  Edit
                </Button>
              )}
              {canDelete && (
                confirmDelete === row.id ? (
                  <span className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={pending} onClick={() => void handleDelete(row.id)}>
                      Confirm
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Keep</Button>
                  </span>
                ) : (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(row.id)}>Delete</Button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div role="dialog" aria-modal="true" aria-label="Edit series" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-surface-base p-4 md:p-6">
            <h2 className="text-base font-semibold text-text-primary">Edit series</h2>
            <div className="space-y-1.5">
              <Label htmlFor="series-edit-title">Title</Label>
              <Input id="series-edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="rounded-full" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="series-edit-slug">Slug</Label>
              <Input id="series-edit-slug" value={editSlug} onChange={(e) => setEditSlug(e.target.value)} className="rounded-full" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="series-edit-desc">Description</Label>
              <Input id="series-edit-desc" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="rounded-full" />
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" className="rounded-full" disabled={pending} onClick={() => void handleUpdate()}>Save</Button>
              <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
