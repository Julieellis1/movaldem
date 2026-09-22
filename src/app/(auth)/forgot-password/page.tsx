"use client";

import * as React from "react";
import Link from "next/link";
import { FormField, FormShell } from "@/components/shared/form-shell";
import { forgotSchema } from "@/modules/auth/schemas";

const GENERIC_MESSAGE = "If that email exists, a reset link has been sent.";

export default function ForgotPasswordPage() {
  const [sent, setSent] = React.useState(false);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="font-headline-sm text-headline-sm text-text-primary">Forgot password?</h1>
        <p className="text-body-sm text-on-surface-variant">
          Enter your email and we&apos;ll send a reset link
        </p>
      </div>
      <div aria-live="polite">
        {sent ? (
          <p className="text-body-md text-on-surface">{GENERIC_MESSAGE}</p>
        ) : (
          <FormShell
            schema={forgotSchema}
            submitLabel="Send reset link"
            onSubmit={async (values) => {
              await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
              });
              // Always the generic outcome — no account enumeration (SEC-09).
              setSent(true);
            }}
          >
            <FormField
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
            />
          </FormShell>
        )}
      </div>
      <p className="text-center text-body-sm text-on-surface-variant">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
