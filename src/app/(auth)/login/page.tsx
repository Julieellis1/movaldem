"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FormField, FormShell } from "@/components/shared/form-shell";
import { loginSchema } from "@/modules/auth/schemas";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = React.useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="font-headline-sm text-headline-sm text-text-primary">Welcome back</h1>
        <p className="text-body-sm text-on-surface-variant">Sign in to continue</p>
      </div>
      {formError && (
        <p role="alert" aria-live="polite" className="text-body-sm text-destructive">
          {formError}
        </p>
      )}
      <FormShell
        schema={loginSchema}
        submitLabel="Sign in"
        onSubmit={async (values) => {
          setFormError(null);
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            setFormError(body?.error ?? "Invalid email or password");
            return;
          }
          toast.success("Signed in");
          const redirect = searchParams.get("redirect");
          router.push(redirect && redirect.startsWith("/") ? redirect : "/");
          router.refresh();
        }}
      >
        <FormField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
        />
        <FormField
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </FormShell>
      <div className="flex items-center justify-between text-body-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          Forgot password?
        </Link>
        <Link href="/register" className="text-primary hover:underline">
          Create account
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense>
      <LoginForm />
    </React.Suspense>
  );
}
