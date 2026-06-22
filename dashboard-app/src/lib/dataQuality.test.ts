import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { autoGuessMappings } from "./fields";
import { processRows } from "./processRows";
import { dataQualityIssues } from "./dataQuality";

describe("data quality parity with legacy dashboard", () => {
  it("finds ~82 exception rows out of 600 sample rows", () => {
    const buf = readFileSync("/tmp/dashboard/Sample_Helix_Export_FakeData.xlsx");
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
    const headers = Object.keys(rawRows[0]);
    const mappings = autoGuessMappings(headers);
    const rows = processRows(rawRows, mappings);

    expect(rows.length).toBe(600);

    const exceptionRows = rows.filter((r) => dataQualityIssues(r).length > 0);
    expect(exceptionRows.length).toBe(82);
  });
});
