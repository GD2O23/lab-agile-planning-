import { useRef } from "react";
import * as XLSX from "xlsx";
import { useDashboardStore } from "../../store/useDashboardStore";
import { EXPECTED_FIELDS } from "../../lib/fields";
import type { FieldKey, RawRow } from "../../types";

// ── Direct XLSX/ZIP XML parsing for hyperlinks (same approach as legacy app) ──

async function readZipEntry(
  data: Uint8Array,
  view: DataView,
  localOffset: number,
  method: number,
  compressedSize: number,
): Promise<string> {
  const localNameLen = view.getUint16(localOffset + 26, true);
  const localExtraLen = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + localNameLen + localExtraLen;
  const compressed = data.slice(dataStart, dataStart + compressedSize);
  let bytes: Uint8Array;
  if (method === 0) {
    bytes = compressed;
  } else {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Parse HYPERLINK() formula cells directly from the XLSX zip XML — same
 * technique as the legacy app. Returns a map of cell address → URL.
 */
async function parseXlsxHyperlinks(
  buf: ArrayBuffer,
  sheetIndex: number,
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  try {
    const data = new Uint8Array(buf);
    const view = new DataView(buf);

    // Locate End of Central Directory record
    let eocd = -1;
    for (let i = data.length - 22; i >= 0; i--) {
      if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x05 && data[i + 3] === 0x06) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return urls;

    const entries = view.getUint16(eocd + 10, true);
    const centralOffset = view.getUint32(eocd + 16, true);

    // Index every file in the zip
    const files = new Map<string, { localOffset: number; method: number; compressedSize: number }>();
    let ptr = centralOffset;
    for (let i = 0; i < entries; i++) {
      if (view.getUint32(ptr, true) !== 0x02014b50) break;
      const method = view.getUint16(ptr + 10, true);
      const compressedSize = view.getUint32(ptr + 20, true);
      const fileNameLength = view.getUint16(ptr + 28, true);
      const extraLength = view.getUint16(ptr + 30, true);
      const commentLength = view.getUint16(ptr + 32, true);
      const localOffset = view.getUint32(ptr + 42, true);
      const name = new TextDecoder("utf-8").decode(data.slice(ptr + 46, ptr + 46 + fileNameLength));
      if (!name.endsWith("/")) files.set(name, { localOffset, method, compressedSize });
      ptr += 46 + fileNameLength + extraLength + commentLength;
    }

    const readFile = (name: string) => {
      const e = files.get(name);
      if (!e) return Promise.resolve("");
      return readZipEntry(data, view, e.localOffset, e.method, e.compressedSize);
    };

    // Resolve workbook → sheet path via rels
    const [wbXml, wbRelsXml] = await Promise.all([
      readFile("xl/workbook.xml"),
      readFile("xl/_rels/workbook.xml.rels"),
    ]);
    if (!wbXml) return urls;

    const rels: Record<string, string> = {};
    new DOMParser().parseFromString(wbRelsXml, "application/xml")
      .querySelectorAll("Relationship")
      .forEach((r) => { rels[r.getAttribute("Id") || ""] = r.getAttribute("Target") || ""; });

    const sheets = [...new DOMParser().parseFromString(wbXml, "application/xml").querySelectorAll("sheet")];
    const target = sheets[sheetIndex];
    if (!target) return urls;

    const rid = target.getAttribute("r:id") || target.getAttribute("id") || "";
    const relPath = rels[rid] || "";
    // Resolve relative path: "worksheets/sheet1.xml" → "xl/worksheets/sheet1.xml"
    const sheetPath = relPath.startsWith("/")
      ? relPath.slice(1)
      : "xl/" + relPath.replace(/^\.\.\//, "");

    const sheetXml = await readFile(sheetPath);
    if (!sheetXml) return urls;

    // Extract HYPERLINK() formula URLs — identical regex to legacy app
    new DOMParser().parseFromString(sheetXml, "application/xml")
      .querySelectorAll("sheetData row c")
      .forEach((c) => {
        const ref = c.getAttribute("r") || "";
        const f = c.querySelector("f");
        if (f && /^HYPERLINK\(/i.test(f.textContent || "")) {
          const mm = (f.textContent || "").match(/HYPERLINK\("([^"]+)"/i);
          if (mm?.[1]) urls.set(ref, mm[1]);
        }
      });
  } catch (e) {
    console.warn("XLSX hyperlink extraction failed:", e);
  }
  return urls;
}

/**
 * Attach __link__<Header> keys to each row using the hyperlink map
 * built from raw XML (cell address → URL).
 */
function attachHyperlinks(sheet: XLSX.WorkSheet, rows: RawRow[], hyperlinkMap: Map<string, string>): void {
  if (!hyperlinkMap.size || !rows.length) return;
  const ref = sheet["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);

  // Build column-index → header name map from row 0
  const colToHeader: Record<number, string> = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell?.v != null) colToHeader[c] = String(cell.v);
  }

  for (const [cellRef, url] of hyperlinkMap) {
    const addr = XLSX.utils.decode_cell(cellRef);
    const header = colToHeader[addr.c];
    if (!header) continue;
    const rowObj = rows[addr.r - range.s.r - 1]; // -1 for header row
    if (!rowObj) continue;
    rowObj[`__link__${header}`] = url;
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
      setStatus(`Reading ${file.name} locally...`);
      const buf = await file.arrayBuffer();
      rawBufRef.current = buf;
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      workbookRef.current = wb;
      const firstSheet = wb.SheetNames[0];
      const sheet = wb.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "", raw: true });
      const hyperlinkMap = await parseXlsxHyperlinks(buf, 0);
      attachHyperlinks(sheet, rows, hyperlinkMap);
      const hdrs = rows.length ? Object.keys(rows[0]).filter((k) => !k.startsWith("__link__")) : [];
      loadWorkbook(wb.SheetNames, hdrs, rows, firstSheet);
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
    const hyperlinkMap = await parseXlsxHyperlinks(buf, sheetIndex);
    attachHyperlinks(sheet, rows, hyperlinkMap);
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
