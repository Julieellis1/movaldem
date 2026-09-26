"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// PRD 04 §9 contact page: name, email, phone (optional), subject, message,
// honeypot + rate limiting (server-side, in the future /api/contact route).
// Presentational + form POST only: no db imports.

/** Honeypot field name. The future /api/contact route must reject non-empty values. */
export const CONTACT_HONEYPOT_FIELD = "company_website";

export const CONTACT_DEFAULT_ACTION = "/api/contact";

type FieldErrors = Partial<{
  name: string;
  email: string;
  subject: string;
  message: string;
  form: string;
}>;

function validate(values: { name: string; email: string; subject: string; message: string }): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.name.trim()) errors.name = "Enter your name.";
  if (!values.email.trim()) errors.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = "Enter a valid email address.";
  if (!values.subject.trim()) errors.subject = "Enter a subject.";
  if (!values.message.trim()) errors.message = "Enter your message.";
  else if (values.message.trim().length < 10)
    errors.message = "Message must be at least 10 characters.";
  return errors;
}

export function ContactForm({
  action = CONTACT_DEFAULT_ACTION,
  className,
}: {
  /** POST target; the /api/contact route comes later. Defaults to /api/contact. */
  action?: string;
  className?: string;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [honeypot, setHoneypot] = React.useState("");
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [status, setStatus] = React.useState<"idle" | "sending" | "success" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors = validate({ name, email, subject, message });
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;
    setStatus("sending");
    setErrors({});
    try {
      const res = await fetch(action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          subject: subject.trim(),
          message: message.trim(),
          [CONTACT_HONEYPOT_FIELD]: honeypot,
        }),
      });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      setStatus("success");
    } catch {
      // Preserve input on failure; surface an inline error.
      setStatus("error");
      setErrors({ form: "Your message could not be sent. Check your connection and try again." });
    }
  };

  if (status === "success") {
    return (
      <div role="status" className={cn("rounded-xl border border-border-subtle bg-surface-card p-6", className)}>
        <p className="font-headline-sm text-headline-sm text-text-primary">Message sent</p>
        <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
          Thank you for contacting us. We will get back to you shortly.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Contact form"
      className={cn("flex flex-col gap-4", className)}
    >
      {errors.form && (
        <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">
          {errors.form}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact-name">Name</Label>
          <Input
            id="contact-name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "contact-name-error" : undefined}
          />
          {errors.name && (
            <p id="contact-name-error" role="alert" className="text-sm text-destructive">
              {errors.name}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "contact-email-error" : undefined}
          />
          {errors.email && (
            <p id="contact-email-error" role="alert" className="text-sm text-destructive">
              {errors.email}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-phone">
          Phone <span className="text-on-surface-variant">(optional)</span>
        </Label>
        <Input
          id="contact-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-subject">Subject</Label>
        <Input
          id="contact-subject"
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-invalid={errors.subject ? true : undefined}
          aria-describedby={errors.subject ? "contact-subject-error" : undefined}
        />
        {errors.subject && (
          <p id="contact-subject-error" role="alert" className="text-sm text-destructive">
            {errors.subject}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-message">Message</Label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? "contact-message-error" : undefined}
          className="w-full rounded-xl border border-input bg-surface-elevated px-4 py-2 text-sm text-on-surface ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {errors.message && (
          <p id="contact-message-error" role="alert" className="text-sm text-destructive">
            {errors.message}
          </p>
        )}
      </div>
      {/* Honeypot: hidden from sighted + assistive users; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="contact-hp">Leave this field empty</label>
        <input
          id="contact-hp"
          name={CONTACT_HONEYPOT_FIELD}
          type="text"
          autoComplete="off"
          tabIndex={-1}
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>
      <div>
        <Button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending" : "Send message"}
        </Button>
      </div>
    </form>
  );
}

export default ContactForm;
