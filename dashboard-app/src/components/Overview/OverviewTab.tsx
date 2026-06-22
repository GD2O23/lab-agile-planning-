import { useDashboardStore } from "../../store/useDashboardStore";
import { useFilteredRows } from "../../lib/selectors";
import { MetricCard } from "../common/MetricCard";
import { IncidentTable } from "../common/IncidentTable";
import { isClosureReview, isOpen, isPending, statusKey } from "../../lib/classification";
import type { GlobalDrill } from "../../types";

export function OverviewTab() {
  const rows = useFilteredRows();
  const pushSingleDrill = useDashboardStore((s) => s.pushSingleDrill);
  const allRows = useDashboardStore((s) => s.rows);

  const openRows = rows.filter(isOpen);

  function drill(d: GlobalDrill) {
    pushSingleDrill(d);
  }

  const aging5 = allRows.filter((r) => isOpen(r) && r.daysOpen != null && r.daysOpen >= 5).length;
  const pendingCount = allRows.filter(isPending).length;
  const stale = allRows.filter((r) => isOpen(r) && r.daysSinceUpdated != null && r.daysSinceUpdated >= 14).length;

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Overview</h2>
          <span className="muted">Operational position</span>
        </div>
        <div className="panel-body">
          <div className="story-row">
            <button className="story-pill red" onClick={() => drill({ metric: "aging5" })}>
              Aging risk: {aging5.toLocaleString()} aging 5+ days
            </button>
            <button className="story-pill orange" onClick={() => drill({ metric: "pending" })}>
              Pending: {pendingCount.toLocaleString()} pending incidents
            </button>
            <button className="story-pill blue" onClick={() => drill({ metric: "stale14" })}>
              Stale updates: {stale.toLocaleString()} stale updates
            </button>
          </div>
          <div className="metric-grid">
            <MetricCard label="Open" value={openRows.length} drill={{ metric: "open" }} onClick={drill} />
            <MetricCard label="Pending" value={rows.filter(isPending).length} drill={{ metric: "pending" }} onClick={drill} className="soft-orange" />
            <MetricCard label="In progress" value={rows.filter((r) => statusKey(r.status) === "progress").length} drill={{ metric: "progress" }} onClick={drill} className="soft-purple" />
            <MetricCard label="Closure Review" value={rows.filter(isClosureReview).length} drill={{ metric: "closureReview" }} onClick={drill} className="closure-card" />
            <MetricCard label="Aging 5+" value={openRows.filter((r) => r.daysOpen != null && r.daysOpen >= 5).length} drill={{ metric: "aging5" }} onClick={drill} className="soft-red" />
            <MetricCard label="Aging 14+" value={openRows.filter((r) => r.daysOpen != null && r.daysOpen >= 14).length} drill={{ metric: "aging14" }} onClick={drill} className="soft-red" />
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Active work list</h2>
          <span className="muted">{rows.length.toLocaleString()} rows visible</span>
        </div>
        <IncidentTable rows={rows} emptyMessage="Upload an XLSX export to begin." />
      </section>
    </>
  );
}
