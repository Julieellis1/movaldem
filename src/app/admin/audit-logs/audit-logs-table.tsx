"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";

export type AuditLogRow = {
  id: string;
  actor: string;
  role: string;
  action: string;
  entity: string;
  entityId: string;
  changes: unknown;
  createdAt: Date;
};

type Filters = {
  actor: string;
  action: string;
  entity: string;
  from: string;
  to: string;
};

// CSV-11: prefix formula-injection characters so spreadsheet apps can't treat a
// cell as an expression.
function csvSafe(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function downloadCsv(rows: AuditLogRow[]) {
  const header = ["Created", "Actor", "Role", "Action", "Entity", "Entity ID", "Changes"];
  const body = rows.map((r) =>
    [
      csvSafe(r.createdAt.toISOString()),
      csvSafe(r.actor),
      csvSafe(r.role),
      csvSafe(r.action),
      csvSafe(r.entity),
      csvSafe(r.entityId),
      csvSafe(JSON.stringify(r.changes)),
    ].join(","),
  );
  const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "audit-logs.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function AuditLogsTable({
  rows,
  filters,
  canExport,
}: {
  rows: AuditLogRow[];
  filters: Filters;
  canExport: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Filters>(filters);

  function apply(next: Filters) {
    const params = new URLSearchParams();
    (Object.keys(next) as (keyof Filters)[]).forEach((key) => {
      const value = next[key].trim();
      if (value) params.set(key, value);
    });
    const query = params.toString();
    router.push(query ? `/admin/audit-logs?${query}` : "/admin/audit-logs");
  }

  const columns: ColumnDef<AuditLogRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">{row.original.createdAt.toLocaleString()}</span>
      ),
    },
    { accessorKey: "actor", header: "Actor" },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.role}</span>,
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => (
        <code className="font-mono text-xs text-text-primary">{row.original.action}</code>
      ),
    },
    { accessorKey: "entity", header: "Entity" },
    {
      accessorKey: "entityId",
      header: "Entity ID",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.entityId}</span>,
    },
    {
      accessorKey: "changes",
      header: "Changes",
      cell: ({ row }) =>
        row.original.changes ? (
          <code className="block max-w-sm truncate font-mono text-xs" title={JSON.stringify(row.original.changes)}>
            {JSON.stringify(row.original.changes)}
          </code>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <form
        className="grid grid-cols-1 gap-3 rounded-xl bg-surface-card p-5 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="audit-actor">Actor</Label>
          <Input
            id="audit-actor"
            type="text"
            value={draft.actor}
            onChange={(e) => setDraft((d) => ({ ...d, actor: e.target.value }))}
            placeholder="Email"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-action">Action</Label>
          <Input
            id="audit-action"
            type="text"
            value={draft.action}
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
            placeholder="e.g. user.register"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-entity">Entity</Label>
          <Input
            id="audit-entity"
            type="text"
            value={draft.entity}
            onChange={(e) => setDraft((d) => ({ ...d, entity: e.target.value }))}
            placeholder="e.g. users"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-from">From</Label>
          <Input
            id="audit-from"
            type="date"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-to">To</Label>
          <Input
            id="audit-to"
            type="date"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
          />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
          <Button type="submit" variant="outline" size="sm">
            Apply filters
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const cleared = { actor: "", action: "", entity: "", from: "", to: "" };
              setDraft(cleared);
              apply(cleared);
            }}
          >
            Clear
          </Button>
          {canExport && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadCsv(rows)}
              disabled={!rows.length}
              className="ml-auto"
            >
              Export CSV
            </Button>
          )}
        </div>
      </form>
      {rows.length ? (
        <DataTable columns={columns} data={rows} />
      ) : (
        <EmptyState title="No audit entries match" description="Widen or clear the filters." />
      )}
    </div>
  );
}
