// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "../src/markdown/schema.js";
import { serializeBody } from "../src/markdown/index.js";
import { createEditorState } from "../src/renderer/editor/state.js";
import type { CommandContext } from "../src/renderer/editor/commands.js";
import {
  filterSlashItems,
  slashQuery,
  removeSlashPrefix,
  slashMenuKey,
} from "../src/renderer/editor/slash-menu.js";
import { slashMenuItems, insertMenuItems } from "../src/renderer/editor/editor-menu.js";
import { docFromMarkdown, caretAfter } from "./helpers/editing.js";

/**
 * The `/` menu (B51).
 *
 * A mounted `EditorView`, like `table-toolbar.test.ts` and for the same reason: this is a
 * panel in the DOM driven by what is in the document, and half of what is worth checking
 * is that the two agree. The pure halves — the query, the filter, the prefix removal — are
 * exercised directly as well, because those are the parts a future change is most likely
 * to get subtly wrong.
 */

const requested = {
  image: 0,
  file: 0,
  noteLink: [] as string[],
  table: 0,
};

const CONTEXT: CommandContext = {
  openLinkPrompt: () => {},
  requestImage: () => {
    requested.image += 1;
  },
  requestFile: () => {
    requested.file += 1;
  },
  requestNoteLink: (prefix) => {
    requested.noteLink.push(prefix);
  },
  requestTable: () => {
    requested.table += 1;
  },
  // No `t`: the English fallback is what a bare mount must produce, the same check
  // `table-toolbar.test.ts` makes of its own labels.
};

let view: EditorView | null = null;

beforeEach(() => {
  requested.image = 0;
  requested.file = 0;
  requested.noteLink = [];
  requested.table = 0;
  // The plugin asks main which platform it is on, for the shortcut labels.
  (window as unknown as { emqnote: { platform: string } }).emqnote = { platform: "linux" };
});

afterEach(() => {
  view?.destroy();
  view = null;
  document.querySelectorAll(".slash-menu").forEach((node) => node.remove());
});

/** A live view whose caret sits just after `needle`. */
function mount(markdown: string, needle: string): EditorView {
  const doc = docFromMarkdown(markdown);
  const base = createEditorState(doc, CONTEXT);
  const state = EditorState.create({
    schema,
    doc,
    plugins: base.plugins,
    selection: TextSelection.create(doc, caretAfter(doc, needle)),
  });

  const host = document.createElement("div");
  document.body.appendChild(host);
  view = new EditorView(host, { state });
  return view;
}

/** A view with the caret on an empty paragraph of its own, ready for a `/`. */
function mountEmpty(): EditorView {
  const doc = schema.nodes.doc!.create(null, [schema.nodes.paragraph!.create()]);
  const base = createEditorState(doc, CONTEXT);

  const host = document.createElement("div");
  document.body.appendChild(host);
  view = new EditorView(host, {
    state: EditorState.create({
      schema,
      doc: base.doc,
      plugins: base.plugins,
      selection: TextSelection.create(base.doc, 1),
    }),
  });
  return view;
}

/** Types text one character at a time, as `handleTextInput` would see it. */
function type(target: EditorView, text: string): void {
  for (const character of text) {
    target.dispatch(target.state.tr.insertText(character));
  }
}

function panel(): HTMLElement | null {
  return document.querySelector(".slash-menu");
}

function labels(): string[] {
  return [...document.querySelectorAll(".slash-menu .context-menu-label")].map(
    (node) => node.textContent ?? "",
  );
}

function press(target: EditorView, key: string): void {
  target.someProp("handleKeyDown", (handler) =>
    handler(target, new KeyboardEvent("keydown", { key })),
  );
}

function markdown(): string {
  return serializeBody(view!.state.doc);
}

