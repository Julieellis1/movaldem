"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  FileText,
  FolderOpen,
  GraduationCap,
  Images,
  KeyRound,
  Layers,
  LayoutDashboard,
  ListChecks,
  Mail,
  MessageCircleQuestionMark,
  Mic,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  /** Undefined = visible to every signed-in staff member (dashboard). */
  perm?: string;
  icon: LucideIcon;
  badge?: "unread";
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/sermons", label: "Sermons", perm: "sermons.read", icon: Mic },
      { href: "/admin/bible-studies", label: "Bible studies", perm: "bible_studies.read", icon: BookOpen },
      { href: "/admin/sunday-school", label: "Sunday school", perm: "sunday_school.read", icon: GraduationCap },
      { href: "/admin/series", label: "Series", perm: "series.read", icon: Layers },
      { href: "/admin/categories", label: "Categories", perm: "content_categories.read", icon: Tags },
      { href: "/admin/events", label: "Events", perm: "events.read", icon: CalendarDays },
      { href: "/admin/programmes", label: "Programmes", perm: "programmes.read", icon: CalendarRange },
      { href: "/admin/gallery", label: "Gallery", perm: "gallery.read", icon: Images },
      { href: "/admin/pages", label: "Pages", perm: "pages.read", icon: FileText },
      { href: "/admin/media", label: "Media library", perm: "media.read", icon: FolderOpen },
      { href: "/admin/quizzes", label: "Quizzes", perm: "quizzes.read", icon: MessageCircleQuestionMark },
      { href: "/admin/questions", label: "Questions", perm: "questions.read", icon: ListChecks },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/users", label: "Members", perm: "members.read", icon: Users },
      { href: "/admin/users/staff", label: "Staff", perm: "staff.read", icon: ShieldCheck },
      { href: "/admin/users/roles", label: "Roles", perm: "roles.read", icon: KeyRound },
      { href: "/admin/contact", label: "Contact messages", perm: "contact_messages.read", icon: Mail, badge: "unread" },
    ],
  },
  {
    label: "Ops",
    items: [
      { href: "/admin/transactions", label: "Transactions", perm: "transactions.read", icon: Receipt },
      { href: "/admin/audit-logs", label: "Audit log", perm: "audit_logs.read", icon: ScrollText },
      { href: "/admin/settings", label: "Settings", perm: "settings.read", icon: Settings },
    ],
  },
];

/** Current section label for the topbar (longest matching prefix wins). */
export function sectionLabelFor(pathname: string): string {
  let best = "Dashboard";
  let bestLen = 0;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.href === "/admin") continue;
      if ((pathname === item.href || pathname.startsWith(`${item.href}/`)) && item.href.length > bestLen) {
        best = item.label;
        bestLen = item.href.length;
      }
    }
  }
  return best;
}

export function SidebarNav({
  permissions,
  collapsed = false,
  onNavigate,
}: {
  permissions: string[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const can = (perm?: string) => !perm || permissions.includes(perm) || permissions.includes("*");

  // Unread contact-message count for the inbox badge (08 §4). Only fetched
  // when the user can see the inbox; failures leave the badge hidden.
  const [unread, setUnread] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!can("contact_messages.read")) return;
    let cancelled = false;
    fetch("/api/contact?status=new")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { unread?: number } | null) => {
        if (!cancelled && json && typeof json.unread === "number") setUnread(json.unread);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissions.join(",")]);

  return (
    <nav aria-label="Admin" className="flex flex-1 flex-col gap-4 overflow-y-auto px-2.5 py-3">
      {NAV_GROUPS.map((group) => {
        const visible = group.items.filter((item) => can(item.perm));
        if (!visible.length) return null;
        return (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {visible.map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const showBadge = "badge" in item && item.badge === "unread" && unread !== null && unread > 0;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-primary/15 font-medium text-primary"
                          : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                      {!collapsed && showBadge && (
                        <span
                          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground"
                          aria-label={`${unread} unread messages`}
                        >
                          {unread}
                        </span>
                      )}
                      {collapsed && showBadge && (
                        <span
                          className="absolute ml-5 mt-[-14px] h-2 w-2 rounded-full bg-primary"
                          aria-label={`${unread} unread messages`}
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
