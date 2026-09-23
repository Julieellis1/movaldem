"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AdminTopbar({
  name,
  email,
}: {
  name: string | null;
  email: string | null;
}) {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface-base px-4 md:px-6">
      <p className="text-sm text-text-secondary">Admin</p>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-text-primary">{name}</p>
          <p className="text-xs text-text-tertiary">{email}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
