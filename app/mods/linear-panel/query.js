// The view query language, turned into a Linear IssueFilter. Pure: no Herdr
// imports, so `node --test` can load it as is.
//
//   @me @alex @none      assignee            #ENG #ENG,OPS   team key
//   l:bug l:"tech debt"  label               p:bfcm p:none   project
//   pri:urgent,high      priority            s:todo,review   status
//   c:current c:12       cycle               by:me           creator
//   sub:me               subscriber          other words     title
//
// Tokens separated by spaces must all hold; `OR` (capitals) between groups
// means either group may match; commas mean any of; a leading `-` negates;
// quotes keep spaces in a value. A query starting with `{` is a raw
// IssueFilter in JSON.

// Status buckets, in the order the list groups them. In Progress and In
// Review are both Linear "started" states, told apart by the state's name.
export const STATUSES = [
  { key: "triage", label: "Triage" },
  { key: "progress", label: "In Progress" },
  { key: "review", label: "In Review" },
  { key: "todo", label: "Todo" },
  { key: "backlog", label: "Backlog" },
  { key: "done", label: "Done" },
  { key: "canceled", label: "Canceled" },
];

// What the Status dropdown offers (triage only through `s:triage`), and what
// it starts with.
export const PICKABLE = ["backlog", "todo", "progress", "review", "done", "canceled"];
export const DEFAULT_STATUSES = ["todo", "progress", "review"];

const TYPE = { triage: "triage", backlog: "backlog", todo: "unstarted", done: "completed", canceled: "canceled" };

export const PRIORITIES = { none: 0, urgent: 1, high: 2, medium: 3, low: 4 };
export const PRIORITY_LABELS = ["No priority", "Urgent", "High", "Medium", "Low"];

// The help table, as the help page and README show it.
export const SYNTAX = [
  ["@me  @alex  @none", "assigned to you, to someone by name, to nobody"],
  ["#ENG  #ENG,OPS", "in a team, by its key"],
  ['l:bug  l:"tech debt"', "has a label"],
  ["p:bfcm  p:none", "project name contains, or no project"],
  ["pri:urgent,high", "priority: urgent, high, medium, low, none"],
  ["s:triage  s:todo,review", "status: triage, backlog, todo, progress, review, done, canceled; replaces the Status dropdown"],
  ["c:current  c:12", "in the active cycle, or cycle number 12"],
  ["by:me", "created by"],
  ["sub:me", "subscribed to"],
  ["any other word", "in the title"],
];

/** The status bucket a Linear workflow state belongs to. */
export function statusOf(state) {
  const type = state?.type;
  if (type === "started") return /review/i.test(state?.name ?? "") ? "review" : "progress";
  if (type === "duplicate") return "canceled";
  for (const [key, t] of Object.entries(TYPE)) if (t === type) return key;
  return "todo";
}

function bucketFilter(key) {
  if (key === "progress") return { and: [{ state: { type: { eq: "started" } } }, { state: { name: { notContainsIgnoreCase: "review" } } }] };
  if (key === "review") return { and: [{ state: { type: { eq: "started" } } }, { state: { name: { containsIgnoreCase: "review" } } }] };
  // Duplicates are their own state type; they count as canceled.
  if (key === "canceled") return { state: { type: { in: ["canceled", "duplicate"] } } };
  return { state: { type: { eq: TYPE[key] } } };
}

/** Issues in any of these buckets. Linear ignores an `or` nested inside
 *  `state`, so the split sits at the issue-filter level. */
export function statusFilter(keys) {
  const known = STATUSES.map((s) => s.key).filter((k) => keys.includes(k));
  if (!known.length) return null;
  if (known.length === 1) return bucketFilter(known[0]);
  return { or: known.map(bucketFilter) };
}

// ---- tokens ---------------------------------------------------------------

/** Splits on spaces outside double quotes. Quotes stay in the token. */
export function tokenize(text) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of String(text ?? "")) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && /\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Splits a value on commas outside quotes and drops the quotes. */
export function splitValues(text) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim()).filter(Boolean);
}

