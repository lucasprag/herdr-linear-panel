// Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuery, viewFilter, statusFilter, statusOf, tokenize, splitValues, DEFAULT_STATUSES } from "../app/mods/linear-panel/query.js";

const f = (q) => {
  const r = parseQuery(q);
  assert.equal(r.error, null, r.error);
  return r.filter;
};

test("tokenize keeps quoted spaces together", () => {
  assert.deepEqual(tokenize(' p:"BFCM 2026"  l:bug  '), ['p:"BFCM 2026"', "l:bug"]);
  assert.deepEqual(splitValues('"tech debt",bug'), ["tech debt", "bug"]);
});

test("empty query matches everything", () => {
  assert.deepEqual(f(""), {});
  assert.deepEqual(f("   "), {});
});

test("assignee: me, a name, nobody", () => {
  assert.deepEqual(f("@me"), { assignee: { isMe: { eq: true } } });
  assert.deepEqual(f("@none"), { assignee: { null: true } });
  assert.deepEqual(f("@alex"), {
    assignee: { or: [{ name: { containsIgnoreCase: "alex" } }, { displayName: { containsIgnoreCase: "alex" } }] },
  });
});

test("assignee commas mean any of, with or without a second @", () => {
  const a = f("@me,alex");
  assert.deepEqual(a, f("@me,@alex"));
  assert.equal(a.assignee.or.length, 2);
  assert.deepEqual(a.assignee.or[0], { isMe: { eq: true } });
});

test("negated assignee keeps unassigned issues", () => {
  assert.deepEqual(f("-@me"), { assignee: { or: [{ null: true }, { isMe: { eq: false } }] } });
  assert.deepEqual(f("-@none"), { assignee: { null: false } });
});

test("team keys are upper-cased; commas are any of", () => {
  assert.deepEqual(f("#eng"), { team: { key: { in: ["ENG"] } } });
  assert.deepEqual(f("#ENG,OPS"), { team: { key: { in: ["ENG", "OPS"] } } });
  assert.deepEqual(f("-#ENG"), { team: { key: { nin: ["ENG"] } } });
});

test("labels, quoted and negated", () => {
  assert.deepEqual(f("l:bug"), { labels: { some: { name: { eqIgnoreCase: "bug" } } } });
  assert.deepEqual(f('l:"tech debt"'), { labels: { some: { name: { eqIgnoreCase: "tech debt" } } } });
  assert.deepEqual(f("l:bug,feature"), {
    labels: { some: { or: [{ name: { eqIgnoreCase: "bug" } }, { name: { eqIgnoreCase: "feature" } }] } },
  });
  assert.deepEqual(f("-l:bug"), { labels: { every: { name: { neqIgnoreCase: "bug" } } } });
});

test("project: contains, none, quoted", () => {
  assert.deepEqual(f("p:bfcm"), { project: { name: { containsIgnoreCase: "bfcm" } } });
  assert.deepEqual(f("p:none"), { project: { null: true } });
  assert.deepEqual(f('p:"BFCM 2026"'), { project: { name: { containsIgnoreCase: "BFCM 2026" } } });
  assert.deepEqual(f("-p:bfcm"), { project: { or: [{ null: true }, { name: { notContainsIgnoreCase: "bfcm" } }] } });
});

test("priority names become numbers", () => {
  assert.deepEqual(f("pri:urgent,high"), { priority: { in: [1, 2] } });
  assert.deepEqual(f("pri:none"), { priority: { in: [0] } });
  assert.deepEqual(f("-pri:low"), { priority: { nin: [4] } });
  assert.match(parseQuery("pri:whenever").error, /Unknown priority/);
});

test("status tokens set the status and split at the issue level", () => {
  const r = parseQuery("s:todo,review");
  assert.equal(r.setsStatus, true);
  assert.deepEqual(r.filter, {
    or: [
      { and: [{ state: { type: { eq: "started" } } }, { state: { name: { containsIgnoreCase: "review" } } }] },
      { state: { type: { eq: "unstarted" } } },
    ],
  });
  assert.deepEqual(f("s:triage"), { state: { type: { eq: "triage" } } });
  assert.match(parseQuery("s:someday").error, /Unknown status/);
  assert.equal(parseQuery("@me").setsStatus, false);
});

test("negated status is every other status", () => {
  const r = parseQuery("-s:done,canceled");
  assert.equal(r.filter.or.length, 5);
});

