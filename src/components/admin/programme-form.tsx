"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MediaPicker } from "./media-picker";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

type Session = {
  id: string;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  speaker: string | null;
  description: string | null;
  sort_order: number;
};

// Inline session editor (PRD 05 §11): add, reorder (up/down + drag),
// remove. Date-within-range errors surface inline next to the form.
function SessionEditor({
  programmeId,
  startDate,
  endDate,
  initialSessions,
}: {
  programmeId: string;
  startDate: string;
  endDate: string;
  initialSessions: Session[];
}) {
  const [sessions, setSessions] = React.useState<Session[]>(() =>
    [...initialSessions].sort((a, b) => a.sort_order - b.sort_order || (a.date < b.date ? -1 : 1)),
  );
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState(startDate);
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");
  const [speaker, setSpeaker] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editDate, setEditDate] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);

  function rangeError(d: string): string | null {
    if (startDate && d < startDate) return `Session date ${d} is before the programme starts (${startDate}) — 05 §11`;
    if (endDate && d > endDate) return `Session date ${d} is after the programme ends (${endDate}) — 05 §11`;
    return null;
  }

  async function refresh() {
    const json = await api<{ agenda: { date: string; sessions: Session[] }[] }>(
      `/api/programmes/${programmeId}/sessions`,
    );
    setSessions(json.agenda.flatMap((d) => d.sessions));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setFormError("Session title is required.");
      return;
    }
    if (!date) {
      setFormError("Session date is required.");
      return;
    }
    const range = rangeError(date);
    if (range) {
      setFormError(range);
      return;
    }
    if (startTime && endTime && endTime <= startTime) {
      setFormError("End time must be after start time on the same day (05 §11).");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      await api(`/api/programmes/${programmeId}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          date,
          start_time: startTime || null,
          end_time: endTime || null,
          speaker: speaker.trim() || null,
        }),
      });
      toast.success("Session added");
      setTitle("");
      setStartTime("");
      setEndTime("");
      setSpeaker("");
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setPending(false);
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const ordered = sessions.map((s) => s.id);
    const i = ordered.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved!);
    setPending(true);
    try {
      await api(`/api/programmes/${programmeId}/sessions`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedIds: next }),
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed");
    } finally {
      setPending(false);
    }
  }

  async function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ordered = sessions.map((s) => s.id).filter((sid) => sid !== dragId);
    const at = ordered.indexOf(targetId);
    ordered.splice(at < 0 ? ordered.length : at, 0, dragId);
    setDragId(null);
    setPending(true);
    try {
      await api(`/api/programmes/${programmeId}/sessions`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedIds: ordered }),
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed");
    } finally {
      setPending(false);
    }
  }

  async function handleRemove(id: string) {
    setPending(true);
    try {
      await api(`/api/programmes/${programmeId}/sessions/${id}`, { method: "DELETE" });
      toast.success("Session removed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setPending(false);
    }
  }

  function startEdit(s: Session) {
    setEditingId(s.id);
    setEditTitle(s.title);
    setEditDate(s.date);
    setFormError(null);
  }

  async function saveEdit(s: Session) {
    if (!editTitle.trim()) {
      setFormError("Session title is required.");
      return;
    }
    const range = rangeError(editDate);
    if (range) {
      setFormError(range);
      return;
    }
    setPending(true);
    try {
      await api(`/api/programmes/${programmeId}/sessions/${s.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), date: editDate }),
      });
      setEditingId(null);
      await refresh();
      toast.success("Session saved");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  const inputClass = "rounded-full bg-surface-elevated";

  return (
    <section aria-label="Programme sessions" className="space-y-4 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-medium text-text-primary">
        Sessions ({sessions.length})
      </h2>

      {sessions.length === 0 ? (
        <p className="text-sm text-text-tertiary">No sessions yet. Add the first one below.</p>
      ) : (
        <ol className="space-y-2">
          {sessions.map((s, i) => (
            <li
              key={s.id}
              draggable={editingId !== s.id}
              onDragStart={() => setDragId(s.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void dropOn(s.id)}
              className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-elevated px-3 py-2"
            >
              <span className="w-6 shrink-0 text-xs text-text-tertiary" aria-hidden="true">{i + 1}</span>
              {editingId === s.id ? (
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <Input
                    aria-label="Session title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="h-8 min-w-32 flex-1 rounded-full text-xs"
                  />
                  <Input
                    aria-label="Session date"
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="h-8 rounded-full text-xs"
                  />
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void saveEdit(s)}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <>
                  <span className="min-w-0 flex-1 text-sm text-text-primary">
                    <span className="font-medium">{s.title}</span>
                    <span className="ml-2 text-xs text-text-tertiary">
                      {s.date}
                      {s.start_time ? ` · ${s.start_time}${s.end_time ? `–${s.end_time}` : ""}` : ""}
                      {s.speaker ? ` · ${s.speaker}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Button type="button" size="sm" variant="ghost" disabled={pending || i === 0} onClick={() => void move(s.id, -1)} aria-label={`Move ${s.title} up`}>
                      Up
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={pending || i === sessions.length - 1} onClick={() => void move(s.id, 1)} aria-label={`Move ${s.title} down`}>
                      Down
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => startEdit(s)}>
                      Edit
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => void handleRemove(s.id)} aria-label={`Remove ${s.title}`}>
                      Remove
                    </Button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={handleAdd} className="space-y-3 border-t border-border pt-3">
        <h3 className="text-sm font-medium text-text-primary">Add session</h3>
        {formError && (
          <p role="alert" aria-live="polite" className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sess-title">Title</Label>
            <Input id="sess-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sess-date">Date (within {startDate} – {endDate})</Label>
            <Input id="sess-date" type="date" value={date} min={startDate} max={endDate} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sess-speaker">Speaker (optional)</Label>
            <Input id="sess-speaker" value={speaker} onChange={(e) => setSpeaker(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sess-start">Start time (optional)</Label>
            <Input id="sess-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sess-end">End time (optional)</Label>
            <Input id="sess-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
          </div>
        </div>
        <Button type="submit" variant="outline" size="sm" className="rounded-full" disabled={pending}>
          {pending ? "Adding…" : "Add session"}
        </Button>
      </form>
    </section>
  );
}

// Programme form (PRD 05 §11): programme fields + inline session editor,
// publish-now vs schedule (CMS-02), unsaved-changes warning (CMS-07).
export function ProgrammeForm({
  basePath,
  initial,
  initialSessions = [],
  showPublishControls,
}: {
  basePath: string;
  initial?: Record<string, string | boolean | null> | null;
  initialSessions?: Session[];
  showPublishControls: boolean;
}) {
  const router = useRouter();
  const isNew = !initial?.id;

  const [values, setValues] = React.useState<Record<string, string>>(() => ({
    title: String(initial?.title ?? ""),
    slug: String(initial?.slug ?? ""),
    description: String(initial?.description ?? ""),
    start_date: String(initial?.start_date ?? ""),
    end_date: String(initial?.end_date ?? ""),
    venue: String(initial?.venue ?? ""),
    seo_title: String(initial?.seo_title ?? ""),
    seo_description: String(initial?.seo_description ?? ""),
    scheduled_for: "",
  }));
  const [featuredId, setFeaturedId] = React.useState<string | null>(
    (initial?.featured_media_id as string) ?? null,
  );
  const [status, setStatus] = React.useState<string>(String(initial?.status ?? "draft"));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);

  const snapshot = React.useRef(JSON.stringify({ values, featuredId }));
  const dirty = snapshot.current !== JSON.stringify({ values, featuredId });

  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function set(field: string, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => {
      if (!e[field]) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!values.title.trim()) e.title = "Title is required";
    if (!values.start_date) e.start_date = "Start date is required";
    if (!values.end_date) e.end_date = "End date is required";
    if (values.start_date && values.end_date && values.end_date < values.start_date) {
      e.end_date = "End date must be on or after start date (05 §11)";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function payload() {
    return {
      title: values.title.trim(),
      slug: values.slug.trim() || undefined,
      description: values.description.trim() || null,
      start_date: values.start_date,
      end_date: values.end_date,
      venue: values.venue.trim() || null,
      featured_media_id: featuredId,
      seo_title: values.seo_title.trim() || null,
      seo_description: values.seo_description.trim() || null,
    };
  }

  async function saveDraft(): Promise<string | null> {
    if (!validate()) {
      toast.error("Fix the highlighted fields");
      return null;
    }
    setPending("draft");
    setServerError(null);
    try {
      if (isNew) {
        const json = await api<{ row: { id: string } }>("/api/programmes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload()),
        });
        snapshot.current = JSON.stringify({ values, featuredId });
        return json.row.id;
      }
      await api(`/api/programmes/${initial?.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      snapshot.current = JSON.stringify({ values, featuredId });
      return String(initial?.id);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Save failed");
      return null;
    } finally {
      setPending(null);
    }
  }

  async function runStatusAction(action: string, publishedAt?: string) {
    const id = await saveDraft();
    if (!id) return;
    setPending(action);
    try {
      const json = await api<{ row: { status: string } }>(`/api/programmes/${id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(publishedAt ? { action, publishedAt } : { action }),
      });
      toast.success(action === "schedule" ? "Scheduled" : action === "publish" ? "Published" : `Status: ${json.row.status}`);
      snapshot.current = JSON.stringify({ values, featuredId });
      if (isNew) router.push(basePath);
      else {
        setStatus(json.row.status);
        router.refresh();
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Status change failed");
    } finally {
      setPending(null);
    }
  }

  async function handleSchedule() {
    if (!values.scheduled_for) {
      setErrors((e) => ({ ...e, scheduled_for: "Choose a future date and time" }));
      return;
    }
    const at = new Date(values.scheduled_for);
    if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
      setErrors((e) => ({ ...e, scheduled_for: "Scheduled time must be in the future (CMS-02)" }));
      return;
    }
    await runStatusAction("schedule", at.toISOString());
  }

  function fieldError(name: string) {
    return errors[name] ? (
      <p role="alert" aria-live="polite" className="text-body-sm text-destructive">
        {errors[name]}
      </p>
    ) : null;
  }

  const inputClass = "rounded-full bg-surface-elevated";
  const areaClass =
    "flex min-h-24 w-full rounded-2xl border border-input bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {isNew ? "New programme" : "Edit programme"}
        </h1>
        {!isNew && <Badge variant="secondary">{status}</Badge>}
        {dirty && <span className="text-xs text-text-tertiary">Unsaved changes</span>}
      </div>

      {serverError && (
        <p role="alert" aria-live="polite" className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pg-title">Title</Label>
            <Input id="pg-title" value={values.title} onChange={(e) => set("title", e.target.value)} className={inputClass} aria-invalid={errors.title ? true : undefined} />
            {fieldError("title")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pg-slug">Slug (optional — auto-generated)</Label>
            <Input id="pg-slug" value={values.slug} onChange={(e) => set("slug", e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pg-description">Description</Label>
            <textarea id="pg-description" value={values.description} onChange={(e) => set("description", e.target.value)} className={areaClass} rows={5} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pg-start">Start date</Label>
              <Input id="pg-start" type="date" value={values.start_date} onChange={(e) => set("start_date", e.target.value)} className={inputClass} aria-invalid={errors.start_date ? true : undefined} />
              {fieldError("start_date")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pg-end">End date</Label>
              <Input id="pg-end" type="date" value={values.end_date} onChange={(e) => set("end_date", e.target.value)} className={inputClass} aria-invalid={errors.end_date ? true : undefined} />
              {fieldError("end_date")}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pg-venue">Venue</Label>
              <Input id="pg-venue" value={values.venue} onChange={(e) => set("venue", e.target.value)} className={inputClass} />
            </div>
          </div>

          <MediaPicker label="Featured image" value={featuredId} onChange={setFeaturedId} kind="image" />

          {!isNew && String(initial?.id) && (
            <SessionEditor
              programmeId={String(initial.id)}
              startDate={values.start_date}
              endDate={values.end_date}
              initialSessions={initialSessions}
            />
          )}
          {isNew && (
            <p className="text-sm text-text-tertiary">Save the programme first, then add sessions inline.</p>
          )}

          <details className="rounded-2xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium text-text-primary">SEO overrides (optional)</summary>
            <div className="mt-3 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pg-seo-title">SEO title</Label>
                <Input id="pg-seo-title" value={values.seo_title} onChange={(e) => set("seo_title", e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pg-seo-desc">SEO description</Label>
                <textarea id="pg-seo-desc" value={values.seo_description} onChange={(e) => set("seo_description", e.target.value)} className={areaClass} rows={3} />
              </div>
            </div>
          </details>
        </div>

        <div className="space-y-4">
          <div className="space-y-2 rounded-2xl border border-border p-4">
            <h2 className="text-sm font-medium text-text-primary">Publishing (CMS-02)</h2>
            <Button
              type="button"
              className="w-full rounded-full"
              disabled={pending !== null}
              onClick={async () => {
                const id = await saveDraft();
                if (id) {
                  toast.success("Saved");
                  snapshot.current = JSON.stringify({ values, featuredId });
                  if (isNew) router.push(`${basePath}/${id}`);
                  else router.refresh();
                }
              }}
            >
              {pending === "draft" ? "Saving…" : "Save draft"}
            </Button>
            {showPublishControls && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-full"
                  disabled={pending !== null}
                  onClick={() => void runStatusAction("publish")}
                >
                  {pending === "publish" ? "Publishing…" : "Publish now"}
                </Button>
                <div className="space-y-1.5">
                  <Label htmlFor="pg-scheduled">Schedule for later</Label>
                  <Input id="pg-scheduled" type="datetime-local" value={values.scheduled_for} onChange={(e) => set("scheduled_for", e.target.value)} className={inputClass} aria-invalid={errors.scheduled_for ? true : undefined} />
                  {fieldError("scheduled_for")}
                  <Button type="button" variant="outline" className="w-full rounded-full" disabled={pending !== null} onClick={() => void handleSchedule()}>
                    {pending === "schedule" ? "Scheduling…" : "Schedule"}
                  </Button>
                </div>
                {!isNew && (status === "published" || status === "scheduled") && (
                  <Button type="button" variant="ghost" className="w-full rounded-full" disabled={pending !== null} onClick={() => void runStatusAction("unpublish")}>
                    Unpublish to draft
                  </Button>
                )}
                {!isNew && (
                  <Button type="button" variant="ghost" className="w-full rounded-full" disabled={pending !== null} onClick={() => void runStatusAction("archive")}>
                    Archive
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
