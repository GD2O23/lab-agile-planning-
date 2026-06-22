import type { IncidentRow } from "../types";
import { useDashboardStore } from "../store/useDashboardStore";
import { filteredRows, incidentRows as incidentRowsFn } from "./filtering";
import { isPending, isClosureReview, isOpen, statusKey } from "./classification";

export function compareRows(k: keyof IncidentRow, d: "asc" | "desc") {
  return (a: IncidentRow, b: IncidentRow) => {
    const av = a[k] as unknown;
    const bv = b[k] as unknown;
    let res: number;
    if (av instanceof Date || bv instanceof Date) {
      res = (av instanceof Date ? av.getTime() : 0) - (bv instanceof Date ? bv.getTime() : 0);
    } else if (typeof av === "number" || typeof bv === "number") {
      res = ((av as number) ?? -Infinity) - ((bv as number) ?? -Infinity);
    } else {
      res = String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true, sensitivity: "base" });
    }
    return d === "asc" ? res : -res;
  };
}

/** Hook: returns the current filtered+sorted row set (state.filteredRows()) */
export function useFilteredRows(extra?: (r: IncidentRow) => boolean): IncidentRow[] {
  const rows = useDashboardStore((s) => s.rows);
  const filters = useDashboardStore((s) => s.filters);
  const filterModes = useDashboardStore((s) => s.filterModes);
  const drills = useDashboardStore((s) => s.drills);
  const sortKey = useDashboardStore((s) => s.sortKey);
  const sortDir = useDashboardStore((s) => s.sortDir);
  const out = filteredRows(rows, filters, filterModes, drills, extra);
  return out.sort(compareRows(sortKey, sortDir));
}

export function useIncidentRows(): IncidentRow[] {
  const rows = useDashboardStore((s) => s.rows);
  const filters = useDashboardStore((s) => s.filters);
  const filterModes = useDashboardStore((s) => s.filterModes);
  const drills = useDashboardStore((s) => s.drills);
  return incidentRowsFn(rows, filters, filterModes, drills);
}

export function usePendingRows(): IncidentRow[] {
  return useFilteredRows(isPending);
}

export function useClosureReviewRows(): IncidentRow[] {
  return useFilteredRows(isClosureReview);
}

export { isPending, isClosureReview, isOpen, statusKey };
