"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// PRD 06 §2 + §8: reusable GivingForm — modes tithe/offering/general/project,
// posts to the single shared client POST /api/giving/checkout (Paystack logic
// lives only in PaymentService, GIV-01/02). Server re-validates everything.

export const GIVING_TYPES = ["tithe", "offering", "general", "project"] as const;
export type GivingTypeOption = (typeof GIVING_TYPES)[number];

export type GivingProjectOption = {
  id: string;
  slug: string;
  title: string;
};

export type GivingFormPrefill = {
  name?: string;
  email?: string;
  phone?: string;
  userId?: string;
};

const TYPE_LABELS: Record<GivingTypeOption, string> = {
  tithe: "Tithe",
  offering: "Offering",
  general: "General Giving",
  project: "Support a Project",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const NIGERIAN_PHONE_RE = /^(\+234\d{10}|0\d{10})$/;

type FieldErrors = Partial<{
  type: string;
  projectId: string;
  amount: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  form: string;
}>;

function isGivingType(v: string): v is GivingTypeOption {
  return (GIVING_TYPES as readonly string[]).includes(v);
}

export function GivingForm({
  initialType = "general",
  initialProjectId,
  projects = [],
  requirePhone = false,
  prefill,
  className,
}: {
  initialType?: GivingTypeOption;
  initialProjectId?: string;
  /** ACTIVE projects only — loaded by the page server component. */
  projects?: GivingProjectOption[];
  requirePhone?: boolean;
  /** Logged-in member prefill (guests allowed, GIV flow step 3). */
  prefill?: GivingFormPrefill;
  className?: string;
}) {
  const [type, setType] = React.useState<GivingTypeOption>(
    isGivingType(initialType) ? initialType : "general",
  );
  const [projectId, setProjectId] = React.useState(initialProjectId ?? "");
  const [amount, setAmount] = React.useState("");
  const [name, setName] = React.useState(prefill?.name ?? "");
  const [email, setEmail] = React.useState(prefill?.email ?? "");
  const [phone, setPhone] = React.useState(prefill?.phone ?? "");
  const [message, setMessage] = React.useState("");
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  /** Set when Paystack is unreachable on initialise (06 §11) — shows retry. */
  const [paystackOutage, setPaystackOutage] = React.useState(false);

  const validate = React.useCallback((): FieldErrors => {
    const errs: FieldErrors = {};
    if (!isGivingType(type)) errs.type = "Choose a giving type.";
    if (type === "project" && !projectId)
      errs.projectId = "Choose a project to support.";
    if (!amount.trim()) errs.amount = "Enter an amount.";
    else if (!AMOUNT_RE.test(amount.trim()) || Number(amount) <= 0)
      errs.amount = "Enter a valid amount in naira (up to 2 decimals).";
    if (!name.trim()) errs.name = "Enter your full name.";
    if (!email.trim()) errs.email = "Enter your email address.";
    else if (!EMAIL_RE.test(email.trim()))
      errs.email = "Enter a valid email address.";
    if (requirePhone && !phone.trim())
      errs.phone = "Enter your phone number.";
    else if (phone.trim() && !NIGERIAN_PHONE_RE.test(phone.trim()))
      errs.phone = "Enter a valid Nigerian phone number (e.g. 0803… or +234…).";
    if (message.trim().length > 500)
      errs.message = "Message must be 500 characters or fewer.";
    return errs;
  }, [type, projectId, amount, name, email, phone, message, requirePhone]);

  const submit = React.useCallback(async () => {
    const fieldErrors = validate();
    setErrors(fieldErrors);
    setPaystackOutage(false);
    if (Object.keys(fieldErrors).length > 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/giving/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          projectId: type === "project" ? projectId : undefined,
          amountNaira: Number(amount),
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          message: message.trim() || undefined,
          userId: prefill?.userId,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        authorizationUrl?: string;
        error?: string;
      } | null;
      if (res.ok && data?.authorizationUrl) {
        window.location.assign(data.authorizationUrl);
        return;
      }
      if (res.status === 502) {
        // Paystack outage on initialise (06 §11): friendly error + retry,
        // input preserved (state untouched).
        setPaystackOutage(true);
        setErrors({
          form: "We could not reach the payment provider just now. Your details are kept — please try again in a moment.",
        });
        return;
      }
      setErrors({
        form:
          data?.error ??
          (res.status === 429
            ? "Too many attempts. Please wait a little while and try again."
            : "Check the highlighted fields and try again."),
      });
    } catch {
      // Network failure: preserve input, surface an inline error.
      setErrors({
        form: "Could not start the payment. Check your connection and try again — your details are kept.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [validate, type, projectId, amount, name, email, phone, message, prefill?.userId]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit();
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label="Giving form"
      className={cn("flex flex-col gap-4", className)}
    >
      {errors.form && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          <p className="font-medium text-destructive">{errors.form}</p>
          {paystackOutage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? "Retrying…" : "Try again"}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="giving-type">Giving type</Label>
        <Select
          value={type}
          onValueChange={(v) => {
            if (isGivingType(v)) setType(v);
          }}
        >
          <SelectTrigger id="giving-type" aria-invalid={errors.type ? true : undefined}>
            <SelectValue placeholder="Choose a giving type" />
          </SelectTrigger>
          <SelectContent>
            {GIVING_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.type && (
          <p role="alert" className="text-sm text-destructive">
            {errors.type}
          </p>
        )}
      </div>

      {type === "project" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="giving-project">Project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id="giving-project" aria-invalid={errors.projectId ? true : undefined}>
              <SelectValue placeholder="Choose a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.projectId && (
            <p role="alert" className="text-sm text-destructive">
              {errors.projectId}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="giving-amount">Amount (₦)</Label>
        <Input
          id="giving-amount"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 5000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={errors.amount ? "giving-amount-error" : undefined}
        />
        {errors.amount && (
          <p id="giving-amount-error" role="alert" className="text-sm text-destructive">
            {errors.amount}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="giving-name">Full name</Label>
          <Input
            id="giving-name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "giving-name-error" : undefined}
          />
          {errors.name && (
            <p id="giving-name-error" role="alert" className="text-sm text-destructive">
              {errors.name}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="giving-email">Email</Label>
          <Input
            id="giving-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "giving-email-error" : undefined}
          />
          {errors.email && (
            <p id="giving-email-error" role="alert" className="text-sm text-destructive">
              {errors.email}
            </p>
          )}
        </div>
      </div>

      {requirePhone && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="giving-phone">Phone</Label>
          <Input
            id="giving-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? "giving-phone-error" : undefined}
          />
          {errors.phone && (
            <p id="giving-phone-error" role="alert" className="text-sm text-destructive">
              {errors.phone}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="giving-message">
          Message <span className="text-on-surface-variant">(optional, max 500 characters)</span>
        </Label>
        <textarea
          id="giving-message"
          name="message"
          rows={3}
          maxLength={501}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? "giving-message-error" : undefined}
          className="w-full rounded-xl border border-input bg-surface-elevated px-4 py-2 text-sm text-on-surface ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {errors.message && (
          <p id="giving-message-error" role="alert" className="text-sm text-destructive">
            {errors.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Starting payment…" : "Proceed to Payment"}
      </Button>
      <p className="text-xs text-on-surface-variant">
        You will be redirected to Paystack to complete your payment securely.
      </p>
    </form>
  );
}

export default GivingForm;
