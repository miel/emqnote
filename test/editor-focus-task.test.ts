// @vitest-environment jsdom
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { docFromMarkdown } from "./helpers/editing.js";
import { Editor, type EditorHandle } from "../src/renderer/editor/Editor.js";

/**
 * A1: clicking a task in the Tasks view left the note unscrolled, because
 * `Library.tsx` calls `setDoc` and `focusTask` in the same tick — the new document has
 * not been laid out yet when the scroll position would otherwise be computed.
 * `Editor.tsx`'s `focusTask` now defers the actual selection move and scroll to a
 * `requestAnimationFrame`, after layout has caught up. This mounts the real `Editor`
 * (unlike `library-task-focus.test.ts`, which mocks it out to test `Library`'s own
 * wiring) so the deferred behaviour itself is under test.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe("Editor focusTask, mounted for real", () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollSpy: ReturnType<typeof vi.fn>;
  let scrolledOn: Element | null;

  beforeEach(() => {
    // `Editor.tsx` reads `window.emqnote.platform` synchronously on mount, to track
    // Mod+click's own modifier key (B33), and subscribes to the editor chords main claims
    // ahead of the page (`editor-keys.ts`) — every other test that mounts a real `Editor`
    // already stubs this; this one predates that and needs the same stub now.
    (window as unknown as { emqnote: unknown }).emqnote = {
      platform: "darwin",
      onEditorCommand: () => () => {},
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    scrolledOn = null;
    scrollSpy = vi.fn(function (this: Element) {
      scrolledOn = this;
    });
    // jsdom has no layout engine and does not implement `scrollIntoView` at all —
    // stubbed here the same way the real Chromium method would report itself, so the
    // `element?.scrollIntoView?.(...)` call in `Editor.tsx` actually runs.
    Element.prototype.scrollIntoView = scrollSpy;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("does not scroll synchronously, but does after a frame, landing on the clicked task", async () => {
    const ref = createRef<EditorHandle>();
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(Editor, {
          ref,
          onChange: () => {},
          onLinkRequested: () => {},
          onImageRequested: () => {},
          onFileRequested: () => {},
          onNoteLinkRequested: () => {},
          onTableRequested: () => {},
        }),
      );
    });

    const doc = docFromMarkdown("- [ ] Een\n- [ ] Twee\n");

    // Mirrors `Library.tsx`'s `useEffect`: `setDoc` and `focusTask` in the same tick,
    // before the browser has had a chance to lay the new document out.
    act(() => {
      ref.current!.setDoc(doc);
      ref.current!.focusTask(1);
    });

    // The whole point of the fix: nothing has scrolled yet synchronously.
    expect(scrollSpy).not.toHaveBeenCalled();

    await act(async () => {
      await nextFrame();
    });

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({ block: "center" });
    expect(scrolledOn?.textContent).toBe("Twee");
  });
});
