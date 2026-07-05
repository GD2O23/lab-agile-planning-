import { useMemo, useState } from "react";
import { useIncidentRows } from "../../lib/selectors";
import { useDashboardStore } from "../../store/useDashboardStore";
import { IncidentTable } from "../common/IncidentTable";
import { PersonFilterPicker } from "../common/PersonFilterPicker";
import { uniqueSorted } from "../../lib/uniqueSorted";
import { isOpen } from "../../lib/classification";
import { personName } from "../../lib/processRows";

type ActivityThreshold = "any" | "5" | "14" | "30";
type AgeThreshold = "any" | "14" | "30" | "60";

const ACTIVITY_OPTIONS: { value: ActivityThreshold; label: string }[] = [
  { value: "any", label: "Any activity age" },
  { value: "5", label: "5+ days since activity" },
  { value: "14", label: "14+ days since activity" },
  { value: "30", label: "30+ days since activity" },
];

const AGE_OPTIONS: { value: AgeThreshold; label: string }[] = [
  { value: "any", label: "Any age" },
  { value: "14", label: "14+ days open" },
  { value: "30", label: "30+ days open" },
  { value: "60", label: "60+ days open" },
];

export function AgingTab() {
  const rows = useIncidentRows();
  const peopleFilters = useDashboardStore((s) => s.peopleFilters);
  const setPeopleFilter = useDashboardStore((s) => s.setPeopleFilter);

  const [activityThreshold, setActivityThreshold] = useState<ActivityThreshold>("5");
  const [ageThreshold, setAgeThreshold] = useState<AgeThreshold>("any");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);

  const openRows = useMemo(() => rows.filter(isOpen), [rows]);
  const peopleOptions = useMemo(() => uniqueSorted(openRows.map(personName)), [openRows]);
  const categoryOptions = useMemo(() => uniqueSorted(openRows.map((r) => r.category || "Unspecified")), [openRows]);
  const selectedPeople = peopleFilters.team;

  const filtered = useMemo(() => {
    let out = openRows;
    if (selectedPeople.length) out = out.filter((r) => selectedPeople.includes(personName(r)));
    if (categoryFilter.length) out = out.filter((r) => categoryFilter.includes(r.category || "Unspecified"));
    if (activityThreshold !== "any") {
      const n = Number(activityThreshold);
      out = out.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= n);
    }
    if (ageThreshold !== "any") {
      const n = Number(ageThreshold);
      out = out.filter((r) => r.daysOpen != null && r.daysOpen >= n);
    }
    return out;
  }, [openRows, selectedPeople, categoryFilter, activityThreshold, ageThreshold]);

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Aging Incident Analysis</h2>
          <span className="muted">{filtered.length.toLocaleString()} open incidents matching filters</span>
        </div>
        <div className="panel-body">
          <div className="filter-grid" style={{ marginBottom: 14 }}>
            <div>
              <label>Days since last activity</label>
              <select value={activityThreshold} onChange={(e) => setActivityThreshold(e.target.value as ActivityThreshold)}>
                {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label>Ticket age</label>
              <select value={ageThreshold} onChange={(e) => setAgeThreshold(e.target.value as AgeThreshold)}>
                {AGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <PersonFilterPicker
              label="Person"
              options={peopleOptions}
              selected={selectedPeople}
              onChange={(next) => setPeopleFilter("team", next)}
            />
            <PersonFilterPicker
              label="Category"
              options={categoryOptions}
              selected={categoryFilter}
              onChange={setCategoryFilter}
            />
          </div>
          <div className="metric-grid" style={{ gridTemplateColumns: "repeat(4, minmax(130px, 1fr))" }}>
            <div className="metric soft-orange">
              <div className="value">{openRows.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 5).length.toLocaleString()}</div>
              <div className="label">5+ days no activity</div>
            </div>
            <div className="metric soft-red">
              <div className="value">{openRows.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 14).length.toLocaleString()}</div>
              <div className="label">14+ days no activity</div>
            </div>
            <div className="metric soft-red">
              <div className="value">{openRows.filter((r) => r.daysOpen != null && r.daysOpen >= 14).length.toLocaleString()}</div>
              <div className="label">14+ days open</div>
            </div>
            <div className="metric soft-red">
              <div className="value">{openRows.filter((r) => r.daysOpen != null && r.daysOpen >= 30).length.toLocaleString()}</div>
              <div className="label">30+ days open</div>
            </div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Aging incident list</h2>
          <span className="muted">Sorted by worst offenders first</span>
        </div>
        <IncidentTable rows={filtered} emptyMessage="No open incidents match the selected aging criteria." />
      </section>
    </>
  );
}
