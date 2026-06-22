import { useMemo } from "react";
import { useDashboardStore } from "../../store/useDashboardStore";
import { useFilteredRows } from "../../lib/selectors";
import { IncidentTable } from "../common/IncidentTable";
import { BarChartCard } from "../common/BarChart";
import { uniqueSorted } from "../../lib/uniqueSorted";
import { isClosureReview, isOpen, isPending, statusKey } from "../../lib/classification";
import { exportRowsAsXlsx } from "../../lib/exports";
import { personName } from "../../lib/processRows";
import {
  agingItems,
  groupItems,
  pendingReasonItems,
  priorityItems,
  staleItems,
  statusItems,
} from "../../lib/aggregations";
import type { GlobalDrill, IncidentRow, PivotField } from "../../types";

const PIVOT_FIELDS: { key: PivotField; label: string }[] = [
  { key: "person", label: "Person" },
  { key: "company", label: "Company" },
  { key: "category", label: "Category" },
  { key: "subCategory", label: "Sub-category" },
  { key: "workType", label: "Work Type" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
];

function pivotValue(r: IncidentRow, field: PivotField): string {
  switch (field) {
    case "person": return personName(r) || "Unspecified";
    case "company": return r.company || "Unspecified";
    case "category": return r.category || "Unspecified";
    case "subCategory": return r.subCategory || "Unspecified";
    case "workType": return r.workType || "Unclassified";
    case "status": return statusKey(r.status) || "Unspecified";
    case "priority": return r.priority || "Unspecified";
  }
}

export function ManagementTab() {
  const allRows = useDashboardStore((s) => s.rows);
  const management = useDashboardStore((s) => s.management);
  const setManagement = useDashboardStore((s) => s.setManagement);
  const tabDrill = useDashboardStore((s) => s.tabDrill);
  const setTabDrill = useDashboardStore((s) => s.setTabDrill);
  const globalFiltered = useFilteredRows();

  const datasetRows = useMemo(() => {
    let rs = globalFiltered;
    if (management.dataset === "active") rs = rs.filter(isOpen);
    else if (management.dataset === "closure") rs = rs.filter(isClosureReview);
    else if (management.dataset !== "all") rs = rs.filter((r) => r.operationalGroup === management.dataset);
    if (management.company) rs = rs.filter((r) => r.company === management.company);
    return rs;
  }, [globalFiltered, management]);

  const companyOptions = useMemo(() => uniqueSorted(allRows.map((r) => r.company)), [allRows]);

  const pivot = useMemo(() => {
    const rowKeys = uniqueSorted(datasetRows.map((r) => pivotValue(r, management.row)));
    const colKeys = uniqueSorted(datasetRows.map((r) => pivotValue(r, management.column)));
    const grid: Record<string, Record<string, number>> = {};
    rowKeys.forEach((rk) => {
      grid[rk] = {};
      colKeys.forEach((ck) => (grid[rk][ck] = 0));
    });
    datasetRows.forEach((r) => {
      const rk = pivotValue(r, management.row);
      const ck = pivotValue(r, management.column);
      grid[rk][ck] = (grid[rk][ck] || 0) + 1;
    });
    return { rowKeys, colKeys, grid };
  }, [datasetRows, management.row, management.column]);

  function pivotDrill(rowValue: string, colValue: string) {
    setTabDrill({ kind: "management", rowField: management.row, rowValue, colField: management.column, colValue });
  }

  function chartDrill(d: GlobalDrill) {
    setTabDrill({ kind: "none" });
    useDashboardStore.getState().pushSingleDrill(d);
  }

  let detail: IncidentRow[] = [];
  if (tabDrill.kind === "management") {
    detail = datasetRows.filter((r) => pivotValue(r, tabDrill.rowField) === tabDrill.rowValue);
    if (tabDrill.colField && tabDrill.colValue) {
      detail = detail.filter((r) => pivotValue(r, tabDrill.colField as PivotField) === tabDrill.colValue);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Management View</h2>
          <button onClick={() => exportRowsAsXlsx(datasetRows, "Management_Pack")}>Export Management Pack</button>
        </div>
        <div className="panel-body">
          <div className="filter-grid">
            <div>
              <label>Dataset</label>
              <select value={management.dataset} onChange={(e) => setManagement({ dataset: e.target.value as typeof management.dataset })}>
                <option value="active">All Active Work</option>
                <option value="all">All Records (Including Closed / Resolved / Cancelled)</option>
                <option value="Production">Production</option>
                <option value="Non-prod / UAT">Non-prod / UAT</option>
                <option value="Requests">Requests</option>
                <option value="Enhancements">Enhancements</option>
                <option value="closure">Closure Review Queue</option>
              </select>
            </div>
            <div>
              <label>Company</label>
              <select value={management.company} onChange={(e) => setManagement({ company: e.target.value })}>
                <option value="">All Companies</option>
                {companyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>Rows</label>
              <select value={management.row} onChange={(e) => setManagement({ row: e.target.value as PivotField })}>
                {PIVOT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label>Columns</label>
              <select value={management.column} onChange={(e) => setManagement({ column: e.target.value as PivotField })}>
                {PIVOT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <div className="metric-grid" style={{ marginTop: 12 }}>
            <div className="metric"><div className="value">{datasetRows.length.toLocaleString()}</div><div className="label">Total in dataset</div></div>
            <div className="metric soft-orange"><div className="value">{datasetRows.filter(isPending).length.toLocaleString()}</div><div className="label">Pending</div></div>
            <div className="metric closure-card"><div className="value">{datasetRows.filter(isClosureReview).length.toLocaleString()}</div><div className="label">Closure Review</div></div>
            <div className="metric soft-red"><div className="value">{datasetRows.filter((r) => isOpen(r) && r.daysOpen != null && r.daysOpen >= 14).length.toLocaleString()}</div><div className="label">Aging 14+</div></div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Management reporting charts</h2></div>
        <div className="panel-body chart-grid">
          <BarChartCard title="Status mix" items={statusItems(datasetRows)} onBarClick={(i) => chartDrill(i.drill)} />
          <BarChartCard title="Priority mix" items={priorityItems(datasetRows)} onBarClick={(i) => chartDrill(i.drill)} />
          <BarChartCard title="Operational group mix" items={groupItems(datasetRows)} onBarClick={(i) => chartDrill(i.drill)} />
          <BarChartCard title="Pending reason mix" items={pendingReasonItems(datasetRows)} onBarClick={(i) => chartDrill(i.drill)} />
          <BarChartCard title="Aging profile" items={agingItems(datasetRows)} onBarClick={(i) => chartDrill(i.drill)} />
          <BarChartCard title="Stale update profile" items={staleItems(datasetRows)} onBarClick={(i) => chartDrill(i.drill)} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Pivot table</h2><span className="muted">Click values to drill into management ticket list</span></div>
        <div className="table-wrap" style={{ maxHeight: 420 }}>
          <table>
            <thead>
              <tr><th>{PIVOT_FIELDS.find((f) => f.key === management.row)?.label}</th>{pivot.colKeys.map((ck) => <th key={ck}>{ck}</th>)}<th>Total</th></tr>
            </thead>
            <tbody>
              {pivot.rowKeys.length ? pivot.rowKeys.map((rk) => {
                const rowTotal = pivot.colKeys.reduce((sum, ck) => sum + pivot.grid[rk][ck], 0);
                return (
                  <tr key={rk}>
                    <td>{rk}</td>
                    {pivot.colKeys.map((ck) => {
                      const n = pivot.grid[rk][ck];
                      return <td key={ck}>{n ? <button className="mini-link" onClick={() => pivotDrill(rk, ck)}>{n}</button> : <span className="muted">-</span>}</td>;
                    })}
                    <td><button className="mini-link" onClick={() => pivotDrill(rk, "")}>{rowTotal}</button></td>
                  </tr>
                );
              }) : <tr><td colSpan={pivot.colKeys.length + 2} className="muted">No data loaded</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Management ticket list</h2><span className="muted">{tabDrill.kind === "management" ? `${detail.length.toLocaleString()} tickets` : "No data loaded"}</span></div>
        <IncidentTable rows={detail} emptyMessage="Click a pivot value above." />
      </section>
    </>
  );
}
