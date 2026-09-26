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

export type ProgrammeOption = { id: string; label: string };

// Event form (PRD 05 §10): date/time/venue/organizer/featured/registration
// fields, publish-now vs schedule (CMS-02), inline validation + unsaved-changes
// warning (CMS-07).
export function EventForm({
  basePath,
  initial,
  programmeOptions,
  showPublishControls,
}: {
  basePath: string;
  initial?: Record<string, string | boolean | null> | null;
  programmeOptions: ProgrammeOption[];
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
    start_time: String(initial?.start_time ?? ""),
    end_time: String(initial?.end_time ?? ""),
    venue: String(initial?.venue ?? ""),
    address: String(initial?.address ?? ""),
    organizer: String(initial?.organizer ?? ""),
    contact_phone: String(initial?.contact_phone ?? ""),
    registration_url: String(initial?.registration_url ?? ""),
    programme_id: String(initial?.programme_id ?? ""),
    seo_title: String(initial?.seo_title ?? ""),
    seo_description: String(initial?.seo_description ?? ""),
    scheduled_for: "",
  }));
  const [featuredId, setFeaturedId] = React.useState<string | null>(
    (initial?.featured_media_id as string) ?? null,
  );
  const [isFeatured, setIsFeatured] = React.useState<boolean>(Boolean(initial?.is_featured));
  const [registrationEnabled, setRegistrationEnabled] = React.useState<boolean>(
    Boolean(initial?.registration_enabled),
  );
  const [status, setStatus] = React.useState<string>(String(initial?.status ?? "draft"));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);

  const snapshot = React.useRef(
    JSON.stringify({ values, featuredId, isFeatured, registrationEnabled }),
  );
  const dirty =
    snapshot.current !==
    JSON.stringify({ values, featuredId, isFeatured, registrationEnabled });

  // CMS-07: warn on unsaved changes.
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
    const end = values.end_date || values.start_date;
    if (values.start_date && end < values.start_date) {
      e.end_date = "End date must be on or after start date (05 §10)";
    }
    if (
      values.start_date &&
      end === values.start_date &&
      values.start_time &&
      values.end_time &&
      values.end_time <= values.start_time
    ) {
      e.end_time = "End time must be after start time on the same day (05 §10)";
    }
    if (registrationEnabled && values.registration_url && !/^https?:\/\//i.test(values.registration_url.trim())) {
      e.registration_url = "Registration URL must start with http(s)://";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function payload() {
    return {
      title: values.title.trim(),
      slug: values.slug.trim() || undefined,
      description: values.description.trim() || null,
      featured_media_id: featuredId,
      start_date: values.start_date,
      end_date: values.end_date || null,
      start_time: values.start_time || null,
      end_time: values.end_time || null,
      venue: values.venue.trim() || null,
      address: values.address.trim() || null,
      organizer: values.organizer.trim() || null,
      contact_phone: values.contact_phone.trim() || null,
      is_featured: isFeatured,
      registration_enabled: registrationEnabled,
      registration_url: values.registration_url.trim() || null,
      programme_id: values.programme_id || null,
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
        const json = await api<{ row: { id: string } }>("/api/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload()),
        });
        snapshot.current = JSON.stringify({ values, featuredId, isFeatured, registrationEnabled });
        return json.row.id;
      }
      await api(`/api/events/${initial?.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      snapshot.current = JSON.stringify({ values, featuredId, isFeatured, registrationEnabled });
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
      const json = await api<{ row: { status: string } }>(`/api/events/${id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(publishedAt ? { action, publishedAt } : { action }),
      });
      toast.success(action === "schedule" ? "Scheduled" : action === "publish" ? "Published" : `Status: ${json.row.status}`);
      snapshot.current = JSON.stringify({ values, featuredId, isFeatured, registrationEnabled });
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
          {isNew ? "New event" : "Edit event"}
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
            <Label htmlFor="ev-title">Title</Label>
            <Input id="ev-title" value={values.title} onChange={(e) => set("title", e.target.value)} className={inputClass} aria-invalid={errors.title ? true : undefined} />
            {fieldError("title")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-slug">Slug (optional — auto-generated)</Label>
            <Input id="ev-slug" value={values.slug} onChange={(e) => set("slug", e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-description">Description</Label>
            <textarea id="ev-description" value={values.description} onChange={(e) => set("description", e.target.value)} className={areaClass} rows={5} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ev-start-date">Start date</Label>
              <Input id="ev-start-date" type="date" value={values.start_date} onChange={(e) => set("start_date", e.target.value)} className={inputClass} aria-invalid={errors.start_date ? true : undefined} />
              {fieldError("start_date")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end-date">End date (optional — single-day if empty)</Label>
              <Input id="ev-end-date" type="date" value={values.end_date} onChange={(e) => set("end_date", e.target.value)} className={inputClass} aria-invalid={errors.end_date ? true : undefined} />
              {fieldError("end_date")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-start-time">Start time (Africa/Lagos)</Label>
              <Input id="ev-start-time" type="time" value={values.start_time} onChange={(e) => set("start_time", e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end-time">End time (Africa/Lagos)</Label>
              <Input id="ev-end-time" type="time" value={values.end_time} onChange={(e) => set("end_time", e.target.value)} className={inputClass} aria-invalid={errors.end_time ? true : undefined} />
              {fieldError("end_time")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-venue">Venue</Label>
              <Input id="ev-venue" value={values.venue} onChange={(e) => set("venue", e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-address">Address</Label>
              <Input id="ev-address" value={values.address} onChange={(e) => set("address", e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-organizer">Organizer</Label>
              <Input id="ev-organizer" value={values.organizer} onChange={(e) => set("organizer", e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-phone">Contact phone</Label>
              <Input id="ev-phone" type="tel" value={values.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border p-4">
            <h2 className="text-sm font-medium text-text-primary">Registration (external link in V1)</h2>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input type="checkbox" checked={registrationEnabled} onChange={(e) => setRegistrationEnabled(e.target.checked)} className="h-4 w-4 accent-primary" />
              Enable registration
            </label>
            {registrationEnabled && (
              <div className="space-y-1.5">
                <Label htmlFor="ev-reg-url">Registration URL</Label>
                <Input id="ev-reg-url" type="url" placeholder="https://…" value={values.registration_url} onChange={(e) => set("registration_url", e.target.value)} className={inputClass} aria-invalid={errors.registration_url ? true : undefined} />
                {fieldError("registration_url")}
              </div>
            )}
          </div>

          <MediaPicker label="Featured image" value={featuredId} onChange={setFeaturedId} kind="image" />

          <details className="rounded-2xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium text-text-primary">SEO overrides (optional)</summary>
            <div className="mt-3 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ev-seo-title">SEO title</Label>
                <Input id="ev-seo-title" value={values.seo_title} onChange={(e) => set("seo_title", e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-seo-desc">SEO description</Label>
                <textarea id="ev-seo-desc" value={values.seo_description} onChange={(e) => set("seo_description", e.target.value)} className={areaClass} rows={3} />
              </div>
            </div>
          </details>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ev-programme">Parent programme (optional)</Label>
            <select
              id="ev-programme"
              value={values.programme_id}
              onChange={(e) => set("programme_id", e.target.value)}
              className="flex h-10 w-full rounded-full border border-input bg-surface-elevated px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">None</option>
              {programmeOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="h-4 w-4 accent-primary" />
            Featured
          </label>

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
                  snapshot.current = JSON.stringify({ values, featuredId, isFeatured, registrationEnabled });
                  if (isNew) router.push(basePath);
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
                  <Label htmlFor="ev-scheduled">Schedule for later</Label>
                  <Input id="ev-scheduled" type="datetime-local" value={values.scheduled_for} onChange={(e) => set("scheduled_for", e.target.value)} className={inputClass} aria-invalid={errors.scheduled_for ? true : undefined} />
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
