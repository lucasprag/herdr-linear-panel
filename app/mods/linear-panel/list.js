// The list page: header, filter bar (search, view tabs, Status and
// Sub-issues), then the issues grouped by status.

import { div } from "gpui-kit";
import { v_flex, h_flex, Input, Popover } from "gpui-base";
import { STATUSES, PICKABLE, statusOf } from "./query.js";
import { readPrefs, writePrefs, selectedView } from "./prefs.js";
import { icon, iconButton, statusIcon, priorityIcon, avatar, faint, faintOn } from "./ui.js";

// Linear's own colors for each status, used where no issue shows the
// workspace's (the Status menu, an empty view).
const FALLBACK_COLOR = {
  triage: "#fc7840", backlog: "#bec2c8", todo: "#e2e2e2", progress: "#f2c94c",
  review: "#4cb782", done: "#5e6ad2", canceled: "#95a2b3",
};

export function statusColors(view) {
  const colors = { ...FALLBACK_COLOR };
  const seen = new Set();
  for (const r of Object.values(view.results)) {
    for (const i of r.issues ?? []) {
      const k = statusOf(i.state);
      if (!seen.has(k) && i.state?.color) {
        colors[k] = i.state.color;
        seen.add(k);
      }
    }
  }
  return colors;
}

function shownIssues(view, result) {
  const q = view.search.value().trim().toLowerCase();
  const issues = result?.issues ?? [];
  if (!q) return issues;
  return issues.filter((i) => i.title.toLowerCase().includes(q) || i.identifier.toLowerCase().includes(q));
}

function header(view, t, count) {
  return h_flex().h(42).flex_none().pl(14).pr(8).gap(8).items_center().border_b(1).border_color(t.border)
    .child(div().font_semibold().text_color(t.foreground).child("Linear"))
    .when(count !== null, (el) => el.child(div().text_size(12).text_color(t.dim).child(String(count))))
    .child(div().flex_1())
    .child(iconButton(t, "lp-help", "help", (_e, cx) => { view.page = "help"; cx.notify(); }, { tip: "Query syntax" }))
    .child(iconButton(t, "lp-settings", "settings", (_e, cx) => view.openSettings(cx), { tip: "Settings" }))
    .child(iconButton(t, "lp-refresh", "refresh", (_e, cx) => view.refresh(cx), { spin: view.busy, size: 13, tip: "Refresh" }));
}

function searchBox(view, t) {
  const hasText = view.search.value().length > 0;
  return h_flex().id("lp-search").h(30).flex_none().px(14).gap(8).items_center().bg(faint(t))
    .on_click(() => view.search.focus())
    .child(icon("search").size(13).flex_none().text_color(t.dim))
    .child(Input.new(view.search).flex_1().h_full().text_size(13).text_color(t.foreground))
    .when(hasText, (el) => el.child(iconButton(t, "lp-search-clear", "x", (_e, cx) => {
      view.search.set_value("");
      cx.notify();
    }, { box: 20, size: 11, tip: "Clear" })));
}

function countText(result) {
  if (!result || result.error || result.issues === undefined) return "";
  return `${result.issues.length}${result.more ? "+" : ""}`;
}

function tabs(view, t, prefs) {
  const current = selectedView(prefs);
  return h_flex().h(28).flex_none().items_center().bg(faint(t))
    .children(prefs.views.map((v) => {
      const on = v.id === current.id;
      return h_flex().id(`lp-tab-${v.id}`).flex_1().min_w(0).h_full().px(6).gap(5).items_center().justify_center().cursor_pointer()
        .when(on, (el) => el.bg(faintOn(t)))
        .hover((s) => s.bg(faintOn(t)))
        .on_click((_e, cx) => {
          writePrefs({ selected: v.id });
          cx.notify();
        })
        .child(div().min_w(0).truncate().text_size(12).when(on, (el) => el.font_medium()).text_color(on ? t.foreground : t.muted).child(v.name || "Untitled"))
        .child(div().flex_none().text_size(11.5).text_color(t.dim).child(countText(view.results[v.id])));
    }))
    .child(iconButton(t, "lp-add-view", "plus", (_e, cx) => view.openSettings(cx, { add: true }), { box: 28, size: 12, tip: "Add a view" }));
}

