import type { FieldMappings, IncidentRow, RawRow } from "../types";
import { norm } from "./fields";
import { parseDate, daysSince } from "./dates";
import { parseOperational, priorityCode } from "./classification";

function rowValue(row: RawRow, mappings: FieldMappings, field: keyof FieldMappings): unknown {
  const h = mappings[field];
  return h ? row[h] : "";
}

function findHyperlinkForHeaders(row: RawRow, headers: (string | undefined)[]): string {
  for (const h of headers.filter(Boolean) as string[]) {
    const link = row["__link__" + h];
    if (link) return String(link);
  }
  return "";
}

function buildTicketUrl(_ticketNumber: string, explicitUrl: unknown): string {
  return norm(explicitUrl) || "";
}

/** Faithful port of processRows() row-mapping step (state.rawRows -> state.rows) */
export function processRows(rawRows: RawRow[], mappings: FieldMappings): IncidentRow[] {
  const mapped = rawRows.map((row) => {
    const created = parseDate(rowValue(row, mappings, "createdDate"));
    const updated = parseDate(rowValue(row, mappings, "updatedDate"));
    const rawDesc = norm(rowValue(row, mappings, "description"));
    const op = parseOperational(rawDesc);
    const ticketNumber = norm(rowValue(row, mappings, "ticketNumber"));
    const ticketId = norm(rowValue(row, mappings, "ticketId"));
    const dash = findHyperlinkForHeaders(row, [mappings.ticketNumber, "Incident ID", "Incident Number", "Ticket Number"]);
    const direct =
      findHyperlinkForHeaders(row, [mappings.ticketId, "Request_ID", "Request ID", "Ticket ID"]) ||
      (rowValue(row, mappings, "ticketUrl") as string);

    const result: IncidentRow = {
      ticketNumber,
      ticketId,
      dashboardUrl: dash,
      ticketUrl: buildTicketUrl(ticketId || ticketNumber, direct),
      company: norm(rowValue(row, mappings, "company")),
      status: norm(rowValue(row, mappings, "status")),
      subStatus: norm(rowValue(row, mappings, "subStatus")),
      priority: priorityCode(rowValue(row, mappings, "priority")),
      submitterName: norm(rowValue(row, mappings, "submitterName")),
      category: norm(rowValue(row, mappings, "category")),
      subCategory: norm(rowValue(row, mappings, "subCategory")),
      description: op.description,
      workType: op.workType,
      operationalGroup: op.operationalGroup,
      classificationPrefix: op.classificationPrefix,
      createdDate: created,
      updatedDate: updated,
      daysOpen: daysSince(created),
      daysSinceUpdated: daysSince(updated),
      lastModifiedBy: norm(rowValue(row, mappings, "lastModifiedBy")),
      raw: row,
    };
    return result;
  });

  // Deduplicate: one row per ticket (ticketNumber preferred, ticketId fallback),
  // keeping the entry with the most recent updatedDate (latest export row = current state).
  const seen = new Map<string, IncidentRow>();
  for (const r of mapped) {
    const key = r.ticketNumber || r.ticketId;
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, r);
    } else {
      const existingTs = existing.updatedDate?.getTime() ?? 0;
      const currentTs = r.updatedDate?.getTime() ?? 0;
      if (currentTs > existingTs) seen.set(key, r);
    }
  }
  // Preserve any rows that had no key (no ticket ID at all) so they still appear.
  const noKey = mapped.filter((r) => !r.ticketNumber && !r.ticketId);
  return [...seen.values(), ...noKey];
}

export function personName(r: IncidentRow): string {
  return r.submitterName || r.lastModifiedBy || "Unspecified";
}