describe("when the menu opens", () => {
  it("opens on a slash typed at the start of an empty line", () => {
    const editor = mountEmpty();
    type(editor, "/");

    expect(panel()).not.toBeNull();
  });

  it("leaves the slash in the document while it is up", () => {
    const editor = mountEmpty();
    type(editor, "/");

    expect(editor.state.doc.textContent).toBe("/");
  });

  it("stays shut for a slash inside a sentence", () => {
    const editor = mount("Kwartaal 1\n", "Kwartaal 1");
    type(editor, "/2");

    expect(panel()).toBeNull();
  });

  it("stays shut for a slash typed after other text on the line", () => {
    const editor = mountEmpty();
    type(editor, "a/");

    expect(panel()).toBeNull();
  });

  it("stays shut inside a table cell, where none of its items would apply", () => {
    const editor = mount("| a | b |\n| --- | --- |\n| c | d |\n", "a");
    // The cell holds "a"; clear it so the slash really is the first character of it.
    editor.dispatch(editor.state.tr.delete(editor.state.selection.from - 1, editor.state.selection.from));
    type(editor, "/");

    expect(panel()).toBeNull();
  });
});

describe("while the menu is up", () => {
  it("lists the blocks and the five insert items", () => {
    const editor = mountEmpty();
    type(editor, "/");

    expect(labels()).toEqual([
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Heading 4",
      "Heading 5",
      "Heading 6",
      "Ordinary paragraph",
      "Bullet list",
      "Numbered list",
      "Insert task",
      "Quote",
      "Insert image",
      "Insert file",
      "Link to note…",
      "Table…",
      "Divider",
    ]);
  });

  it("filters as you keep typing, in the note itself", () => {
    const editor = mountEmpty();
    type(editor, "/head");

    expect(labels()).toEqual([
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Heading 4",
      "Heading 5",
      "Heading 6",
    ]);
    // The caret never left the document — that is the whole difference from the note
    // picker, which is a modal overlay with a filter box of its own.
    expect(editor.state.selection.$head.parent.textContent).toBe("/head");
  });

  it("says so when nothing matches, rather than closing", () => {
    const editor = mountEmpty();
    type(editor, "/zzzz");

    expect(panel()).not.toBeNull();
    expect(document.querySelector(".slash-menu-empty")?.textContent).toBe("Nothing matches");
  });

  it("closes on a space, because that is no longer a command name", () => {
    const editor = mountEmpty();
    type(editor, "/head ");

    expect(panel()).toBeNull();
  });

  it("closes when the slash is deleted", () => {
    const editor = mountEmpty();
    type(editor, "/");
    editor.dispatch(editor.state.tr.delete(1, 2));

    expect(panel()).toBeNull();
    expect(slashMenuKey.getState(editor.state)).toBeNull();
  });

  it("closes on Escape and leaves what was typed", () => {
    const editor = mountEmpty();
    type(editor, "/head");
    press(editor, "Escape");

    expect(panel()).toBeNull();
    expect(editor.state.doc.textContent).toBe("/head");
  });

  it("moves the highlight with the arrow keys", () => {
    const editor = mountEmpty();
    type(editor, "/");

    expect(document.querySelector(".context-menu-active .context-menu-label")?.textContent).toBe(
      "Heading 1",
    );
    press(editor, "ArrowDown");
    expect(document.querySelector(".context-menu-active .context-menu-label")?.textContent).toBe(
      "Heading 2",
    );
    press(editor, "ArrowUp");
    expect(document.querySelector(".context-menu-active .context-menu-label")?.textContent).toBe(
      "Heading 1",
    );
  });

  it("wraps the highlight round the ends", () => {
    const editor = mountEmpty();
    type(editor, "/");
    press(editor, "ArrowUp");

    expect(document.querySelector(".context-menu-active .context-menu-label")?.textContent).toBe(
      "Divider",
    );
  });

  it("lets every other key through, or the filtering would not work", () => {
    const editor = mountEmpty();
    type(editor, "/");

    const handled = editor.someProp("handleKeyDown", (handler) =>
      handler(editor, new KeyboardEvent("keydown", { key: "a" })),
    );
    expect(handled).not.toBe(true);
  });
});

