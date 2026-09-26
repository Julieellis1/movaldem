"use client";

import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AdminTopbar({
  title,
  name,
  email,
  onMenu,
}: {
  title: string;
  name: string | null;
  email: string | null;
  onMenu: () => void;
}) {
  const router = useRouter();

  async function signOut() {
    try {
      const res = await fetch("/api/auth/sign-out", { method: "POST" });
      if (!res.ok) throw new Error(`sign-out answered ${res.status}`);
    } catch {
      toast.error("Sign-out failed. Please try again.");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-base/85 px-3 backdrop-blur-md md:px-6">
      <button
        type="button"
        onClick={onMenu}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{title}</p>
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="hidden text-right min-[420px]:block">
          <p className="max-w-40 truncate text-sm font-medium text-text-primary">{name}</p>
          <p className="max-w-40 truncate text-xs text-text-tertiary">{email}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
