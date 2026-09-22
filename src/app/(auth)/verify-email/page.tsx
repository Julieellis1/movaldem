"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Status = "idle" | "pending" | "success" | "invalid";

// better-auth owns token generation/validation (auth.config comments): this
// page only surfaces the redirect state — pending → success / invalid — with
// aria-live announcements (A11Y-04).
function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const errorParam = searchParams.get("error");
  const [status, setStatus] = React.useState<Status>(token ? "pending" : "idle");

  React.useEffect(() => {
    if (errorParam) {
      setStatus("invalid");
      return;
    }
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!cancelled) setStatus(res.ok ? "success" : "invalid");
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, errorParam]);

  return (
    <div className="space-y-4 text-center" aria-live="polite">
      <h1 className="font-headline-sm text-headline-sm text-text-primary">Verify your email</h1>
      {status === "idle" && (
        <p className="text-body-md text-on-surface-variant">
          We sent you a verification link. Open it to activate your account.
        </p>
      )}
      {status === "pending" && (
        <p className="text-body-md text-on-surface-variant">Verifying your email…</p>
      )}
      {status === "success" && (
        <>
          <p className="text-body-md text-on-surface">Email verified — you can sign in now.</p>
          <Link href="/login" className="text-primary hover:underline">
            Go to sign in
          </Link>
        </>
      )}
      {status === "invalid" && (
        <p role="alert" className="text-body-md text-destructive">
          This verification link is invalid or has expired. Request a new one by signing in.
        </p>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense>
      <VerifyEmailContent />
    </React.Suspense>
  );
}
