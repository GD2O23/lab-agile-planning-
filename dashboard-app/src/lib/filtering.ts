import type { Filters, FilterModes, GlobalDrill, IncidentRow } from "../types";
import { isClosureReview, isHighPriority, isOpen, isPending, statusKey } from "./classification";
import { personName } from "./processRows";
import { weekStart } from "./dates";

function arrVal(v: string[] | undefined): string[] {
  return Array.isArray(v) ? v : v ? [v] : [];
}

function passFilter(
  filters: Filters,
  modes: FilterModes,
  key: keyof FilterModes,
  value: string,
  empty: string,
): boolean {
  const selected = arrVal(filters[key]).filter(Boolean);
  if (!selected.length) return true;
  const actual = value || empty || "Unspecified";
  const exclude = modes[key] === "exclude";
  return exclude ? !selected.includes(actual) : selected.includes(actual);
}

/**
 * Faithful port of the FINAL overridden matchesBase(r) (UAT V2.3 multi-select
 * version) combined with the global state.drills[] array predicate logic.
 */
export function matchesBase(r: IncidentRow, filters: Filters, modes: FilterModes, drills: GlobalDrill[]): boolean {
  // Always exclude done tickets unless the user has explicitly filtered by status
  const selectedStatuses = arrVal(filters["status"]).filter(Boolean);
  if (!selectedStatuses.length) {
    const sk = statusKey(r.status);
    if (sk === "closed" || sk === "resolved" || sk === "cancelled") return false;
  }

  if (!passFilter(filters, modes, "company", r.company, "Unspecified")) return false;
  if (!passFilter(filters, modes, "workType", r.workType, "Unclassified")) return false;
  if (!passFilter(filters, modes, "operationalGroup", r.operationalGroup, "Unclassified")) return false;
  if (!passFilter(filters, modes, "priority", r.priority, "Unspecified")) return false;
  if (!passFilter(filters, modes, "status", r.status, "Unspecified")) return false;
  if (!passFilter(filters, modes, "subStatus", r.subStatus, "Unspecified")) return false;
  if (!passFilter(filters, modes, "category", r.category, "Unspecified")) return false;
  if (!passFilter(filters, modes, "subCategory", r.subCategory, "Unspecified")) return false;

  const md = Number(filters.minDays || "0");
  if (md && (r.daysOpen == null || r.daysOpen < md)) return false;

  const ow = Number(filters.openedWithin || "0");
  if (ow && (r.daysOpen == null || r.daysOpen > ow)) return false;

  if (filters.search) {
    const q = filters.search.toLowerCase();
    const hay = [
      r.ticketNumber,
      r.ticketId,
      r.company,
      r.workType,
      r.operationalGroup,
      r.submitterName,
      r.status,
      r.subStatus,
      r.priority,
      r.category,
      r.subCategory,
      r.description,
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }

  for (const d of drills || []) {
    if ("metric" in d) {
      if (d.metric === "pending" && !isPending(r)) return false;
      if (d.metric === "progress" && statusKey(r.status) !== "progress") return false;
      if (d.metric === "open" && !isOpen(r)) return false;
      if (d.metric === "resolvedClosed" && !["closed", "resolved"].includes(statusKey(r.status))) return false;
      if (d.metric === "aging5" && !(isOpen(r) && r.daysOpen != null && r.daysOpen >= 5)) return false;
      if (d.metric === "aging14" && !(isOpen(r) && r.daysOpen != null && r.daysOpen >= 14)) return false;
      if (d.metric === "stale14" && !(isOpen(r) && r.daysSinceUpdated != null && r.daysSinceUpdated >= 14)) return false;
      if (d.metric === "stale14Pending" && !(isPending(r) && r.daysSinceUpdated != null && r.daysSinceUpdated >= 14)) return false;
      if (d.metric === "open30" && !(isPending(r) && r.daysOpen != null && r.daysOpen >= 30)) return false;
      if (d.metric === "highPending" && !(isPending(r) && isHighPriority(r.priority))) return false;
      if (d.metric === "closureReview" && !isClosureReview(r)) return false;
      continue;
    }
    if (d.type === "statusGroup" && d.value === "closedResolved" && !["closed", "resolved"].includes(statusKey(r.status))) return false;
    if (d.type === "priorityGroup" && d.value === "high" && !isHighPriority(r.priority)) return false;
    if (d.type === "status" && statusKey(r.status) !== d.value) return false;
    if (d.type === "priority" && (r.priority || "Unspecified") !== d.value) return false;
    if (d.type === "ageBucket") {
      if (!isOpen(r)) return false;
      if (d.value === "0to4" && !(r.daysOpen != null && r.daysOpen < 5)) return false;
      if (d.value === "5to13" && !(r.daysOpen != null && r.daysOpen >= 5 && r.daysOpen < 14)) return false;
      if (d.value === "14to29" && !(r.daysOpen != null && r.daysOpen >= 14 && r.daysOpen < 30)) return false;
      if (d.value === "30plus" && !(r.daysOpen != null && r.daysOpen >= 30)) return false;
    }
    if (d.type === "workType" && (r.workType || "Unclassified") !== d.value) return false;
    if (d.type === "operationalGroup" && (r.operationalGroup || "Unclassified") !== d.value) return false;
    if (d.type === "staleBucket") {
      if (d.value === "0to4" && !(r.daysSinceUpdated != null && r.daysSinceUpdated < 5)) return false;
      if (d.value === "5to13" && !(r.daysSinceUpdated != null && r.daysSinceUpdated >= 5 && r.daysSinceUpdated < 14)) return false;
      if (d.value === "14to29" && !(r.daysSinceUpdated != null && r.daysSinceUpdated >= 14 && r.daysSinceUpdated < 30)) return false;
      if (d.value === "30plus" && !(r.daysSinceUpdated != null && r.daysSinceUpdated >= 30)) return false;
      if (d.value === "nodate" && r.daysSinceUpdated != null) return false;
    }
    if (d.type === "pendingReason" && (r.subStatus || "Unspecified") !== d.value) return false;
    if (d.type === "team" && personName(r) !== d.value) return false;
    if (d.type === "category") {
      if ((r.category || "Unspecified") !== d.category) return false;
      if (d.subCategory && (r.subCategory || "Unspecified") !== d.subCategory) return false;
    }
    if (d.type === "company" && (r.company || "Unspecified") !== d.value) return false;
    if (d.type === "weekBucket") {
      if (!r.createdDate || weekStart(r.createdDate).toISOString().slice(0, 10) !== d.value) return false;
    }
  }
  return true;
}

export function filteredRows(
  rows: IncidentRow[],
  filters: Filters,
  modes: FilterModes,
  drills: GlobalDrill[],
  extra?: (r: IncidentRow) => boolean,
): IncidentRow[] {
  let out = rows.filter((r) => matchesBase(r, filters, modes, drills));
  if (extra) out = out.filter(extra);
  return out;
}

export function incidentRows(rows: IncidentRow[], filters: Filters, modes: FilterModes, drills: GlobalDrill[]): IncidentRow[] {
  return filteredRows(rows, filters, modes, drills, (r) => (r.workType || "Unclassified") === "Production Incident");
}

export const DEFAULT_FILTERS: Filters = {
  company: [],
  workType: [],
  operationalGroup: [],
  priority: [],
  status: [],
  subStatus: [],
  category: [],
  subCategory: [],
  minDays: "0",
  openedWithin: "0",
  search: "",
};

export const DEFAULT_FILTER_MODES: FilterModes = {
  company: "include",
  workType: "include",
  operationalGroup: "include",
  priority: "include",
  status: "include",
  subStatus: "include",
  category: "include",
  subCategory: "include",
};
