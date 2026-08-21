// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EditorView } from "prosemirror-view";
import { EditorState } from "prosemirror-state";
import { schema } from "@emqnote/core/markdown/schema";
import { serializeBody } from "@emqnote/core/markdown";
import { taskCheckboxes } from "../src/renderer/editor/checkbox.js";
import { docFromMarkdown } from "./helpers/editing.js";

/**
 * The clickable half of the checkbox.
 *
 * The command tests in `checkbox.test.ts` run against `EditorState`, which is where the
 * rest of the editing logic is tested and is the right level for it. A widget
 * decoration is the exception: it only exists once there is a view, so this is the one
 * place that mounts one. jsdom is enough — nothing here measures or hit-tests, it
 * dispatches the same `click` the mouse would.
 */

function mount(markdown: string): { view: EditorView; boxes: () => HTMLElement[] } {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const view = new EditorView(host, {
    state: EditorState.create({
      doc: docFromMarkdown(markdown),
      plugins: [taskCheckboxes()],
    }),
  });

  return {
    view,
    boxes: () => [...host.querySelectorAll<HTMLElement>("button.task-check")],
  };
}

describe("the checkbox widget", () => {
  it("puts one box on each task item and none on a plain bullet", () => {
    const { view, boxes } = mount("- [ ] Een\n- Gewoon\n- [x] Twee\n");

    expect(boxes()).toHaveLength(2);
    expect(boxes().map((box) => box.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
    ]);

    view.destroy();
  });

  it("ticks the item it belongs to when clicked", () => {
    const { view, boxes } = mount("- [ ] Een\n- [ ] Twee\n");

    boxes()[1]!.click();

    expect(serializeBody(view.state.doc)).toBe("- [ ] Een\n- [x] Twee\n");
    view.destroy();
  });

  it("unticks again, and redraws as unticked", () => {
    const { view, boxes } = mount("- [x] Klaar\n");

    boxes()[0]!.click();
    expect(serializeBody(view.state.doc)).toBe("- [ ] Klaar\n");
    expect(boxes()[0]!.getAttribute("aria-checked")).toBe("false");

    view.destroy();
  });

  it("finds the right item three levels deep", () => {
    const { view, boxes } = mount("- Een\n  - Twee\n    - [ ] Diep\n");

    boxes()[0]!.click();

    expect(serializeBody(view.state.doc)).toBe("- Een\n  - Twee\n    - [x] Diep\n");
    view.destroy();
  });

  it("is a checkbox to assistive technology, not just a picture of one", () => {
    const { view, boxes } = mount("- [ ] Een\n");

    expect(boxes()[0]!.getAttribute("role")).toBe("checkbox");
    expect(boxes()[0]!.contentEditable).toBe("false");

    view.destroy();
  });
});
