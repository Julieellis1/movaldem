// Client table for the admin transactions list — DataTable reuse (ADM-04).
// Amounts format with formatNaira (integer kobo end-to-end); the reference
// links to the detail view. Sort headers are server links.

"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { formatNaira } from "@/lib/money";

export type TxListRow = {
  id: string;
  reference: string;
  name: string;
  email: string;
  amount: number;
  type: string;
  project_title: string | null;
  status: string;
  created_at: string;
};

function sortHref(baseQs: string, sort: string, order: string, col: string): string {
  const p = new URLSearchParams(baseQs.replace(/^\?/, ""));
  p.set("sort", col);
  p.set("order", sort === col && order === "desc" ? "asc" : "desc");
  p.delete("page");
  const s = p.toString();
  return `/admin/giving/transactions${s ? `?${s}` : ""}`;
}

export function TxTable({
  rows,
  sort,
  order,
  baseQs,
}: {
  rows: TxListRow[];
  sort: string;
  order: string;
  baseQs: string;
}) {
  const arrow = (col: string) =>
    sort === col ? (order === "asc" ? " ↑" : " ↓") : "";

  const columns: ColumnDef<TxListRow>[] = [
    {
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) => (
        <Link
          href={`/admin/giving/transactions/${row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.reference}
        </Link>
      ),
    },
    {
      accessorKey: "name",
      header: "Donor",
      cell: ({ row }) => (
        <span className="text-sm text-text-secondary">
          {row.original.name} · {row.original.email}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: () => (
        <Link href={sortHref(baseQs, sort, order, "amount")}>
          Amount{arrow("amount")}
        </Link>
      ),
      cell: ({ row }) => (
        <span className="font-medium">{formatNaira(row.original.amount)}</span>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.type}
          {row.original.project_title ? ` · ${row.original.project_title}` : ""}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: () => (
        <Link href={sortHref(baseQs, sort, order, "status")}>
          Status{arrow("status")}
        </Link>
      ),
      cell: ({ row }) => <Badge variant="secondary">{row.original.status}</Badge>,
    },
    {
      accessorKey: "created_at",
      header: () => (
        <Link href={sortHref(baseQs, sort, order, "created_at")}>
          Date{arrow("created_at")}
        </Link>
      ),
      cell: ({ row }) => (
        <span className="text-sm text-text-secondary">
          {new Date(row.original.created_at).toLocaleString()}
        </span>
      ),
    },
  ];

  return <DataTable columns={columns} data={rows} />;
}
