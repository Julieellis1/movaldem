"use client";

import * as React from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { MediaPicker } from "./media-picker";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export const SITE_PAGE_KEYS = ["about.history", "about.vision", "about.mission", "about.beliefs"] as const;

const inputClass = "rounded-full bg-surface-elevated";
const areaClass =
  "flex min-h-24 w-full rounded-2xl border border-input bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Site page editor (PRD 05 §13): key-based title + rich-text body (plain
// textarea in V1), unsaved-changes warning, toasts. No delete UI.
export function SitePagesEditor({ canUpdate }: { canUpdate: boolean }) {
  const [key, setKey] = React.useState<string>(SITE_PAGE_KEYS[0]);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  async function load(k: string) {
    setLoading(true);
    try {
      const json = await api<{ row: { title: string; body: string } }>(
        `/api/pages/${encodeURIComponent(k)}`,
      );
      setTitle(json.row.title);
      setBody(json.row.body);
      setDirty(false);
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) {
        setTitle("");
        setBody("");
        setDirty(false);
      } else {
        toast.error(err instanceof Error ? err.message : "Load failed");
      }
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function save() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/pages/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body }),
      });
      setDirty(false);
      toast.success("Page saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Site pages" className="space-y-4 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-text-primary">Site pages</h2>
        {dirty && <span className="text-xs text-text-tertiary">Unsaved changes</span>}
      </div>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Site page">
        {SITE_PAGE_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={key === k}
            onClick={() => setKey(k)}
            className={`rounded-full px-3 py-1.5 text-sm ${key === k ? "bg-primary/10 font-medium text-primary" : "text-text-secondary hover:bg-surface-elevated"}`}
          >
            {k}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-sm text-text-tertiary">Loading…</p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sp-title">Title</Label>
            <Input
              id="sp-title"
              value={title}
              disabled={!canUpdate}
              onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-body">Body</Label>
            <textarea
              id="sp-body"
              value={body}
              disabled={!canUpdate}
              onChange={(e) => { setBody(e.target.value); setDirty(true); }}
              rows={8}
              className={areaClass}
            />
          </div>
          {canUpdate && (
            <Button type="button" size="sm" className="rounded-full" disabled={saving || !dirty} onClick={() => void save()}>
              {saving ? "Saving…" : "Save page"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

type Leader = {
  id: string;
  name: string;
  title: string;
  bio: string | null;
  photo_media_id: string | null;
  sort_order: number;
  is_visible: boolean;
};

// Leaders manager (PRD 05 §13): add, edit, visibility toggle, reorder
// (up/down). No delete UI — hide via visibility instead.
export function LeadersManager({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const [leaders, setLeaders] = React.useState<Leader[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [name, setName] = React.useState("");
  const [office, setOffice] = React.useState("");
  const [photoId, setPhotoId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editOffice, setEditOffice] = React.useState("");
  const [editBio, setEditBio] = React.useState("");

  async function reload() {
    try {
      const json = await api<{ rows: Leader[] }>("/api/leaders");
      setLeaders(json.rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void reload();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !office.trim()) {
      toast.error("Name and title/office are required");
      return;
    }
    setAdding(true);
    try {
      await api("/api/leaders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), title: office.trim(), photo_media_id: photoId }),
      });
      toast.success("Leader added");
      setName("");
      setOffice("");
      setPhotoId(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>, label: string) {
    try {
      await api(`/api/leaders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(label);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const ordered = leaders.map((l) => l.id);
    const i = ordered.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved!);
    try {
      await api("/api/leaders", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedIds: next }),
      });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed");
    }
  }

  function startEdit(l: Leader) {
    setEditingId(l.id);
    setEditName(l.name);
    setEditOffice(l.title);
    setEditBio(l.bio ?? "");
  }

  return (
    <section aria-label="Leaders" className="space-y-4 rounded-2xl border border-border p-4">
      <h2 className="text-lg font-semibold text-text-primary">Leadership</h2>
      {loading ? (
        <p className="text-sm text-text-tertiary">Loading…</p>
      ) : leaders.length === 0 ? (
        <EmptyState title="No leaders yet" description={canCreate ? "Add the first leader below." : ""} />
      ) : (
        <ol className="space-y-2">
          {leaders.map((l, i) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-elevated px-3 py-2">
              <div className="min-w-0 flex-1">
                {editingId === l.id ? (
                  <span className="flex flex-wrap gap-2">
                    <Input aria-label="Leader name" value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 min-w-28 flex-1 rounded-full text-xs" />
                    <Input aria-label="Leader title" value={editOffice} onChange={(e) => setEditOffice(e.target.value)} className="h-8 min-w-28 flex-1 rounded-full text-xs" />
                    <Input aria-label="Leader bio" value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Bio (optional)" className="h-8 min-w-28 flex-1 rounded-full text-xs" />
                    <Button type="button" size="sm" variant="outline" onClick={() => { void patch(l.id, { name: editName.trim(), title: editOffice.trim(), bio: editBio.trim() || null }, "Leader saved"); setEditingId(null); }}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <p className="text-sm text-text-primary">
                    <span className="font-medium">{l.name}</span>
                    <span className="ml-2 text-xs text-text-tertiary">{l.title}</span>{" "}
                    {!l.is_visible && <Badge variant="secondary">Hidden</Badge>}
                  </p>
                )}
              </div>
              {canUpdate && editingId !== l.id && (
                <span className="flex items-center gap-1">
                  <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => void move(l.id, -1)} aria-label={`Move ${l.name} up`}>
                    Up
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={i === leaders.length - 1} onClick={() => void move(l.id, 1)} aria-label={`Move ${l.name} down`}>
                    Down
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => startEdit(l)}>
                    Edit
                  </Button>
                  <Button
                    type="button" size="sm" variant="ghost"
                    onClick={() => void patch(l.id, { is_visible: !l.is_visible }, l.is_visible ? "Leader hidden" : "Leader visible")}
                    aria-label={l.is_visible ? `Hide ${l.name}` : `Show ${l.name}`}
                  >
                    {l.is_visible ? "Hide" : "Show"}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {canCreate && (
        <form onSubmit={add} className="space-y-3 border-t border-border pt-3">
          <h3 className="text-sm font-medium text-text-primary">Add leader</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ld-name">Name</Label>
              <Input id="ld-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ld-office">Title/office</Label>
              <Input id="ld-office" value={office} onChange={(e) => setOffice(e.target.value)} className={inputClass} />
            </div>
          </div>
          <MediaPicker label="Photo" value={photoId} onChange={setPhotoId} kind="image" />
          <Button type="submit" variant="outline" size="sm" className="rounded-full" disabled={adding}>
            {adding ? "Adding…" : "Add leader"}
          </Button>
        </form>
      )}
    </section>
  );
}

type Branch = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
  service_times: string | null;
  map_url: string | null;
  sort_order: number;
  is_visible: boolean;
};

// Branches manager (PRD 05 §13): add, edit, visibility toggle, reorder
// (up/down). No delete UI — hide via visibility instead.
export function BranchesManager({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [serviceTimes, setServiceTimes] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editAddress, setEditAddress] = React.useState("");
  const [editPhone, setEditPhone] = React.useState("");
  const [editTimes, setEditTimes] = React.useState("");

  async function reload() {
    try {
      const json = await api<{ rows: Branch[] }>("/api/branches");
      setBranches(json.rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void reload();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !address.trim()) {
      toast.error("Name and address are required");
      return;
    }
    setAdding(true);
    try {
      await api("/api/branches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
          service_times: serviceTimes.trim() || null,
        }),
      });
      toast.success("Branch added");
      setName("");
      setAddress("");
      setServiceTimes("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>, label: string) {
    try {
      await api(`/api/branches/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(label);
      setEditingId(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const ordered = branches.map((b) => b.id);
    const i = ordered.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved!);
    try {
      await api("/api/branches", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedIds: next }),
      });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed");
    }
  }

  function startEdit(b: Branch) {
    setEditingId(b.id);
    setEditName(b.name);
    setEditAddress(b.address);
    setEditPhone(b.phone ?? "");
    setEditTimes(b.service_times ?? "");
  }

  return (
    <section aria-label="Branches" className="space-y-4 rounded-2xl border border-border p-4">
      <h2 className="text-lg font-semibold text-text-primary">Branches</h2>
      {loading ? (
        <p className="text-sm text-text-tertiary">Loading…</p>
      ) : branches.length === 0 ? (
        <EmptyState title="No branches yet" description={canCreate ? "Add the first branch below." : ""} />
      ) : (
        <ol className="space-y-2">
          {branches.map((b, i) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-elevated px-3 py-2">
              <div className="min-w-0 flex-1">
                {editingId === b.id ? (
                  <span className="grid gap-2">
                    <Input aria-label="Branch name" value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 rounded-full text-xs" />
                    <Input aria-label="Branch address" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} className="h-8 rounded-full text-xs" />
                    <span className="flex flex-wrap gap-2">
                      <Input aria-label="Branch phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone (optional)" className="h-8 min-w-28 flex-1 rounded-full text-xs" />
                      <Input aria-label="Service times" value={editTimes} onChange={(e) => setEditTimes(e.target.value)} placeholder="Service times (optional)" className="h-8 min-w-28 flex-1 rounded-full text-xs" />
                    </span>
                    <span className="flex gap-1">
                      <Button
                        type="button" size="sm" variant="outline"
                        onClick={() => void patch(b.id, {
                          name: editName.trim(),
                          address: editAddress.trim(),
                          phone: editPhone.trim() || null,
                          service_times: editTimes.trim() || null,
                        }, "Branch saved")}
                      >
                        Save
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </span>
                  </span>
                ) : (
                  <p className="text-sm text-text-primary">
                    <span className="font-medium">{b.name}</span>
                    <span className="ml-2 text-xs text-text-tertiary">{b.address}</span>{" "}
                    {!b.is_visible && <Badge variant="secondary">Hidden</Badge>}
                  </p>
                )}
              </div>
              {canUpdate && editingId !== b.id && (
                <span className="flex items-center gap-1">
                  <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => void move(b.id, -1)} aria-label={`Move ${b.name} up`}>
                    Up
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={i === branches.length - 1} onClick={() => void move(b.id, 1)} aria-label={`Move ${b.name} down`}>
                    Down
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => startEdit(b)}>
                    Edit
                  </Button>
                  <Button
                    type="button" size="sm" variant="ghost"
                    onClick={() => void patch(b.id, { is_visible: !b.is_visible }, b.is_visible ? "Branch hidden" : "Branch visible")}
                    aria-label={b.is_visible ? `Hide ${b.name}` : `Show ${b.name}`}
                  >
                    {b.is_visible ? "Hide" : "Show"}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {canCreate && (
        <form onSubmit={add} className="space-y-3 border-t border-border pt-3">
          <h3 className="text-sm font-medium text-text-primary">Add branch</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="br-name">Name</Label>
              <Input id="br-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-address">Address</Label>
              <Input id="br-address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="br-times">Service times (optional)</Label>
              <Input id="br-times" value={serviceTimes} onChange={(e) => setServiceTimes(e.target.value)} className={inputClass} />
            </div>
          </div>
          <Button type="submit" variant="outline" size="sm" className="rounded-full" disabled={adding}>
            {adding ? "Adding…" : "Add branch"}
          </Button>
        </form>
      )}
    </section>
  );
}
