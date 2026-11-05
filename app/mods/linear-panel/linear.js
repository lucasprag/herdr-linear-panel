// The panel's only way to Linear: the `linear` CLI (github.com/schpet/linear-cli)
// and its GraphQL passthrough, `linear api`. The CLI keeps its own login, so the
// panel never sees or stores an API key.

import { exec, home, appHome } from "herdr";
import { exists, mkdir } from "fs/promises";

// Why a call failed, so the panel can say what to do about it.
//   missing: no `linear` binary          auth: not logged in or key rejected
//   network: Linear unreachable/limited  graphql: Linear answered with errors
export class LinearError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

let bin = null;

/** Finds `linear` in ~/.local/bin, Homebrew's folders, then PATH. */
export async function binary() {
  if (bin) return bin;
  for (const c of [`${home()}/.local/bin/linear`, "/opt/homebrew/bin/linear", "/usr/local/bin/linear"]) {
    try {
      if (await exists(c)) return (bin = c);
    } catch {}
  }
  try {
    const r = await exec("/usr/bin/which", ["linear"]);
    const found = r.stdout.trim().split("\n")[0];
    if (r.code === 0 && found) return (bin = found);
  } catch {}
  throw new LinearError("missing", "The linear command isn't installed.");
}

/** Forgets the binary, so "Check again" looks for it afresh. */
export function forget() {
  bin = null;
}

function firstError(text) {
  try {
    const j = JSON.parse(text);
    const e = j?.errors?.[0];
    if (e) return { message: e.extensions?.userPresentableMessage || e.message || "Linear returned an error", type: e.extensions?.type ?? "", code: e.extensions?.code ?? "" };
  } catch {}
  return null;
}

/** Runs one GraphQL document; resolves with `data`, rejects with a LinearError. */
export async function api(document, variables = {}) {
  const b = await binary();
  let r;
  try {
    r = await exec(b, ["api", "--no-input", document, "--variables-json", JSON.stringify(variables)]);
  } catch (e) {
    bin = null;
    throw new LinearError("missing", String(e?.message ?? e));
  }
  const err = firstError(r.stdout) ?? firstError(r.stderr);
  if (r.code === 4) throw new LinearError("auth", err?.message ?? "The linear CLI isn't logged in.");
  if (r.code === 5) throw new LinearError("network", err?.message ?? "Linear can't be reached right now.");
  if (r.code !== 0 || err) {
    const text = err?.message ?? (r.stderr || r.stdout || `linear exited ${r.code}`).trim().split("\n")[0];
    throw new LinearError("graphql", text);
  }
  try {
    return JSON.parse(r.stdout).data;
  } catch {
    throw new LinearError("graphql", "Couldn't read the linear CLI's answer.");
  }
}

// ---- documents ------------------------------------------------------------

const USER = "id name displayName avatarUrl app";

// One issue line's worth. The description waits for the details page.
const ISSUE_FIELDS = `
  id identifier title url priority createdAt updatedAt
  state { id name type color }
  assignee { ${USER} }
  delegate { ${USER} }
  team { id key name }
  project { id name }
  cycle { id number name }
  parent { id identifier title }
  children { nodes { id } }
  labels { nodes { id name color } }`;

export const PAGE_SIZE = 250;

/** One page of issues for a filter: { issues, more }. */
export async function issues(filter) {
  const data = await api(
    `query LinearPanelIssues($filter: IssueFilter, $first: Int) {
      issues(filter: $filter, first: $first, orderBy: updatedAt) {
        nodes { ${ISSUE_FIELDS} }
        pageInfo { hasNextPage }
      }
    }`,
    { filter, first: PAGE_SIZE });
  return { issues: data.issues.nodes, more: data.issues.pageInfo.hasNextPage };
}

/** One issue with its description, sub-issues and the team's statuses and people. */
export async function issue(id) {
  const data = await api(
    `query LinearPanelIssue($id: String!) {
      issue(id: $id) {
        ${ISSUE_FIELDS}
        description
        creator { ${USER} }
        subIssues: children(first: 100) { nodes { id identifier title state { id name type color } } }
      }
    }`,
    { id });
  return data.issue;
}

/** A team's workflow states and members, for the pickers. */
export async function teamOptions(teamId) {
  const data = await api(
    `query LinearPanelTeam($id: String!) {
      viewer { id }
      team(id: $id) {
        states { nodes { id name type color position } }
        members(first: 250) { nodes { ${USER} active } }
      }
    }`,
    { id: teamId });
  return {
    me: data.viewer.id,
    states: data.team.states.nodes,
    members: data.team.members.nodes.filter((m) => m.active !== false),
  };
}

/** Changes an issue's status, priority or assignee: input is IssueUpdateInput. */
export async function updateIssue(id, input) {
  const data = await api(
    `mutation LinearPanelUpdate($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success }
    }`,
    { id, input });
  if (!data?.issueUpdate?.success) throw new LinearError("graphql", "Linear didn't save the change.");
}

// The nil id names no issue, so this update can't change anything. Linear
// checks the key's permission before it looks the issue up: a key that can
// only read is refused ("on" never comes back), a key that can write gets
// "not found".
const NOBODY = "00000000-0000-0000-0000-000000000000";

/** Whether the CLI's key may write: "on", "off" or "unknown" (with a message). */
export async function writeAccess() {
  try {
    await api(`mutation LinearPanelCanWrite { issueUpdate(id: "${NOBODY}", input: {}) { success } }`);
    return { state: "on", message: null };
  } catch (e) {
    const text = String(e?.message ?? e);
    if (e.kind === "graphql" && /scope|permission|forbidden|read[- ]?only|not allowed/i.test(text)) return { state: "off", message: text };
    if (e.kind === "graphql" && /not found|could not find|doesn't exist|does not exist|entity/i.test(text)) return { state: "on", message: null };
    // Unreachable, logged out, or an answer we don't recognize: say so, and
    // let an edit try (its own error shows if it fails).
    return { state: "unknown", message: text };
  }
}

// ---- avatars ----------------------------------------------------------------

// Cached under Herdr's data folder, never the mod's own (a file written there
// reloads the mod). Named by user id and a hash of the URL, so a new picture
// gets a new file.
export const AVATAR_DIR = "data/linear-panel/avatars";
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif", "image/webp": "webp" };

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Downloads a user's avatar once; resolves with its path for `image()`, or null. */
export async function avatar(user) {
  if (!user?.avatarUrl) return null;
  const dir = `${appHome()}/${AVATAR_DIR}`;
  const base = `${user.id}-${hash(user.avatarUrl)}`;
  for (const ext of new Set(Object.values(EXT))) {
    try {
      if (await exists(`${dir}/${base}.${ext}`)) return `${AVATAR_DIR}/${base}.${ext}`;
    } catch {}
  }
  try { await mkdir(dir, { recursive: true }); } catch {}
  const part = `${dir}/${base}.part`;
  const r = await exec("curl", ["-fsSL", "--max-time", "10", "-o", part, "-w", "%{content_type}", user.avatarUrl]);
  const ext = EXT[r.stdout.trim().split(";")[0].toLowerCase()];
  if (r.code !== 0 || !ext) {
    await exec("rm", ["-f", part]).catch(() => {});
    return null;
  }
  const mv = await exec("mv", ["-f", part, `${dir}/${base}.${ext}`]);
  return mv.code === 0 ? `${AVATAR_DIR}/${base}.${ext}` : null;
}
