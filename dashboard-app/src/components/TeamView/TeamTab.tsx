import { useMemo } from "react";
import { useDashboardStore } from "../../store/useDashboardStore";
import { useFilteredRows } from "../../lib/selectors";
import { IncidentTable } from "../common/IncidentTable";
import { isClosureReview, isOpen, isPending, statusKey } from "../../lib/classification";
import { avg } from "../../lib/aggregations";
import { personName } from "../../lib/processRows";
import { uniqueSorted } from "../../lib/uniqueSorted";
import { PersonFilterPicker } from "../common/PersonFilterPicker";
import type { IncidentRow } from "../../types";

type TeamSubKind = "all" | "open" | "progress" | "pending" | "closure" | "aging14" | "stale14" | "stale30";

function TeamBtn({ n, onClick }: { n: number; onClick: () => void }) {
  return n ? <button className="mini-link" onClick={onClick}>{n.toLocaleString()}</button> : <span className="muted">-</span>;
}

export function TeamTab() {
  const rows = useFilteredRows();
  const tabDrill = useDashboardStore((s) => s.tabDrill);
  const setTabDrill = useDashboardStore((s) => s.setTabDrill);
  const peopleFilters = useDashboardStore((s) => s.peopleFilters);
  const setPeopleFilter = useDashboardStore((s) => s.setPeopleFilter);

  const peopleOptions = useMemo(() => uniqueSorted(rows.map(personName)), [rows]);
  const teamSelection = peopleFilters.team;

  const scopedRows = teamSelection.length ? rows.filter((r) => teamSelection.includes(personName(r))) : rows;

  const groups = useMemo(() => {
    const map = new Map<string, IncidentRow[]>();
    scopedRows.forEach((r) => {
      const name = personName(r);
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(r);
    });
    return [...map.entries()]
      .map(([name, rs]) => ({ name, rs }))
      .sort((a, b) => b.rs.length - a.rs.length || a.name.localeCompare(b.name));
  }, [scopedRows]);

  function teamDrill(name: string, subKind: TeamSubKind) {
    setTabDrill({ kind: "team", name, subKind });
  }

  let detail: IncidentRow[] = [];
  let detailNote = "Click a team count above.";
  if (tabDrill.kind === "team") {
    detail = scopedRows.filter((r) => personName(r) === tabDrill.name);
    const k = tabDrill.subKind;
    if (k === "open") detail = detail.filter(isOpen);
    if (k === "progress") detail = detail.filter((r) => statusKey(r.status) === "progress");
    if (k === "pending") detail = detail.filter(isPending);
    if (k === "closure") detail = detail.filter(isClosureReview);
    if (k === "aging14") detail = detail.filter((r) => isOpen(r) && r.daysOpen != null && r.daysOpen >= 14);
    if (k === "stale14") detail = detail.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 14);
    if (k === "stale30") detail = detail.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 30);
    detailNote = `${detail.length.toLocaleString()} rows visible`;
  }

  const exceptionGroups = groups
    .map((g) => ({
      name: g.name,
      open: g.rs.filter(isOpen).length,
      pending: g.rs.filter(isPending).length,
      closure: g.rs.filter(isClosureReview).length,
      aging14: g.rs.filter((r) => isOpen(r) && r.daysOpen != null && r.daysOpen >= 14).length,
      stale14: g.rs.filter((r) => isOpen(r) && r.daysSinceUpdated != null && r.daysSinceUpdated >= 14).length,
      total: g.rs.length,
    }))
    .filter((g) => g.closure || g.aging14 || g.stale14)
    .sort((a, b) => b.closure - a.closure || b.aging14 - a.aging14 || b.stale14 - a.stale14 || a.name.localeCompare(b.name));

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Team workload & Closure Review</h2>
          <span className="muted">Click counts to drill down</span>
        </div>
        <div className="panel-body">
          <div className="mapping-ok" style={{ marginBottom: 10 }}>
            <b>People filter:</b> Select one or more people to review a team, leavers, or reassignment group.
            <div style={{ marginTop: 8 }}>
              <PersonFilterPicker
                label="People"
                options={peopleOptions}
                selected={teamSelection}
                onChange={(next) => setPeopleFilter("team", next)}
                wide
              />
            </div>
          </div>
          <div className="table-wrap" style={{ maxHeight: 440, borderTop: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Person</th><th>Open</th><th>In Progress</th><th>Pending</th><th>Closure Review</th><th>Avg Age</th><th>Stale 14+</th><th>Stale 30+</th><th>Total</th>
                </tr>
              </thead>
              <tbody>
                {groups.length ? groups.map((g) => (
                  <tr key={g.name}>
                    <td><button className="mini-link" onClick={() => teamDrill(g.name, "all")}>{g.name}</button></td>
                    <td><TeamBtn n={g.rs.filter(isOpen).length} onClick={() => teamDrill(g.name, "open")} /></td>
                    <td><TeamBtn n={g.rs.filter((r) => statusKey(r.status) === "progress").length} onClick={() => teamDrill(g.name, "progress")} /></td>
                    <td><TeamBtn n={g.rs.filter(isPending).length} onClick={() => teamDrill(g.name, "pending")} /></td>
                    <td><TeamBtn n={g.rs.filter(isClosureReview).length} onClick={() => teamDrill(g.name, "closure")} /></td>
                    <td>{avg(g.rs.map((r) => r.daysOpen))}</td>
                    <td><TeamBtn n={g.rs.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 14).length} onClick={() => teamDrill(g.name, "stale14")} /></td>
                    <td><TeamBtn n={g.rs.filter((r) => r.daysSinceUpdated != null && r.daysSinceUpdated >= 30).length} onClick={() => teamDrill(g.name, "stale30")} /></td>
                    <td>{g.rs.length.toLocaleString()}</td>
                  </tr>
                )) : <tr><td colSpan={9} className="muted">No team data found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Team Exception Reporting</h2>
          <span className="muted">Objective exception counts only</span>
        </div>
        <div className="panel-body">
          <div className="table-wrap" style={{ maxHeight: 360, borderTop: 0 }}>
            <table>
              <thead>
                <tr><th>Person</th><th>Open</th><th>Pending</th><th>Closure Review</th><th>Aging 14+</th><th>Stale 14+</th><th>Total</th></tr>
              </thead>
              <tbody>
                {exceptionGroups.length ? exceptionGroups.map((g) => (
                  <tr key={g.name}>
                    <td><button className="mini-link" onClick={() => teamDrill(g.name, "all")}>{g.name}</button></td>
                    <td>{g.open.toLocaleString()}</td>
                    <td>{g.pending.toLocaleString()}</td>
                    <td><TeamBtn n={g.closure} onClick={() => teamDrill(g.name, "closure")} /></td>
                    <td><TeamBtn n={g.aging14} onClick={() => teamDrill(g.name, "aging14")} /></td>
                    <td><TeamBtn n={g.stale14} onClick={() => teamDrill(g.name, "stale14")} /></td>
                    <td>{g.total.toLocaleString()}</td>
                  </tr>
                )) : <tr><td colSpan={7} className="muted">No team exceptions match current filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Team drill-through</h2>
          <span className="muted">{detailNote}</span>
        </div>
        <IncidentTable rows={detail} emptyMessage="No tickets match this team drill-through." />
      </section>
    </>
  );
}
