"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Content",
    items: [
      { href: "/admin/sermons", label: "Sermons", perm: "sermons.read" },
      { href: "/admin/quizzes", label: "Quizzes", perm: "quizzes.read" },
      { href: "/admin/questions", label: "Questions", perm: "questions.read" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/users", label: "Members", perm: "members.read" },
      { href: "/admin/users/staff", label: "Staff", perm: "staff.read" },
      { href: "/admin/users/roles", label: "Roles", perm: "roles.read" },
    ],
  },
  {
    label: "Ops",
    items: [
      { href: "/admin/transactions", label: "Transactions", perm: "transactions.read" },
      { href: "/admin/audit-logs", label: "Audit log", perm: "audit_logs.read" },
      { href: "/admin/settings", label: "Settings", perm: "settings.read" },
    ],
  },
] as const;

export function AdminSidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const can = (perm: string) => permissions.includes(perm) || permissions.includes("*");

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-surface-base md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-border px-4">
        <Link href="/admin" className="font-semibold tracking-tight text-text-primary">
          MOVALDEM
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter((item) => can(item.perm));
          if (!visible.length) return null;
          return (
            <div key={group.label}>
              <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {visible.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "block rounded-full px-3 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