const PREFIXES = [
  ["@", "assignee"],
  ["#", "team"],
  ["l:", "label"],
  ["p:", "project"],
  ["pri:", "priority"],
  ["s:", "status"],
  ["c:", "cycle"],
  ["by:", "creator"],
  ["sub:", "subscriber"],
];

/** One token: { neg, kind, values }. Anything without a known prefix is a title word. */
export function readToken(raw) {
  let text = raw;
  let neg = false;
  if (text.length > 1 && text.startsWith("-")) {
    neg = true;
    text = text.slice(1);
  }
  const lower = text.toLowerCase();
  for (const [prefix, kind] of PREFIXES) {
    if (lower.startsWith(prefix) && text.length > prefix.length) {
      // `@me,@alex` and `@me,alex` both work.
      const values = splitValues(text.slice(prefix.length)).map((v) => (kind === "assignee" ? v.replace(/^@/, "") : kind === "team" ? v.replace(/^#/, "") : v));
      return { neg, kind, values };
    }
  }
  return { neg, kind: "title", values: splitValues(text) };
}

// ---- filters --------------------------------------------------------------

const one = (list, op) => (list.length === 1 ? list[0] : { [op]: list });

// A user field: me, none, or a name matched against full and display names.
function userMatch(v) {
  const l = v.toLowerCase();
  if (l === "me") return { isMe: { eq: true } };
  return { or: [{ name: { containsIgnoreCase: v } }, { displayName: { containsIgnoreCase: v } }] };
}
function userMiss(v) {
  const l = v.toLowerCase();
  if (l === "me") return { isMe: { eq: false } };
  return { and: [{ name: { notContainsIgnoreCase: v } }, { displayName: { notContainsIgnoreCase: v } }] };
}

// A nullable relation (assignee, creator, project, cycle). `none` means unset.
// Negated, an unset relation counts as "not that one" unless `none` is negated too.
function nullable(values, neg, match, miss) {
  const none = values.some((v) => v.toLowerCase() === "none");
  const rest = values.filter((v) => v.toLowerCase() !== "none");
  if (!neg) {
    const parts = [...(none ? [{ null: true }] : []), ...rest.map(match)];
    return one(parts, "or");
  }
  const misses = rest.map(miss);
  if (none) return misses.length ? { and: [{ null: false }, ...misses] } : { null: false };
  return { or: [{ null: true }, one(misses, "and")] };
}

class QueryError extends Error {}

function tokenFilter(tok) {
  const { neg, kind, values } = tok;
  if (!values.length) throw new QueryError(`Nothing after the ${kind} prefix`);
  switch (kind) {
    case "assignee":
      return { assignee: nullable(values, neg, userMatch, userMiss) };
    case "creator":
      return { creator: nullable(values, neg, userMatch, userMiss) };
    case "subscriber": {
      if (neg) return { subscribers: { every: one(values.map(userMiss), "and") } };
      return { subscribers: { some: one(values.map(userMatch), "or") } };
    }
    case "team": {
      const keys = values.map((v) => v.toUpperCase());
      return { team: { key: neg ? { nin: keys } : { in: keys } } };
    }
    case "label": {
      if (neg) return { labels: { every: one(values.map((v) => ({ name: { neqIgnoreCase: v } })), "and") } };
      return { labels: { some: one(values.map((v) => ({ name: { eqIgnoreCase: v } })), "or") } };
    }
    case "project":
      return {
        project: nullable(values, neg,
          (v) => ({ name: { containsIgnoreCase: v } }),
          (v) => ({ name: { notContainsIgnoreCase: v } })),
      };
    case "priority": {
      const nums = values.map((v) => {
        const n = PRIORITIES[v.toLowerCase()];
        if (n === undefined) throw new QueryError(`Unknown priority "${v}" (urgent, high, medium, low, none)`);
        return n;
      });
      return { priority: neg ? { nin: nums } : { in: nums } };
    }
    case "status": {
      const keys = values.map((v) => {
        const k = v.toLowerCase();
        if (!STATUSES.some((s) => s.key === k)) throw new QueryError(`Unknown status "${v}" (triage, backlog, todo, progress, review, done, canceled)`);
        return k;
      });
      const chosen = neg ? STATUSES.map((s) => s.key).filter((k) => !keys.includes(k)) : keys;
      // Every status negated: nothing can match.
      return statusFilter(chosen) ?? { id: { eq: "00000000-0000-0000-0000-000000000000" } };
    }
    case "cycle": {
      const check = (v) => {
        const l = v.toLowerCase();
        if (l === "current" || /^\d+$/.test(l)) return;
        throw new QueryError(`Unknown cycle "${v}" (current or a number)`);
      };
      values.forEach(check);
      return {
        cycle: nullable(values, neg,
          (v) => (v.toLowerCase() === "current" ? { isActive: { eq: true } } : { number: { eq: Number(v) } }),
          (v) => (v.toLowerCase() === "current" ? { isActive: { eq: false } } : { number: { neq: Number(v) } })),
      };
    }
    default: {
      if (neg) return one(values.map((v) => ({ title: { notContainsIgnoreCase: v } })), "and");
      return one(values.map((v) => ({ title: { containsIgnoreCase: v } })), "or");
    }
  }
}

function hasKey(value, key) {
  if (Array.isArray(value)) return value.some((v) => hasKey(v, key));
  if (value && typeof value === "object") return Object.entries(value).some(([k, v]) => k === key || hasKey(v, key));
  return false;
}

/**
 * Parses a view's query.
 * Returns { filter, setsStatus, error }: `filter` is an IssueFilter ({} matches
 * everything), `setsStatus` says the query picks statuses itself (so the
 * Status dropdown steps aside), `error` is a message for the person, with
 * `filter` null.
 */
export function parseQuery(text) {
  const src = String(text ?? "").trim();
  if (src.startsWith("{")) {
    try {
      const filter = JSON.parse(src);
      if (!filter || typeof filter !== "object" || Array.isArray(filter)) throw new Error("not an object");
      return { filter, setsStatus: hasKey(filter, "state"), error: null };
    } catch (e) {
      return { filter: null, setsStatus: false, error: `Invalid JSON filter: ${e.message}` };
    }
  }
  const groups = [[]];
  for (const raw of tokenize(src)) {
    if (raw === "OR") groups.push([]);
    else groups[groups.length - 1].push(raw);
  }
  let setsStatus = false;
  try {
    const parts = groups.filter((g) => g.length).map((g) => {
      const filters = g.map((raw) => {
        const tok = readToken(raw);
        if (tok.kind === "status") setsStatus = true;
        return tokenFilter(tok);
      });
      return one(filters, "and");
    });
    const filter = parts.length === 0 ? {} : one(parts, "or");
    return { filter, setsStatus, error: null };
  } catch (e) {
    if (e instanceof QueryError) return { filter: null, setsStatus, error: e.message };
    throw e;
  }
}

/**
 * The whole filter for one view: its query, the Status dropdown's choice
 * (unless the query sets statuses), and sub-issues left out on the server
 * unless asked for. Returns { filter, setsStatus, error, noStatus }; with
 * `noStatus` there is nothing to ask for (no status chosen).
 */
export function viewFilter(query, { statuses = DEFAULT_STATUSES, subIssues = false } = {}) {
  const parsed = parseQuery(query);
  if (parsed.error) return { ...parsed, noStatus: false };
  const parts = [];
  if (Object.keys(parsed.filter).length) parts.push(parsed.filter);
  if (!parsed.setsStatus) {
    const sf = statusFilter(statuses);
    if (!sf) return { filter: null, setsStatus: false, error: null, noStatus: true };
    parts.push(sf);
  }
  if (!subIssues) parts.push({ parent: { null: true } });
  const filter = parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { and: parts };
  return { filter, setsStatus: parsed.setsStatus, error: null, noStatus: false };
}
