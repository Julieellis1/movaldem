import Link from "next/link";
import { findValidStaffInvite } from "@/modules/auth/auth.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInviteAction } from "./actions";

const ERROR_COPY: Record<string, string> = {
  invalid: "This invitation is invalid or has expired. Ask a super admin to send a new one.",
  password: "Choose a stronger password: at least 8 characters.",
  match: "The two passwords do not match.",
  rate: "Too many attempts. Try again in a little while.",
};

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const errorText = error ? ERROR_COPY[error] : undefined;

  // An invalid/expired token never renders the password form at all, so the
  // form cannot be posted against a dead invite (USR-03).
  if (!token || !(await findValidStaffInvite(token))) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="font-headline-sm text-headline-sm text-text-primary">Invitation unavailable</h1>
        <p className="text-sm text-on-surface-variant">{errorText ?? ERROR_COPY.invalid}</p>
        <Link href="/login" className="inline-block text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="font-headline-sm text-headline-sm text-text-primary">Set your password</h1>
        <p className="text-body-sm text-on-surface-variant">
          Your staff account is ready. Choose a password to finish joining the team.
        </p>
      </div>
      {errorText && (
        <p role="alert" className="text-center text-body-sm text-destructive">
          {errorText}
        </p>
      )}
      <form action={acceptInviteAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="rounded-full bg-surface-elevated"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="rounded-full bg-surface-elevated"
          />
        </div>
        <Button type="submit" className="w-full">
          Set password
        </Button>
      </form>
    </div>
  );
}
