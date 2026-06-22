import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import type { IncidentRow } from "../types";
import { dateDisplay } from "./dates";
import { personName } from "./processRows";
import { statusItems, priorityItems, groupItems, pendingReasonItems } from "./aggregations";
import { renderBarChartImage } from "./chartImage";

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

const NAVY = "FF00384D";
const BLUE = "FF2563EB";
const WHITE = "FFFFFFFF";
const RED_FILL = "FFFDE7E4";
const RED_TEXT = "FFB42318";
const AMBER_FILL = "FFFFF4CC";
const AMBER_TEXT = "FF7A4B00";
const GREEN_FILL = "FFE3F8E8";
const GREEN_TEXT = "FF1E7A4D";
const STRIPE_FILL = "FFF8FAFC";

function ragForMetric(label: string, value: number): { fill: string; text: string } | null {
  if (/^aging 14\+|^stale 14\+|^stale 30\+/i.test(label)) return value > 0 ? { fill: RED_FILL, text: RED_TEXT } : { fill: GREEN_FILL, text: GREEN_TEXT };
  if (/^aging 5\+/i.test(label)) return value > 0 ? { fill: AMBER_FILL, text: AMBER_TEXT } : { fill: GREEN_FILL, text: GREEN_TEXT };
  if (/^closure review/i.test(label)) return value > 0 ? { fill: AMBER_FILL, text: AMBER_TEXT } : { fill: GREEN_FILL, text: GREEN_TEXT };
  return null;
}

function styleHeaderRow(row: ExcelJS.Row, fillColor = NAVY) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
    cell.alignment = { vertical: "middle" };
  });
}

function styleTitleBand(sheet: ExcelJS.Worksheet, row: ExcelJS.Row, text: string, span: number, opts: { size?: number; bg?: string; color?: string } = {}) {
  row.getCell(1).value = text;
  sheet.mergeCells(row.number, 1, row.number, span);
  row.height = (opts.size ?? 16) + 14;
  row.getCell(1).font = { bold: true, size: opts.size ?? 16, color: { argb: opts.color ?? WHITE } };
  row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.bg ?? NAVY } };
  row.getCell(1).alignment = { vertical: "middle" };
  for (let c = 2; c <= span; c++) {
    row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.bg ?? NAVY } };
  }
}

function styleSectionLabel(sheet: ExcelJS.Worksheet, row: ExcelJS.Row, text: string, span: number) {
  row.getCell(1).value = text;
  sheet.mergeCells(row.number, 1, row.number, span);
  row.getCell(1).font = { bold: true, size: 13, color: { argb: NAVY } };
}

/**
 * 3-sheet workbook (Executive Summary, Operational Summary, Ticket Detail)
 * built with ExcelJS for cell styling/RAG colour-coding and embedded chart
 * images, matching the visual "premium" feel of the legacy hand-rolled
 * OOXML export (which SheetJS community edition cannot reproduce, since it
 * can't write cell styles or charts).
 */
