// Settings (views and "Show priority"), help (the query syntax) and the
// first-run page (no `linear` command, or not logged in).

import { div } from "gpui-kit";
import { v_flex, h_flex, Input, InputState } from "gpui-base";
import { run } from "herdr";
import { SYNTAX, parseQuery } from "./query.js";
import { writePrefs } from "./prefs.js";
import * as linear from "./linear.js";
import { icon, iconButton, button } from "./ui.js";

function pageHeader(view, t, title, extra) {
  return h_flex().h(42).flex_none().pl(6).pr(8).gap(6).items_center().border_b(1).border_color(t.border)
    .child(iconButton(t, `lp-back-${title}`, "chevron-left", (_e, cx) => view.back(cx), { tip: "Back" }))
    .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(title))
    .when(Boolean(extra), (el) => el.child(extra));
}

// ---- settings ---------------------------------------------------------------

let nextId = 0;

/** A view being edited: its inputs. Call from init or a handler, never render. */
export function newDraftView(v, cx) {
  const id = v.id ?? `v${Date.now().toString(36)}${(nextId++).toString(36)}`;
  const name = InputState.new({ placeholder: "Name", value: v.name ?? "" });
  const query = InputState.new({ placeholder: "@me #ENG s:todo,progress", value: v.query ?? "" });
  name.on("change", (_e, cx) => cx.notify());
  query.on("change", (_e, cx) => cx.notify());
  return { id, name, query };
}

function input(t, id, state, mono) {
  return h_flex().id(id).h(30).px(8).items_center().border_1().border_color(t.input).bg(t.background)
    .on_click(() => state.focus())
    .child(Input.new(state).flex_1().h_full().text_size(12.5).text_color(t.foreground)
      .when(Boolean(mono), (el) => el.font_family("JetBrains Mono")));
}

function draftView(view, t, d, index, count) {
  const move = (delta) => (_e, cx) => {
    const list = view.draft.views;
    const [item] = list.splice(index, 1);
    list.splice(index + delta, 0, item);
    cx.notify();
  };
  const error = parseQuery(d.query.value()).error;
  return v_flex().id(`lp-draft-${d.id}`).p(10).gap(6).border_1().border_color(t.border)
    .child(h_flex().gap(4).items_center()
      .child(div().flex_1().min_w(0).child(input(t, `lp-name-${d.id}`, d.name)))
      .child(index > 0 ? iconButton(t, `lp-up-${d.id}`, "chevron-up", move(-1), { tip: "Move up" }) : div().size(26))
      .child(index < count - 1 ? iconButton(t, `lp-down-${d.id}`, "chevron-down", move(1), { tip: "Move down" }) : div().size(26))
      .child(count > 1
        ? iconButton(t, `lp-delete-${d.id}`, "trash", (_e, cx) => { view.draft.views.splice(index, 1); cx.notify(); }, { tip: "Delete view" })
        : div().size(26)))
    .child(input(t, `lp-query-${d.id}`, d.query, true))
    .when(Boolean(error), (el) => el.child(div().text_size(11.5).text_color(t.blocked).child(error)));
}

function toggle(t, id, label, on, onClick) {
  return h_flex().id(id).h(30).gap(8).items_center().cursor_pointer().on_click(onClick)
    .child(div().size(14).flex_none().flex().items_center().justify_center().border_1()
      .border_color(on ? t.accent : t.input).bg(on ? t.accent : t.chrome)
      .when(on, (el) => el.child(icon("check").size(11).text_color(t.accent_foreground))))
    .child(div().text_size(12.5).text_color(t.foreground).child(label));
}

export function settingsPage(view, t, prefs) {
  const views = view.draft.views;
  const invalid = views.some((d) => parseQuery(d.query.value()).error);
  return v_flex().size_full().min_h(0)
    .child(pageHeader(view, t, "Settings"))
    .child(v_flex().id("lp-settings").flex_1().min_h(0).overflow_y_scrollbar().px(14).py(12).gap(14)
      .child(v_flex().gap(8)
        .child(h_flex().items_center()
          .child(div().flex_1().text_size(12).font_semibold().text_color(t.foreground).child("Views"))
          .child(iconButton(t, "lp-help-from-settings", "help", (_e, cx) => { view.page = "help"; view.helpBack = "settings"; cx.notify(); }, { tip: "Query syntax" })))
        .child(div().text_size(11.5).text_color(t.dim).child("Each view is a tab: a name and a query. The help (?) lists the query syntax."))
        .children(views.map((d, i) => draftView(view, t, d, i, views.length)))
        .child(h_flex().child(button(t, "lp-add-draft", "Add a view", (_e, cx) => {
          const v = newDraftView({ name: "New view", query: "" }, cx);
          view.draft.views.push(v);
          v.name.focus();
          cx.notify();
        }, { icon: "plus" }))))
      .child(v_flex().gap(4)
        .child(div().text_size(12).font_semibold().text_color(t.foreground).child("List"))
        .child(toggle(t, "lp-show-priority", "Show priority", prefs.showPriority, (_e, cx) => {
          writePrefs({ showPriority: !prefs.showPriority });
          cx.notify();
        }))))
    .child(h_flex().flex_none().px(14).py(10).gap(8).justify_end().items_center().border_t(1).border_color(t.border)
      .when(invalid, (el) => el.child(div().flex_1().text_size(11.5).text_color(t.blocked).child("Fix the query errors to save.")))
      .child(button(t, "lp-cancel", "Cancel", (_e, cx) => view.back(cx)))
      .child(button(t, "lp-save", "Save", (_e, cx) => { if (!invalid) view.saveSettings(cx); }, { solid: !invalid })));
}

