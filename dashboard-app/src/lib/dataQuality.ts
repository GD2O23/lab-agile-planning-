import type { DataQualityIssue, IncidentRow } from "../types";

/** Faithful port of dataQualityIssues(r) */
export function dataQualityIssues(r: IncidentRow): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if ((r.workType || "Unclassified") === "Unclassified") issues.push("Unclassified");
  if (!r.priority) issues.push("Missing Priority");
  if (!r.category) issues.push("Missing Category");
  if (!r.subCategory) issues.push("Missing Sub-category");
  if (!r.updatedDate) issues.push("Missing Last Modified Date");
  if (!r.createdDate) issues.push("Missing Submit Date");
  return issues;
}
