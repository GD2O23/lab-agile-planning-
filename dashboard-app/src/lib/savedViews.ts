import type { SavedView } from "../types";

const SAVED_VIEW_KEY = "gsbIncidentPlatform.savedViews.v2";

export function getSavedViews(): Record<string, SavedView> {
  try {
    return JSON.parse(localStorage.getItem(SAVED_VIEW_KEY) || "{}");
  } catch {
    return {};
  }
}

export function setSavedViews(v: Record<string, SavedView>): void {
  localStorage.setItem(SAVED_VIEW_KEY, JSON.stringify(v || {}));
}

export function saveView(name: string, view: SavedView): void {
  const views = getSavedViews();
  views[name] = view;
  setSavedViews(views);
}

export function deleteView(name: string): void {
  const views = getSavedViews();
  delete views[name];
  setSavedViews(views);
}
