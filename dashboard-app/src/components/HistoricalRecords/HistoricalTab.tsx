import { useDashboardStore } from "../../store/useDashboardStore";
import { useFilteredRows } from "../../lib/selectors";
import { MetricCard } from "../common/MetricCard";
import { IncidentTable } from "../common/IncidentTable";
import { BarChartCard } from "../common/BarChart";
import { avg, priorityItems, resolutionDays, statusItems, workTypeItems } from "../../lib/aggregations";
import { isHighPriority, statusKey } from "../../lib/classification";
import type { ChartBarItem } from "../../types";

export function HistoricalTab() {
  const rows = useFilteredRows();
  const pushSingleDrill = useDashboardStore((s) => s.pushSingleDrill);
  function onBar(i: ChartBarItem) {
    pushSingleDrill(i.drill);
  }

  const closed = rows.filter((r) => ["closed", "resolved"].includes(statusKey(r.status)));
  const cancelled = rows.filter((r) => statusKey(r.status) === "cancelled");
  const prodInc = rows.filter((r) => r.workType === "Production Incident");
  const high = rows.filter((r) => isHighPriority(r.priority));
  const avgResolve = avg(closed.map(resolutionDays));

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Historical Records</h2>
          <span className="muted">All loaded records, including Closed, Resolved and Cancelled</span>
        </div>
        <div className="panel-body">
          <div className="story-row">
            <span className="story-pill blue">Purpose: retrospective analysis, audit, volume review and closed-ticket lookup</span>
          </div>
          <div className="metric-grid">
            <MetricCard label="Total records" value={rows.length} />
            <MetricCard label="Closed / resolved" value={closed.length} drill={{ type: "statusGroup", value: "closedResolved" }} onClick={pushSingleDrill} className="soft-green" />
            <MetricCard label="Cancelled" value={cancelled.length} drill={{ type: "status", value: "cancelled" }} onClick={pushSingleDrill} className="soft-red" />
            <MetricCard label="Production incidents" value={prodInc.length} drill={{ type: "workType", value: "Production Incident" }} onClick={pushSingleDrill} className="soft-blue" />
            <MetricCard label="P1 / P2" value={high.length} drill={{ type: "priorityGroup", value: "high" }} onClick={pushSingleDrill} className="soft-orange" />
            <MetricCard label="Avg resolve days" value={avgResolve} drill={{ type: "statusGroup", value: "closedResolved" }} onClick={pushSingleDrill} className="soft-purple" />
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Historical insights</h2>
          <span className="muted">Status and closure profile across the loaded export</span>
        </div>
        <div className="panel-body chart-grid">
          <BarChartCard title="Status mix" items={statusItems(rows)} onBarClick={onBar} />
          <BarChartCard title="Priority mix" items={priorityItems(rows)} onBarClick={onBar} />
          <BarChartCard title="Work type mix" items={workTypeItems(rows)} onBarClick={onBar} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Historical record list</h2>
          <span className="muted">{rows.length.toLocaleString()} rows</span>
        </div>
        <IncidentTable rows={rows} emptyMessage="No records match current filters." />
      </section>
    </>
  );
}
