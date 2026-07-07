import { useRef } from "react";
import * as XLSX from "xlsx";
import { useDashboardStore } from "../../store/useDashboardStore";
import { EXPECTED_FIELDS } from "../../lib/fields";
import type { FieldKey, RawRow } from "../../types";

// ── XLSX hyperlink extraction — direct ZIP/XML parsing (same as legacy app) ──

async function decompressZipEntry(compressed: Uint8Array, method: number): Promise<string> {
  let bytes: Uint8Array;
  if (method === 0) {
    bytes = compressed;
  } else {
    const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/** Index all entries in an XLSX/ZIP file. Returns filename → {offset, method, size}. */
function indexZip(data: Uint8Array, view: DataView): Map<string, { local: number; method: number; size: number }> {
  const files = new Map<string, { local: number; method: number; size: number }>();
  let eocd = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x05 && data[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return files;
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const size = view.getUint32(ptr + 20, true);
    const fnLen = view.getUint16(ptr + 28, true);
    const exLen = view.getUint16(ptr + 30, true);
    const cmLen = view.getUint16(ptr + 32, true);
    const local = view.getUint32(ptr + 42, true);
    const name = new TextDecoder("utf-8").decode(data.slice(ptr + 46, ptr + 46 + fnLen));
    if (!name.endsWith("/")) files.set(name, { local, method, size });
    ptr += 46 + fnLen + exLen + cmLen;
  }
  return files;
}

async function readZipEntry(
  data: Uint8Array,
  view: DataView,
  entry: { local: number; method: number; size: number },
): Promise<string> {
  const { local, method, size } = entry;
  const nameLen = view.getUint16(local + 26, true);
  const exLen = view.getUint16(local + 28, true);
  const start = local + 30 + nameLen + exLen;
  return decompressZipEntry(data.slice(start, start + size), method);
}

/**
 * Extract HYPERLINK() formula URLs from an XLSX sheet's raw XML.
 * Uses getElementsByTagNameNS("*", ...) to handle OOXML default namespace.
 * Returns Map of cell address (e.g. "B2") → URL string.
 */
async function parseXlsxHyperlinks(buf: ArrayBuffer, sheetIndex: number): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  try {
    const data = new Uint8Array(buf);
    const view = new DataView(buf);
    const files = indexZip(data, view);
    if (!files.size) return urls;

    const readFile = async (name: string): Promise<string> => {
      const e = files.get(name);
      return e ? readZipEntry(data, view, e) : "";
    };

    // Locate the sheet XML — try direct path first (works for 99% of xlsx files),
    // then fall back to resolving via workbook.xml.rels.
    let sheetPath = `xl/worksheets/sheet${sheetIndex + 1}.xml`;
    if (!files.has(sheetPath)) {
      // Resolve via workbook.xml → _rels
      const [wbXml, relsXml] = await Promise.all([
        readFile("xl/workbook.xml"),
        readFile("xl/_rels/workbook.xml.rels"),
      ]);
      const rels: Record<string, string> = {};
      const relsDoc = new DOMParser().parseFromString(relsXml, "application/xml");
      const relElems = relsDoc.getElementsByTagNameNS("*", "Relationship");
      for (let i = 0; i < relElems.length; i++) {
        const r = relElems[i];
        rels[r.getAttribute("Id") || ""] = r.getAttribute("Target") || "";
      }
      const wbDoc = new DOMParser().parseFromString(wbXml, "application/xml");
      const sheetElems = wbDoc.getElementsByTagNameNS("*", "sheet");
      const target = sheetElems[sheetIndex];
      if (!target) return urls;
      const rid = target.getAttribute("r:id") || target.getAttribute("id") || "";
      const relPath = rels[rid] || "";
      sheetPath = relPath.startsWith("/")
        ? relPath.slice(1)
        : "xl/" + relPath.replace(/^\.\.\//, "");
    }

    const sheetXml = await readFile(sheetPath);
    if (!sheetXml) return urls;

    // Parse XML and scan for HYPERLINK() formula cells.
    // getElementsByTagNameNS with "*" wildcard handles the OOXML default namespace.
    const doc = new DOMParser().parseFromString(sheetXml, "application/xml");
    const fElems = doc.getElementsByTagNameNS("*", "f");
    for (let i = 0; i < fElems.length; i++) {
      const text = fElems[i].textContent || "";
      if (/^HYPERLINK\(/i.test(text)) {
        const mm = text.match(/HYPERLINK\("([^"]+)"/i);
        const cell = fElems[i].parentElement;
        const ref = cell?.getAttribute("r") || "";
        if (mm?.[1] && ref) urls.set(ref, mm[1]);
      }
    }
  } catch (err) {
    console.warn("Hyperlink extraction failed:", err);
  }
  return urls;
}

/**
 * Attach __link__<Header> keys to RawRow objects using the hyperlink URL map.
 * Also handles native hyperlinks stored via SheetJS cell.l.Target.
 */
function attachHyperlinks(sheet: XLSX.WorkSheet, rows: RawRow[], urlMap: Map<string, string>): void {
  if (!rows.length) return;
  const ref = sheet["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);

  // Build col-index → header name from the parsed sheet (handles shared strings)
  const colToHeader: Record<number, string> = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
    if (cell?.v != null) colToHeader[c] = String(cell.v);
  }

  // Apply formula-based hyperlinks from the URL map
  for (const [cellRef, url] of urlMap) {
    const addr = XLSX.utils.decode_cell(cellRef);
    const header = colToHeader[addr.c];
    if (!header) continue;
    const rowIdx = addr.r - range.s.r - 1;
    const rowObj = rows[rowIdx];
    if (!rowObj) continue;
    rowObj[`__link__${header}`] = url;
  }

  // Also apply native SheetJS hyperlinks (cell.l.Target) as a second pass
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const rowObj = rows[r - range.s.r - 1];
    if (!rowObj) continue;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const header = colToHeader[c];
      if (!header) continue;
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell?.l?.Target && !rowObj[`__link__${header}`]) {
        rowObj[`__link__${header}`] = cell.l.Target;
      }
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
  const rawBufRef = useRef<ArrayBuffer | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setStatus(`Reading ${file.name}...`);
      const buf = await file.arrayBuffer();
      rawBufRef.current = buf;

      // Parse data with SheetJS (pass Uint8Array to avoid ArrayBuffer ambiguity)
      const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
      workbookRef.current = wb;
      const firstSheet = wb.SheetNames[0];
      const sheet = wb.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "", raw: true });

      // Extract hyperlinks directly from XLSX XML (same approach as legacy app)
      const urlMap = await parseXlsxHyperlinks(buf, 0);
      attachHyperlinks(sheet, rows, urlMap);

      const hdrs = rows.length ? Object.keys(rows[0]).filter((k) => !k.startsWith("__link__")) : [];
      loadWorkbook(
        wb.SheetNames,
        hdrs,
        rows,
        firstSheet,
      );
      setStatus(
        `Loaded ${rows.length.toLocaleString()} rows${urlMap.size ? ` · ${urlMap.size} hyperlinks found` : " · no hyperlinks found"} from "${firstSheet}".`,
      );
    } catch (err) {
      setStatus(`Could not read workbook: ${(err as Error).message || err}`, true);
    }
  }

  async function handleSheetChange(name: string) {
    const wb = workbookRef.current;
    const buf = rawBufRef.current;
    if (!wb || !buf) return;
    const sheetIndex = wb.SheetNames.indexOf(name);
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "", raw: true });
    const urlMap = await parseXlsxHyperlinks(buf, Math.max(0, sheetIndex));
    attachHyperlinks(sheet, rows, urlMap);
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
