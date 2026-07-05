// Core row + domain types ported from /tmp/dashboard/dashboard.html

export type RawRow = Record<string, unknown>;

export interface IncidentRow {
  ticketNumber: string;
  ticketId: string;
  dashboardUrl: string;
  ticketUrl: string;
  company: string;
  status: string;
  subStatus: string;
  priority: string; // normalized via priorityCode -> P1/P2/P3/other
  submitterName: string;
  category: string;
  subCategory: string;
  description: string;
  workType: string;
  operationalGroup: string;
  classificationPrefix: string;
  createdDate: Date | null;
  updatedDate: Date | null;
  daysOpen: number | null;
  daysSinceUpdated: number | null;
  lastModifiedBy: string;
  raw: RawRow;
}

export type FieldKey =
  | "ticketNumber"
  | "ticketId"
  | "ticketUrl"
  | "status"
  | "subStatus"
  | "priority"
  | "company"
  | "submitterName"
  | "category"
  | "subCategory"
  | "description"
  | "createdDate"
  | "updatedDate"
  | "lastModifiedBy";

export type FieldMappings = Partial<Record<FieldKey, string>>;

export type FilterKey =
  | "company"
  | "workType"
  | "operationalGroup"
  | "priority"
  | "status"
  | "subStatus"
  | "category"
  | "subCategory";

export type FilterMode = "include" | "exclude";

export interface Filters {
  company: string[];
  workType: string[];
  operationalGroup: string[];
  priority: string[];
  status: string[];
  subStatus: string[];
  category: string[];
  subCategory: string[];
  minDays: string;
  openedWithin: string;
  search: string;
}

export type FilterModes = Record<FilterKey, FilterMode>;

// ---- Global drill-through filters (the `state.drills[]` array) ----
// Each entry narrows the row-set further. Faithful port of the various
// shapes pushed into `state.drills` by metric pills / chart bars / metrics.
export type GlobalDrill =
  | { metric: "pending" | "progress" | "open" | "resolvedClosed" | "aging5" | "aging14" | "stale14" | "stale14Pending" | "open30" | "highPending" | "closureReview" }
  | { type: "statusGroup"; value: "closedResolved" }
  | { type: "priorityGroup"; value: "high" }
  | { type: "status"; value: string }
  | { type: "priority"; value: string }
  | { type: "ageBucket"; value: "0to4" | "5to13" | "14to29" | "30plus" }
  | { type: "staleBucket"; value: "0to4" | "5to13" | "14to29" | "30plus" | "nodate" }
  | { type: "workType"; value: string }
  | { type: "operationalGroup"; value: string }
  | { type: "pendingReason"; value: string }
  | { type: "team"; value: string }
  | { type: "category"; category: string; subCategory?: string }
  | { type: "company"; value: string }
  | { type: "weekBucket"; value: string };

export interface DrillLabelled {
  drill: GlobalDrill;
  label?: string;
}

// ---- The ~10 ad hoc per-tab drill-through fields, unified ----
// Old app had: pendingReasonDrill, teamDrill, categoryDrill, managementDrill,
// pendingWorkbenchDrill, teamExceptionKind, dataQualityDrill (+ implicit
// chartsTable / overview / historical / incident drill via state.drills).
export type Drill =
  | { kind: "pendingReason"; reason: string; subKind: "all" | "stale14" | "stale30" | "closure" }
  | { kind: "pendingWorkbench"; reason: string; subKind: "all" | "stale14" | "stale30" | "closure" }
  | { kind: "team"; name: string; subKind: "all" | "open" | "progress" | "pending" | "closure" | "aging14" | "stale14" | "stale30" }
  | { kind: "teamException"; exceptionKind: "closure" | "aging14" | "stale14" }
  | { kind: "category"; category: string; subCategory: string; subKind: "all" | "last24" | "24to48" | "48to3" | "older3" | "closure" | "stale14" }
  | { kind: "management"; rowField: PivotField; rowValue: string; colField?: PivotField | ""; colValue?: string }
  | { kind: "dataQuality"; issue: DataQualityIssue | "any" }
  | { kind: "none" };

export type PivotField = "person" | "company" | "category" | "subCategory" | "workType" | "status" | "priority";

export type DataQualityIssue =
  | "Unclassified"
  | "Missing Priority"
  | "Missing Category"
  | "Missing Sub-category"
  | "Missing Last Modified Date"
  | "Missing Submit Date";

export interface ManagementSelection {
  dataset: "active" | "all" | "Production" | "Non-prod / UAT" | "Requests" | "Enhancements" | "closure";
  company: string;
  row: PivotField;
  column: PivotField;
}

export interface SavedView {
  filters: Filters;
  filterModes: FilterModes;
  drills: GlobalDrill[];
  view: TabId;
  management: ManagementSelection;
}

export type TabId =
  | "overview"
  | "pending"
  | "incident"
  | "historical"
  | "charts"
  | "team"
  | "category"
  | "dataQuality"
  | "management"
  | "setup";

export interface ChartBarItem {
  label: string;
  value: number;
  color: string;
  drill: GlobalDrill;
}

export interface PeopleFilters {
  team: string[];
  management: string[];
}
