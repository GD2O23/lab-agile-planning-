import { useRef } from "react";
import * as XLSX from "xlsx";
import { useDashboardStore } from "./store/useDashboardStore";
import { ControlCentre } from "./components/common/ControlCentre";
import { OverviewTab } from "./components/Overview/OverviewTab";
import { PendingTab } from "./components/PendingWorkbench/PendingTab";
import { IncidentTab } from "./components/IncidentView/IncidentTab";
import { HistoricalTab } from "./components/HistoricalRecords/HistoricalTab";
import { ChartsTab } from "./components/Charts/ChartsTab";
import { TeamTab } from "./components/TeamView/TeamTab";
import { CategoryTab } from "./components/CategoryView/CategoryTab";
import { DataQualityTab } from "./components/DataQuality/DataQualityTab";
import { ManagementTab } from "./components/ManagementView/ManagementTab";
import { SetupTab } from "./components/Setup/SetupTab";
import { isClosureReview, isOpen, isPending } from "./lib/classification";
import type { RawRow, TabId } from "./types";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "pending", label: "Pending Workbench" },
  { id: "incident", label: "Incident View" },
  { id: "historical", label: "Historical Records" },
  { id: "charts", label: "Charts" },
  { id: "team", label: "Team View" },
  { id: "category", label: "Category View" },
  { id: "dataQuality", label: "Data Quality" },
  { id: "management", label: "Management View" },
  { id: "setup", label: "Setup" },
];

function attachHyperlinks(sheet: XLSX.WorkSheet, rows: RawRow[]): void {
  if (!rows.length) return;
  const ref = sheet["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  const colToHeader: Record<number, string> = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
    if (cell?.v != null) colToHeader[c] = String(cell.v);
  }
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const rowObj = rows[r - range.s.r - 1];
    if (!rowObj) continue;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const header = colToHeader[c];
      if (!header) continue;
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      if (cell.l?.Target) {
        rowObj[`__link__${header}`] = cell.l.Target;
      } else if (cell.f) {
        const mm = String(cell.f).match(/^HYPERLINK\("([^"]+)"/i);
        if (mm?.[1]) rowObj[`__link__${header}`] = mm[1];
      }
    }
  }
}

function sheetToRows(wb: XLSX.WorkBook, sheetName: string): { headers: string[]; rows: RawRow[] } {
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "", raw: true });
  attachHyperlinks(ws, json);
  const headers = json.length
    ? Object.keys(json[0]).filter((k) => !k.startsWith("__link__"))
    : (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] as string[]) || [];
  return { headers, rows: json };
}

function App() {
  const fileRef = useRef<HTMLInputElement>(null);
  const view = useDashboardStore((s) => s.view);
  const setView = useDashboardStore((s) => s.setView);
  const rows = useDashboardStore((s) => s.rows);
  const sheetNames = useDashboardStore((s) => s.sheetNames);
  const sheetName = useDashboardStore((s) => s.sheetName);
  const statusMessage = useDashboardStore((s) => s.statusMessage);
  const statusIsError = useDashboardStore((s) => s.statusIsError);
  const loadWorkbook = useDashboardStore((s) => s.loadWorkbook);
  const setSheet = useDashboardStore((s) => s.setSheet);
  const setStatus = useDashboardStore((s) => s.setStatus);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        const wb = XLSX.read(data, { type: "array", cellDates: true, cellFormula: true });
        const firstSheet = wb.SheetNames[0];
        const { headers, rows: rawRows } = sheetToRows(wb, firstSheet);
        loadWorkbook(wb.SheetNames, headers, rawRows, firstSheet);
        (window as unknown as { __wb?: XLSX.WorkBook }).__wb = wb;
      } catch (err) {
        setStatus(`Failed to read workbook: ${(err as Error).message}`, true);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleSheetChange(name: string) {
    const wb = (window as unknown as { __wb?: XLSX.WorkBook }).__wb;
    if (!wb) return;
    const { headers, rows: rawRows } = sheetToRows(wb, name);
    setSheet(name, headers, rawRows);
  }

  const active = rows.filter(isOpen).length;
  const historical = rows.length - active;
  const prodInc = rows.filter((r) => r.workType === "Production Incident").length;
  const pending = rows.filter(isPending).length;
  const closure = rows.filter(isClosureReview).length;

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <div>
            <h1>SBB Incident Intelligence Platform</h1>
            <p className="subtitle">Production V3</p>
          </div>
          <div className="subtitle">{rows.length ? `${rows.length.toLocaleString()} rows loaded` : "No workbook loaded"}</div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${view === t.id ? "active" : ""}`} onClick={() => setView(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        <section className="panel">
          <div className="panel-header">
            <h2>Upload Helix XLSX export</h2>
            <span className="muted">Data stays in your browser</span>
          </div>
          <div className="panel-body">
            <div className="upload-grid">
              <div>
                <label>XLSX file</label>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} />
              </div>
              <div>
                <label>Worksheet</label>
                <select disabled={!sheetNames.length} value={sheetName || ""} onChange={(e) => handleSheetChange(e.target.value)}>
                  {sheetNames.length ? sheetNames.map((s) => <option key={s} value={s}>{s}</option>) : <option>No workbook loaded</option>}
                </select>
              </div>
            </div>
            <div className={statusIsError ? "status-line error" : "status-line"}>{statusMessage}</div>
          </div>
        </section>

        <ControlCentre />

        <section className="recon-strip-panel">
          <div className="recon-strip">
            <span><strong>{rows.length.toLocaleString()}</strong> Loaded</span>
            <span><strong>{active.toLocaleString()}</strong> Active</span>
            <span><strong>{historical.toLocaleString()}</strong> Historical</span>
            <span><strong>{prodInc.toLocaleString()}</strong> Production Incidents</span>
            <span><strong>{pending.toLocaleString()}</strong> Pending</span>
            <span><strong>{closure.toLocaleString()}</strong> Closure Review</span>
          </div>
        </section>

        {view === "overview" && <OverviewTab />}
        {view === "pending" && <PendingTab />}
        {view === "incident" && <IncidentTab />}
        {view === "historical" && <HistoricalTab />}
        {view === "charts" && <ChartsTab />}
        {view === "team" && <TeamTab />}
        {view === "category" && <CategoryTab />}
        {view === "dataQuality" && <DataQualityTab />}
        {view === "management" && <ManagementTab />}
        {view === "setup" && <SetupTab />}
      </main>
      <footer className="dashboard-footer">
        <div className="footer-title">SBB Incident Intelligence Platform</div>
        <div>Production V3</div>
        <div>Product Owner: Geoff Deller</div>
        <div>Powered by Helix Data</div>
      </footer>
    </>
  );
}

export default App;
