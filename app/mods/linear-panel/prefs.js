// The person's choices: views, the selected one, the Status dropdown, the
// Sub-issues toggle, collapsed groups and "Show priority". Kept in Herdr's
// shared state, not per-copy localStorage, which resets when the layout
// rebuilds.

import { shared, setShared } from "herdr";
import { DEFAULT_STATUSES, PICKABLE } from "./query.js";

const PREFS = "linear-panel.prefs";
export const DEFAULT_VIEWS = [
  { id: "me", name: "Me", query: "@me" },
  { id: "triage", name: "Triage", query: "s:triage" },
];

export function readPrefs() {
  const p = shared(PREFS) ?? {};
  const views = Array.isArray(p.views) && p.views.length
    ? p.views.filter((v) => v && typeof v.id === "string").map((v) => ({ id: v.id, name: String(v.name ?? ""), query: String(v.query ?? "") }))
    : DEFAULT_VIEWS;
  return {
    views: views.length ? views : DEFAULT_VIEWS,
    selected: typeof p.selected === "string" ? p.selected : null,
    statuses: Array.isArray(p.statuses) ? p.statuses.filter((s) => PICKABLE.includes(s)) : DEFAULT_STATUSES,
    subIssues: Boolean(p.subIssues),
    collapsed: Array.isArray(p.collapsed) ? p.collapsed : [],
    showPriority: Boolean(p.showPriority),
  };
}

export function writePrefs(patch) {
  setShared(PREFS, { ...readPrefs(), ...patch });
}

export function selectedView(prefs) {
  return prefs.views.find((v) => v.id === prefs.selected) ?? prefs.views[0];
}

// What the issues depend on; a change means asking Linear again.
export const dataKey = (p) => JSON.stringify([p.views.map((v) => [v.id, v.query]), p.statuses, p.subIssues]);
