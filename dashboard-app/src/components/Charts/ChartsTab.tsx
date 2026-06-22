import { useDashboardStore } from "../../store/useDashboardStore";
import { useFilteredRows } from "../../lib/selectors";
import { IncidentTable } from "../common/IncidentTable";
import { BarChartCard } from "../common/BarChart";
import {
  agingItems,
  companyItems,
  groupItems,
  pendingReasonItems,
  priorityItems,
  staleItems,
  statusItems,
  trendItems,
  workTypeItems,
} from "../../lib/aggregations";
import type { ChartBarItem } from "../../types";

export function ChartsTab() {
  const rows = useFilteredRows();
  const pushSingleDrill = useDashboardStore((s) => s.pushSingleDrill);
  function onBar(i: ChartBarItem) {
    pushSingleDrill(i.drill);
  }

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Charts</h2>
          <span className="muted">Visual operational story across the loaded Helix export</span>
        </div>
        <div className="panel-body chart-grid">
          <BarChartCard title="Status mix" items={statusItems(rows)} onBarClick={onBar} />
          <BarChartCard title="Priority mix" items={priorityItems(rows)} onBarClick={onBar} />
          <BarChartCard title="Operational group mix" items={groupItems(rows)} onBarClick={onBar} />
          <BarChartCard title="Work type mix" items={workTypeItems(rows)} onBarClick={onBar} />
          <BarChartCard title="Pending reasons" items={pendingReasonItems(rows)} onBarClick={onBar} />
          <BarChartCard title="Aging profile" items={agingItems(rows)} onBarClick={onBar} />
          <BarChartCard title="Last update / stale profile" items={staleItems(rows)} onBarClick={onBar} />
          <BarChartCard title="Company mix" items={companyItems(rows)} onBarClick={onBar} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Incidents created per week (last 12 weeks)</h2>
        </div>
        <div className="panel-body chart-grid">
          <BarChartCard title="Weekly trend" items={trendItems(rows)} onBarClick={onBar} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Chart drill-through</h2>
          <span className="muted">Click a chart bar to filter the ticket list</span>
        </div>
        <IncidentTable rows={rows} emptyMessage="No tickets match current filters." />
      </section>
    </>
  );
}
