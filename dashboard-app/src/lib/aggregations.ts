import type { ChartBarItem, IncidentRow } from "../types";
import { isClosureReview, isOpen, isPending, statusKey, CLOSURE_REVIEW_REASON } from "./classification";
import { norm } from "./fields";
import { weekStart } from "./dates";

export function countBy(rows: IncidentRow[], fn: (r: IncidentRow) => string): { key: string; value: number }[] {
  const m: Record<string, number> = {};
  rows.forEach((r) => {
    const k = fn(r) || "Unspecified";
    m[k] = (m[k] || 0) + 1;
  });
  return Object.entries(m)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
}

export function avg(arr: (number | null | undefined)[]): number {
  const vals = arr.filter((v): v is number => v != null && !isNaN(v));
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

export function statusItems(rows: IncidentRow[]): ChartBarItem[] {
  return countBy(rows, (r) => statusKey(r.status)).map((x) => ({
    label: x.key,
    value: x.value,
    color:
      x.key === "pending" ? "#f59e0b" : x.key === "progress" ? "#7c3aed" : x.key === "assigned" ? "#64748b" :
      x.key === "resolved" ? "#059669" : x.key === "closed" ? "#2563eb" : x.key === "cancelled" ? "#dc2626" : "#94a3b8",
    drill: { type: "status", value: x.key },
  }));
}

export function priorityItems(rows: IncidentRow[]): ChartBarItem[] {
  return countBy(rows, (r) => r.priority || "Unspecified").map((x) => ({
    label: x.key,
    value: x.value,
    color: x.key === "P1" ? "#dc2626" : x.key === "P2" ? "#ea580c" : x.key === "P3" ? "#7c3aed" : "#94a3b8",
    drill: { type: "priority", value: x.key },
  }));
}

export function groupItems(rows: IncidentRow[]): ChartBarItem[] {
  return countBy(rows, (r) => r.operationalGroup || "Unclassified").map((x) => ({
    label: x.key,
    value: x.value,
    color:
      x.key === "Production" ? "#dc2626" : x.key === "Non-prod / UAT" ? "#2563eb" :
      x.key === "Requests" ? "#059669" : x.key === "Enhancements" ? "#7c3aed" : "#94a3b8",
    drill: { type: "operationalGroup", value: x.key },
  }));
}

export function workTypeItems(rows: IncidentRow[]): ChartBarItem[] {
  return countBy(rows, (r) => r.workType || "Unclassified")
    .slice(0, 12)
    .map((x) => ({ label: x.key, value: x.value, color: "#00A0B9", drill: { type: "workType", value: x.key } }));
}

export function pendingReasonItems(rows: IncidentRow[]): ChartBarItem[] {
  return countBy(rows.filter(isPending), (r) => r.subStatus || "Unspecified")
    .slice(0, 12)
    .map((x) => ({
      label: x.key,
      value: x.value,
      color: norm(x.key).toLowerCase() === norm(CLOSURE_REVIEW_REASON).toLowerCase() ? "#00A0B9" : "#D5C7BD",
      drill: { type: "pendingReason", value: x.key },
    }));
}

export function agingItems(rows: IncidentRow[]): ChartBarItem[] {
  const openRows = rows.filter(isOpen);
  return [
    { label: "0-4 days", value: openRows.filter((r) => r.daysOpen != null && r.daysOpen < 5).length, color: "#99D9D5", drill: { type: "ageBucket", value: "0to4" } },
    { label: "5-13 days", value: openRows.filter((r) => r.daysOpen != null && r.daysOpen >= 5 && r.daysOpen < 14).length, color: "#f59e0b", drill: { type: "ageBucket", value: "5to13" } },
    { label: "14-29 days", value: openRows.filter((r) => r.daysOpen != null && r.daysOpen >= 14 && r.daysOpen < 30).length, color: "#ea580c", drill: { type: "ageBucket", value: "14to29" } },
    { label: "30+ days", value: openRows.filter((r) => r.daysOpen != null && r.daysOpen >= 30).length, color: "#dc2626", drill: { type: "ageBucket", value: "30plus" } },
  ];
}

export function staleItems(rows: IncidentRow[]): ChartBarItem[] {
  const openRows = rows.filter(isOpen);
  return [
    { label: "0-4 days", value: openRows.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated < 5).length, color: "#99D9D5", drill: { type: "staleBucket", value: "0to4" } },
    { label: "5-13 days", value: openRows.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 5 && r.daysSinceUpdated < 14).length, color: "#f59e0b", drill: { type: "staleBucket", value: "5to13" } },
    { label: "14-29 days", value: openRows.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 14 && r.daysSinceUpdated < 30).length, color: "#ea580c", drill: { type: "staleBucket", value: "14to29" } },
    { label: "30+ days", value: openRows.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 30).length, color: "#dc2626", drill: { type: "staleBucket", value: "30plus" } },
    { label: "No date", value: openRows.filter((r) => r.daysSinceUpdated == null).length, color: "#94a3b8", drill: { type: "staleBucket", value: "nodate" } },
  ];
}

export function companyItems(rows: IncidentRow[]): ChartBarItem[] {
  return countBy(rows, (r) => r.company || "Unspecified")
    .slice(0, 12)
    .map((x) => ({ label: x.key, value: x.value, color: "#334155", drill: { type: "company", value: x.key } }));
}

export function trendItems(rows: IncidentRow[]): ChartBarItem[] {
  const weeks: Date[] = [];
  const today = new Date();
  const start = weekStart(today);
  for (let i = 11; i >= 0; i--) {
    const ws = new Date(start);
    ws.setDate(ws.getDate() - i * 7);
    weeks.push(ws);
  }
  const counts = weeks.map(() => 0);
  rows.forEach((r) => {
    if (!r.createdDate) return;
    const ws = weekStart(r.createdDate).getTime();
    const idx = weeks.findIndex((w) => w.getTime() === ws);
    if (idx >= 0) counts[idx]++;
  });
  return weeks.map((w, i) => ({
    label: w.toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
    value: counts[i],
    color: "#2563eb",
    drill: { type: "weekBucket", value: w.toISOString().slice(0, 10) },
  }));
}

export function resolutionDays(r: IncidentRow): number | null {
  if (!r.createdDate || !r.updatedDate) return null;
  const a = new Date(r.createdDate.getFullYear(), r.createdDate.getMonth(), r.createdDate.getDate()).getTime();
  const b = new Date(r.updatedDate.getFullYear(), r.updatedDate.getMonth(), r.updatedDate.getDate()).getTime();
  return Math.max(0, Math.floor((b - a) / 86400000));
}

export function createdBucket(r: IncidentRow): "last24" | "24to48" | "48to3" | "older3" {
  if (!r.createdDate) return "older3";
  const ageHours = (new Date().getTime() - r.createdDate.getTime()) / 36e5;
  if (ageHours < 24) return "last24";
  if (ageHours < 48) return "24to48";
  if (ageHours < 72) return "48to3";
  return "older3";
}

export function pendingReasonStats(rows: IncidentRow[]) {
  return countBy(rows, (r) => r.subStatus || "Unspecified").map((x) => {
    const matching = rows.filter((r) => (r.subStatus || "Unspecified") === x.key);
    return {
      reason: x.key,
      count: matching.length,
      avgAge: avg(matching.map((r) => r.daysOpen)),
      stale14: matching.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 14).length,
      stale30: matching.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 30).length,
      closure: matching.filter(isClosureReview).length,
    };
  });
}
