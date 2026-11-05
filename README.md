# Linear panel

**Your Linear issues in a [Herdr](https://herdr.dev) side panel, next to your terminals.**

The panel lists the issues of one view at a time, grouped by status. A view is a
saved query (`@me`, `s:triage`, `#ENG pri:urgent,high`); each one is a tab with
its issue count. Click an issue to see its details, open it in the browser or
copy its link. If your Linear key can write, you can change its status,
priority and assignee from there too.

## Requirements

- The Herdr app.
- The [`linear` CLI](https://github.com/schpet/linear-cli) (v3), logged in. The
  panel reads Linear through it and never stores a key of its own.

  ```sh
  brew install schpet/tap/linear   # or a release binary in ~/.local/bin
  linear auth login                # paste a personal API key
  ```

  Create the key at
  [linear.app/settings/account/security](https://linear.app/settings/account/security).
  A read-only key is enough to browse; changing status, priority or assignee
  needs a key with write access.

The panel finds `linear` in `~/.local/bin`, Homebrew's folders or your `PATH`.
If it's missing or not logged in, the panel says how to fix it.

## Install

1. Clone this repo and copy the mod into Herdr:

   ```sh
   git clone https://github.com/lucasprag/herdr-linear-panel ~/Projects/herdr-linear-panel
   ~/Projects/herdr-linear-panel/scripts/install-mod.sh
   ```

   The script copies `app/mods/linear-panel` to
   `~/.config/herdr-app/mods/linear-panel` (or `$HERDR_APP_HOME/mods/...`) and
   runs `herdr-app check` on it. Run it again after every pull.

2. Put the panel in your layout. It has `"place": "none"`, so Herdr doesn't add
   it anywhere by itself. Add a block to a side panel stack, for example the
   `panel-body` stack of a layout cloned from `main`:

   ```json
   { "id": "linear", "type": "block", "content": { "mod": "linear-panel" } }
   ```

   and a button that shows it, for example in a clone of the `tabs` mod:

   ```js
   run("layout.select", { stack: "panel-body", child: "linear" });
   run("layout.show", { id: "panel" });
   ```

   `mods/linear-panel/linear.svg` is an icon for that button. Shipped layouts
   and mods are read-only, so clone them first (`layout.clone`, `mod.clone`).

## Views and queries

Views live in **Settings** (the gear): add, rename, edit the query, reorder or
delete. The `+` at the end of the tabs adds one. Out of the box there are two:
**Me** (`@me`) and **Triage** (`s:triage`).

| Token | Meaning |
|---|---|
| `@me` `@alex` `@none` | assigned to you, to someone by name, to nobody |
| `#ENG` `#ENG,OPS` | in a team, by its key |
| `l:bug` `l:"tech debt"` | has a label |
| `p:bfcm` `p:none` | project name contains, or no project |
| `pri:urgent,high` | priority: urgent, high, medium, low, none |
| `s:triage` `s:todo,review` | status: triage, backlog, todo, progress, review, done, canceled; replaces the Status dropdown |
| `c:current` `c:12` | in the active cycle, or cycle number 12 |
| `by:me` | created by |
| `sub:me` | subscribed to |
| any other word | in the title |

- Tokens separated by spaces must all hold.
- `OR` (in capitals) between groups means either group may match:
  `@me OR @none #ENG`.
- Commas in a token mean any of: `#ENG,OPS`, `@me,alex`.
- A leading `-` negates: `-l:bug`, `-@me` (unassigned issues count as "not
  me").
- Quote values with spaces: `p:"BFCM 2026"`.
- A query starting with `{` is a raw Linear `IssueFilter` in JSON
  (`linear schema` prints its fields), for example
  `{"priority":{"eq":1}}`.

The help button (`?`) in the panel shows the same table.

## The list

- **Search issues** filters the shown view by title (or identifier) as you type.
- **Status** picks which statuses to show: Backlog, Todo, In Progress, In
  Review, Done, Canceled (Todo, In Progress and In Review to start with). A
  view whose query has `s:` picks its own, and the dropdown says "Status set by
  this view".
- **Sub-issues** off (the default) leaves sub-issues out on Linear's side, so
  the page of 250 issues per view isn't spent on them. On, they show in their
  own status group with "in ENG-123" after the title.
- Groups go Triage, In Progress, In Review, Todo, Backlog, Done, Canceled.
  Click a group to collapse it.

The panel refreshes when it opens, when you click refresh, and every two
minutes.

## Settings

Kept in Herdr's shared state under `linear-panel.prefs`, so they survive layout
changes:

- **Views**: name and query of each tab, in order.
- **Show priority**: a priority icon on each issue line.
- The selected view, the Status choice, the Sub-issues toggle and collapsed
  groups are remembered too.

Avatars are cached in `~/.config/herdr-app/data/linear-panel/avatars`.

## Keys

`keys.json` can send these to the panel: `linear-panel.refresh`,
`linear-panel.search`, `linear-panel.status`, `linear-panel.help`,
`linear-panel.settings`, `linear-panel.back`, `linear-panel.view:<name>`,
`linear-panel.open:<ID>` (for example `linear-panel.open:ENG-123`) and
`linear-panel.add-view:<name>=<query>`, which adds a view (or changes the
query of the view with that name) and selects it, e.g.
`herdr-app do 'linear-panel.add-view:Platform=#ENG'`. Commands reach the
panel only while it's in the shown layout.

## Development

Edit `app/mods/linear-panel/`, then run `scripts/install-mod.sh`; Herdr reloads
the copy right away. The query parser (`query.js`) has no Herdr imports, so its
tests run with plain Node:

```sh
node --test
```

`app/RECIPE.md` describes the panel for anyone rebuilding it from scratch.

## License

[MIT](LICENSE)
