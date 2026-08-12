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
import {
  addColumn,
  addRow,
  deleteColumn,
  deleteRow,
  deleteTable,
  findTable,
  setColumnAlign,
} from "./table-commands.js";

/** What the menu needs from the window around it, to actually carry out an item. */
export interface EditorMenuActions {
  /** Runs a ProseMirror command against the live view, then refocuses it. */
  run: (command: Command) => void;
  insertImage: () => void;
  insertFile: () => void;
  /** Opens the note picker (B41). Nothing was typed to get here, so it swallows no prefix. */
  insertNoteLink: () => void;
  /** Opens the table size grid (B42). */
  insertTable: () => void;
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
    {
      label: t("menu.insertNoteLink"),
      shortcut: formatFirstKey("insertNoteLink", isMac),
      onSelect: actions.insertNoteLink,
    },
    {
      label: t("menu.insertTable"),
      shortcut: formatFirstKey("insertTable", isMac),
      onSelect: actions.insertTable,
    },
    ...tableItems(state, t, actions),
  ];
}

/**
 * The row and column operations, shown only when the caret is actually in a table (B42).
 *
 * Always-present-but-disabled was the alternative and is worse: it would put five dead
 * items on every right-click in a note that has no table in it, to save the discovery of
 * five live ones in the rare note that does.
 *
 * These have no shortcuts of their own, deliberately — five more chords for something
 * done a handful of times per table is how a registry stops being memorable. That does
 * not put them behind a menu-only door: `Mod+Shift+M` opens this same menu at the caret,
 * so the keyboard route and the pointer route land on the same items, which is what
 * `CLAUDE.md`'s rule about menus actually asks for.
 */
function tableItems(
  state: EditorState,
  t: (key: string) => string,
  actions: EditorMenuActions,
): MenuItem[] {
  if (findTable(state) === null) return [];

  return [
    { label: "" },
    { label: t("menu.tableRowAbove"), onSelect: () => actions.run(addRow("before")) },
    { label: t("menu.tableRowBelow"), onSelect: () => actions.run(addRow("after")) },
    { label: t("menu.tableColumnLeft"), onSelect: () => actions.run(addColumn("before")) },
    { label: t("menu.tableColumnRight"), onSelect: () => actions.run(addColumn("after")) },
    { label: t("menu.tableDeleteRow"), onSelect: () => actions.run(deleteRow()) },
    { label: t("menu.tableDeleteColumn"), onSelect: () => actions.run(deleteColumn()) },
    {
      label: t("menu.tableDelete"),
      danger: true,
      onSelect: () => actions.run(deleteTable()),
    },
    { label: "" },
    // Alignment is per column and already in the file format (`:---`/`:---:`/`---:`); this
    // is the first thing in the app that can *set* it. "Default" is a real fourth state,
    // not a synonym for left — it is what a plain `---` means.
    { label: t("menu.tableAlignLeft"), onSelect: () => actions.run(setColumnAlign("left")) },
    { label: t("menu.tableAlignCenter"), onSelect: () => actions.run(setColumnAlign("center")) },
    { label: t("menu.tableAlignRight"), onSelect: () => actions.run(setColumnAlign("right")) },
    { label: t("menu.tableAlignDefault"), onSelect: () => actions.run(setColumnAlign(null)) },
  ];
}
