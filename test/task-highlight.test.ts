// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EditorView } from "prosemirror-view";
import { docFromMarkdown } from "./helpers/editing.js";
import { focusTaskAt } from "../src/renderer/editor/focus-task.js";
import { clearTaskHighlight, taskHighlightKey } from "../src/renderer/editor/task-highlight.js";
import { createEditorState } from "../src/renderer/editor/state.js";
import type { CommandContext } from "../src/renderer/editor/commands.js";

/**
 * The decoration `focusTaskAt` adds alongside the caret move, and its removal —
 * `Editor.tsx`'s own 10-second timer is what calls `clearTaskHighlight` in the real app,
 * so this only tests that the plugin state does what both ends expect of it.
 */

const context: CommandContext = {
  openLinkPrompt: () => {},
  requestAttachment: () => {},
};

function mount(markdown: string): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return new EditorView(host, { state: createEditorState(docFromMarkdown(markdown), context) });
}

describe("task highlight", () => {
  it("highlights exactly the clicked task's text", () => {
    const view = mount("- [ ] Een\n- [ ] Twee\n");
    focusTaskAt(view, 1);

    const decorations = taskHighlightKey.getState(view.state)!;
    const found = decorations.find();
    expect(found).toHaveLength(1);
    expect(view.state.doc.textBetween(found[0]!.from, found[0]!.to)).toBe("Twee");
    view.destroy();
  });

  it("moves the highlight rather than stacking a second one, on a later click", () => {
    const view = mount("- [ ] Een\n- [ ] Twee\n- [ ] Drie\n");
    focusTaskAt(view, 0);
    focusTaskAt(view, 2);

    const decorations = taskHighlightKey.getState(view.state)!;
    const found = decorations.find();
    expect(found).toHaveLength(1);
    expect(view.state.doc.textBetween(found[0]!.from, found[0]!.to)).toBe("Drie");
    view.destroy();
  });

  it("clearTaskHighlight removes it", () => {
    const view = mount("- [ ] Een\n");
    focusTaskAt(view, 0);
    expect(taskHighlightKey.getState(view.state)!.find()).toHaveLength(1);

    clearTaskHighlight(view);

    expect(taskHighlightKey.getState(view.state)!.find()).toHaveLength(0);
    view.destroy();
  });

  it("clearTaskHighlight is a no-op on a destroyed view", () => {
    const view = mount("- [ ] Een\n");
    focusTaskAt(view, 0);
    view.destroy();

    expect(() => clearTaskHighlight(view)).not.toThrow();
  });

  it("survives an ordinary edit elsewhere in the document, mapped to the new positions", () => {
    const view = mount("- [ ] Een\n- [ ] Twee\n");
    focusTaskAt(view, 1);

    // Typing at the very start of the document shifts every later position by one.
    view.dispatch(view.state.tr.insertText("X", 0));

    const decorations = taskHighlightKey.getState(view.state)!;
    expect(view.state.doc.textBetween(decorations.find()[0]!.from, decorations.find()[0]!.to)).toBe(
      "Twee",
    );
    view.destroy();
  });
});
