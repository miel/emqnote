// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EditorView } from "prosemirror-view";
import { EditorState } from "prosemirror-state";
import { docFromMarkdown } from "./helpers/editing.js";
import { focusTaskAt } from "../src/renderer/editor/focus-task.js";

/**
 * `focusTaskAt`, the function behind the Editor's `focusTask` imperative handle —
 * mirroring `insert-attachment.test.ts`'s precedent of mounting a real `EditorView`
 * rather than testing at the state level, since dispatching the selection is what this
 * function does.
 */

function mount(markdown: string): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return new EditorView(host, { state: EditorState.create({ doc: docFromMarkdown(markdown) }) });
}

describe("focusTaskAt", () => {
  it("puts the caret at the end of the first task's text", () => {
    const view = mount("- [ ] Een\n- [ ] Twee\n");
    focusTaskAt(view, 0);

    const { from, to, empty } = view.state.selection;
    expect(empty).toBe(true);
    expect(view.state.doc.textBetween(0, from)).toBe("Een");
    expect(to).toBe(from);
    view.destroy();
  });

  it("puts the caret at the end of a later task's text, by ordinal", () => {
    const view = mount("- [ ] Een\n- [ ] Twee\n- [ ] Drie\n");
    focusTaskAt(view, 2);

    const { from } = view.state.selection;
    const before = view.state.doc.textBetween(0, from);
    expect(before.endsWith("Drie")).toBe(true);
    view.destroy();
  });

  it("finds a task nested under a plain bullet", () => {
    const view = mount("- Project X\n  - [ ] Een\n  - [x] Twee\n");
    focusTaskAt(view, 1);

    const { from } = view.state.selection;
    const before = view.state.doc.textBetween(0, from);
    expect(before.endsWith("Twee")).toBe(true);
    view.destroy();
  });

  it("does nothing for an ordinal past the end of the document's tasks", () => {
    const view = mount("- [ ] Een\n");
    const before = view.state.selection;

    focusTaskAt(view, 5);

    expect(view.state.selection.eq(before)).toBe(true);
    view.destroy();
  });

  it("does nothing when the document has no tasks at all", () => {
    const view = mount("Gewone tekst, geen taken.\n");
    const before = view.state.selection;

    focusTaskAt(view, 0);

    expect(view.state.selection.eq(before)).toBe(true);
    view.destroy();
  });
});
