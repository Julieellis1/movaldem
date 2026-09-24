"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MediaPicker } from "./media-picker";

export type TeachingType = "sermon" | "bible_study" | "sunday_school";

type Option = { id: string; label: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

const TYPE_LABEL: Record<TeachingType, string> = {
  sermon: "Sermon",
  bible_study: "Bible study",
  sunday_school: "Sunday school lesson",
};

// Shared teaching-content form (PRD 05 §2 + per-type §3/4/5): common media /
// taxonomy / SEO parts plus per-type required fields. CMS-02 publish-now vs
// schedule, CMS-07 inline validation + unsaved-changes warning.
export function ContentForm({
  type,
  basePath,
  initial,
  initialTags = [],
  seriesOptions,
  categoryOptions,
  showPublishControls,
}: {
  type: TeachingType;
  basePath: string;
  initial?: Record<string, string | number | boolean | null> | null;
  initialTags?: string[];
  seriesOptions: Option[];
  categoryOptions: Option[];
  showPublishControls: boolean;
}) {
  const router = useRouter();
  const isNew = !initial?.id;

  const [values, setValues] = React.useState<Record<string, string>>(() => ({
    title: String(initial?.title ?? ""),
    slug: String(initial?.slug ?? ""),
    description: String(initial?.description ?? ""),
    preacher: String(initial?.preacher ?? ""),
    sermon_date: String(initial?.sermon_date ?? ""),
    scripture_reference: String(initial?.scripture_reference ?? ""),
    teacher: String(initial?.teacher ?? ""),
    study_date: String(initial?.study_date ?? ""),
    lesson_number: initial?.lesson_number != null ? String(initial.lesson_number) : "",
    lesson_date: String(initial?.lesson_date ?? ""),
    topic: String(initial?.topic ?? ""),
    memory_verse: String(initial?.memory_verse ?? ""),
    introduction: String(initial?.introduction ?? ""),
    series_id: String(initial?.series_id ?? ""),
    category_id: String(initial?.category_id ?? ""),
    seo_title: String(initial?.seo_title ?? ""),
    seo_description: String(initial?.seo_description ?? ""),
    tags: initialTags.join(", "),
    video_external_url: "",
    scheduled_for: "",
  }));
  const [featuredId, setFeaturedId] = React.useState<string | null>(
    (initial?.featured_media_id as string) ?? null,
  );
  const [audioId, setAudioId] = React.useState<string | null>((initial?.audio_media_id as string) ?? null);
  const [videoId, setVideoId] = React.useState<string | null>((initial?.video_media_id as string) ?? null);
  const [documentId, setDocumentId] = React.useState<string | null>(
    (initial?.document_media_id as string) ?? null,
  );
  const [downloadEnabled, setDownloadEnabled] = React.useState<boolean>(
    initial?.download_enabled !== false,
  );
  const [isFeatured, setIsFeatured] = React.useState<boolean>(Boolean(initial?.is_featured));
  const [status, setStatus] = React.useState<string>(String(initial?.status ?? "draft"));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);

  const snapshot = React.useRef(
    JSON.stringify({ values, featuredId, audioId, videoId, documentId, downloadEnabled, isFeatured }),
  );
  const dirty =
    snapshot.current !==
    JSON.stringify({ values, featuredId, audioId, videoId, documentId, downloadEnabled, isFeatured });

  // CMS-07: warn on unsaved changes (in-browser navigation guard included).
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
    if (type === "sermon") {
      if (!values.preacher.trim()) e.preacher = "Preacher is required";
      if (!values.sermon_date) e.sermon_date = "Sermon date is required";
    }
    if (type === "bible_study") {
      if (!values.teacher.trim()) e.teacher = "Teacher is required";
      if (!values.study_date) e.study_date = "Study date is required";
    }
    if (type === "sunday_school") {
      if (!values.series_id) e.series_id = "Series is required (a quarter is a series)";
      if (!values.lesson_number.trim()) e.lesson_number = "Lesson number is required";
      else if (!/^\d+$/.test(values.lesson_number.trim())) e.lesson_number = "Lesson number must be an integer";
      if (!values.lesson_date) e.lesson_date = "Lesson date is required";
      if (!values.topic.trim()) e.topic = "Topic is required";
    }
    // CMS-11: video is one of uploaded file or external URL, not both.
    if (videoId && values.video_external_url.trim()) {
      e.video_external_url = "Use either an uploaded video or an external URL, not both (CMS-11)";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function payload(videoMediaId: string | null) {
    const tagList = values.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const body: Record<string, unknown> = {
      title: values.title.trim(),
      slug: values.slug.trim() || undefined,
      description: values.description.trim() || null,
      featured_media_id: featuredId,
      audio_media_id: audioId,
      video_media_id: videoMediaId,
      document_media_id: documentId,
      download_enabled: downloadEnabled,
      series_id: values.series_id || null,
      category_id: values.category_id || null,
      is_featured: isFeatured,
      seo_title: values.seo_title.trim() || null,
      seo_description: values.seo_description.trim() || null,
      tags: tagList,
    };
    if (type === "sermon") {
      body.preacher = values.preacher.trim();
      body.sermon_date = values.sermon_date;
      body.scripture_reference = values.scripture_reference.trim() || null;
    }
    if (type === "bible_study") {
      body.teacher = values.teacher.trim();
      body.study_date = values.study_date;
      body.scripture_reference = values.scripture_reference.trim() || null;
      body.lesson_number = values.lesson_number.trim() ? Number(values.lesson_number.trim()) : null;
    }
    if (type === "sunday_school") {
      body.series_id = values.series_id;
      body.lesson_number = Number(values.lesson_number.trim());
      body.lesson_date = values.lesson_date;
      body.topic = values.topic.trim();
      body.memory_verse = values.memory_verse.trim() || null;
      body.introduction = values.introduction.trim() || null;
      body.teacher = values.teacher.trim() || null;
    }
    return body;
  }

  function friendlyError(message: string) {
    // Friendly duplicate lesson_number error (unique per series).
    if (/lesson_number already exists|duplicate lesson_number/i.test(message)) {
      setErrors((e) => ({ ...e, lesson_number: "This lesson number already exists in the selected series" }));
    }
    setServerError(message);
  }

  async function saveDraft(): Promise<string | null> {
    if (!validate()) {
      toast.error("Fix the highlighted fields");
      return null;
    }
    setPending("draft");
    setServerError(null);
    try {
      // CMS-11: an external video URL becomes an external_url media row whose
      // id is attached as video_media_id (one video source only).
      let resolvedVideoId = videoId;
      const extUrl = values.video_external_url.trim();
      if (extUrl && !resolvedVideoId) {
        const created = await api<{ row: { id: string } }>("/api/media", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "external_url", externalUrl: extUrl, title: values.title.trim() || null }),
        });
        resolvedVideoId = created.row.id;
        setVideoId(resolvedVideoId);
      }
      if (isNew) {
        const json = await api<{ row: { id: string } }>(`/api/content/${type}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload(resolvedVideoId)),
        });
        snapshot.current = JSON.stringify({
          values, featuredId, audioId, videoId, documentId, downloadEnabled, isFeatured,
        });
        return json.row.id;
      }
      await api(`/api/content/${type}/${initial?.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload(resolvedVideoId)),
      });
      snapshot.current = JSON.stringify({
        values, featuredId, audioId, videoId, documentId, downloadEnabled, isFeatured,
      });
      return String(initial?.id);
    } catch (err) {
      friendlyError(err instanceof Error ? err.message : "Save failed");
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
      const json = await api<{ row: { status: string } }>(`/api/content/${type}/${id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(publishedAt ? { action, publishedAt } : { action }),
      });
      toast.success(action === "schedule" ? "Scheduled" : action === "publish" ? "Published" : `Status: ${json.row.status}`);
      snapshot.current = JSON.stringify({
        values, featuredId, audioId, videoId, documentId, downloadEnabled, isFeatured,
      });
      if (isNew) router.push(basePath);
      else {
        setStatus(json.row.status);
        router.refresh();
      }
    } catch (err) {
      friendlyError(err instanceof Error ? err.message : "Status change failed");
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
          {isNew ? `New ${TYPE_LABEL[type]}` : `Edit ${TYPE_LABEL[type]}`}
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
            <Label htmlFor="cf-title">Title</Label>
            <Input id="cf-title" value={values.title} onChange={(e) => set("title", e.target.value)} className={inputClass} aria-invalid={errors.title ? true : undefined} />
            {fieldError("title")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-slug">Slug (optional — auto-generated)</Label>
            <Input id="cf-slug" value={values.slug} onChange={(e) => set("slug", e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-description">Description</Label>
            <textarea id="cf-description" value={values.description} onChange={(e) => set("description", e.target.value)} className={areaClass} rows={5} />
          </div>

          {type === "sermon" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cf-preacher">Preacher</Label>
                <Input id="cf-preacher" value={values.preacher} onChange={(e) => set("preacher", e.target.value)} className={inputClass} aria-invalid={errors.preacher ? true : undefined} />
                {fieldError("preacher")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-sermon-date">Sermon date</Label>
                <Input id="cf-sermon-date" type="date" value={values.sermon_date} onChange={(e) => set("sermon_date", e.target.value)} className={inputClass} aria-invalid={errors.sermon_date ? true : undefined} />
                {fieldError("sermon_date")}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cf-scripture">Scripture reference</Label>
                <Input id="cf-scripture" placeholder="e.g. Genesis 6:14" value={values.scripture_reference} onChange={(e) => set("scripture_reference", e.target.value)} className={inputClass} />
              </div>
            </div>
          )}

          {type === "bible_study" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cf-teacher">Teacher</Label>
                <Input id="cf-teacher" value={values.teacher} onChange={(e) => set("teacher", e.target.value)} className={inputClass} aria-invalid={errors.teacher ? true : undefined} />
                {fieldError("teacher")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-study-date">Study date</Label>
                <Input id="cf-study-date" type="date" value={values.study_date} onChange={(e) => set("study_date", e.target.value)} className={inputClass} aria-invalid={errors.study_date ? true : undefined} />
                {fieldError("study_date")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-bscripture">Scripture reference</Label>
                <Input id="cf-bscripture" value={values.scripture_reference} onChange={(e) => set("scripture_reference", e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-blesson">Lesson number (optional)</Label>
                <Input id="cf-blesson" inputMode="numeric" value={values.lesson_number} onChange={(e) => set("lesson_number", e.target.value)} className={inputClass} />
              </div>
            </div>
          )}

          {type === "sunday_school" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cf-topic">Topic</Label>
                <Input id="cf-topic" value={values.topic} onChange={(e) => set("topic", e.target.value)} className={inputClass} aria-invalid={errors.topic ? true : undefined} />
                {fieldError("topic")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-teacher-ss">Teacher (optional)</Label>
                <Input id="cf-teacher-ss" value={values.teacher} onChange={(e) => set("teacher", e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-lesson-number">Lesson number (unique per series)</Label>
                <Input id="cf-lesson-number" inputMode="numeric" value={values.lesson_number} onChange={(e) => set("lesson_number", e.target.value)} className={inputClass} aria-invalid={errors.lesson_number ? true : undefined} />
                {fieldError("lesson_number")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-lesson-date">Lesson date</Label>
                <Input id="cf-lesson-date" type="date" value={values.lesson_date} onChange={(e) => set("lesson_date", e.target.value)} className={inputClass} aria-invalid={errors.lesson_date ? true : undefined} />
                {fieldError("lesson_date")}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cf-memory">Memory verse</Label>
                <Input id="cf-memory" value={values.memory_verse} onChange={(e) => set("memory_verse", e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cf-intro">Introduction</Label>
                <textarea id="cf-intro" value={values.introduction} onChange={(e) => set("introduction", e.target.value)} className={areaClass} rows={4} />
              </div>
            </div>
          )}

          <div className="space-y-4 rounded-2xl border border-border p-4">
            <h2 className="text-sm font-medium text-text-primary">Media (any combination, or text-only — CMS-10/12)</h2>
            <MediaPicker label="Featured image" value={featuredId} onChange={setFeaturedId} kind="image" />
            <MediaPicker label="Audio" value={audioId} onChange={setAudioId} kind="audio" />
            <MediaPicker label="Video file" value={videoId} onChange={setVideoId} kind="video" allowExternal={false} />
            <div className="space-y-1.5">
              <Label htmlFor="cf-video-url">Or external video URL (YouTube, Vimeo, Facebook — CMS-11)</Label>
              <Input id="cf-video-url" type="url" placeholder="https://…" value={values.video_external_url} onChange={(e) => set("video_external_url", e.target.value)} className={inputClass} aria-invalid={errors.video_external_url ? true : undefined} />
              {fieldError("video_external_url")}
            </div>
            <MediaPicker label="PDF document" value={documentId} onChange={setDocumentId} kind="document" />
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input type="checkbox" checked={downloadEnabled} onChange={(e) => setDownloadEnabled(e.target.checked)} className="h-4 w-4 accent-primary" />
              Enable downloads (Download button appears only with a PDF — §8)
            </label>
          </div>

          <details className="rounded-2xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium text-text-primary">SEO overrides (optional)</summary>
            <div className="mt-3 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cf-seo-title">SEO title</Label>
                <Input id="cf-seo-title" value={values.seo_title} onChange={(e) => set("seo_title", e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-seo-desc">SEO description</Label>
                <textarea id="cf-seo-desc" value={values.seo_description} onChange={(e) => set("seo_description", e.target.value)} className={areaClass} rows={3} />
              </div>
            </div>
          </details>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cf-series">Series{type === "sunday_school" ? " (required)" : ""}</Label>
            <select
              id="cf-series"
              value={values.series_id}
              onChange={(e) => set("series_id", e.target.value)}
              aria-invalid={errors.series_id ? true : undefined}
              className="flex h-10 w-full rounded-full border border-input bg-surface-elevated px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">None</option>
              {seriesOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            {fieldError("series_id")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-category">Category</Label>
            <select
              id="cf-category"
              value={values.category_id}
              onChange={(e) => set("category_id", e.target.value)}
              className="flex h-10 w-full rounded-full border border-input bg-surface-elevated px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">None</option>
              {categoryOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-tags">Tags (comma-separated, created inline)</Label>
            <Input id="cf-tags" placeholder="faith, prayer" value={values.tags} onChange={(e) => set("tags", e.target.value)} className={inputClass} />
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
                  snapshot.current = JSON.stringify({
                    values, featuredId, audioId, videoId, documentId, downloadEnabled, isFeatured,
                  });
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
                  <Label htmlFor="cf-scheduled">Schedule for later</Label>
                  <Input id="cf-scheduled" type="datetime-local" value={values.scheduled_for} onChange={(e) => set("scheduled_for", e.target.value)} className={inputClass} aria-invalid={errors.scheduled_for ? true : undefined} />
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
