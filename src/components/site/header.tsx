"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// PRD 04 §1 primary navigation. No existing site chrome — this is the minimal
// public header. Hidden on staff/auth shells via SiteChrome (admin keeps its
// own layout). 360px-first with a collapsible mobile menu; Give always visible.
export const SITE_NAV: Array<{ href: string; label: string }> = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/sermons", label: "Sermons" },
  { href: "/bible-study", label: "Bible Study" },
  { href: "/sunday-school", label: "Sunday School" },
  { href: "/events", label: "Events" },
  { href: "/programmes", label: "Programmes" },
  { href: "/gallery", label: "Gallery" },
  { href: "/quiz", label: "Bible Quiz" },
  { href: "/contact", label: "Contact" },
];

export function Header({ churchName }: { churchName?: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Close the mobile menu on navigation.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface-base/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="font-headline-sm text-headline-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          aria-label="MOVALDEM home"
        >
          {churchName && churchName !== "MOVALDEM" ? (
            <span className="flex items-baseline gap-2">
              <span aria-hidden="true">MOVALDEM</span>
              <span className="hidden max-w-55 truncate text-xs font-normal text-on-surface-variant md:inline">
                {churchName}
              </span>
            </span>
          ) : (
            "MOVALDEM"
          )}
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {SITE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                pathname === item.href ? "font-semibold text-text-primary" : "text-on-surface-variant",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/give">Give</Link>
          </Button>
          <Link
            href="/login"
            className="hidden rounded-full px-3 py-1.5 text-sm text-on-surface-variant hover:underline sm:inline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Login
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls="site-mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Menu"}
          </Button>
        </div>
      </div>
      {open && (
        <nav
          id="site-mobile-menu"
          aria-label="Mobile"
          className="border-t border-border-subtle px-4 py-3 sm:px-6 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {SITE_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    pathname === item.href ? "font-semibold text-text-primary" : "text-on-surface-variant",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 flex gap-2">
              <Button asChild size="sm" className="flex-1">
                <Link href="/give">Give</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="flex-1">
                <Link href="/login">Login</Link>
              </Button>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

export default Header;
