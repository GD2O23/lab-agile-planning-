import { useState } from "react";
import { useDashboardStore } from "../../store/useDashboardStore";
import { useIncidentRows } from "../../lib/selectors";
import { MetricCard } from "../common/MetricCard";
import { IncidentTable } from "../common/IncidentTable";
import { BarChartCard } from "../common/BarChart";
import { AgingTab } from "./AgingTab";
import { agingItems, priorityItems, statusItems } from "../../lib/aggregations";
import { isClosureReview, isOpen, isPending } from "../../lib/classification";
import type { ChartBarItem } from "../../types";

type SubTab = "overview" | "aging";

export function IncidentTab() {
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const rows = useIncidentRows();
  const pushSingleDrill = useDashboardStore((s) => s.pushSingleDrill);
  const openRows = rows.filter(isOpen);

  function onBar(i: ChartBarItem) {
    pushSingleDrill(i.drill);
  }

  return (
    <>
      <div className="subtab-bar">
        <button className={`subtab-btn ${subTab === "overview" ? "active" : ""}`} onClick={() => setSubTab("overview")}>Overview</button>
        <button className={`subtab-btn ${subTab === "aging" ? "active" : ""}`} onClick={() => setSubTab("aging")}>Aging Analysis</button>
      </div>

      {subTab === "overview" && (
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
                <MetricCard label="Open" value={openRows.length} drill={{ metric: "open" }} onClick={pushSingleDrill}
                  tooltip="Tickets currently open (not resolved, closed, or cancelled)." />
                <MetricCard label="Pending" value={rows.filter(isPending).length} drill={{ metric: "pending" }} onClick={pushSingleDrill} className="soft-orange"
                  tooltip="Open tickets in a Pending status — awaiting a response or action before work can continue." />
                <MetricCard label="Closure Review" value={rows.filter(isClosureReview).length} drill={{ metric: "closureReview" }} onClick={pushSingleDrill} className="closure-card"
                  tooltip="Pending tickets where the sub-status is 'Client Action Required' — work is done, awaiting client confirmation to close." />
                <MetricCard label="Aging 5+" value={openRows.filter((r) => r.daysOpen != null && r.daysOpen >= 5).length} drill={{ metric: "aging5" }} onClick={pushSingleDrill} className="soft-red"
                  tooltip="Open tickets that have been open for 5 or more days." />
                <MetricCard label="Aging 14+" value={openRows.filter((r) => r.daysOpen != null && r.daysOpen >= 14).length} drill={{ metric: "aging14" }} onClick={pushSingleDrill} className="soft-red"
                  tooltip="Open tickets that have been open for 14 or more days — escalation threshold requiring management attention." />
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
      )}

      {subTab === "aging" && <AgingTab />}
    </>
  );
}
