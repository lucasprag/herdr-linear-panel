// linear-panel: Linear issues in a Herdr side panel.
//
// Everything goes through the `linear` CLI (linear.js). Views are queries in
// a small language (query.js); prefs live in Herdr's shared state under
// "linear-panel.prefs", so they survive layout rebuilds. One View, five pages:
// the list (list.js), an issue (issue.js), settings, help and first-run setup
// (pages.js).

import { View } from "gpui-kit";
import { v_flex, InputState } from "gpui-base";
import { theme, nextCommand } from "herdr";
import * as linear from "./linear.js";
import { viewFilter } from "./query.js";
import { readPrefs, writePrefs, selectedView, dataKey } from "./prefs.js";
import { listPage } from "./list.js";
import { issuePage } from "./issue.js";
import { settingsPage, helpPage, setupPage, newDraftView } from "./pages.js";

const REFRESH_MS = 2 * 60 * 1000; // gently: Herdr keeps hidden copies running
const SYNC_MS = 3000; // notices prefs changed by another copy
const SPIN_MS = 900;

export default class LinearPanel extends View {
  init(_props, cx) {
    this.page = "list"; // list | issue | settings | help
    this.results = {}; // view id -> { issues, more, setsStatus, error, noStatus }
    this.busy = false;
    this.problem = null; // { kind: "missing" | "auth", message }: the setup page
    this.banner = null; // a transient problem (Linear unreachable); data stays
    this.avatars = {}; // user id + url -> image path | false
    this.statusOpen = false;
    this.search = InputState.new({ placeholder: "Search issues" });
    this.search.on("change", (_e, cx) => cx.notify());
    // The issue page.
    this.stack = []; // issue ids, last is shown
    this.detail = null; // { id, issue, error }
    this.write = null; // { state: "checking" | "on" | "off" | "unknown", message }
    this.teamOptions = {}; // team id -> { me, states, members } | "loading"
    this.picker = null; // "status" | "priority" | "assignee"
    this.editError = null;
    this.saving = false;
    // Settings.
    this.draft = null;

    this.refresh(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
    cx.timer.every(SYNC_MS, (cx) => {
      if (!this.busy && this.loadedKey && dataKey(readPrefs()) !== this.loadedKey) this.refresh(cx);
    });
    // keys.json / `herdr-app do`: linear-panel.refresh, .open:<ID>, .back,
    // .help, .settings, .status, .search, .view:<name>, .add-view:<name>=<query>.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        this.command(c, cx);
        cx.notify();
      }
    });
  }

  command(c, cx) {
    const i = c.indexOf(":");
    const name = i < 0 ? c : c.slice(0, i);
    const arg = i < 0 ? "" : c.slice(i + 1);
    if (name === "refresh") this.refresh(cx);
    else if (name === "open" && arg) this.openIssue(arg, cx);
    else if (name === "back") this.back(cx);
    else if (name === "help") this.page = "help";
    else if (name === "settings") this.openSettings(cx);
    else if (name === "status") { this.page = "list"; this.statusOpen = !this.statusOpen; }
    else if (name === "search") { this.page = "list"; this.search.focus(); }
    else if (name === "view" && arg) {
      const v = readPrefs().views.find((v) => v.name.toLowerCase() === arg.toLowerCase() || v.id === arg);
      if (v) writePrefs({ selected: v.id });
      this.page = "list";
    }
    else if (name === "add-view" && arg.includes("=")) this.addView(arg);
  }

  // `add-view:<name>=<query>`: adds the view and selects it; a view with that
  // name already gets the new query instead.
  addView(arg) {
    const eq = arg.indexOf("=");
    const viewName = arg.slice(0, eq).trim();
    const query = arg.slice(eq + 1).trim();
    if (!viewName || !query) return;
    const views = readPrefs().views;
    const same = views.find((v) => v.name.toLowerCase() === viewName.toLowerCase());
    if (same) {
      writePrefs({ views: views.map((v) => (v === same ? { ...v, query } : v)), selected: same.id });
    } else {
      const base = viewName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "view";
      let id = base;
      for (let n = 2; views.some((v) => v.id === id); n++) id = `${base}-${n}`;
      writePrefs({ views: [...views, { id, name: viewName, query }], selected: id });
    }
    this.page = "list";
  }

  // ---- the list's data -----------------------------------------------------

  refresh(cx) {
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    cx.notify(); // spin the refresh icon now
    const started = Date.now();
    cx.spawn(async (cx) => {
      do {
        this.again = false;
        const prefs = readPrefs();
        this.loadedKey = dataKey(prefs);
        const first = selectedView(prefs);
        try {
          // The shown view first, then the rest for their tab counts.
          await this.load(first, prefs);
          this.problem = null;
          cx.notify();
          await Promise.all(prefs.views.filter((v) => v !== first).map((v) => this.load(v, prefs)));
        } catch (e) {
          if (e?.kind === "missing" || e?.kind === "auth") this.problem = { kind: e.kind, message: String(e.message) };
          else this.banner = String(e?.message ?? e);
        }
      } while (this.again);
      cx.notify();
      await this.fetchAvatars(Object.values(this.results).flatMap((r) => r.issues ?? []).flatMap((i) => [i.assignee, i.delegate]), cx);
      const left = SPIN_MS - (Date.now() - started);
      if (left > 0) await cx.sleep(left);
      this.busy = false;
      cx.notify();
    });
  }

  async load(view, prefs) {
    const vf = viewFilter(view.query, prefs);
    if (vf.error) {
      this.results[view.id] = { issues: [], error: vf.error, setsStatus: vf.setsStatus };
      return;
    }
    if (vf.noStatus) {
      this.results[view.id] = { issues: [], noStatus: true, setsStatus: false };
      return;
    }
    try {
      const r = await linear.issues(vf.filter);
      this.results[view.id] = { issues: r.issues, more: r.more, setsStatus: vf.setsStatus };
      this.banner = null;
    } catch (e) {
      if (e?.kind === "graphql") this.results[view.id] = { issues: [], error: String(e.message), setsStatus: vf.setsStatus };
      else throw e;
    }
  }

  async fetchAvatars(users, cx) {
    let changed = false;
    for (const u of users) {
      if (!u?.avatarUrl) continue;
      const key = `${u.id} ${u.avatarUrl}`;
      if (key in this.avatars) continue;
      this.avatars[key] = false;
      try {
        this.avatars[key] = (await linear.avatar(u)) ?? false;
      } catch {}
      if (this.avatars[key]) changed = true;
    }
    if (changed) cx.notify();
  }

  avatarPath(user) {
    if (!user?.avatarUrl) return null;
    return this.avatars[`${user.id} ${user.avatarUrl}`] || null;
  }

  // ---- the issue page ------------------------------------------------------

  openIssue(id, cx) {
    this.page = "issue";
    if (this.stack[this.stack.length - 1] !== id) this.stack.push(id);
    this.loadIssue(cx);
  }

  back(cx) {
    if (this.page === "issue") {
      this.stack.pop();
      if (this.stack.length) {
        this.loadIssue(cx);
        return;
      }
    }
    this.page = "list";
    this.picker = null;
    this.draft = null;
    cx.notify();
  }

  loadIssue(cx) {
    const id = this.stack[this.stack.length - 1];
    this.detail = { id, issue: null, error: null };
    this.picker = null;
    this.editError = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const issue = await linear.issue(id);
        if (this.detail?.id !== id) return;
        if (!issue) throw new Error(`${id} wasn't found.`);
        this.detail.issue = issue;
        cx.notify();
        await this.fetchAvatars([issue.assignee, issue.delegate, issue.creator], cx);
      } catch (e) {
        if (this.detail?.id === id) this.detail.error = String(e?.message ?? e);
      }
      cx.notify();
      // Never blocks reading: the issue is already on screen.
      if (this.write === null) this.checkWrite(cx);
    });
  }

  checkWrite(cx) {
    this.write = { state: "checking", message: null };
    cx.notify();
    cx.spawn(async (cx) => {
      this.write = await linear.writeAccess();
      cx.notify();
    });
  }

  canEdit() {
    return this.write?.state === "on" || this.write?.state === "unknown";
  }

  openPicker(kind, cx) {
    this.picker = kind;
    this.editError = null;
    const team = this.detail?.issue?.team?.id;
    if (team && !this.teamOptions[team]) {
      this.teamOptions[team] = "loading";
      cx.spawn(async (cx) => {
        try {
          const o = await linear.teamOptions(team);
          this.teamOptions[team] = o;
          cx.notify();
          await this.fetchAvatars(o.members, cx);
        } catch (e) {
          delete this.teamOptions[team];
          this.editError = String(e?.message ?? e);
        }
        cx.notify();
      });
    }
    cx.notify();
  }

  // Status, priority or assignee: an IssueUpdateInput.
  change(input, cx) {
    const issue = this.detail?.issue;
    if (!issue || this.saving) return;
    this.picker = null;
    this.saving = true;
    this.editError = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await linear.updateIssue(issue.id, input);
        this.saving = false;
        this.loadIssue(cx);
        this.refresh(cx);
      } catch (e) {
        this.saving = false;
        this.editError = String(e?.message ?? e);
        if (/scope|permission|forbidden|read[- ]?only|not allowed/i.test(this.editError)) this.write = { state: "off", message: this.editError };
      }
      cx.notify();
    });
  }

  // ---- settings ------------------------------------------------------------

  openSettings(cx, opts = {}) {
    const prefs = readPrefs();
    this.draft = { views: prefs.views.map((v) => newDraftView(v, cx)) };
    if (opts.add) {
      const v = newDraftView({ name: "New view", query: "" }, cx);
      this.draft.views.push(v);
      v.name.focus();
    }
    this.page = "settings";
    cx.notify();
  }

  saveSettings(cx) {
    const views = this.draft.views.map((d) => ({ id: d.id, name: d.name.value().trim() || "Untitled", query: d.query.value().trim() }));
    if (!views.length) return;
    const prefs = readPrefs();
    const selected = views.some((v) => v.id === prefs.selected) ? prefs.selected : views[0].id;
    writePrefs({ views, selected });
    for (const id of Object.keys(this.results)) if (!views.some((v) => v.id === id)) delete this.results[id];
    this.draft = null;
    this.page = "list";
    this.refresh(cx);
  }

  render(cx) {
    const t = theme();
    const prefs = readPrefs();
    let page;
    if (this.page === "help") page = helpPage(this, t);
    else if (this.page === "settings" && this.draft) page = settingsPage(this, t, prefs);
    else if (this.problem) page = setupPage(this, t);
    else if (this.page === "issue" && this.detail) page = issuePage(this, t, prefs);
    else page = listPage(this, t, prefs);
    return v_flex().id("lp-root").size_full().min_h(0).bg(t.chrome).overflow_hidden().text_size(13).child(page);
  }
}
