import { useMemo } from "react";
import { useDashboardStore } from "../../store/useDashboardStore";
import { useFilteredRows } from "../../lib/selectors";
import { IncidentTable } from "../common/IncidentTable";
import { dataQualityIssues } from "../../lib/dataQuality";
import { MetricCard } from "../common/MetricCard";
import { isClosureReview, isOpen, isPending } from "../../lib/classification";
import type { DataQualityIssue, IncidentRow } from "../../types";

const ISSUE_LIST: DataQualityIssue[] = [
  "Unclassified",
  "Missing Priority",
  "Missing Category",
  "Missing Sub-category",
  "Missing Last Modified Date",
  "Missing Submit Date",
];

export function DataQualityTab() {
  const rows = useFilteredRows();
  const tabDrill = useDashboardStore((s) => s.tabDrill);
  const setTabDrill = useDashboardStore((s) => s.setTabDrill);

  const issuesByRow = useMemo(() => rows.map((r) => ({ row: r, issues: dataQualityIssues(r) })), [rows]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    ISSUE_LIST.forEach((i) => (m[i] = 0));
    issuesByRow.forEach(({ issues }) => issues.forEach((i) => (m[i] = (m[i] || 0) + 1)));
    return m;
  }, [issuesByRow]);
  const totalExceptionRows = issuesByRow.filter((x) => x.issues.length > 0).length;

  /** Faithful port of renderKpiIntegrityHealth() */
  const kpiIssues = useMemo(() => {
    const open = rows.filter(isOpen).length;
    const pending = rows.filter(isPending).length;
    const closure = rows.filter(isClosureReview).length;
    const aging5 = rows.filter((r) => isOpen(r) && r.daysOpen != null && r.daysOpen >= 5).length;
    const aging14 = rows.filter((r) => isOpen(r) && r.daysOpen != null && r.daysOpen >= 14).length;
    const stale14 = rows.filter((r) => isOpen(r) && r.daysSinceUpdated != null && r.daysSinceUpdated >= 14).length;
    const issues: string[] = [];
    if (closure > pending) issues.push("Closure Review exceeds Pending");
    if (aging14 > aging5) issues.push("Aging 14+ exceeds Aging 5+");
    if (aging5 > open) issues.push("Aging 5+ exceeds Open Active Work");
    if (stale14 > open) issues.push("Stale 14+ exceeds Open Active Work");
    return issues;
  }, [rows]);

  let detail: IncidentRow[] = [];
  if (tabDrill.kind === "dataQuality") {
    detail = tabDrill.issue === "any"
      ? issuesByRow.filter((x) => x.issues.length > 0).map((x) => x.row)
      : issuesByRow.filter((x) => x.issues.includes(tabDrill.issue as DataQualityIssue)).map((x) => x.row);
  }

  return (
    <>
      {rows.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <h2>KPI Integrity Health</h2>
            <span className="muted">Cross-metric logical consistency checks</span>
          </div>
          <div className="panel-body">
            <div className={kpiIssues.length ? "mapping-warning" : "mapping-ok"}>
              {kpiIssues.length
                ? `KPI integrity issues detected: ${kpiIssues.join("; ")}.`
                : "KPI integrity OK: no logical inconsistencies detected across the current filtered dataset."}
            </div>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-header">
          <h2>Data Quality Dashboard</h2>
          <span className="muted">Source-data and classification exceptions</span>
        </div>
        <div className="panel-body">
          <div className="quality-grid">
            <MetricCard label="Records with any exception" value={totalExceptionRows} onClick={() => setTabDrill({ kind: "dataQuality", issue: "any" })} drill={{ metric: "open" }} className="soft-red" />
            {ISSUE_LIST.map((issue) => (
              <MetricCard
                key={issue}
                label={issue}
                value={counts[issue]}
                onClick={() => setTabDrill({ kind: "dataQuality", issue })}
                drill={{ metric: "open" }}
              />
            ))}
          </div>
          <p className="small-note">These are factual exceptions only. They identify records that may need source data correction or classification review.</p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Data quality exception list</h2>
          <span className="muted">{tabDrill.kind === "dataQuality" ? `${detail.length.toLocaleString()} records` : "Click a metric above"}</span>
        </div>
        <IncidentTable rows={detail} emptyMessage="Click a data quality metric above." />
      </section>
    </>
  );
}
