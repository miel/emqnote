import type React from "react";
import { matches, shortcut, type KeyEvent } from "../../shared/shortcuts.js";

/**
 * Every row Up/Down walks through in the sidebar, in one place.
 *
 * The folder tree's rows are `role="treeitem"`; the footer's — Tags, People, each tag and
 * each person, Tasks, Settings, Help, Unlinked — are not, and should not be: they are
 * destinations sitting beside a tree, not items in one, and calling them tree items would
 * be a lie to a screen reader for the sake of a `querySelectorAll`. So the two are named
 * together here rather than each row's key handler naming its own set. Arrowing from the
 * last folder used to land on Trash and stop, skipping everything between — the footer
 * rows were click-only, with no `tabIndex`, no `onFocus` and no key handler at all.
 *
 * Document order is what `querySelectorAll` returns, and it is already the order these
 * read in: the folders, then the footer, then Trash last inside its own `<ul>`.
 *
 * `Library.tsx`'s `paneOf` has to recognise the same set, or Tab and Ctrl+Tab stop
 * knowing which pane focus is in the moment it lands on one of the new rows.
 */
export const SIDEBAR_ROWS = '[role="treeitem"], .tree-footer .branch';

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
 * The `tabIndex`/`onFocus`/`onKeyDown` trio a sidebar row needs to be reachable by arrow.
 *
 * A row that is only `onClick` is invisible to every one of the three: it cannot hold the
 * pane's roving tab stop, cannot be focused for the arrows to move off, and would not
 * answer them if it were. Built here rather than repeated per row, because a row that
 * carries two of the three is a row that swallows the key and stops the walk dead.
 *
 * `Branch` does not use this — it has ArrowLeft/ArrowRight for folding and a context menu
 * of its own to bind, so it spells its own handler out and shares only `SIDEBAR_ROWS`.
 */
export function sidebarRowProps(
  rowKey: string,
  activeRow: string,
  onActivate: (rowKey: string) => void,
  onActivateRow: () => void,
): {
  tabIndex: number;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
} {
  return {
    tabIndex: activeRow === rowKey ? 0 : -1,
    onFocus: () => onActivate(rowKey),
    onKeyDown: (event) => {
      const next = roveArrowKey(
        event,
        (event.currentTarget as HTMLElement).closest(".tree"),
        SIDEBAR_ROWS,
        event.currentTarget as HTMLElement,
      );
      if (next !== null) {
        event.preventDefault();
        next.focus();
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivateRow();
      }
    },
  };
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
