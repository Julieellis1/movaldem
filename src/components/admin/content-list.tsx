"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { TeachingType } from "./content-form";

export type ContentListRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  published_at: string | Date | null;
  deleted_at?: string | Date | null;
  meta?: string;
};

async function postStatus(apiType: string, id: string, action: string) {
  const res = await fetch(`/api/content/${apiType}/${id}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
}

function RowActions({
  apiType,
  basePath,
  row,
  canUpdate,
  canDelete,
  canPublish,
}: {
  apiType: string;
  basePath: string;
  row: ContentListRow;
  canUpdate: boolean;
  canDelete: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  async function run(label: string, fn: () => Promise<void>) {
    setPending(label);
    try {
      await fn();
      toast.success(`${label} done`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setPending(null);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-1">
      {canUpdate && (
        <Link href={`${basePath}/${row.id}`}>
          <Button type="button" variant="outline" size="sm">Edit</Button>
        </Link>
      )}
      {canPublish && (row.status === "draft" || row.status === "review" || row.status === "scheduled") && (
        <Button
          type="button" variant="outline" size="sm"
          disabled={pending !== null}
          onClick={() => void run("Publish", () => postStatus(apiType, row.id, "publish"))}
          aria-label={`Publish ${row.title}`}
        >
          {pending === "Publish" ? "…" : "Publish"}
        </Button>
      )}
      {canUpdate && row.status === "published" && (
        <Button
          type="button" variant="ghost" size="sm"
          disabled={pending !== null}
          onClick={() => void run("Unpublish", () => postStatus(apiType, row.id, "unpublish"))}
          aria-label={`Unpublish ${row.title}`}
        >
          {pending === "Unpublish" ? "…" : "Unpublish"}
        </Button>
      )}
      {canDelete && !confirmDelete && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${row.title}`}>
          Delete
        </Button>
      )}
      {canDelete && confirmDelete && (
        <Button
          type="button" variant="ghost" size="sm"
          disabled={pending !== null}
          className="text-destructive"
          onClick={() =>
            void run("Delete", async () => {
              const res = await fetch(`/api/content/${apiType}/${row.id}`, { method: "DELETE" });
              const json = (await res.json().catch(() => ({}))) as { error?: string };
              if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
            })
          }
          aria-label={`Confirm delete ${row.title}`}
        >
          {pending === "Delete" ? "…" : "Confirm"}
        </Button>
      )}
    </div>
  );
}

// Shared admin list: client-side search + DataTable + lifecycle actions.
// Server pages fetch rows and pass them in (with capability flags).
export function ContentList({
  type,
  apiType,
  basePath,
  title,
  newLabel,
  rows,
  canCreate,
  canUpdate,
  canDelete,
  canPublish,
}: {
  type: TeachingType;
  apiType: string;
  basePath: string;
  title: string;
  newLabel: string;
  rows: ContentListRow[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canPublish: boolean;
}) {
  void type;
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(term) ||
        r.slug.toLowerCase().includes(term) ||
        (r.meta ?? "").toLowerCase().includes(term),
    );
  }, [rows, search]);

  const columns: ColumnDef<ContentListRow>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="font-medium text-text-primary">
          {row.original.title}
          {row.original.deleted_at && <span className="ml-2 text-xs text-destructive">(deleted)</span>}
        </span>
      ),
    },
    {
      accessorKey: "meta",
      header: "Details",
      cell: ({ row }) => <span className="text-sm text-text-secondary">{row.original.meta ?? "—"}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Badge variant="secondary">{row.original.status}</Badge>,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <RowActions
          apiType={apiType}
          basePath={basePath}
          row={row.original}
          canUpdate={canUpdate}
          canDelete={canDelete}
          canPublish={canPublish}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
        {canCreate && (
          <Link href={`${basePath}/new`}>
            <Button type="button" size="sm" className="rounded-full">{newLabel}</Button>
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState title={`No ${title.toLowerCase()} yet`} description={canCreate ? `Use “${newLabel}” to create the first one.` : ""} />
      ) : (
        <div className="space-y-4">
          <Input
            type="search"
            placeholder="Search by title"
            aria-label={`Search ${title}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm rounded-full bg-surface-elevated"
          />
          {filtered.length ? (
            <DataTable columns={columns} data={filtered} />
          ) : (
            <EmptyState title="No matches" description="Try a different search term." />
          )}
        </div>
      )}
    </div>
  );
}
