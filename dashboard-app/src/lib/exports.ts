import * as XLSX from "xlsx";
import type { IncidentRow } from "../types";
import { dateDisplay } from "./dates";
import { personName } from "./processRows";

const DETAIL_COLUMNS: [keyof IncidentRow | "personName", string][] = [
  ["ticketNumber", "Incident ID"],
  ["ticketId", "Request ID"],
  ["dashboardUrl", "Dashboard"],
  ["ticketUrl", "Ticket"],
  ["company", "Company"],
  ["workType", "Work Type"],
  ["operationalGroup", "Group"],
  ["priority", "Priority"],
  ["status", "Status"],
  ["subStatus", "Pending Reason"],
  ["personName", "Submitter"],
  ["category", "Category"],
  ["subCategory", "Sub-category"],
  ["createdDate", "Created Date"],
  ["daysOpen", "Age Days"],
  ["daysSinceUpdated", "Last Update Age"],
  ["description", "Description"],
];

function rowToExportRecord(r: IncidentRow): Record<string, unknown> {
  const rec: Record<string, unknown> = {};
  for (const [key, label] of DETAIL_COLUMNS) {
    if (key === "personName") rec[label] = personName(r);
    else if (key === "createdDate") rec[label] = dateDisplay(r.createdDate);
    else rec[label] = (r as unknown as Record<string, unknown>)[key as string] ?? "";
  }
  return rec;
}

function safeName(v: string): string {
  return (
    String(v || "export")
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "export"
  );
}

function currentDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Port of exportRowsAsXlsx(rows,label): writes a single "Export" sheet via SheetJS. */
export function exportRowsAsXlsx(rows: IncidentRow[], label: string): void {
  const ws = XLSX.utils.json_to_sheet(rows.map(rowToExportRecord));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Export");
  XLSX.writeFile(wb, `${safeName(label)}_${currentDateStamp()}.xlsx`);
}

function countMapForExport(rows: IncidentRow[], fn: (r: IncidentRow) => string): [string, number][] {
  const m: Record<string, number> = {};
  rows.forEach((r) => {
    const k = fn(r) || "Unspecified";
    m[k] = (m[k] || 0) + 1;
  });
  return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

interface ManagementPackMetric {
  label: string;
  value: number;
}

export function managementPackMetrics(rows: IncidentRow[], isOpenFn: (r: IncidentRow) => boolean, isPendingFn: (r: IncidentRow) => boolean, isClosureReviewFn: (r: IncidentRow) => boolean): ManagementPackMetric[] {
  const open = rows.filter(isOpenFn);
  const pending = rows.filter(isPendingFn);
  return [
    { label: "Active Work", value: open.length },
    { label: "Pending Work", value: pending.length },
    { label: "Closure Review", value: rows.filter(isClosureReviewFn).length },
    { label: "Aging 5+", value: open.filter((r) => r.daysOpen != null && r.daysOpen >= 5).length },
    { label: "Aging 14+", value: open.filter((r) => r.daysOpen != null && r.daysOpen >= 14).length },
    { label: "Stale 14+", value: open.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 14).length },
    { label: "Stale 30+", value: open.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 30).length },
  ];
}

/**
 * Port of exportManagementCsv(): 3-sheet workbook (Executive Summary,
 * Operational Summary, Ticket Detail), using SheetJS writer instead of the
 * old app's hand-rolled OOXML/ZIP builder. Styling (fonts/fills) from the old
 * app is dropped since SheetJS community edition doesn't carry cell styles
 * through json_to_sheet; content/structure is preserved.
 */
export function exportManagementPack(
  summaryRows: IncidentRow[],
  detailRows: IncidentRow[],
  opts: {
    isOpenFn: (r: IncidentRow) => boolean;
    isPendingFn: (r: IncidentRow) => boolean;
    isClosureReviewFn: (r: IncidentRow) => boolean;
    dataset: string;
    company: string;
    appliedFilters: [string, string][];
  },
): void {
  const metrics = managementPackMetrics(summaryRows, opts.isOpenFn, opts.isPendingFn, opts.isClosureReviewFn);
  const closure = metrics.find((m) => m.label === "Closure Review")?.value ?? 0;
  const pending = metrics.find((m) => m.label === "Pending Work")?.value ?? 0;
  const pct = pending ? Math.round((closure / pending) * 100) : 0;
  const generated = new Date().toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const execRows: (string | number)[][] = [
    ["SBB Incident Intelligence Platform"],
    ["Management Pack"],
    ["Export Generated", generated, "Dataset", opts.dataset, "Company", opts.company, "Summary Records", summaryRows.length],
    ["Ticket Detail Records", detailRows.length],
    [],
    ["Key Operational Metrics"],
    ...metrics.map((m) => [m.label, m.value]),
    [],
    ["Governance Focus"],
    ["Closure Review", closure, "Pending", pending, "% Pending Ready", pct + "%"],
    [],
    ["Report Scope"],
    ...opts.appliedFilters.map(([k, v]) => [k, v]),
  ];

  const sections: [string, [string, number][]][] = [
    ["Status Breakdown", countMapForExport(summaryRows, (r) => r.status || "Unspecified")],
    ["Priority Breakdown", countMapForExport(summaryRows, (r) => r.priority || "Unspecified")],
    ["Work Type Breakdown", countMapForExport(summaryRows, (r) => r.workType || "Unclassified")],
    ["Operational Group Breakdown", countMapForExport(summaryRows, (r) => r.operationalGroup || "Unclassified")],
    ["Pending Reason Breakdown", countMapForExport(summaryRows.filter(opts.isPendingFn), (r) => r.subStatus || "Unspecified")],
    ["Company Breakdown", countMapForExport(summaryRows, (r) => r.company || "Unspecified")],
  ];
  const opRows: (string | number)[][] = [["Operational Summary"], ["Records", summaryRows.length], []];
  sections.forEach(([title, items]) => {
    opRows.push([title]);
    opRows.push(["Item", "Count"]);
    items.forEach(([k, v]) => opRows.push([k, v]));
    opRows.push([]);
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(execRows), "Executive Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(opRows), "Operational Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows.map(rowToExportRecord)), "Ticket Detail");
  XLSX.writeFile(wb, `SBB_Incident_Management_Pack_${currentDateStamp()}.xlsx`);
}
