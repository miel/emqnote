import { matches, shortcut, type KeyEvent } from "../../shared/shortcuts.js";

/**
 * The keyboard half of a roving `tabIndex`, shared by the folder tree, the note list and
 * the task list: exactly one row per pane is a Tab stop, and Up/Down/Home/End move which
 * one that is.
 *
 * Reads the DOM directly rather than tracking a parallel array of paths/ordinals in React
 * state. Each pane already decides which rows exist through its own render logic — a
 * folder that is expanded or collapsed, a note list that is filtered — so "what row comes
 * next" is simplest answered by asking the DOM what is actually on screen right now, the
 * same way `FolderTree.tsx`'s drag handling already does with `closest`/`contains`.
 */
export function roveArrowKey(
  event: { key: string },
  container: Element | null,
  selector: string,
  current: Element,
): HTMLElement | null {
  if (container === null) return null;
  const rows = Array.from(container.querySelectorAll<HTMLElement>(selector));
  const index = rows.indexOf(current as HTMLElement);
  if (index === -1) return null;

  if (event.key === "ArrowDown") return rows[Math.min(index + 1, rows.length - 1)] ?? null;
  if (event.key === "ArrowUp") return rows[Math.max(index - 1, 0)] ?? null;
  if (event.key === "Home") return rows[0] ?? null;
  if (event.key === "End") return rows[rows.length - 1] ?? null;
  return null;
}

/**
 * Mod-Shift-M or the dedicated `ContextMenu` key — the keyboard route into a context menu.
 *
 * Delegates to the registry's own `matches` rather than testing `event.key`/modifiers by
 * hand — a second definition of the `contextMenu` entry is exactly what `shortcuts.ts`'s
 * own module comment warns against, and it is how this used to still say Shift+F10 after
 * the registry moved on to Mod-Shift-M (B32).
 */
export function isContextMenuKey(event: KeyEvent, isMac: boolean): boolean {
  return matches(shortcut("contextMenu"), event, isMac);
}
