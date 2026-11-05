// The issue page, pushed over the list: everything about one issue, with
// pickers for status, priority and assignee when the CLI's key may write.

import { div } from "gpui-kit";
import { v_flex, h_flex, Popover } from "gpui-base";
import { notify } from "herdr";
import { STATUSES, PRIORITY_LABELS, statusOf } from "./query.js";
import { icon, iconButton, statusIcon, priorityIcon, avatar, button, ago } from "./ui.js";

const PRIORITY_ORDER = [0, 1, 2, 3, 4];

function header(view, t, issue) {
  const copy = (text, what) => (_e, cx) => {
    cx.write_to_clipboard(text);
    notify({ title: `Copied ${what}`, body: text, level: "success", timeout: 2000 });
  };
  return h_flex().h(42).flex_none().pl(6).pr(8).gap(6).items_center().border_b(1).border_color(t.border)
    .child(iconButton(t, "lp-back", "chevron-left", (_e, cx) => view.back(cx), { tip: "Back" }))
    .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(issue?.identifier ?? view.detail.id))
    .when(Boolean(issue), (el) => el
      .child(iconButton(t, "lp-open", "external", (_e, cx) => cx.open_url(issue.url), { tip: "Open in browser" }))
      .child(iconButton(t, "lp-copy-link", "link", copy(issue.url, "link"), { tip: "Copy link" }))
      .child(iconButton(t, "lp-copy-id", "copy", copy(issue.identifier, "identifier"), { tip: "Copy identifier" })));
}

function field(t, label, value) {
  return h_flex().min_h(26).gap(10).items_center().text_size(12.5)
    .child(div().w(76).flex_none().text_color(t.dim).child(label))
    .child(div().flex_1().min_w(0).child(value));
}

const plain = (t, text, color) => div().min_w(0).truncate().text_color(color ?? t.foreground).child(text);

function person(view, t, user, empty) {
  if (!user) return plain(t, empty, t.dim);
  return h_flex().gap(6).items_center().min_w(0)
    .child(avatar(t, user, view.avatarPath(user)))
    .child(plain(t, user.displayName || user.name))
    .when(Boolean(user.app), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child("agent")));
}

// A value that opens a menu when the key may write; plain otherwise.
function picker(view, t, kind, value, menu) {
  if (!view.canEdit()) return value;
  const trigger = h_flex().id(`lp-pick-${kind}`).min_h(24).px(6).ml(-6).items_center().cursor_pointer()
    .hover((s) => s.bg(t.hover)).child(value);
  return Popover.new(`lp-picker-${kind}`).anchor("top_left")
    .open(view.picker === kind)
    .on_open_change((open, cx) => {
      if (open) view.openPicker(kind, cx);
      else {
        view.picker = null;
        cx.notify();
      }
    })
    .trigger(trigger)
    .content(view.picker === kind ? menu() : div());
}

function menuFrame(t, id, children) {
  return v_flex().id(id).w(240).max_h(320).py(4).overflow_y_scrollbar()
    .bg(t.popover).border_1().border_color(t.border).shadow_lg().text_size(12.5).children(children);
}

function option(t, id, current, content, onPick) {
  return h_flex().id(id).h(28).flex_none().px(10).gap(8).items_center().cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => onPick(cx))
    .child(h_flex().flex_1().min_w(0).gap(8).items_center().children(content))
    .when(current, (el) => el.child(icon("check").size(12).flex_none().text_color(t.foreground)));
}

function options(view, t, issue) {
  const o = view.teamOptions[issue.team?.id];
  return o && o !== "loading" ? o : null;
}

function waiting(t, id) {
  return menuFrame(t, id, [div().px(10).py(6).text_color(t.dim).child("Loading…")]);
}

function statusMenu(view, t, issue) {
  const o = options(view, t, issue);
  if (!o) return waiting(t, "lp-status-picker");
  const order = (s) => STATUSES.findIndex((x) => x.key === statusOf(s));
  const states = [...o.states].sort((a, b) => order(a) - order(b) || a.position - b.position);
  return menuFrame(t, "lp-status-picker", states.map((s) => option(t, `lp-state-${s.id}`, s.id === issue.state?.id,
    [statusIcon(statusOf(s), s.color, 13), plain(t, s.name)],
    (cx) => view.change({ stateId: s.id }, cx))));
}

function priorityMenu(view, t, issue) {
  return menuFrame(t, "lp-priority-picker", PRIORITY_ORDER.map((p) => option(t, `lp-priority-${p}`, p === issue.priority,
    [priorityIcon(t, p, 13), plain(t, PRIORITY_LABELS[p])],
    (cx) => view.change({ priority: p }, cx))));
}

function assigneeMenu(view, t, issue) {
  const o = options(view, t, issue);
  if (!o) return waiting(t, "lp-assignee-picker");
  const name = (u) => (u.displayName || u.name || "").toLowerCase();
  const people = [...o.members].filter((u) => !u.app).sort((a, b) => (b.id === o.me) - (a.id === o.me) || name(a).localeCompare(name(b)));
  return menuFrame(t, "lp-assignee-picker", [
    option(t, "lp-assignee-none", !issue.assignee, [div().size(18).flex_none(), plain(t, "Unassigned", t.muted)],
      (cx) => view.change({ assigneeId: null }, cx)),
    ...people.map((u) => option(t, `lp-assignee-${u.id}`, u.id === issue.assignee?.id,
      [avatar(t, u, view.avatarPath(u)), plain(t, u.id === o.me ? `${u.displayName || u.name} (you)` : u.displayName || u.name)],
      (cx) => view.change({ assigneeId: u.id }, cx))),
  ]);
}