function statusMenu(view, t, prefs, colors) {
  const chosen = new Set(prefs.statuses);
  return v_flex().id("lp-status-menu").w(210).py(4).bg(t.popover).border_1().border_color(t.border).shadow_lg().text_size(12.5)
    .children(PICKABLE.map((key) => {
      const on = chosen.has(key);
      const label = STATUSES.find((s) => s.key === key).label;
      return h_flex().id(`lp-status-${key}`).h(28).px(10).gap(8).items_center().cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => {
          const next = on ? prefs.statuses.filter((s) => s !== key) : PICKABLE.filter((s) => s === key || chosen.has(s));
          writePrefs({ statuses: next });
          view.refresh(cx);
        })
        .child(div().size(14).flex_none().flex().items_center().justify_center().border_1()
          .border_color(on ? t.accent : t.input).bg(on ? t.accent : t.chrome)
          .when(on, (el) => el.child(icon("check").size(11).text_color(t.accent_foreground))))
        .child(statusIcon(key, colors[key], 13))
        .child(div().text_color(t.foreground).child(label));
    }));
}

function filterRow(view, t, prefs, result, colors) {
  const setByView = Boolean(result?.setsStatus);
  const chosen = PICKABLE.filter((k) => prefs.statuses.includes(k));
  const trigger = h_flex().id("lp-status-trigger").w_full().h(28).px(8).gap(6).items_center()
    .border_1().border_color(t.border)
    .when(!setByView, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)))
    .when(setByView, (el) => el.opacity(0.55))
    .when(!setByView && chosen.length > 0, (el) => el.child(h_flex().gap(2).flex_none().items_center()
      .children(chosen.map((k) => statusIcon(k, colors[k], 12)))))
    .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted)
      .child(setByView ? "Status set by this view" : "Status"))
    .when(!setByView, (el) => el.child(icon("chevron-down").size(12).flex_none().text_color(t.dim)));
  const status = setByView
    ? div().flex_1().min_w(0).child(trigger)
    // A Popover has no box of its own: the div sizes it.
    : div().flex_1().min_w(0).child(Popover.new("lp-status").anchor("top_left")
      .open(view.statusOpen)
      .on_open_change((open, cx) => { view.statusOpen = open; cx.notify(); })
      .trigger(trigger)
      .content(statusMenu(view, t, prefs, colors)));
  const on = prefs.subIssues;
  const sub = h_flex().id("lp-sub-issues").h(28).flex_none().px(10).gap(6).items_center().cursor_pointer()
    .border_1().border_color(on ? t.input : t.border).when(on, (el) => el.bg(faintOn(t)))
    .text_size(12).text_color(on ? t.foreground : t.muted)
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .tooltip(on ? "Showing sub-issues" : "Sub-issues are hidden")
    .on_click((_e, cx) => {
      writePrefs({ subIssues: !on });
      view.refresh(cx);
    })
    .child(icon("sub-issues").size(13).flex_none())
    .child("Sub-issues");
  return h_flex().flex_none().gap(8).items_center().child(status).child(sub);
}

function groupHeader(view, t, key, label, count, color, collapsed) {
  return h_flex().id(`lp-group-${key}`).h(30).flex_none().px(14).gap(8).items_center().cursor_pointer().bg(faint(t))
    .hover((s) => s.bg(faintOn(t)))
    .on_click((_e, cx) => {
      const c = readPrefs().collapsed;
      writePrefs({ collapsed: collapsed ? c.filter((k) => k !== key) : [...c, key] });
      cx.notify();
    })
    .child(icon(collapsed ? "chevron-right" : "chevron-down").size(12).flex_none().text_color(t.dim))
    .child(statusIcon(key, color, 14))
    .child(div().font_semibold().text_color(t.foreground).child(label))
    .child(div().text_size(12).text_color(t.dim).child(String(count)));
}

