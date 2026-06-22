import { useState } from "react";
import { useDashboardStore } from "../../store/useDashboardStore";
import { uniqueSorted } from "../../lib/uniqueSorted";
import { exportRowsAsXlsx } from "../../lib/exports";
import { getSavedViews, saveView, deleteView } from "../../lib/savedViews";
import { isClosureReview, isOpen } from "../../lib/classification";
import type { FilterKey } from "../../types";
import { useFilteredRows } from "../../lib/selectors";

const FILTER_DEFS: { key: FilterKey; label: string; field: (r: { company: string; workType: string; operationalGroup: string; priority: string; status: string; subStatus: string; category: string; subCategory: string }) => string }[] = [
  { key: "company", label: "Company", field: (r) => r.company },
  { key: "workType", label: "Work Type", field: (r) => r.workType },
  { key: "operationalGroup", label: "Operational Group", field: (r) => r.operationalGroup },
  { key: "priority", label: "Priority", field: (r) => r.priority },
  { key: "status", label: "Status", field: (r) => r.status },
  { key: "subStatus", label: "Pending Reason", field: (r) => r.subStatus },
  { key: "category", label: "Category", field: (r) => r.category },
  { key: "subCategory", label: "Sub-category", field: (r) => r.subCategory },
];

type DrawerId = "filters" | "views" | "exports" | null;