function editingOff(view, t) {
  return v_flex().p(10).gap(6).border_1().border_color(t.border).text_size(12)
    .child(div().font_semibold().text_color(t.foreground).child("Editing is off"))
    .child(div().text_color(t.muted).child(
      "The linear CLI's API key can only read, so status, priority and assignee can't be changed here. " +
      "Create a key with write access in Linear's security settings (linear.app/settings/account/security), " +
      "then run `linear auth login` with it."))
    .when(Boolean(view.write?.message), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(view.write.message)))
    .child(h_flex().child(button(t, "lp-check-write", "Check again", (_e, cx) => view.checkWrite(cx))));
}

function chip(t, label) {
  return h_flex().h(20).px(7).gap(5).flex_none().items_center().border_1().border_color(t.border).text_size(11.5).text_color(t.muted)
    .child(div().size(7).rounded_full().flex_none().bg(label.color || t.dim))
    .child(label.name);
}

function issueLink(view, t, id, sub) {
  return h_flex().id(`lp-link-${id}-${sub.id}`).h(28).px(8).mx(-8).gap(8).items_center().cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => view.openIssue(sub.identifier, cx))
    .child(div().flex_none().text_size(12).text_color(t.muted).child(sub.identifier))
    .when(Boolean(sub.state), (el) => el.child(statusIcon(statusOf(sub.state), sub.state.color, 13)))
    .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(sub.title));
}

function section(t, title, count, body) {
  return v_flex().gap(4)
    .child(h_flex().gap(6).items_center()
      .child(div().text_size(12).font_semibold().text_color(t.foreground).child(title))
      .when(count !== null, (el) => el.child(div().text_size(12).text_color(t.dim).child(String(count)))))
    .child(body);
}

// The description as text: one line per line, blank lines kept short.
function description(t, text) {
  const src = String(text ?? "").replace(/!\[([^\]]*)\]\([^)]*\)/g, "[image $1]").trim();
  if (!src) return div().text_size(12.5).text_color(t.dim).child("No description.");
  return v_flex().gap(2).text_size(12.5).text_color(t.foreground)
    .children(src.split("\n").map((line, i) => (line.trim() ? div().id(`lp-desc-${i}`).child(line) : div().h(6))));
}

export function issuePage(view, t) {
  const d = view.detail;
  const issue = d.issue;
  let body;
  if (d.error) body = div().px(14).py(12).text_size(12).text_color(t.blocked).child(d.error);
  else if (!issue) body = div().px(14).py(12).text_size(12).text_color(t.dim).child("Loading issue…");
  else {
    const key = statusOf(issue.state);
    const subs = issue.children?.nodes ?? [];
    const labels = issue.labels?.nodes ?? [];
    body = v_flex().id("lp-issue-body").flex_1().min_h(0).overflow_y_scrollbar().px(14).py(12).gap(14)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child(issue.title))
      .when(view.write?.state === "off", (el) => el.child(editingOff(view, t)))
      .when(Boolean(view.editError), (el) => el.child(div().text_size(12).text_color(t.blocked).child(view.editError)))
      .child(v_flex().gap(2)
        .child(field(t, "Status", picker(view, t, "status",
          h_flex().gap(7).items_center().child(statusIcon(key, issue.state?.color ?? t.muted, 13)).child(plain(t, issue.state?.name ?? "")),
          () => statusMenu(view, t, issue))))
        .child(field(t, "Priority", picker(view, t, "priority",
          h_flex().gap(7).items_center().child(priorityIcon(t, issue.priority, 13)).child(plain(t, PRIORITY_LABELS[issue.priority] ?? "No priority")),
          () => priorityMenu(view, t, issue))))
        .child(field(t, "Assignee", picker(view, t, "assignee", person(view, t, issue.assignee, "Unassigned"),
          () => assigneeMenu(view, t, issue))))
        .when(Boolean(issue.delegate), (el) => el.child(field(t, "Delegate", person(view, t, issue.delegate, ""))))
        .child(field(t, "Team", plain(t, issue.team ? `${issue.team.name} (${issue.team.key})` : "None", issue.team ? t.foreground : t.dim)))
        .child(field(t, "Project", plain(t, issue.project?.name ?? "None", issue.project ? t.foreground : t.dim)))
        .child(field(t, "Cycle", plain(t, issue.cycle ? issue.cycle.name || `Cycle ${issue.cycle.number}` : "None", issue.cycle ? t.foreground : t.dim)))
        .when(Boolean(issue.parent), (el) => el.child(field(t, "Parent", issueLink(view, t, "parent", issue.parent))))
        .when(labels.length > 0, (el) => el.child(field(t, "Labels", h_flex().flex_wrap().gap(4).py(3).children(labels.map((l) => chip(t, l))))))
        .child(field(t, "Created", plain(t, `${ago(issue.createdAt)}${issue.creator ? ` by ${issue.creator.displayName || issue.creator.name}` : ""}`, t.muted)))
        .child(field(t, "Updated", plain(t, ago(issue.updatedAt), t.muted))))
      .when(view.saving, (el) => el.child(div().text_size(12).text_color(t.dim).child("Saving…")))
      .when(subs.length > 0, (el) => el.child(section(t, "Sub-issues", subs.length,
        v_flex().children(subs.map((s) => issueLink(view, t, "sub", s))))))
      .child(section(t, "Description", null, description(t, issue.description)));
  }
  return v_flex().size_full().min_h(0).child(header(view, t, issue)).child(body);
}
