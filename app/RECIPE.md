# Linear panel

A side panel that lists Linear issues next to your terminals. The person picks a view from a row of tabs (each a saved query such as `@me` or `s:triage`, with its issue count), narrows it with a search box, a Status dropdown and a Sub-issues toggle, and sees the issues grouped by status, one line each: identifier, status icon, title and the assignee's avatar. Clicking an issue pushes its details page: status, priority, assignee, delegate, team, project, cycle, parent, labels, sub-issues and the description, with buttons to open it in the browser or copy its link or identifier. When the Linear key can write, status, priority and assignee are pickers there. Everything goes through the `linear` CLI, which keeps the login.

(No preview image is committed yet: a screenshot for `preview.png` should show a demo workspace, not real work issues.)

## What you see

The panel fills a block, normally a side panel stack 368px wide, on the theme's `chrome` background at text size 13. It's flat and square: no rounded corners, rows edge to edge.

- **Header, 42px, 1px `border` line below.** "Linear" (semibold, `foreground`) and the number of issue lines shown, at 12 in `dim`. On the right three 26px icon buttons in `dim` with a `hover` background: help (circled `?`), settings (gear) and refresh (two arrows, turning once every 900ms while loading).
- **Filter bar**, no outer padding, 8px between its rows:
  - Search box, 30px tall, full width, fill `#ffffff06`: a 13px magnifier in `dim`, then an input with placeholder "Search issues". An `x` clears it when there is text.
  - View tabs, 28px tall, full width, fill `#ffffff06`. Each tab takes an equal share: its name at 12 (`foreground` and medium weight when selected, `muted` otherwise) and its count at 11.5 in `dim` ("250+" when Linear had more). The selected tab and a hovered one get `#ffffff10`. A 28px `+` at the end.
  - A 28px row: the Status dropdown (fills the row, 1px `border`): the chosen statuses' icons at 12px, "Status" in `muted`, a chevron at the right. Then a "Sub-issues" button (1px `border`, a branching icon), `muted` when off, `foreground` on `#ffffff10` when on.
  - 4px below the bar, then the list.
- **The list** scrolls; no padding at its top or bottom. Status groups in this order: Triage, In Progress, In Review, Todo, Backlog, Done, Canceled; empty groups don't show.
  - Group header, 30px, fill `#ffffff06`, square, no gap between sections: a 12px chevron (down open, right collapsed) in `dim`, the status icon at 14px in the state's Linear color, the name (semibold, `foreground`) and the count at 12 in `dim`.
  - Issue line, 31px, 14px side padding, `hover` background: identifier at 12 in `muted` (at least 62px wide, so the icons line up), the status icon at 13px in its state's color, the title at 12.8 medium in `foreground` (truncates), and for a sub-issue a dim "in ENG-123" (its parent) after the title. On the right, the 18px avatar: people are circles, agents rounded squares; a colored initial on a color picked from the user id when there's no picture; when an agent is the delegate, the assignee's then the agent's. With "Show priority" on, a priority icon sits before the status icon.
  - Within a group: urgent first, no priority last, then the most recently updated.
  - Empty states at 12 in `dim`: "Loading issues…", "No issues match these filters.", "Choose a status to see issues." A query error or a GraphQL error shows in `blocked` in place of the list.
