import { useRef } from "react";
import * as XLSX from "xlsx";
import { useDashboardStore } from "../../store/useDashboardStore";
import { EXPECTED_FIELDS } from "../../lib/fields";
import type { FieldKey, RawRow } from "../../types";

/**
 * Scan the SheetJS worksheet object for hyperlinks and attach them as
 * __link__<Header> keys on the corresponding RawRow objects.
 *
 * Two sources are checked per cell (same priority as legacy app):
 *   1. cell.l.Target  – native Excel hyperlink
 *   2. cell.f         – =HYPERLINK("url","label") formula (cellFormula:true)
 */
function attachHyperlinks(sheet: XLSX.WorkSheet, rows: RawRow[]): number {
  if (!rows.length) return 0;
  const ref = sheet["!ref"];
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);
  let found = 0;

  // Build col-index → header name from the header row
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

      // 1. Native hyperlink stored by SheetJS
      if (cell.l?.Target) {
        rowObj[`__link__${header}`] = cell.l.Target;
        found++;
        continue;
      }

      // 2. HYPERLINK() formula — use same regex as legacy app
      // cell.f contains the formula WITHOUT the leading "=" e.g.
      // HYPERLINK("https://...","label")
      if (cell.f) {
        const mm = String(cell.f).match(/^HYPERLINK\("([^"]+)"/i);
        if (mm?.[1]) {
          rowObj[`__link__${header}`] = mm[1];
          found++;
        }
      }
    }
  }
  return found;
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

  // Track link count separately so we can show it even after loadWorkbook
  // overwrites the status message
  const linkCountRef = useRef<number | null>(null);

  const workbookRef = useRef<XLSX.WorkBook | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setStatus(`Reading ${file.name}...`);
      const buf = await file.arrayBuffer();

      // cellFormula:true → SheetJS populates cell.f for formula cells
      const wb = XLSX.read(new Uint8Array(buf), {
        type: "array",
        cellDates: true,
        cellFormula: true,
      });
      workbookRef.current = wb;
      const firstSheet = wb.SheetNames[0];
      const sheet = wb.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "", raw: true });

      const found = attachHyperlinks(sheet, rows);
      linkCountRef.current = found;

      const hdrs = rows.length
        ? Object.keys(rows[0]).filter((k) => !k.startsWith("__link__"))
        : [];
      loadWorkbook(wb.SheetNames, hdrs, rows, firstSheet);

      // Overwrite loadWorkbook's generic status with our diagnostic one
      setStatus(
        `Loaded ${rows.length.toLocaleString()} rows from "${firstSheet}" · ${found} hyperlinks detected.`,
      );
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
    const hdrs = rows.length
      ? Object.keys(rows[0]).filter((k) => !k.startsWith("__link__"))
      : [];
    setSheet(name, hdrs, rows);
  }

  const requiredMissing = (
    ["ticketNumber", "ticketId", "status", "subStatus", "priority", "description", "createdDate", "updatedDate"] as FieldKey[]
  ).filter((f) => !mappings[f]);

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
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFile}
              />
            </div>
            <div>
              <label>Worksheet</label>
              <select
                disabled={!sheetNames.length}
                value={sheetName || ""}
                onChange={(e) => handleSheetChange(e.target.value)}
              >
                {sheetNames.length
                  ? sheetNames.map((n) => <option key={n} value={n}>{n}</option>)
                  : <option>No workbook loaded</option>}
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
                  <select
                    value={mappings[field] || ""}
                    onChange={(e) => setMappings({ [field]: e.target.value })}
                  >
                    <option value="">-- Not mapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
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
