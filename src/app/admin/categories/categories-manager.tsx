"use client";

import * as React from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";

type CategoryRow = {
  id: string;
  type: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// Content categories admin CRUD (PRD 05 §6): typed by content, slug unique
// per type, delete blocked while in use (archive/reassign instead).
export function CategoriesManager({
  initialRows,
  canCreate,
  canUpdate,
  canDelete,
}: {
  initialRows: CategoryRow[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const [rows, setRows] = React.useState<CategoryRow[]>(initialRows);
  const [typeFilter, setTypeFilter] = React.useState("");
  const [form, setForm] = React.useState({ type: "sermon", name: "", slug: "" });
  const [editing, setEditing] = React.useState<CategoryRow | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editSlug, setEditSlug] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function refresh() {
    const json = await api<{ rows: CategoryRow[] }>("/api/categories");
    setRows(json.rows);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setPending(true);
    try {
      await api("/api/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          name: form.name.trim(),
          slug: form.slug.trim() || form.name.trim(),
        }),
      });
      toast.success("Category created");
      setForm({ type: "sermon", name: "", slug: "" });
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
      await api(`/api/categories/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editName.trim() || undefined,
          slug: editSlug.trim() || undefined,
        }),
      });
      toast.success("Category updated");
      setEditing(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(false);
    }
  }

  async function handleToggleActive(row: CategoryRow) {
    setPending(true);
    try {
      await api(`/api/categories/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      toast.success(row.is_active ? "Category archived" : "Category activated");
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
      await api(`/api/categories/${id}`, { method: "DELETE" });
      toast.success("Category deleted");
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
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Categories</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Typed by content (sermon, bible_study). A category in use cannot be deleted.
          </p>
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter categories by type"
          className="h-10 rounded-full border border-input bg-surface-elevated px-3 text-sm text-text-primary"
        >
          <option value="">All types</option>
          <option value="sermon">Sermon</option>
          <option value="bible_study">Bible study</option>
        </select>
      </div>

      {canCreate && (
        <form onSubmit={(e) => void handleCreate(e)} className="grid gap-3 rounded-2xl border border-border p-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cat-type">Type</Label>
            <select id="cat-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="flex h-10 w-full rounded-full border border-input bg-surface-elevated px-3 text-sm text-text-primary">
              <option value="sermon">Sermon</option>
              <option value="bible_study">Bible study</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-full" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-slug">Slug (optional — defaults to name)</Label>
            <Input id="cat-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="rounded-full" />
          </div>
          <div className="md:col-span-3">
            <Button type="submit" size="sm" className="rounded-full" disabled={pending}>
              {pending ? "Saving…" : "Create category"}
            </Button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <EmptyState title="No categories yet" description="Create the first category above." />
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-primary">
                  {row.name}
                  {!row.is_active && <span className="ml-2 text-xs text-text-tertiary">(archived)</span>}
                </span>
                <span className="block truncate text-xs text-text-tertiary">{row.slug}</span>
              </span>
              <Badge variant="secondary">{row.type.replace("_", " ")}</Badge>
              {canUpdate && (
                <>
                  <Button
                    type="button" variant="ghost" size="sm"
                    onClick={() => {
                      setEditing(row);
                      setEditName(row.name);
                      setEditSlug(row.slug);
                    }}
                  >
                    Edit
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => void handleToggleActive(row)}>
                    {row.is_active ? "Archive" : "Activate"}
                  </Button>
                </>
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
        <div role="dialog" aria-modal="true" aria-label="Edit category" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-surface-base p-4 md:p-6">
            <h2 className="text-base font-semibold text-text-primary">Edit category</h2>
            <div className="space-y-1.5">
              <Label htmlFor="cat-edit-name">Name</Label>
              <Input id="cat-edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-full" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-edit-slug">Slug</Label>
              <Input id="cat-edit-slug" value={editSlug} onChange={(e) => setEditSlug(e.target.value)} className="rounded-full" />
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