// ---- help -------------------------------------------------------------------

export function helpPage(view, t) {
  const back = (_e, cx) => {
    view.page = view.helpBack ?? "list";
    view.helpBack = null;
    cx.notify();
  };
  const notes = [
    "Tokens separated by spaces must all hold.",
    "OR (in capitals) between groups means either group may match.",
    "Commas in a token mean any of: #ENG,OPS.",
    "A leading - negates: -l:bug.",
    'Quote values with spaces: p:"BFCM 2026".',
    "A query starting with { is a raw Linear IssueFilter in JSON.",
  ];
  return v_flex().size_full().min_h(0)
    .child(h_flex().h(42).flex_none().pl(6).pr(8).gap(6).items_center().border_b(1).border_color(t.border)
      .child(iconButton(t, "lp-back-help", "chevron-left", back, { tip: "Back" }))
      .child(div().flex_1().font_semibold().text_color(t.foreground).child("Query syntax")))
    .child(v_flex().id("lp-help").flex_1().min_h(0).overflow_y_scrollbar().px(14).py(12).gap(12)
      .child(v_flex().gap(3).text_size(12).text_color(t.muted).children(notes.map((n) => div().child(n))))
      .child(v_flex().border_t(1).border_color(t.border)
        .children(SYNTAX.map(([token, meaning], i) => h_flex().id(`lp-syntax-${i}`).py(6).gap(10).items_start()
          .border_b(1).border_color(t.border)
          .child(div().w(132).flex_none().font_family("JetBrains Mono").text_size(11.5).text_color(t.foreground).child(token))
          .child(div().flex_1().min_w(0).text_size(12).text_color(t.muted).child(meaning)))))
      .child(div().text_size(11.5).text_color(t.dim).child(
        "Without s:, the Status dropdown picks the statuses. The search box filters the shown view by title as you type.")));
}

// ---- first run --------------------------------------------------------------

function code(t, text) {
  return div().px(8).py(5).bg(t.background).border_1().border_color(t.border)
    .font_family("JetBrains Mono").text_size(11.5).text_color(t.foreground).child(text);
}

export function setupPage(view, t) {
  const p = view.problem;
  const again = button(t, "lp-check-again", "Check again", (_e, cx) => {
    linear.forget();
    view.problem = null;
    view.refresh(cx);
  }, { solid: true });
  const lines = p.kind === "missing"
    ? [
      div().text_size(13).font_semibold().text_color(t.foreground).child("Install the linear command"),
      div().text_size(12).text_color(t.muted).child("This panel reads Linear through the linear CLI (github.com/schpet/linear-cli). With Homebrew:"),
      code(t, "brew install schpet/tap/linear"),
      div().text_size(12).text_color(t.muted).child("Or download a release binary from github.com/schpet/linear-cli/releases and put it in ~/.local/bin."),
      div().text_size(12).text_color(t.muted).child("Then log in:"),
      code(t, "linear auth login"),
    ]
    : [
      div().text_size(13).font_semibold().text_color(t.foreground).child("Log in to Linear"),
      div().text_size(12).text_color(t.muted).child("The linear CLI isn't logged in. Create a personal API key at linear.app/settings/account/security, then run this in a terminal and paste the key:"),
      code(t, "linear auth login"),
      div().text_size(11.5).text_color(t.dim).child(p.message),
    ];
  return v_flex().size_full().min_h(0)
    .child(h_flex().h(42).flex_none().px(14).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().text_color(t.foreground).child("Linear")))
    .child(v_flex().px(14).py(14).gap(8).children(lines)
      .child(h_flex().pt(4).gap(8)
        .child(again)
        .when(p.kind === "auth", (el) => el.child(button(t, "lp-login", "Log in in a new tab", () => {
          run("tab.new", { name: "linear login", argv: ["linear", "auth", "login"] });
        })))));
}
