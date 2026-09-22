"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FormField, FormShell } from "@/components/shared/form-shell";
import { resetSchema } from "@/modules/auth/schemas";

function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);

  if (!token) {
    return (
      <div className="space-y-4 text-center" role="alert" aria-live="polite">
        <p className="text-body-md text-destructive">
          This reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password" className="text-primary hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="font-headline-sm text-headline-sm text-text-primary">Set a new password</h1>
        <p className="text-body-sm text-on-surface-variant">Choose a strong password</p>
      </div>
      {formError && (
        <p role="alert" aria-live="polite" className="text-body-sm text-destructive">
          {formError}
        </p>
      )}
      <FormShell
        schema={resetSchema}
        submitLabel="Reset password"
        onSubmit={async (values) => {
          setFormError(null);
          const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, newPassword: values.password }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            setFormError(body?.error ?? "Invalid or expired link");
            return;
          }
          toast.success("Password updated — sign in with your new password");
          router.push("/login");
        }}
      >
        <FormField name="password" label="New password" type="password" autoComplete="new-password" placeholder="At least 8 characters" />
        <FormField
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your new password"
        />
        {/* token is required by resetSchema but comes from the URL, not a field */}
        <input type="hidden" name="token" value={token} />
      </FormShell>
      <p className="text-center text-body-sm text-on-surface-variant">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  // better-auth 1.7 puts the token in the path (/reset-password/<token>);
  // also accept ?token= for the redirectTo form.
  const queryToken = searchParams.get("token");
  const [pathToken, setPathToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    const segment = window.location.pathname.split("/").filter(Boolean);
    const idx = segment.indexOf("reset-password");
    if (idx >= 0 && segment[idx + 1]) setPathToken(decodeURIComponent(segment[idx + 1]));
  }, []);

  return (
    <React.Suspense>
      <ResetPasswordForm token={queryToken ?? pathToken ?? ""} />
    </React.Suspense>
  );
}
