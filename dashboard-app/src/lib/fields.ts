import type { FieldKey, FieldMappings } from "../types";

export const FIELD_ALIASES: Record<FieldKey, string[]> = {
  ticketNumber: ["Incident Number", "Incident ID", "Ticket Number", "ID"],
  ticketId: ["Request_ID", "Request ID", "Ticket ID", "Request Number"],
  ticketUrl: ["Ticket URL", "Incident URL", "URL", "Link"],
  status: ["Status", "Incident Status"],
  subStatus: ["Status_Reason", "Status Reason", "Sub Status", "SubStatus", "Pending Reason", "Detailed Status", "Resolution Status"],
  priority: ["Priority", "Priority*"],
  company: ["Company", "Client", "Customer", "Organisation", "Organization"],
  submitterName: ["Sumitter_name", "Submitter_name", "Submitter Name", "Submitter", "Reported By", "Requested By", "Customer", "Client"],
  category: ["Category", "Operational Category", "Categorization Tier 1", "Functional Area", "Queue Category"],
  subCategory: ["Sub_Category", "Sub Category", "Sub-Category", "Category Tier 2", "Operational Category Tier 2"],
  description: ["Description", "Summary", "Detailed Description", "Notes"],
  createdDate: ["Submit Date", "Reported Date", "Created Date", "Create Date", "Opened Date", "Submitted"],
  updatedDate: ["Last Modified Date", "Last Updated", "Modified Date", "Last Update Date", "Last updated"],
  lastModifiedBy: ["Last Modified By", "Modified By", "Last updated by"],
};

export const EXPECTED_FIELDS: [FieldKey, string][] = [
  ["ticketNumber", "Incident ID / Dashboard link"],
  ["ticketId", "Request_ID / Direct ticket link"],
  ["ticketUrl", "Fallback Ticket URL"],
  ["status", "Status"],
  ["subStatus", "Status_Reason / Pending reason"],
  ["priority", "Priority"],
  ["company", "Company"],
  ["submitterName", "Submitter name"],
  ["category", "Category"],
  ["subCategory", "Sub-category"],
  ["description", "Description"],
  ["createdDate", "Submit date"],
  ["updatedDate", "Last modified date"],
  ["lastModifiedBy", "Last modified by"],
];

export function norm(v: unknown): string {
  return String(v == null ? "" : v).trim();
}

export function normHead(v: unknown): string {
  return norm(v).toLowerCase().replace(/[\s_*:\-/\\]+/g, "");
}

/** Faithful port of autoGuessMappings(headers) */
export function autoGuessMappings(headers: string[]): FieldMappings {
  const maps: FieldMappings = {};
  const hs = headers.map((h) => ({ o: h, n: normHead(h) }));
  for (const [field] of EXPECTED_FIELDS) {
    let match = "";
    for (const alias of FIELD_ALIASES[field] || []) {
      const a = normHead(alias);
      const found = hs.find((h) => h.n === a);
      if (found) {
        match = found.o;
        break;
      }
    }
    if (!match) {
      for (const alias of FIELD_ALIASES[field] || []) {
        const a = normHead(alias);
        const found = hs.find((h) => h.n.includes(a) || a.includes(h.n));
        if (found) {
          match = found.o;
          break;
        }
      }
    }
    maps[field] = match;
  }
  return maps;
}
