import type { Command, EditorState } from "prosemirror-state";
import { formatFirstKey } from "../../shared/shortcuts.js";
import type { MenuItem } from "../library/ContextMenu.js";
import {
  isMarkActive,
  toggleBulletList,
  toggleEm,
  toggleHighlight,
  toggleOrderedList,
  toggleStrong,
  toggleTask,
  toggleUnderline,
} from "./commands.js";

/** What the menu needs from the window around it, to actually carry out an item. */
export interface EditorMenuActions {
  /** Runs a ProseMirror command against the live view, then refocuses it. */
  run: (command: Command) => void;
  insertImage: () => void;
  insertFile: () => void;
}

/**
 * The note panel's right-click menu: the handful of formatting commands used often
 * enough to already have a keyboard shortcut, plus the two ways to insert an attachment.
 *
 * Pure and DOM-free on purpose — no `EditorView`, no React — so what the menu *contains*
 * can be checked directly against an `EditorState` (`test/editor-menu.test.ts`) without
 * mounting anything. Every shortcut label comes from `formatFirstKey`, never a hardcoded
 * string — the same rule that governs the two-line status bar hint in `Capture.tsx`.
 */
export function buildEditorMenu(
  state: EditorState,
  isMac: boolean,
  t: (key: string) => string,
  actions: EditorMenuActions,
): MenuItem[] {
  return [
    {
      label: t("menu.bold"),
      shortcut: formatFirstKey("strong", isMac),
      checked: isMarkActive(state, "strong"),
      onSelect: () => actions.run(toggleStrong),
    },
    {
      label: t("menu.italic"),
      shortcut: formatFirstKey("em", isMac),
      checked: isMarkActive(state, "em"),
      onSelect: () => actions.run(toggleEm),
    },
    {
      label: t("menu.underline"),
      shortcut: formatFirstKey("underline", isMac),
      checked: isMarkActive(state, "underline"),
      onSelect: () => actions.run(toggleUnderline),
    },
    {
      label: t("menu.highlight"),
      shortcut: formatFirstKey("highlight", isMac),
      checked: isMarkActive(state, "highlight"),
      onSelect: () => actions.run(toggleHighlight),
    },
    { label: "" },
    {
      label: t("menu.bulletList"),
      shortcut: formatFirstKey("bulletList", isMac),
      onSelect: () => actions.run(toggleBulletList),
    },
    {
      label: t("menu.orderedList"),
      shortcut: formatFirstKey("orderedList", isMac),
      onSelect: () => actions.run(toggleOrderedList),
    },
    { label: "" },
    {
      label: t("menu.insertTask"),
      shortcut: formatFirstKey("task", isMac),
      onSelect: () => actions.run(toggleTask),
    },
    {
      label: t("menu.insertImage"),
      shortcut: formatFirstKey("insertImage", isMac),
      onSelect: actions.insertImage,
    },
    {
      label: t("menu.insertFile"),
      shortcut: formatFirstKey("insertFile", isMac),
      onSelect: actions.insertFile,
    },
  ];
}
