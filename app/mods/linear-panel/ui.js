// Small pieces every page draws: icons, avatars, buttons, the faint band.

import { div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";

export const ICONS = "mods/linear-panel";
export const icon = (name) => svg(`${ICONS}/${name}.svg`);

const GLYPH = { triage: "triage", progress: "progress", review: "review", todo: "todo", backlog: "backlog", done: "done", canceled: "canceled" };
const PRIORITY_GLYPH = ["none", "urgent", "high", "medium", "low"];

/** Whether the theme is dark, by the panel background's lightness. */
export function isDark(t) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(t.chrome ?? t.background ?? "");
  if (!m) return true;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

/** The faint fill behind the search box, the tabs and group headers. */
export const faint = (t) => (isDark(t) ? "#ffffff06" : "#00000008");
/** A touch stronger: the selected tab, a pressed toggle. */
export const faintOn = (t) => (isDark(t) ? "#ffffff10" : "#00000010");

/** A status glyph for a bucket key, tinted with the state's Linear color. */
export function statusIcon(key, color, size = 14) {
  return icon(`status-${GLYPH[key] ?? "todo"}`).size(size).flex_none().text_color(color);
}

/** A priority glyph (0 none … 4 low). Urgent is orange, the rest follow the text. */
export function priorityIcon(t, priority, size = 14) {
  const p = Number.isInteger(priority) && priority >= 0 && priority <= 4 ? priority : 0;
  const color = p === 1 ? "#f2994a" : p === 0 ? t.dim : t.muted;
  return icon(`priority-${PRIORITY_GLYPH[p]}`).size(size).flex_none().text_color(color);
}

/** A square icon button, dim until hovered. `spin` turns the glyph (refresh). */
export function iconButton(t, id, name, onClick, opts = {}) {
  const glyph = icon(name).size(opts.size ?? 14);
  return div().id(id).size(opts.box ?? 26).flex_none().flex().items_center().justify_center()
    .text_color(t.dim).cursor_pointer()
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .when(Boolean(opts.tip), (el) => el.tooltip(opts.tip))
    .on_click(onClick)
    .child(opts.spin ? glyph.spin(900) : glyph);
}

/** A bordered text button with an optional icon. */
export function button(t, id, label, onClick, opts = {}) {
  return h_flex().id(id).h(opts.h ?? 28).px(10).gap(6).flex_none().items_center().cursor_pointer()
    .border_1().border_color(opts.solid ? t.solid : t.border)
    .bg(opts.solid ? t.solid : t.chrome)
    .text_size(12).text_color(opts.solid ? t.solid_foreground : t.foreground)
    .hover((s) => (opts.solid ? s.opacity(0.88) : s.bg(t.hover)))
    .on_click(onClick)
    .when(Boolean(opts.icon), (el) => el.child(icon(opts.icon).size(13).flex_none()))
    .child(label);
}

// A stable color per name for avatars without a picture.
const TINTS = ["#5e6ad2", "#26b5ce", "#4cb782", "#f2c94c", "#f2994a", "#eb5757", "#bb87fc", "#8a8f98"];
function tint(seed) {
  let h = 0;
  for (const ch of String(seed ?? "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

/**
 * A person's or agent's avatar: people are circles, agents rounded squares.
 * `path` is the cached picture (or null): without one, a colored initial.
 */
export function avatar(t, user, path, size = 18) {
  const shape = (el) => (user?.app ? el.rounded(Math.round(size / 4)) : el.rounded_full());
  if (path) return shape(image(path).size(size).flex_none());
  const name = user?.displayName || user?.name || "?";
  return shape(div().size(size).flex_none().flex().items_center().justify_center()
    .bg(tint(user?.id ?? name)).text_size(Math.round(size * 0.55)).font_semibold().text_color("#ffffff")
    .child(name[0].toUpperCase()));
}

/** "5m ago", "3h ago", "2d ago", or "Feb 10, 2026" past a month. */
export function ago(iso) {
  const ms = Date.parse(iso);
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.round(s / 86400)}d ago`;
  // By hand: the runtime ignores toLocaleDateString's options.
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
