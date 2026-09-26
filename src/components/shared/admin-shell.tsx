"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNav, sectionLabelFor } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";

const RAIL_KEY = "movaldem:admin:rail";

/**
 * Admin shell: collapsible icon rail on desktop (persisted), slide-over
 * drawer on mobile, sticky topbar. Same Luminous Sanctuary tokens throughout.
 */
export function AdminShell({
  permissions,
  name,
  email,
  children,
}: {
  permissions: string[];
  name: string | null;
  email: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Restore persisted rail state client-side only (avoids hydration mismatch).
  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(RAIL_KEY) === "1");
    } catch {
      /* private mode — rail simply defaults to expanded */
    }
  }, []);

  const toggleRail = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(RAIL_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const closeDrawer = React.useCallback(() => setMobileOpen(false), []);
  const drawerCloseRef = React.useRef<HTMLButtonElement>(null);

  // Drawer follows navigation and dismisses with Escape; background stays put.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  React.useEffect(() => {
    if (!mobileOpen) return;
    drawerCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen bg-surface-base">
      {/* Desktop sidebar: expanded panel or collapsed icon rail. */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border-subtle bg-surface-base transition-[width] duration-200 ease-out md:flex",
          collapsed ? "w-[68px]" : "w-60",
        )}
        aria-label="Admin navigation"
      >
        <div className={cn("flex h-14 shrink-0 items-center border-b border-border-subtle", collapsed ? "justify-center px-0" : "justify-between px-3")}>
          {!collapsed && (
            <Link href="/admin" className="truncate px-1 font-semibold tracking-tight text-text-primary">
              MOVALDEM
            </Link>
          )}
          <button
            type="button"
            onClick={toggleRail}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>
        <SidebarNav permissions={permissions} collapsed={collapsed} />
      </aside>

      {/* Mobile drawer + scrim. Always mounted for smooth transitions. */}
      <div className={cn("fixed inset-0 z-50 md:hidden", !mobileOpen && "pointer-events-none")} aria-hidden={!mobileOpen}>
        <div
          onClick={closeDrawer}
          className={cn(
            "absolute inset-0 bg-black/55 transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Admin navigation"
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface-base shadow-2xl transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-3">
            <Link href="/admin" onClick={closeDrawer} className="px-1 font-semibold tracking-tight text-text-primary">
              MOVALDEM
            </Link>
            <button
              type="button"
              ref={drawerCloseRef}
              onClick={closeDrawer}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <SidebarNav permissions={permissions} onNavigate={closeDrawer} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar title={sectionLabelFor(pathname)} name={name} email={email} onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-5 md:px-8 md:py-7">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
