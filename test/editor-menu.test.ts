import { describe, expect, it } from "vitest";
import { EditorState, type Command } from "prosemirror-state";
import { schema } from "../src/markdown/schema.js";
import { buildEditorMenu, type EditorMenuActions } from "../src/renderer/editor/editor-menu.js";
import { formatFirstKey } from "../src/shared/shortcuts.js";
import { docFromMarkdown, stateAt } from "./helpers/editing.js";

/**
 * `buildEditorMenu` is deliberately pure — no `EditorView`, no React — so what the note
 * panel's right-click menu *contains* can be checked directly against a constructed
 * `EditorState`, the same way `test/focus-task.test.ts` and friends test the editor at
 * the state level rather than the DOM level.
 */

const noop = (): void => {};
const actions: EditorMenuActions = {
  run: noop,
  insertImage: noop,
  insertFile: noop,
  insertNoteLink: noop,
  insertTable: noop,
};
// The identity function stands in for `app.t`: every label comes back as its own key,
// so a test can find "the Bold item" by looking for the literal key rather than an
// English string that would drift the moment the translation changed.
const t = (key: string): string => key;

// Maps each menu label back to the shortcut-registry id `buildEditorMenu` reads it
// from, for the "every shortcut is `formatFirstKey`" check below.
const SHORTCUT_ITEMS: Record<string, string> = {
  "menu.bold": "strong",
  "menu.italic": "em",
  "menu.underline": "underline",
  "menu.highlight": "highlight",
  "menu.bulletList": "bulletList",
  "menu.orderedList": "orderedList",
  "menu.insertTask": "task",
  "menu.insertImage": "insertImage",
  "menu.insertFile": "insertFile",
  "menu.insertNoteLink": "insertNoteLink",
  "menu.insertTable": "insertTable",
};

function plainState(): EditorState {
  return EditorState.create({ schema, doc: docFromMarkdown("Plain text.\n") });
}

describe("buildEditorMenu", () => {
  it("marks Bold checked when the caret sits inside bold text", () => {
    const state = stateAt("**bold** text\n", "bol");
    const items = buildEditorMenu(state, false, t, actions);
    const bold = items.find((item) => item.label === "menu.bold");
    expect(bold?.checked).toBe(true);
  });

  it("leaves Bold unchecked outside bold text", () => {
    const state = stateAt("plain text\n", "plai");
    const items = buildEditorMenu(state, false, t, actions);
    const bold = items.find((item) => item.label === "menu.bold");
    expect(bold?.checked).toBe(false);
  });

  it("marks Underline and Highlight checked independently of Bold", () => {
    const state = stateAt("plain <u>underlined</u> text\n", "underlin");
    const items = buildEditorMenu(state, false, t, actions);
    expect(items.find((item) => item.label === "menu.underline")?.checked).toBe(true);
    expect(items.find((item) => item.label === "menu.bold")?.checked).toBe(false);
  });

  it("includes exactly the two separators between the three formatting groups", () => {
    const items = buildEditorMenu(plainState(), false, t, actions);
    const separators = items.filter((item) => item.onSelect === undefined);
    expect(separators).toHaveLength(2);
  });

  it("wires Insert image and Insert file to their own actions, each with its own shortcut", () => {
    const items = buildEditorMenu(plainState(), false, t, actions);
    const image = items.find((item) => item.label === "menu.insertImage");
    const file = items.find((item) => item.label === "menu.insertFile");
    expect(image?.shortcut).toBe(formatFirstKey("insertImage", false));
    expect(file?.shortcut).toBe(formatFirstKey("insertFile", false));
    expect(image?.onSelect).toBe(actions.insertImage);
    expect(file?.onSelect).toBe(actions.insertFile);
  });

  it("offers a divider, and running it puts a rule in the document", () => {
    const items = buildEditorMenu(plainState(), false, t, actions);
    const divider = items.find((item) => item.label === "menu.insertRule");

    // No shortcut and no picker: the one insert item that is simply done. The Insert menu
    // opens from a plain button, so `--click-button="Insert>…"` still reaches it.
    expect(divider?.shortcut).toBeUndefined();

    let ran: Command | null = null;
    buildEditorMenu(plainState(), false, t, { ...actions, run: (command) => (ran = command) })
      .find((item) => item.label === "menu.insertRule")!
      .onSelect!();

    let state = plainState();
    ran!(state, (transaction) => (state = state.apply(transaction)));
    expect(state.doc.child(0).type.name).toBe("horizontalRule");
  });

  it.each([true, false])(
    "formats every shortcut through formatFirstKey (isMac=%s)",
    (isMac) => {
      const items = buildEditorMenu(plainState(), isMac, t, actions);
      const withShortcuts = items.filter(
        (item): item is typeof item & { shortcut: string } => item.shortcut !== undefined,
      );

      // Every item this codebase's shortcut table assigns a binding to shows up here —
      // if the mapping above goes stale (an id renamed, a new formatting command added
      // without a shortcut counterpart), this is the line that catches it.
      expect(withShortcuts.map((item) => item.label).sort()).toEqual(
        Object.keys(SHORTCUT_ITEMS).sort(),
      );

      for (const item of withShortcuts) {
        const id = SHORTCUT_ITEMS[item.label];
        expect(id).toBeDefined();
        expect(item.shortcut).toBe(formatFirstKey(id!, isMac));
      }
    },
  );
});
