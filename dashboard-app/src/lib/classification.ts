import { norm } from "./fields";

export const CLOSURE_REVIEW_REASON = "Client Action Required";

export const CLASSIFICATION_MAP: Record<string, string> = {
  "report production incident": "Production Incident",
  "access request": "Access Request",
  "gsb service request": "Service Request",
  "report uat bug": "UAT Bug",
  "report production enhancement": "Production Enhancement",
  "report production defect": "Production Defect",
  "report defect": "Defect",
  "report bug": "Bug",
  "report improvement": "Improvement",
  "improvement request": "Improvement",
};

export interface OperationalClassification {
  workType: string;
  operationalGroup: string;
  classificationPrefix: string;
  description: string;
}

/** Faithful port of parseOperational(desc) */
export function parseOperational(desc: unknown): OperationalClassification {
  const text = norm(desc);
  const slash = text.indexOf("/");
  const prefix = norm(slash >= 0 ? text.slice(0, slash) : text);
  const key = prefix.toLowerCase();
  const workType = CLASSIFICATION_MAP[key] || "Unclassified";
  const clean = norm(slash >= 0 ? text.slice(slash + 1) : text);
  let group = "Unclassified";
  const c = workType.toLowerCase();
  if (c.includes("service request") || c.includes("access request")) group = "Requests";
  else if (c.includes("enhancement") || c.includes("improvement")) group = "Enhancements";
  else if (c.includes("uat") || c.includes("bug") || c.includes("defect")) group = "Non-prod / UAT";
  else if (c.includes("production")) group = "Production";
  return { workType, operationalGroup: group, classificationPrefix: prefix, description: clean || text };
}

/** Faithful port of statusKey(s) */
export function statusKey(s: unknown): string {
  const v = norm(s).toLowerCase();
  if (v === "pending") return "pending";
  if (v.includes("progress")) return "progress";
  if (v === "resolved") return "resolved";
  if (v === "closed") return "closed";
  if (v === "cancelled" || v === "canceled") return "cancelled";
  if (v === "assigned") return "assigned";
  if (v === "new") return "new";
  return v || "unspecified";
}

/** Maps Helix priority values (Critical/High/Medium/Low, or numeric/P-prefixed equivalents) to P1-P4. */
export function priorityCode(p: unknown): string {
  const v = norm(p).toLowerCase();
  if (!v) return "";
  if (v === "p1" || v === "1" || v.includes("critical") || v.startsWith("1-")) return "P1";
  if (v === "p2" || v === "2" || v.includes("high") || v.startsWith("2-")) return "P2";
  if (v === "p3" || v === "3" || v.includes("medium") || v.startsWith("3-")) return "P3";
  if (v === "p4" || v === "4" || v === "5" || v.includes("low") || v.startsWith("4-") || v.startsWith("5-")) return "P4";
  return norm(p);
}

export function isHighPriority(p: unknown): boolean {
  const c = priorityCode(p).toUpperCase();
  return c === "P1" || c === "P2";
}

// Row-shape independent predicates take the minimal slice they need.
interface StatusBearing {
  status: string;
}
interface PendingBearing extends StatusBearing {
  subStatus: string;
}

export function isPending(r: StatusBearing): boolean {
  return statusKey(r.status) === "pending";
}
export function isClosed(r: StatusBearing): boolean {
  return ["resolved", "closed"].includes(statusKey(r.status));
}
export function isOpen(r: StatusBearing): boolean {
  return !["resolved", "closed", "cancelled"].includes(statusKey(r.status));
}
export function isClosureReview(r: PendingBearing): boolean {
  return isPending(r) && norm(r.subStatus).toLowerCase() === norm(CLOSURE_REVIEW_REASON).toLowerCase();
}
