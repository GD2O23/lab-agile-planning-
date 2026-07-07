import { useRef } from "react";
import * as XLSX from "xlsx";
import { useDashboardStore } from "../../store/useDashboardStore";
import { EXPECTED_FIELDS } from "../../lib/fields";
import type { FieldKey, RawRow } from "../../types";

/** Extract hyperlinks from SheetJS worksheet cells and attach as __link__<Header> on each row. */
function attachHyperlinks(sheet: XLSX.WorkSheet, rows: RawRow[]): void {
  const ref = sheet["!ref"];
  if (!ref || !rows.length) return;
  const range = XLSX.utils.decode_range(ref);
  // Build column index → header name map from row 1
  const colToHeader: Record<number, string> = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const cell = sheet[addr];
    if (cell?.v != null) colToHeader[c] = String(cell.v);
  }
  // Walk data rows and copy any hyperlink targets onto the row object
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const rowObj = rows[r - range.s.r - 1];
    if (!rowObj) continue;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const header = colToHeader[c];
      if (!header) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      const target = cell?.l?.Target;
      if (target) rowObj[`__link__${header}`] = target;
    }
  }
}

export function SetupTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const sheetName = useDashboardStore((s) => s.sheetName);
  const sheetNames = useDashboardStore((s) => s.sheetNames);
  const headers = useDashboardStore((s) => s.headers);
  const mappings = useDashboardStore((s) => s.mappings);
  const statusMessage = useDashboardStore((s) => s.statusMessage);
  const statusIsError = useDashboardStore((s) => s.statusIsError);
  const loadWorkbook = useDashboardStore((s) => s.loadWorkbook);
  const setSheet = useDashboardStore((s) => s.setSheet);
  const setMappings = useDashboardStore((s) => s.setMappings);
  const autoMap = useDashboardStore((s) => s.autoMap);
  const setStatus = useDashboardStore((s) => s.setStatus);

  const workbookRef = useRef<XLSX.WorkBook | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setStatus(`Reading ${file.name} locally with SheetJS...`);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      workbookRef.current = wb;
      const firstSheet = wb.SheetNames[0];
      const sheet = wb.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "", raw: true });
      attachHyperlinks(sheet, rows);
      const hdrs = rows.length ? Object.keys(rows[0]).filter((k) => !k.startsWith("__link__")) : [];
      loadWorkbook(wb.SheetNames, hdrs, rows, firstSheet);
    } catch (err) {
      setStatus(`Could not read workbook: ${(err as Error).message || err}`, true);
    }
  }

  function handleSheetChange(name: string) {
    const wb = workbookRef.current;
    if (!wb) return;
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "", raw: true });
    attachHyperlinks(sheet, rows);
    const hdrs = rows.length ? Object.keys(rows[0]).filter((k) => !k.startsWith("__link__")) : [];
    setSheet(name, hdrs, rows);
  }

  const requiredMissing = (["ticketNumber", "ticketId", "status", "subStatus", "priority", "description", "createdDate", "updatedDate"] as FieldKey[]).filter(
    (f) => !mappings[f],
  );

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Upload Helix XLSX export</h2>
          <span className="muted">Data stays in your browser</span>
        </div>
        <div className="panel-body">
          <div className="upload-grid">
            <div>
              <label>XLSX file</label>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleFile} />
            </div>
            <div>
              <label>Worksheet</label>
              <select disabled={!sheetNames.length} value={sheetName || ""} onChange={(e) => handleSheetChange(e.target.value)}>
                {sheetNames.length ? sheetNames.map((n) => <option key={n} value={n}>{n}</option>) : <option>No workbook loaded</option>}
              </select>
            </div>
          </div>
          <div className={`status-line ${statusIsError ? "error" : ""}`}>{statusMessage}</div>
          {headers.length > 0 && (
            <div className={requiredMissing.length ? "mapping-warning" : "mapping-ok"}>
              {requiredMissing.length
                ? `Mapping warning: missing ${requiredMissing.join(", ")}. Map fields below.`
                : "Column mapping OK: header-driven mapping includes Priority and Status_Reason."}
            </div>
          )}
        </div>
      </section>

      {headers.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <h2>Column Mapping</h2>
            <button onClick={autoMap}>Auto-map columns</button>
          </div>
          <div className="panel-body">
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.45, marginTop: 0 }}>
              Map Helix export columns to dashboard fields.
            </p>
            <div className="mapping-grid">
              {EXPECTED_FIELDS.map(([field, label]) => (
                <div key={field}>
                  <label>{label}</label>
                  <select value={mappings[field] || ""} onChange={(e) => setMappings({ [field]: e.target.value })}>
                    <option value="">-- Not mapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
