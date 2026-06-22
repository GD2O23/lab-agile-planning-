/** Faithful port of parseDate(value) and daysSince(d) */
export function parseDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === "number" && isFinite(value)) {
    const d = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  const t = String(value).trim();
  if (!t) return null;
  const p = new Date(t);
  if (!isNaN(p.getTime())) return p;
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function daysSince(d: Date | null): number | null {
  if (!d) return null;
  const today = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(0, Math.floor((b - a) / 86400000));
}

export function dateDisplay(d: Date | null): string {
  if (!d) return "-";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

/** age bucket logic: 0-4 / 5-13 / 14-29 / 30+ */
export type AgeBucket = "0to4" | "5to13" | "14to29" | "30plus";
export function ageBucket(days: number | null): AgeBucket | null {
  if (days == null) return null;
  if (days < 5) return "0to4";
  if (days < 14) return "5to13";
  if (days < 30) return "14to29";
  return "30plus";
}
