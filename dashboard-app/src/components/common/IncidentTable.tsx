import { useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { IncidentRow } from "../../types";
import { dateDisplay } from "../../lib/dates";
import { personName } from "../../lib/processRows";
import { statusKey } from "../../lib/classification";

function priorityClass(p: string): string {
  const code = p.toUpperCase();
  if (code === "P1" || code === "P2") return "pill-high";
  if (code === "P3") return "pill-med";
  return "pill-neutral";
}
function statusPill(s: string): string {
  const k = statusKey(s);
  return k === "pending" ? "pill-pending" : k === "progress" ? "pill-progress" : k === "resolved" ? "pill-resolved" :
    k === "closed" ? "pill-closed" : k === "cancelled" ? "pill-cancelled" : "pill-neutral";
}
function ageDisplay(n: number | null): React.ReactNode {
  if (n == null || isNaN(n)) return <span className="muted">-</span>;
  if (n >= 14) return <span className="age-risk">{n.toLocaleString()}</span>;
  if (n >= 5) return <span className="age-warn">{n.toLocaleString()}</span>;
  return n.toLocaleString();
}

const columns: ColumnDef<IncidentRow>[] = [
  {
    accessorKey: "ticketNumber",
    header: "Incident ID",
    cell: ({ row }) =>
      row.original.dashboardUrl ? (
        <a href={row.original.dashboardUrl} target="_blank" rel="noopener noreferrer">{row.original.ticketNumber || "Open"}</a>
      ) : (
        row.original.ticketNumber || "-"
      ),
  },
  {
    accessorKey: "ticketId",
    header: "Request ID",
    cell: ({ row }) =>
      row.original.ticketUrl ? (
        <a href={row.original.ticketUrl} target="_blank" rel="noopener noreferrer">{row.original.ticketId || "Open"}</a>
      ) : (
        row.original.ticketId || "-"
      ),
  },
  { accessorKey: "company", header: "Company", cell: (c) => c.getValue<string>() || "-" },
  { accessorKey: "workType", header: "Work Type", cell: (c) => c.getValue<string>() || "Unclassified" },
  { accessorKey: "operationalGroup", header: "Group", cell: (c) => c.getValue<string>() || "Unclassified" },
  {
    accessorKey: "priority",
    header: "Priority",
    cell: (c) => <span className={`pill ${priorityClass(c.getValue<string>())}`}>{c.getValue<string>() || "Unspecified"}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: (c) => <span className={`pill ${statusPill(c.getValue<string>())}`}>{c.getValue<string>() || "-"}</span>,
  },
  { accessorKey: "subStatus", header: "Pending Reason", cell: (c) => c.getValue<string>() || "-" },
  { id: "submitterName", header: "Submitter", accessorFn: personName },
  { accessorKey: "category", header: "Category", cell: (c) => c.getValue<string>() || "-" },
  { accessorKey: "subCategory", header: "Sub-category", cell: (c) => c.getValue<string>() || "-" },
  { accessorKey: "createdDate", header: "Created", cell: (c) => dateDisplay(c.getValue<Date | null>()) },
  { accessorKey: "daysOpen", header: "Age", cell: (c) => (c.getValue<number | null>() ?? "-").toString() },
  { accessorKey: "daysSinceUpdated", header: "Last update age", cell: (c) => ageDisplay(c.getValue<number | null>()) },
  { accessorKey: "description", header: "Description", cell: (c) => <span className="desc">{c.getValue<string>() || "-"}</span> },
];

interface Props {
  rows: IncidentRow[];
  emptyMessage: string;
  pageSize?: number;
}

export function IncidentTable({ rows, emptyMessage, pageSize = 100 }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "daysOpen", desc: true }]);
  const data = useMemo(() => rows.slice(0, pageSize), [rows, pageSize]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="table-wrap">
      <table>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} onClick={h.column.getToggleSortingHandler()}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {h.column.getIsSorted() === "asc" ? <span className="sort-arrow">▲</span> : null}
                  {h.column.getIsSorted() === "desc" ? <span className="sort-arrow">▼</span> : null}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {data.length ? (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="muted">{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
