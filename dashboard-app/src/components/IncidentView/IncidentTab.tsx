import { useDashboardStore } from "../../store/useDashboardStore";
import { useIncidentRows } from "../../lib/selectors";
import { MetricCard } from "../common/MetricCard";
import { IncidentTable } from "../common/IncidentTable";
import { BarChartCard } from "../common/BarChart";
import { agingItems, priorityItems, statusItems } from "../../lib/aggregations";
import { isClosureReview, isOpen, isPending } from "../../lib/classification";
import type { ChartBarItem } from "../../types";

export function IncidentTab() {
  const rows = useIncidentRows();
  const pushSingleDrill = useDashboardStore((s) => s.pushSingleDrill);
  const openRows = rows.filter(isOpen);

  function onBar(i: ChartBarItem) {
    pushSingleDrill(i.drill);
  }

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Incident Operations View</h2>
          <span className="muted">Production Incidents Only</span>
        </div>
        <div className="panel-body">
          <div className="story-row">
            <span className="story-pill blue">Scope: Work Type = Production Incident</span>
          </div>
          <div className="metric-grid">
            <MetricCard label="Open" value={openRows.length} drill={{ metric: "open" }} onClick={pushSingleDrill} />
            <MetricCard label="Pending" value={rows.filter(isPending).length} drill={{ metric: "pending" }} onClick={pushSingleDrill} className="soft-orange" />
            <MetricCard label="Closure Review" value={rows.filter(isClosureReview).length} drill={{ metric: "closureReview" }} onClick={pushSingleDrill} className="closure-card" />
            <MetricCard label="Aging 5+" value={openRows.filter((r) => r.daysOpen != null && r.daysOpen >= 5).length} drill={{ metric: "aging5" }} onClick={pushSingleDrill} className="soft-red" />
            <MetricCard label="Aging 14+" value={openRows.filter((r) => r.daysOpen != null && r.daysOpen >= 14).length} drill={{ metric: "aging14" }} onClick={pushSingleDrill} className="soft-red" />
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Incident insights</h2>
          <span className="muted">Production Incident records only · click a bar to drill down</span>
        </div>
        <div className="panel-body chart-grid">
          <BarChartCard title="Status mix" items={statusItems(rows)} onBarClick={onBar} />
          <BarChartCard title="Priority mix" items={priorityItems(rows)} onBarClick={onBar} />
          <BarChartCard title="Aging profile" items={agingItems(rows)} onBarClick={onBar} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Production Incident register</h2>
          <span className="muted">{rows.length.toLocaleString()} rows</span>
        </div>
        <IncidentTable rows={rows} emptyMessage="No Production Incident records match current filters." />
      </section>
    </>
  );
}