describe("choosing an item", () => {
  it("removes the slash and what was typed after it", () => {
    const editor = mountEmpty();
    type(editor, "/head");
    press(editor, "Enter");

    expect(editor.state.doc.textContent).toBe("");
  });

  it("carries out the command it names", () => {
    const editor = mountEmpty();
    type(editor, "/head");
    press(editor, "Enter");
    type(editor, "Titel");

    expect(markdown()).toBe("# Titel\n");
  });

  it("makes a real quote", () => {
    const editor = mountEmpty();
    type(editor, "/quote");
    press(editor, "Enter");
    type(editor, "Zo zei hij");

    expect(markdown()).toBe("> Zo zei hij\n");
  });

  it("makes a divider, which has no other keyboard route at all", () => {
    const editor = mountEmpty();
    type(editor, "/divid");
    press(editor, "Enter");

    expect(markdown()).toContain("---");
  });

  it("opens a picker for the items that have one, after the slash is gone", () => {
    const editor = mountEmpty();
    type(editor, "/image");
    press(editor, "Enter");

    expect(requested.image).toBe(1);
    // The prefix is removed *before* the picker opens, so what it inserts lands on a clean
    // line — and it is handed no prefix of its own to swallow.
    expect(editor.state.doc.textContent).toBe("");
  });

  it("hands the note picker an empty prefix, never its own slash", () => {
    const editor = mountEmpty();
    type(editor, "/link");
    press(editor, "Enter");

    expect(requested.noteLink).toEqual([""]);
  });

  it("closes the menu behind it", () => {
    const editor = mountEmpty();
    type(editor, "/table");
    press(editor, "Enter");

    expect(panel()).toBeNull();
    expect(requested.table).toBe(1);
  });

  it("acts on a click as well as on Enter", () => {
    const editor = mountEmpty();
    type(editor, "/quote");

    const button = document.querySelector<HTMLButtonElement>(".slash-menu .context-menu-item");
    button?.click();
    type(editor, "Zo");

    expect(markdown()).toBe("> Zo\n");
  });
});

describe("the item list itself", () => {
  const t = (key: string): string => key;
  const actions = {
    run: vi.fn(),
    insertImage: vi.fn(),
    insertFile: vi.fn(),
    insertNoteLink: vi.fn(),
    insertTable: vi.fn(),
  };

  it("contains every one of the Insert menu's items, so the two cannot drift", () => {
    const slash = slashMenuItems(false, t, actions).map((item) => item.label);
    for (const item of insertMenuItems(false, t, actions)) {
      expect(slash).toContain(item.label);
    }
  });

  it("offers no mark toggles — there is nothing selected to apply one to", () => {
    const slash = slashMenuItems(false, t, actions).map((item) => item.label);
    expect(slash).not.toContain("menu.bold");
    expect(slash).not.toContain("menu.highlight");
  });
});

describe("the pure halves", () => {
  it("filters on a loose subsequence, like every other list in the app", () => {
    const items = [
      { label: "Heading 1", onSelect: () => {} },
      { label: "Bullet list", onSelect: () => {} },
      { label: "Link to note…", onSelect: () => {} },
    ];

    expect(filterSlashItems(items, "list").map((item) => item.label)).toEqual(["Bullet list"]);
    expect(filterSlashItems(items, "").map((item) => item.label)).toHaveLength(3);
  });

  it("drops separators, which cannot be chosen", () => {
    const items = [{ label: "Heading 1", onSelect: () => {} }, { label: "" }];
    expect(filterSlashItems(items, "")).toHaveLength(1);
  });

  it("refuses to remove a prefix that is no longer there", () => {
    const doc = docFromMarkdown("Gewone tekst\n");
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 5) });

    expect(removeSlashPrefix(state, 1)).toBeNull();
  });

  it("has no query when no menu is open", () => {
    const doc = docFromMarkdown("Gewone tekst\n");
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 5) });

    expect(slashQuery(state)).toBeNull();
  });
});