test("cycle: current or a number", () => {
  assert.deepEqual(f("c:current"), { cycle: { isActive: { eq: true } } });
  assert.deepEqual(f("c:12"), { cycle: { number: { eq: 12 } } });
  assert.match(parseQuery("c:soon").error, /Unknown cycle/);
});

test("creator and subscriber", () => {
  assert.deepEqual(f("by:me"), { creator: { isMe: { eq: true } } });
  assert.deepEqual(f("sub:me"), { subscribers: { some: { isMe: { eq: true } } } });
  assert.deepEqual(f("-sub:me"), { subscribers: { every: { isMe: { eq: false } } } });
});

test("other words search the title, all of them", () => {
  assert.deepEqual(f("login"), { title: { containsIgnoreCase: "login" } });
  assert.deepEqual(f("login bug"), {
    and: [{ title: { containsIgnoreCase: "login" } }, { title: { containsIgnoreCase: "bug" } }],
  });
  assert.deepEqual(f("-flaky"), { title: { notContainsIgnoreCase: "flaky" } });
  assert.deepEqual(f('"two words"'), { title: { containsIgnoreCase: "two words" } });
  // A lone dash is a word, not a negation.
  assert.deepEqual(f("-"), { title: { containsIgnoreCase: "-" } });
});

test("tokens are and-ed; OR (capitals) splits groups", () => {
  assert.deepEqual(f("@me #ENG"), { and: [{ assignee: { isMe: { eq: true } } }, { team: { key: { in: ["ENG"] } } }] });
  assert.deepEqual(f("@me OR @none"), { or: [{ assignee: { isMe: { eq: true } } }, { assignee: { null: true } }] });
  // Lower-case "or" is a title word.
  assert.deepEqual(f("@me or"), { and: [{ assignee: { isMe: { eq: true } } }, { title: { containsIgnoreCase: "or" } }] });
});

test("a query starting with { is a raw IssueFilter", () => {
  const r = parseQuery('{"priority":{"eq":1}}');
  assert.deepEqual(r.filter, { priority: { eq: 1 } });
  assert.equal(r.setsStatus, false);
  assert.equal(parseQuery('{"state":{"type":{"eq":"triage"}}}').setsStatus, true);
  assert.match(parseQuery("{nope").error, /Invalid JSON/);
});

test("viewFilter adds the dropdown's statuses and leaves sub-issues out", () => {
  const v = viewFilter("@me", { statuses: ["todo"], subIssues: false });
  assert.deepEqual(v.filter, {
    and: [{ assignee: { isMe: { eq: true } } }, { state: { type: { eq: "unstarted" } } }, { parent: { null: true } }],
  });
  const w = viewFilter("@me", { statuses: ["todo"], subIssues: true });
  assert.equal(w.filter.and.length, 2);
});

test("viewFilter: a query with s: ignores the dropdown", () => {
  const v = viewFilter("s:triage", { statuses: [], subIssues: true });
  assert.equal(v.noStatus, false);
  assert.deepEqual(v.filter, { state: { type: { eq: "triage" } } });
});

test("viewFilter: no status chosen means nothing to ask for", () => {
  const v = viewFilter("@me", { statuses: [] });
  assert.equal(v.noStatus, true);
  assert.equal(v.filter, null);
});

test("viewFilter defaults to Todo, In Progress and In Review", () => {
  assert.deepEqual(DEFAULT_STATUSES, ["todo", "progress", "review"]);
  assert.deepEqual(viewFilter("").filter.and[0], statusFilter(DEFAULT_STATUSES));
});

test("statusOf sorts states into buckets", () => {
  assert.equal(statusOf({ type: "started", name: "In Progress" }), "progress");
  assert.equal(statusOf({ type: "started", name: "In Review" }), "review");
  assert.equal(statusOf({ type: "started", name: "Code review" }), "review");
  assert.equal(statusOf({ type: "unstarted", name: "Todo" }), "todo");
  assert.equal(statusOf({ type: "completed", name: "Done" }), "done");
  assert.equal(statusOf({ type: "canceled", name: "Duplicate" }), "canceled");
  assert.equal(statusOf({ type: "triage", name: "Triage" }), "triage");
  assert.equal(statusOf({ type: "backlog", name: "Backlog" }), "backlog");
});
