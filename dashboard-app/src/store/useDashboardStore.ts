import { create } from "zustand";
import type {
  Drill,
  FieldMappings,
  Filters,
  FilterModes,
  GlobalDrill,
  IncidentRow,
  ManagementSelection,
  PeopleFilters,
  RawRow,
  TabId,
} from "../types";
import { autoGuessMappings } from "../lib/fields";
import { processRows } from "../lib/processRows";
import { DEFAULT_FILTERS, DEFAULT_FILTER_MODES } from "../lib/filtering";

export interface DashboardState {
  sheetName: string | null;
  sheetNames: string[];
  headers: string[];
  rawRows: RawRow[];
  rows: IncidentRow[];
  mappings: FieldMappings;

  view: TabId;
  sortKey: keyof IncidentRow;
  sortDir: "asc" | "desc";

  filters: Filters;
  filterModes: FilterModes;
  drills: GlobalDrill[];

  /** Unified per-tab drill state (replaces ~10 ad hoc fields from the old app) */
  tabDrill: Drill;

  management: ManagementSelection;
  peopleFilters: PeopleFilters;

  statusMessage: string;
  statusIsError: boolean;

  loadWorkbook: (sheetNames: string[], headers: string[], rawRows: RawRow[], sheetName: string) => void;
  setSheet: (sheetName: string, headers: string[], rawRows: RawRow[]) => void;
  setMappings: (mappings: FieldMappings) => void;
  autoMap: () => void;

  setView: (view: TabId) => void;
  setSort: (key: keyof IncidentRow) => void;

  setFilters: (filters: Partial<Filters>) => void;
  setFilterMode: (key: keyof FilterModes, mode: "include" | "exclude") => void;
  setDrills: (drills: GlobalDrill[]) => void;
  pushSingleDrill: (drill: GlobalDrill) => void;
  clearDrills: () => void;
  resetFilters: () => void;

  setTabDrill: (drill: Drill) => void;
  clearTabDrill: () => void;

  setManagement: (m: Partial<ManagementSelection>) => void;
  setPeopleFilter: (key: keyof PeopleFilters, names: string[]) => void;

  setStatus: (msg: string, isError?: boolean) => void;
}

function recompute(rawRows: RawRow[], mappings: FieldMappings): IncidentRow[] {
  return processRows(rawRows, mappings);
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  sheetName: null,
  sheetNames: [],
  headers: [],
  rawRows: [],
  rows: [],
  mappings: {},

  view: "overview",
  sortKey: "daysOpen",
  sortDir: "desc",

  filters: { ...DEFAULT_FILTERS },
  filterModes: { ...DEFAULT_FILTER_MODES },
  drills: [],

  tabDrill: { kind: "none" },

  management: { dataset: "active", company: "", row: "person", column: "status" },
  peopleFilters: { team: [], management: [] },

  statusMessage: "Upload a Helix export to begin.",
  statusIsError: false,

  loadWorkbook: (sheetNames, headers, rawRows, sheetName) => {
    const mappings = autoGuessMappings(headers);
    set({
      sheetNames,
      sheetName,
      headers,
      rawRows,
      mappings,
      rows: recompute(rawRows, mappings),
      statusMessage: `Loaded ${rawRows.length.toLocaleString()} rows from worksheet "${sheetName}".`,
      statusIsError: false,
    });
  },

  setSheet: (sheetName, headers, rawRows) => {
    const mappings = autoGuessMappings(headers);
    set({
      sheetName,
      headers,
      rawRows,
      mappings,
      rows: recompute(rawRows, mappings),
      statusMessage: `Loaded ${rawRows.length.toLocaleString()} rows from worksheet "${sheetName}".`,
    });
  },

  setMappings: (mappings) => {
    const merged = { ...get().mappings, ...mappings };
    set({ mappings: merged, rows: recompute(get().rawRows, merged) });
  },

  autoMap: () => {
    const mappings = autoGuessMappings(get().headers);
    set({ mappings, rows: recompute(get().rawRows, mappings) });
  },

  setView: (view) => set({ view }),
  setSort: (key) =>
    set((s) => ({
      sortKey: key,
      sortDir: s.sortKey === key ? (s.sortDir === "asc" ? "desc" : "asc") : (["daysOpen", "daysSinceUpdated", "createdDate"].includes(key) ? "desc" : "asc"),
    })),

  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial }, tabDrill: { kind: "none" } })),
  setFilterMode: (key, mode) => set((s) => ({ filterModes: { ...s.filterModes, [key]: mode } })),
  setDrills: (drills) => set({ drills, tabDrill: { kind: "none" } }),
  pushSingleDrill: (drill) => set({ drills: [drill], tabDrill: { kind: "none" } }),
  clearDrills: () => set({ drills: [] }),
  resetFilters: () =>
    set({
      filters: { ...DEFAULT_FILTERS },
      filterModes: { ...DEFAULT_FILTER_MODES },
      drills: [],
      tabDrill: { kind: "none" },
    }),

  setTabDrill: (drill) => set({ tabDrill: drill }),
  clearTabDrill: () => set({ tabDrill: { kind: "none" } }),

  setManagement: (m) => set((s) => ({ management: { ...s.management, ...m }, tabDrill: { kind: "none" } })),
  setPeopleFilter: (key, names) => set((s) => ({ peopleFilters: { ...s.peopleFilters, [key]: names } })),

  setStatus: (msg, isError = false) => set({ statusMessage: msg, statusIsError: isError }),
}));
