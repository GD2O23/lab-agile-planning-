import { norm } from "./fields";

export function uniqueSorted(a: string[]): string[] {
  return [...new Set(a.map((v) => norm(v) || "Unspecified"))].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: "base" }));
}
