import { useState } from "react";
import { useDashboardStore } from "../../store/useDashboardStore";
import { useFilteredRows } from "../../lib/selectors";
import { MetricCard } from "../common/MetricCard";
import { IncidentTable } from "../common/IncidentTable";
import { isClosureReview, isHighPriority, isPending } from "../../lib/classification";
import { pendingReasonStats } from "../../lib/aggregations";
import type { GlobalDrill } from "../../types";

type SubTab = "summary" | "closure" | "reasonAnalytics";

export function PendingTab() {
  const [sub, setSub] = useState<SubTab>("summary");
  const allFiltered = useFilteredRows();
  const pending = useFilteredRows(isPending);
  const closureReviewRows = useFilteredRows(isClosureReview);
  const pushSingleDrill = useDashboardStore((s) => s.pushSingleDrill);
  const tabDrill = useDashboardStore((s) => s.tabDrill);
  const setTabDrill = useDashboardStore((s) => s.setTabDrill);

  function drill(d: GlobalDrill) {
    pushSingleDrill(d);
  }

  function applyReasonDrill(reason: string, subKind: "all" | "stale14" | "stale30" | "closure") {
    setTabDrill({ kind: "pendingWorkbench", reason, subKind });
  }

  let pendingBottomRows = pending;
  let drillNote = `${pending.length.toLocaleString()} rows visible`;
  if (tabDrill.kind === "pendingWorkbench") {
    pendingBottomRows = pendingBottomRows.filter((r) => (r.subStatus || "Unspecified") === tabDrill.reason);
    if (tabDrill.subKind === "stale14") pendingBottomRows = pendingBottomRows.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 14);
    if (tabDrill.subKind === "stale30") pendingBottomRows = pendingBottomRows.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 30);
    if (tabDrill.subKind === "closure") pendingBottomRows = pendingBottomRows.filter(isClosureReview);
    drillNote = `Pending reason drill-through: ${tabDrill.reason} · ${pendingBottomRows.length.toLocaleString()} tickets`;
  }

  const stats = pendingReasonStats(pending);

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Pending Workbench</h2>
          <div className="subtabs">
            <button className={`subtab ${sub === "summary" ? "active" : ""}`} onClick={() => setSub("summary")}>Summary</button>
            <button className={`subtab ${sub === "closure" ? "active" : ""}`} onClick={() => setSub("closure")}>Closure Review Queue</button>
            <button className={`subtab ${sub === "reasonAnalytics" ? "active" : ""}`} onClick={() => setSub("reasonAnalytics")}>Pending Reason Analytics</button>
          </div>
        </div>
        <div className="panel-body">
          {sub === "summary" && (
            <>
              <div className="story-row">
                <button className="story-pill red" onClick={() => drill({ metric: "open30" })}>
                  Aging risk: {pending.filter((r) => r.daysOpen != null && r.daysOpen >= 30).length.toLocaleString()} open 30+ days
                </button>
                <button className="story-pill orange" onClick={() => drill({ metric: "stale14Pending" })}>
                  Stale updates: {pending.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 14).length.toLocaleString()} not updated 14+ days
                </button>
                <button className="story-pill blue" onClick={() => drill({ metric: "pending" })}>
                  All pending: {pending.length.toLocaleString()} tickets
                </button>
              </div>
              <div className="metric-grid">
                <MetricCard label="Total pending" value={pending.length} drill={{ metric: "pending" }} onClick={drill} />
                <MetricCard label="Critical / high pending" value={pending.filter((r) => isHighPriority(r.priority)).length} drill={{ metric: "highPending" }} onClick={drill} className="soft-red" />
                <MetricCard label="Open 30+ days" value={pending.filter((r) => r.daysOpen != null && r.daysOpen >= 30).length} drill={{ metric: "open30" }} onClick={drill} className="soft-orange" />
                <MetricCard label="Not updated 14+ days" value={pending.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 14).length} drill={{ metric: "stale14Pending" }} onClick={drill} className="soft-orange" />
                <MetricCard label="Closure Review" value={pending.filter(isClosureReview).length} drill={{ metric: "closureReview" }} onClick={drill} className="closure-card" />
                <MetricCard label="Visible pending" value={pending.length} drill={{ metric: "pending" }} onClick={drill} className="soft-blue" />
              </div>
            </>
          )}
          {sub === "closure" && <IncidentTable rows={closureReviewRows} emptyMessage="No tickets are currently in Closure Review Queue." />}
          {sub === "reasonAnalytics" && (
            <div className="table-wrap" style={{ maxHeight: 420 }}>
              <table>
                <thead>
                  <tr>
                    <th>Pending Reason</th>
                    <th>Count</th>
                    <th>Average Age</th>
                    <th>Stale 14+</th>
                    <th>Stale 30+</th>
                    <th>Closure Review</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.length ? (
                    stats.map((s) => (
                      <tr key={s.reason}>
                        <td>
                          <button className="mini-link" onClick={() => applyReasonDrill(s.reason, "all")}>
                            {s.reason}
                          </button>
                        </td>
                        <td>
                          <button className="mini-link" onClick={() => applyReasonDrill(s.reason, "all")}>{s.count}</button>
                        </td>
                        <td>{s.avgAge}</td>
                        <td>
                          <button className="mini-link" onClick={() => applyReasonDrill(s.reason, "stale14")}>{s.stale14}</button>
                        </td>
                        <td>
                          <button className="mini-link" onClick={() => applyReasonDrill(s.reason, "stale30")}>{s.stale30}</button>
                        </td>
                        <td>
                          <button className="mini-link" onClick={() => applyReasonDrill(s.reason, "closure")}>{s.closure}</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={6} className="muted">No pending reasons found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Pending ticket details</h2>
          <span className="muted">{drillNote}</span>
        </div>
        <IncidentTable rows={pendingBottomRows} emptyMessage="No pending tickets match this pending reason drill-through." />
      </section>
      <div style={{ display: "none" }}>{allFiltered.length}</div>
    </>
  );
}