export function ControlCentre() {
  const [drawer, setDrawer] = useState<DrawerId>(null);
  const rows = useDashboardStore((s) => s.rows);
  const filters = useDashboardStore((s) => s.filters);
  const filterModes = useDashboardStore((s) => s.filterModes);
  const drills = useDashboardStore((s) => s.drills);
  const setFilters = useDashboardStore((s) => s.setFilters);
  const setFilterMode = useDashboardStore((s) => s.setFilterMode);
  const resetFilters = useDashboardStore((s) => s.resetFilters);
  const view = useDashboardStore((s) => s.view);
  const management = useDashboardStore((s) => s.management);

  const [savedViewName, setSavedViewName] = useState("");
  const [selectedSavedView, setSelectedSavedView] = useState("");
  const savedViews = getSavedViews();

  const currentViewRows = useFilteredRows();

  const activeCount =
    FILTER_DEFS.filter((d) => filters[d.key].length).length +
    (filters.minDays !== "0" && filters.minDays ? 1 : 0) +
    (filters.search ? 1 : 0) +
    (drills.length ? 1 : 0);

  function toggleValue(key: FilterKey, value: string) {
    const cur = filters[key];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    setFilters({ [key]: next } as Partial<typeof filters>);
  }

  function handleSaveView() {
    if (!savedViewName.trim()) {
      alert("Enter a saved view name first.");
      return;
    }
    saveView(savedViewName.trim(), { filters, filterModes, drills, view, management });
    setSelectedSavedView(savedViewName.trim());
  }

  function handleLoadView() {
    const v = savedViews[selectedSavedView];
    if (!v) return;
    setFilters(v.filters);
    useDashboardStore.setState({ filterModes: v.filterModes, drills: v.drills, view: v.view, management: v.management });
  }

  function handleDeleteView() {
    if (!selectedSavedView) return;
    deleteView(selectedSavedView);
    setSelectedSavedView("");
  }

  return (
    <section className="panel control-centre-panel">
      <div className="panel-header">
        <h2>Dashboard Control Centre</h2>
        <span className="muted">Open controls only when needed</span>
      </div>
      <div className="panel-body">
        <div className="control-toolbar">
          <button className={`control-toggle ${drawer === "filters" ? "active" : ""}`} onClick={() => setDrawer(drawer === "filters" ? null : "filters")}>
            Filters <span>{activeCount} active</span>
          </button>
          <button className={`control-toggle secondary ${drawer === "views" ? "active" : ""}`} onClick={() => setDrawer(drawer === "views" ? null : "views")}>
            Views
          </button>
          <button className={`control-toggle secondary ${drawer === "exports" ? "active" : ""}`} onClick={() => setDrawer(drawer === "exports" ? null : "exports")}>
            Export
          </button>
          <button className="control-toggle secondary" onClick={resetFilters}>
            Reset filters
          </button>
        </div>

        {drawer === "filters" && (
          <div className="control-drawer open">
            <div className="drawer-title">Filters</div>
            <div className="filter-grid">
              {FILTER_DEFS.map((def) => {
                const values = uniqueSorted(rows.map(def.field));
                return (
                  <div key={def.key}>
                    <label>{def.label}</label>
                    <div className="filter-control">
                      <select
                        multiple
                        className="filter-multiselect"
                        value={filters[def.key]}
                        onChange={(e) => setFilters({ [def.key]: Array.from(e.target.selectedOptions).map((o) => o.value) } as Partial<typeof filters>)}
                      >
                        {values.map((v) => (
                          <option key={v} value={v} onClick={() => toggleValue(def.key, v)}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <select
                        className={`filter-mode ${filterModes[def.key] === "exclude" ? "exclude" : ""}`}
                        value={filterModes[def.key]}
                        onChange={(e) => setFilterMode(def.key, e.target.value as "include" | "exclude")}
                      >
                        <option value="include">Include</option>
                        <option value="exclude">Exclude</option>
                      </select>
                    </div>
                    <div className="filter-help">Ctrl/Cmd-click to multi-select</div>
                  </div>
                );
              })}
              <div>
                <label>Minimum days open</label>
                <select value={filters.minDays} onChange={(e) => setFilters({ minDays: e.target.value })}>
                  <option value="0">All</option>
                  <option value="2">2+</option>
                  <option value="5">5+</option>
                  <option value="14">14+</option>
                  <option value="30">30+</option>
                  <option value="60">60+</option>
                </select>
              </div>
              <div>
                <label>Search</label>
                <input
                  type="search"
                  placeholder="Ticket, company, person, category, summary"
                  value={filters.search}
                  onChange={(e) => setFilters({ search: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        {drawer === "views" && (
          <div className="control-drawer open">
            <div className="drawer-title">Saved Views</div>
            <div className="saved-view-grid">
              <div>
                <label>Saved view</label>
                <select value={selectedSavedView} onChange={(e) => setSelectedSavedView(e.target.value)}>
                  <option value="">Select saved view</option>
                  {Object.keys(savedViews)
                    .sort()
                    .map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label>New / update saved view name</label>
                <input value={savedViewName} onChange={(e) => setSavedViewName(e.target.value)} placeholder="e.g. Closure Review" />
              </div>
              <div>
                <button className="action-btn secondary" onClick={handleLoadView}>Load View</button>
              </div>
              <div>
                <button className="action-btn" onClick={handleSaveView}>Save View</button>
              </div>
              <div>
                <button className="action-btn danger" onClick={handleDeleteView}>Delete View</button>
              </div>
            </div>
          </div>
        )}

        {drawer === "exports" && (
          <div className="control-drawer open">
            <div className="drawer-title">Operational Exports</div>
            <div className="export-grid">
              <button className="action-btn" onClick={() => exportRowsAsXlsx(currentViewRows, "Current_View")}>
                Export Current View
              </button>
              <button className="action-btn secondary" onClick={() => exportRowsAsXlsx(rows.filter(isClosureReview), "Closure_Review")}>
                Export Closure Review
              </button>
              <button
                className="action-btn warning"
                onClick={() => exportRowsAsXlsx(rows.filter((r) => isOpen(r) && r.daysOpen != null && r.daysOpen >= 14), "Aging_14_Plus")}
              >
                Export Aging 14+
              </button>
              <button
                className="action-btn warning"
                onClick={() => exportRowsAsXlsx(rows.filter((r) => isOpen(r) && r.daysSinceUpdated != null && r.daysSinceUpdated >= 14), "Stale_14_Plus")}
              >
                Export Stale 14+
              </button>
            </div>
            <p className="small-note">Exports respect the current tab, filters, include/exclude selections and drill-through context where applicable.</p>
          </div>
        )}
      </div>
    </section>
  );
}