- **Status icons** (own SVGs, 16px grid, tinted with the state's color): triage a ring with two arrows, backlog a dotted ring, todo an empty ring, in progress a ring half filled, in review a ring three-quarters filled, done a filled disc with a check cut out, canceled (and duplicate) a filled disc with an `x` cut out.
- **Priority icons**: none three dashes in `dim`; low, medium, high one, two, three bars full (the rest at 30%); urgent a filled square with `!` cut out, in `#f2994a`.
- **Status menu** (a popover under the dropdown, 210px, `popover` with a 1px `border` and a shadow): Backlog, Todo, In Progress, In Review, Done, Canceled, each 28px with a square checkbox (`accent` filled with a check when chosen), its icon and name. It stays open while toggling.
- **Issue page** (pushed over the list): a 42px header with a back chevron, the identifier (semibold) and three icon buttons: open in browser, copy link, copy identifier. Below, scrolling, 14px padding: the title at 15 semibold; label/value lines (labels 76px wide in `dim`): Status, Priority, Assignee, Delegate (only when there is one), Team, Project, Cycle ("None" in `dim` when unset), Parent (a clickable line), Labels (bordered chips with a color dot), Created ("3d ago by …") and Updated. Then "Sub-issues" with a count and one clickable line each, then "Description" as plain text, line by line ("No description." when empty; images become `[image …]`).
  - Editing off: a bordered box above the fields: "Editing is off", "The linear CLI's API key can only read, so status, priority and assignee can't be changed here. Create a key with write access in Linear's security settings (linear.app/settings/account/security), then run `linear auth login` with it.", Linear's own message in `dim`, and a "Check again" button.
  - Editing on: Status, Priority and Assignee values get a `hover` background and open a 240px popover menu (max 320px tall, scrolls): the team's states in status order, the five priorities, or Unassigned plus the team's people (you first, marked "(you)"). The current one has a check.
- **Settings page**: header with back and "Settings". "Views" with a one-line explanation and a `?` that opens the help; one bordered card per view with a name input, up/down/delete buttons (no delete for the last view) and a query input in JetBrains Mono, with the parse error under it in `blocked`. "Add a view" below. "List" with a "Show priority" checkbox. A footer with Cancel and Save (Save is solid; with an invalid query it isn't and says "Fix the query errors to save.").
- **Help page**: header with back and "Query syntax"; six rules (spaces mean all, `OR` in capitals, commas mean any of, `-` negates, quotes, `{` raw JSON); the token table (tokens in JetBrains Mono 11.5 in a 150px column, meanings in `muted`); a closing note about the Status dropdown and search.
- **First-run page**, in place of everything when `linear` is missing or not logged in: "Install the linear command" with `brew install schpet/tap/linear`, the release binary alternative (`~/.local/bin`) and `linear auth login`; or "Log in to Linear" with where to make a key and `linear auth login`, plus "Log in in a new tab". Both have "Check again".

## How it behaves

- **Loading:** on start, on the refresh button and every 2 minutes, the panel asks Linear for every view: the selected one first, the rest in parallel for their tab counts. One page of up to 250 issues per view, newest update first. A view with no status chosen asks for nothing.
- **Search** filters the shown view's issues by title or identifier as you type, in the panel; the header count follows.
- **Tabs:** a click selects the view (remembered). `+` opens Settings with a new view ready to name.
- **Status dropdown:** toggles statuses and reloads. Defaults to Todo, In Progress and In Review. In Progress and In Review are both Linear "started" states: a started state whose name contains "review" is In Review. If the view's query has `s:`, the dropdown is dimmed, says "Status set by this view" and doesn't open.
- **Sub-issues:** off leaves sub-issues out on the server (`parent: { null: true }`); on shows them in their own status group, never nested.
- **Groups:** a click on a header collapses or opens it (remembered, the same for every view).
- **Issue page:** clicking a parent or a sub-issue opens it on top; back walks back, then to the list. Copying puts the text on the clipboard and posts a 2-second toast. Picking a status, priority or assignee saves it, reloads the issue and refreshes the list; an error shows in `blocked` above the fields.
- **Write check:** the first time an issue page opens, the panel asks Linear whether the key can write (see Watch out). The page shows before the answer; until it's known, values aren't pickers.
- **Settings:** edits stay in the form until Save; Cancel or back drops them. "Show priority" applies at once.
- **Problems:** no `linear` or not logged in shows the first-run page. Linear unreachable keeps the last issues and shows the message in a `blocked` line under the header.
- **Commands** (`keys.json` or `herdr-app do`): `linear-panel.refresh`, `.search`, `.status`, `.help`, `.settings`, `.back`, `.view:<name>`, `.open:<ID>`, `.add-view:<name>=<query>` (adds the view, or changes the query of the one with that name, and selects it).

## Built from

- **One mod, `linear-panel`**, `mod.json` `{ "place": "none", "title": "Linear" }`. One `View` (`main.js`) with five pages, drawn by `list.js` (list), `issue.js` (details), `pages.js` (settings, help, first run). `ui.js` has the icons, avatars and buttons; `prefs.js` the settings.
- **`query.js`**, pure (no Herdr imports, tested with `node --test` from `tests/query.test.mjs`): `parseQuery(text)` turns a query into a Linear `IssueFilter` plus whether it sets statuses; `viewFilter(query, { statuses, subIssues })` adds the dropdown's statuses and `parent: { null: true }`; `statusOf(state)` buckets a workflow state; `SYNTAX` is the help table. Status buckets: triage `type: triage`, backlog `backlog`, todo `unstarted`, in progress `started` and name not containing "review", in review `started` and name containing "review", done `completed`, canceled `canceled` or `duplicate`. Several statuses are an `or` of whole issue filters, never an `or` inside `state`.
- **Data** (`linear.js`): `exec(<linear>, ["api", "--no-input", <document>, "--variables-json", <json>])`. Exit 4 is "not logged in", 5 "unreachable", anything else with `errors` a GraphQL error. Queries: `issues(filter, first: 250, orderBy: updatedAt)` with identifier, title, url, priority, dates, `state {name type color}`, `assignee`/`delegate {id name displayName avatarUrl app}`, team, project, cycle, `parent {identifier title}`, `children {nodes {id}}`, labels and `pageInfo.hasNextPage`; `issue(id)` adds description, creator and `subIssues: children(first: 100)`; `team(id) { states members }` and `viewer { id }` for the pickers; `issueUpdate(id, input)` to save. `linear` is found in `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, then `which linear`.
- **Avatars:** `curl` into `<appHome>/data/linear-panel/avatars/<user id>-<url hash>.<ext>` (the extension from the response's content type), shown with `image("data/linear-panel/avatars/…")`.
- **Settings** in shared state `linear-panel.prefs`: `{ views: [{id, name, query}], selected, statuses, subIssues, collapsed, showPriority }`. A 3-second timer compares them with what was loaded, so another copy's change reloads this one.
- **`herdr` functions:** `exec`, `home`, `appHome`, `theme`, `shared`, `setShared`, `nextCommand`, `notify`, `run` (`tab.new` for "Log in in a new tab"). `cx.open_url`, `cx.write_to_clipboard`.
- **`gpui-base`:** `v_flex`, `h_flex`, `InputState`/`Input`, `Popover` (the Status menu and the pickers).
- **Icons:** all its own SVGs in the mod folder: seven status glyphs, five priority glyphs, chevrons (down, right, left, up), search, refresh, help, settings, plus, x, check, sub-issues, external, link, copy, trash, and, in `brand/`, Linear's own logomark for a layout button (`logo-light.svg` white for dark themes, `logo-dark.svg` for light ones), unchanged from linear.app/brand and shown with `image()` so it isn't recolored.

## Watch out

- **`mod.json` first.** A folder that lands in `mods/` without `"place": "none"` gets docked into the shown layout. `scripts/install-mod.sh` copies `mod.json` before anything else (rsync would write `main.js` first).
- **No panel until a layout has a block for it:** `{ "id": "linear", "type": "block", "content": { "mod": "linear-panel" } }` in a side panel stack, and a button running `layout.select { stack, child: "linear" }` and `layout.show`. Shipped layouts and mods are read-only: clone first.
- **Tell the person:** it runs `linear` and `curl`, reaches Linear's API (through the CLI) and avatar hosts, and writes only under `<appHome>/data/linear-panel/`.
- **Never write into the mod folder at run time:** any non-hidden file there reloads the mod and resets it. Avatars go under `data/`.
- **The write check is a mutation.** Linear's API has no "what can this key do" query, so the panel sends `issueUpdate` on the nil id `00000000-0000-0000-0000-000000000000` with an empty input. No issue has that id, so nothing changes. A refusal mentioning scope, permission, forbidden, read-only or not allowed means editing is off; "not found" (or "entity") means it's on; anything else is "unknown", which leaves the pickers on and lets a failed save say why (a permission error there turns editing off). The wording Linear uses for a read-only key hasn't been checked against a real read-only key.
- **Linear ignores an `or` nested inside `state`.** Put status splits at the issue-filter level. `or` inside `assignee` and `project` works.
- **Negating nullable fields:** `isMe: false` leaves out unassigned issues, so `-@me` is `assignee: { or: [{ null: true }, { isMe: false }] }`. `-@none` is `assignee: { null: false }`. The same pattern for `-by:`, `-p:` and `-c:`.
- **Counts are per page:** a tab's count is the number of issues loaded (up to 250, then "250+"). There's no `totalCount` on Linear's connections.
- **The details query** can't ask for `children` twice with different arguments; the details page uses the alias `subIssues`.
- **`Popover` has no box:** style the element inside it or wrap it in a sized `div` (the Status dropdown is wrapped to fill its row).
- **`toLocaleDateString` options are ignored** by this runtime; dates are formatted by hand ("Feb 10, 2026").
- **`#ffffff06` vanishes on a light theme;** the panel uses `#00000008` there (and `#00000010` for `#ffffff10`).
- **Out of scope:** no play, "start working" or start-an-agent button.

## Done when

- `herdr-app check` passes on `mods/linear-panel`, and `node --test` passes in the repo.
- With `linear` logged in, the panel shows "Me" and "Triage" tabs with counts, and the issues assigned to you grouped by status, avatars included.
- Unchecking In Review in the Status menu removes that group and lowers the counts; the Triage tab's dropdown reads "Status set by this view".
- Typing in the search box narrows the list and the header count as you type.
- Clicking an issue shows its page with fields, labels, sub-issues and description; Copy link puts its URL on the clipboard.
- Settings → Add a view named "Urgent" with `pri:urgent` and Save adds a tab; a query like `pri:someday` shows "Unknown priority" and blocks Save.
- After renaming the `linear` binary away, Check again on the panel shows "Install the linear command".
