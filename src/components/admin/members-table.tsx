"use client";

import * as React from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";

type MemberRow = {
  id: string;
  full_name: string;
  email: string;
  status: "active" | "suspended" | "deactivated";
  email_verified: boolean;
  created_at: Date;
};

// CSV-11: prefix formula-injection characters so spreadsheet apps can't treat a
// cell as an expression, even though the real export target is giving records.
function csvSafe(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function downloadCsv(filename: string, rows: MemberRow[]) {
  const header = ["Name", "Email", "Status", "Verified", "Joined"];
  const body = rows.map((r) =>
    [csvSafe(r.full_name), csvSafe(r.email), r.status, String(r.email_verified), r.created_at.toISOString()].join(","),
  );
  const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function MembersTable({
  rows,
  onSuspend,
  onRestore,
}: {
  rows: MemberRow[];
  onSuspend: (formData: FormData) => Promise<void>;
  onRestore: (formData: FormData) => Promise<void>;
}) {
  const [search, setSearch] = React.useState("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) => r.email.toLowerCase().includes(term) || r.full_name.toLowerCase().includes(term),
    );
  }, [rows, search]);

  const columns: ColumnDef<MemberRow>[] = [
    {
      accessorKey: "full_name",
      header: "Name",
      cell: ({ row }) => (
        <Link
          href={`/admin/users/${row.original.id}`}
          className="font-medium text-text-primary hover:underline"
        >
          {row.original.full_name}
        </Link>
      ),
    },
    { accessorKey: "email", header: "Email" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "active" ? "default" : "secondary"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "email_verified",
      header: "Verified",
      cell: ({ row }) => (row.original.email_verified ? "Yes" : "No"),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const id = row.original.id;
        const suspended = row.original.status !== "active";
        return (
          <form
            action={async (formData) => {
              setPendingId(id);
              try {
                await (suspended ? onRestore(formData) : onSuspend(formData));
              } finally {
                setPendingId(null);
              }
            }}
          >
            <input type="hidden" name="id" value={id} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={pendingId === id}
              aria-label={suspended ? `Restore ${row.original.full_name}` : `Suspend ${row.original.full_name}`}
            >
              {pendingId === id ? "…" : suspended ? "Restore" : "Suspend"}
            </Button>
          </form>
        );
      },
    },
  ];

  if (!rows.length) {
    return <EmptyState title="No members yet" description="Registrations will appear here." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          type="text"
          placeholder="Search by name or email"
          aria-label="Search members"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm rounded-full bg-surface-elevated"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => downloadCsv("members.csv", filtered)}
          disabled={!filtered.length}
        >
          Export CSV
        </Button>
      </div>
      {filtered.length ? (
        <DataTable columns={columns} data={filtered} />
      ) : (
        <EmptyState title="No matches" description="Try a different search term." />
      )}
    </div>
  );
}
