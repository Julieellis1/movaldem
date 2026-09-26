"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export type ContactRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: string;
  created_at: string;
};

const STATUSES = ["all", "new", "read", "archived"] as const;

// Contact inbox (PRD 08 §4): status filter new/read/archived, view,
// mark read/unread, archive, delete (Admin+), mailto reply link.
export function ContactInbox({
  initialRows,
  initialUnread,
  canUpdate,
  canDelete,
}: {
  initialRows: ContactRow[];
  initialUnread: number;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<(typeof STATUSES)[number]>("all");
  const [rows, setRows] = React.useState<ContactRow[]>(initialRows);
  const [unread, setUnread] = React.useState(initialUnread);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);

  async function reload(nextFilter: (typeof STATUSES)[number]) {
    setLoading(true);
    try {
      const params = nextFilter === "all" ? "" : `?status=${nextFilter}`;
      const json = await api<{ rows: ContactRow[]; unread: number }>(`/api/contact${params}`);
      setRows(json.rows);
      setUnread(json.unread);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  function changeFilter(next: (typeof STATUSES)[number]) {
    setFilter(next);
    setOpenId(null);
    void reload(next);
  }

  async function setStatus(id: string, status: "new" | "read" | "archived", label: string) {
    setPending(id);
    try {
      await api(`/api/contact/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      toast.success(label);
      await reload(filter);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(null);
    }
  }

  async function remove(id: string) {
    setPending(id);
    try {
      await api(`/api/contact/${id}`, { method: "DELETE" });
      toast.success("Message deleted");
      setOpenId(null);
      await reload(filter);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPending(null);
    }
  }

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term) ||
        r.subject.toLowerCase().includes(term),
    );
  }, [rows, search]);

  const columns: ColumnDef<ContactRow>[] = [
    {
      accessorKey: "subject",
      header: "Subject",
      cell: ({ row }) => (
        <span className="font-medium text-text-primary">
          {row.original.status === "new" && (
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary" aria-label="Unread" />
          )}
          {row.original.subject}
        </span>
      ),
    },
    {
      accessorKey: "name",
      header: "From",
      cell: ({ row }) => (
        <span className="text-sm text-text-secondary">
          {row.original.name} · {row.original.email}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Badge variant="secondary">{row.original.status}</Badge>,
    },
    {
      accessorKey: "created_at",
      header: "Received",
      cell: ({ row }) => (
        <span className="text-sm text-text-secondary">
          {new Date(row.original.created_at).toLocaleString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const r = row.original;
        const open = openId === r.id;
        return (
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open}>
              {open ? "Close" : "View"}
            </Button>
            {canUpdate && r.status === "new" && (
              <Button type="button" variant="ghost" size="sm" disabled={pending === r.id} onClick={() => void setStatus(r.id, "read", "Marked read")}>
                Mark read
              </Button>
            )}
            {canUpdate && r.status === "read" && (
              <Button type="button" variant="ghost" size="sm" disabled={pending === r.id} onClick={() => void setStatus(r.id, "new", "Marked unread")}>
                Mark unread
              </Button>
            )}
            {canUpdate && r.status !== "archived" && (
              <Button type="button" variant="ghost" size="sm" disabled={pending === r.id} onClick={() => void setStatus(r.id, "archived", "Archived")}>
                Archive
              </Button>
            )}
            <a
              href={`mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(`Re: ${r.subject}`)}`}
              className="inline-flex h-8 items-center rounded-full px-3 text-sm text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
            >
              Reply
            </a>
            {canDelete && (
              <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={pending === r.id} onClick={() => void remove(r.id)} aria-label={`Delete message from ${r.name}`}>
                Delete
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const openRow = openId ? rows.find((r) => r.id === openId) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Contact messages</h1>
        {unread > 0 && (
          <Badge variant="secondary" aria-label={`${unread} unread messages`}>
            {unread} unread
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="tablist" aria-label="Message status">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={filter === s}
              onClick={() => changeFilter(s)}
              className={`rounded-full px-3 py-1.5 text-sm capitalize ${filter === s ? "bg-primary/10 font-medium text-primary" : "text-text-secondary hover:bg-surface-elevated"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <Input
          type="search"
          placeholder="Search name, email, subject"
          aria-label="Search messages"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs rounded-full bg-surface-elevated"
        />
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No messages" description={filter === "all" ? "New contact form submissions will appear here." : `No ${filter} messages.`} />
      ) : filtered.length ? (
        <DataTable columns={columns} data={filtered} />
      ) : (
        <EmptyState title="No matches" description="Try a different search term." />
      )}

      {openRow && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Message from ${openRow.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpenId(null);
          }}
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface-base p-4 shadow-xl md:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">{openRow.subject}</h2>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                aria-label="Close message"
                className="rounded-full px-3 py-1 text-sm text-text-secondary hover:bg-surface-elevated"
              >
                Close
              </button>
            </div>
            <dl className="space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-text-tertiary">From</dt>
                <dd className="text-text-primary">{openRow.name} ({openRow.email})</dd>
              </div>
              {openRow.phone && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-text-tertiary">Phone</dt>
                  <dd className="text-text-primary">{openRow.phone}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-text-tertiary">Received</dt>
                <dd className="text-text-primary">{new Date(openRow.created_at).toLocaleString()}</dd>
              </div>
            </dl>
            <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-surface-elevated p-3 text-sm text-text-primary">
              {openRow.message}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`mailto:${encodeURIComponent(openRow.email)}?subject=${encodeURIComponent(`Re: ${openRow.subject}`)}`}
                className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Reply via email
              </a>
              {canUpdate && openRow.status === "new" && (
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void setStatus(openRow.id, "read", "Marked read")}>
                  Mark read
                </Button>
              )}
              {canUpdate && openRow.status !== "archived" && (
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void setStatus(openRow.id, "archived", "Archived")}>
                  Archive
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