export async function exportManagementPack(
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
): Promise<void> {
  const metrics = managementPackMetrics(summaryRows, opts.isOpenFn, opts.isPendingFn, opts.isClosureReviewFn);
  const closure = metrics.find((m) => m.label === "Closure Review")?.value ?? 0;
  const pending = metrics.find((m) => m.label === "Pending Work")?.value ?? 0;
  const pct = pending ? Math.round((closure / pending) * 100) : 0;
  const generated = new Date().toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const wb = new ExcelJS.Workbook();
  wb.creator = "SBB Incident Intelligence Platform";
  wb.created = new Date();

  const COLS = 8;

  // --- Executive Summary ---
  const exec = wb.addWorksheet("Executive Summary");
  exec.columns = [{ width: 22 }, { width: 14 }, { width: 22 }, { width: 14 }, { width: 22 }, { width: 14 }, { width: 18 }, { width: 14 }];

  styleTitleBand(exec, exec.addRow([]), "SBB Incident Intelligence Platform", COLS, { size: 18 });
  styleTitleBand(exec, exec.addRow([]), "Management Pack", COLS, { size: 13, bg: BLUE });
  exec.addRow([]);

  const metaRow1 = exec.addRow(["Export Generated", generated, "Dataset", opts.dataset]);
  metaRow1.getCell(1).font = { bold: true };
  metaRow1.getCell(3).font = { bold: true };
  const metaRow2 = exec.addRow(["Company", opts.company, "Summary Records", summaryRows.length, "Ticket Detail Records", detailRows.length]);
  metaRow2.getCell(1).font = { bold: true };
  metaRow2.getCell(3).font = { bold: true };
  metaRow2.getCell(5).font = { bold: true };
  exec.addRow([]);

  styleSectionLabel(exec, exec.addRow([]), "Key Operational Metrics", COLS);
  for (let i = 0; i < metrics.length; i += 4) {
    const group = metrics.slice(i, i + 4);
    const labelRow = exec.addRow([]);
    const valueRow = exec.addRow([]);
    valueRow.height = 30;
    group.forEach((m, idx) => {
      const c1 = idx * 2 + 1;
      const c2 = c1 + 1;
      const rag = ragForMetric(m.label, m.value);
      const bg = rag?.fill ?? "FFEFF4F8";
      const fg = rag?.text ?? NAVY;
      exec.mergeCells(labelRow.number, c1, labelRow.number, c2);
      exec.mergeCells(valueRow.number, c1, valueRow.number, c2);
      labelRow.getCell(c1).value = m.label;
      labelRow.getCell(c1).font = { bold: true, color: { argb: fg } };
      labelRow.getCell(c1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      valueRow.getCell(c1).value = m.value;
      valueRow.getCell(c1).font = { bold: true, size: 20, color: { argb: fg } };
      valueRow.getCell(c1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      valueRow.getCell(c1).alignment = { horizontal: "center" };
    });
  }
  exec.addRow([]);

  styleSectionLabel(exec, exec.addRow([]), "Governance Focus", COLS);
  const govRag = pct >= 50 ? { fill: GREEN_FILL, text: GREEN_TEXT } : closure > 0 ? { fill: AMBER_FILL, text: AMBER_TEXT } : { fill: GREEN_FILL, text: GREEN_TEXT };
  const govRow = exec.addRow([]);
  govRow.height = 30;
  exec.mergeCells(govRow.number, 1, govRow.number, 2);
  exec.mergeCells(govRow.number, 3, govRow.number, 4);
  exec.mergeCells(govRow.number, 5, govRow.number, COLS);
  govRow.getCell(1).value = "Closure Review";
  govRow.getCell(3).value = "Pending";
  govRow.getCell(5).value = "% Pending Ready";
  const govValRow = exec.addRow([]);
  govValRow.height = 30;
  exec.mergeCells(govValRow.number, 1, govValRow.number, 2);
  exec.mergeCells(govValRow.number, 3, govValRow.number, 4);
  exec.mergeCells(govValRow.number, 5, govValRow.number, COLS);
  govValRow.getCell(1).value = closure;
  govValRow.getCell(3).value = pending;
  govValRow.getCell(5).value = pct + "%";
  [govRow, govValRow].forEach((r) => {
    [1, 3, 5].forEach((c) => {
      r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: govRag.fill } };
      r.getCell(c).font = { bold: true, size: r === govValRow ? 18 : 12, color: { argb: govRag.text } };
      r.getCell(c).alignment = { horizontal: c === 5 ? "left" : "center" };
    });
  });
  exec.addRow([]);

  styleSectionLabel(exec, exec.addRow([]), "Report Scope", COLS);
  const scopeRows: [string, string][] = opts.appliedFilters.length ? opts.appliedFilters : [["No filters applied", "All loaded data"]];
  scopeRows.forEach(([k, v]) => {
    const r = exec.addRow([k]);
    r.getCell(1).font = { bold: true };
    exec.mergeCells(r.number, 2, r.number, COLS);
    r.getCell(2).value = v;
  });

  // --- Operational Summary (breakdown tables + chart images) ---
  const op = wb.addWorksheet("Operational Summary");
  op.columns = [{ width: 30 }, { width: 14 }, { width: 4 }, { width: 30 }, { width: 14 }];
  styleTitleBand(op, op.addRow([]), "Operational Summary", 5, { size: 16 });
  op.addRow(["Records", summaryRows.length]).getCell(1).font = { bold: true };
  op.addRow([]);

  const breakdowns: [string, [string, number][]][] = [
    ["Status Breakdown", countMapForExport(summaryRows, (r) => r.status || "Unspecified")],
    ["Priority Breakdown", countMapForExport(summaryRows, (r) => r.priority || "Unspecified")],
    ["Work Type Breakdown", countMapForExport(summaryRows, (r) => r.workType || "Unclassified")],
    ["Operational Group Breakdown", countMapForExport(summaryRows, (r) => r.operationalGroup || "Unclassified")],
    ["Pending Reason Breakdown", countMapForExport(summaryRows.filter(opts.isPendingFn), (r) => r.subStatus || "Unspecified")],
    ["Company Breakdown", countMapForExport(summaryRows, (r) => r.company || "Unspecified")],
  ];

  let cursorRow = op.lastRow ? op.lastRow.number + 1 : 4;
  for (let i = 0; i < breakdowns.length; i += 2) {
    const left = breakdowns[i];
    const right = breakdowns[i + 1];
    const titleRow = op.getRow(cursorRow);
    titleRow.getCell(1).value = left[0];
    titleRow.getCell(1).font = { bold: true, size: 12, color: { argb: NAVY } };
    if (right) {
      titleRow.getCell(4).value = right[0];
      titleRow.getCell(4).font = { bold: true, size: 12, color: { argb: NAVY } };
    }
    cursorRow += 1;
    styleHeaderRow(op.getRow(cursorRow), BLUE);
    op.getRow(cursorRow).getCell(1).value = "Item";
    op.getRow(cursorRow).getCell(2).value = "Count";
    if (right) {
      op.getRow(cursorRow).getCell(4).value = "Item";
      op.getRow(cursorRow).getCell(5).value = "Count";
    }
    cursorRow += 1;
    const maxLen = Math.max(left[1].length, right ? right[1].length : 0);
    for (let j = 0; j < maxLen; j++) {
      const row = op.getRow(cursorRow + j);
      if (left[1][j]) {
        row.getCell(1).value = left[1][j][0];
        row.getCell(2).value = left[1][j][1];
      }
      if (right && right[1][j]) {
        row.getCell(4).value = right[1][j][0];
        row.getCell(5).value = right[1][j][1];
      }
      if (j % 2 === 1) {
        row.getCell(1).fill = row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE_FILL } };
        if (right) row.getCell(4).fill = row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE_FILL } };
      }
    }
    cursorRow += maxLen + 1;
  }

  cursorRow += 1;
  const chartTitleRow = op.getRow(cursorRow);
  chartTitleRow.getCell(1).value = "Reporting Charts";
  chartTitleRow.getCell(1).font = { bold: true, size: 14, color: { argb: NAVY } };
  cursorRow += 1;

  const chartSpecs: [string, ReturnType<typeof statusItems>][] = [
    ["Status mix", statusItems(summaryRows)],
    ["Priority mix", priorityItems(summaryRows)],
    ["Operational group mix", groupItems(summaryRows)],
    ["Pending reason mix", pendingReasonItems(summaryRows)],
  ];
  for (const [title, items] of chartSpecs) {
    const dataUrl = renderBarChartImage(title, items);
    if (!dataUrl) continue;
    const imageId = wb.addImage({ base64: dataUrl, extension: "png" });
    op.addImage(imageId, { tl: { col: 0, row: cursorRow }, ext: { width: 480, height: 240 } });
    cursorRow += 14;
  }

  // --- Ticket Detail ---
  const detail = wb.addWorksheet("Ticket Detail");
  const detailHeaders = DETAIL_COLUMNS.map(([, label]) => label);
  styleHeaderRow(detail.addRow(detailHeaders), NAVY);
  detail.columns = detailHeaders.map((h) => ({ width: h === "Description" ? 50 : 18 }));
  detailRows.forEach((r) => {
    const rec = rowToExportRecord(r);
    const row = detail.addRow(detailHeaders.map((h) => rec[h]));
    const priorityCell = row.getCell(detailHeaders.indexOf("Priority") + 1);
    const priority = String(rec["Priority"] || "");
    if (priority === "P1") {
      priorityCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED_FILL } };
      priorityCell.font = { bold: true, color: { argb: RED_TEXT } };
    } else if (priority === "P2") {
      priorityCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBER_FILL } };
      priorityCell.font = { bold: true, color: { argb: AMBER_TEXT } };
    }
  });
  detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: detailHeaders.length } };
  detail.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `SBB_Incident_Management_Pack_${currentDateStamp()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
