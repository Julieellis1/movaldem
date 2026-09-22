"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { FormField, FormShell } from "@/components/shared/form-shell";
import { Label } from "@/components/ui/label";
import { registerSchema } from "@/modules/auth/schemas";

export default function RegisterPage() {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="font-headline-sm text-headline-sm text-text-primary">Create your account</h1>
        <p className="text-body-sm text-on-surface-variant">Join the MOVALDEM community</p>
      </div>
      {formError && (
        <p role="alert" aria-live="polite" className="text-body-sm text-destructive">
          {formError}
        </p>
      )}
      <FormShell
        schema={registerSchema}
        submitLabel="Create account"
        onSubmit={async (values) => {
          setFormError(null);
          const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            setFormError(body?.error ?? "Registration failed. Please try again.");
            return;
          }
          toast.success("Account created — check your email to verify");
          router.push("/verify-email");
        }}
      >
        <FormField name="full_name" label="Full name" autoComplete="name" placeholder="Grace Okafor" />
        <FormField name="email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" />
        <FormField name="password" label="Password" type="password" autoComplete="new-password" placeholder="At least 8 characters" />
        <FormField
          name="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your password"
        />
        <ConsentField />
      </FormShell>
      <p className="text-center text-body-sm text-on-surface-variant">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

// Renders inside FormShell so useFormContext resolves the RHF store;
// handles both the checkbox registration and its inline consent error.
function ConsentField() {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = errors.consent;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <input
          id="consent"
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "consent-error" : undefined}
          className="mt-1 h-4 w-4 shrink-0 rounded border-input accent-primary"
          {...register("consent")}
        />
        <Label htmlFor="consent" className="cursor-pointer leading-relaxed">
          I consent to MOVALDEM storing my details and contacting me about the ministry
        </Label>
      </div>
      {error && (
        <p id="consent-error" role="alert" aria-live="polite" className="text-body-sm text-destructive">
          {String(error.message ?? "Consent is required")}
        </p>
      )}
    </div>
  );
}
