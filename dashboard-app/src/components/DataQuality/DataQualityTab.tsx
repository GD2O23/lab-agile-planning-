import { useMemo } from "react";
import { useDashboardStore } from "../../store/useDashboardStore";
import { useFilteredRows } from "../../lib/selectors";
import { IncidentTable } from "../common/IncidentTable";
import { dataQualityIssues } from "../../lib/dataQuality";
import { MetricCard } from "../common/MetricCard";
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

  let detail: IncidentRow[] = [];
  if (tabDrill.kind === "dataQuality") {
    detail = tabDrill.issue === "any"
      ? issuesByRow.filter((x) => x.issues.length > 0).map((x) => x.row)
      : issuesByRow.filter((x) => x.issues.includes(tabDrill.issue as DataQualityIssue)).map((x) => x.row);
  }

  return (
    <>
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
