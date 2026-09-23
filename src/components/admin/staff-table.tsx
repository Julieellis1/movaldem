"use client";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import type { ColumnDef } from "@tanstack/react-table";

type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  status: "active" | "suspended" | "deactivated";
  email_verified: boolean;
  roles: { key: string; name: string }[];
};

export function StaffTable({ staff }: { staff: StaffRow[] }) {
  if (!staff.length) {
    return <EmptyState title="No staff yet" description="Invite a team member to get started." />;
  }

  const columns: ColumnDef<StaffRow>[] = [
    {
      accessorKey: "full_name",
      header: "Name",
      cell: ({ row }) => <span className="font-medium text-text-primary">{row.original.full_name}</span>,
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
      accessorKey: "roles",
      header: "Roles",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.roles.map((r) => (
            <Badge key={r.key} variant="outline">
              {r.name}
            </Badge>
          ))}
        </div>
      ),
    },
  ];

  return <DataTable columns={columns} data={staff} />;
}