export function people(view, t, issue) {
  const out = [];
  if (issue.assignee) out.push(avatar(t, issue.assignee, view.avatarPath(issue.assignee)));
  if (issue.delegate && issue.delegate.id !== issue.assignee?.id) out.push(avatar(t, issue.delegate, view.avatarPath(issue.delegate)));
  return h_flex().flex_none().gap(3).items_center().children(out);
}

function issueLine(view, t, issue, showPriority) {
  const who = [issue.assignee?.displayName, issue.delegate ? `${issue.delegate.displayName} (agent)` : null].filter(Boolean).join(", ");
  return h_flex().id(`lp-issue-${issue.id}`).h(31).flex_none().px(14).gap(8).items_center().cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => view.openIssue(issue.identifier, cx))
    .child(div().flex_none().min_w(62).text_size(12).text_color(t.muted).child(issue.identifier))
    .when(showPriority, (el) => el.child(priorityIcon(t, issue.priority, 13)))
    .child(statusIcon(statusOf(issue.state), issue.state?.color ?? t.muted, 13))
    .child(h_flex().flex_1().min_w(0).gap(6).items_center()
      .child(div().min_w(0).truncate().text_size(12.8).font_medium().text_color(t.foreground).child(issue.title))
      .when(Boolean(issue.parent), (el) => el.child(div().flex_none().text_size(11.5).text_color(t.dim).child(`in ${issue.parent.identifier}`))))
    .when(Boolean(who), (el) => el.child(people(view, t, issue).tooltip(who)));
}

// Urgent first, no priority last, then the most recently updated.
const rank = (p) => (p > 0 ? p : 5);
const byPriority = (a, b) => rank(a.priority) - rank(b.priority) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

function note(t, text, color) {
  return div().px(14).py(12).text_size(12).text_color(color ?? t.dim).child(text);
}

function body(view, t, prefs, result, issues) {
  if (!result || (result.issues === undefined && !result.error)) return note(t, "Loading issues…");
  if (result.noStatus) return note(t, "Choose a status to see issues.");
  if (result.error) return note(t, result.error, t.blocked);
  if (!issues.length) return note(t, "No issues match these filters.");
  const collapsed = new Set(prefs.collapsed);
  const groups = new Map(STATUSES.map((s) => [s.key, []]));
  for (const i of issues) groups.get(statusOf(i.state)).push(i);
  const lines = [];
  for (const s of STATUSES) {
    const list = groups.get(s.key);
    if (!list.length) continue;
    const folded = collapsed.has(s.key);
    lines.push(groupHeader(view, t, s.key, s.label, list.length, list[0].state?.color ?? t.muted, folded));
    if (!folded) for (const i of list.sort(byPriority)) lines.push(issueLine(view, t, i, prefs.showPriority));
  }
  return v_flex().id("lp-list").flex_1().min_h(0).overflow_y_scrollbar().children(lines);
}

export function listPage(view, t, prefs) {
  const current = selectedView(prefs);
  const result = view.results[current.id];
  const issues = shownIssues(view, result);
  const ready = result && result.issues !== undefined && !result.error && !result.noStatus;
  const colors = statusColors(view);
  return v_flex().size_full().min_h(0)
    .child(header(view, t, ready ? issues.length : null))
    .when(Boolean(view.banner), (el) => el.child(div().px(14).py(6).flex_none().text_size(11.5).text_color(t.blocked)
      .border_b(1).border_color(t.border).child(view.banner)))
    .child(v_flex().flex_none().gap(8)
      .child(searchBox(view, t))
      .child(tabs(view, t, prefs))
      .child(filterRow(view, t, prefs, result, colors)))
    .child(div().h(4).flex_none())
    .child(body(view, t, prefs, result, issues));
}
