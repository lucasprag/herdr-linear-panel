#!/bin/sh
# Copies the mod into the Herdr app's home and checks it. A copy, not a
# symlink: Herdr doesn't reload a mod behind a symlink.
#
# Run it after cloning and after every pull or change to app/mods/.
set -eu
repo="$(cd "$(dirname "$0")/.." && pwd)"
src="$repo/app/mods/linear-panel"
dst="${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/linear-panel"
[ -L "$dst" ] && rm "$dst"
mkdir -p "$dst"
# mod.json goes first: a folder that shows up without it gets docked into the
# shown layout. Its "place": "none" keeps the panel out until a layout asks.
cp "$src/mod.json" "$dst/mod.json"
# --delete keeps the copy exact; the files Herdr writes into every mod stay.
rsync -a --delete \
  --exclude .target --exclude gpui-kit.d.ts --exclude herdr.d.ts --exclude jsconfig.json \
  "$src/" "$dst/"
herdr-app check "$dst"
