// @vitest-environment jsdom
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { docFromMarkdown } from "./helpers/editing.js";
import { Editor, type EditorHandle } from "../src/renderer/editor/Editor.js";

/**
 * `getSelection` / `setSelection` — the two halves of B70's caret memory that live in the
 * editor. `Library.tsx` owns *when* they are called; this owns what they do.
 *
 * Mounted for real, like `test/editor-focus-task.test.ts` and for the same reason: the
 * whole question is what a live `EditorView` does with an offset, and a mocked handle
 * would answer it by construction.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Editor getSelection/setSelection, mounted for real", () => {
  let container: HTMLDivElement;
  let root: Root;
  let ref: React.RefObject<EditorHandle | null>;

  beforeEach(async () => {
    // `Editor.tsx` reads `window.emqnote.platform` on mount (B33's Mod+click) and
    // subscribes to the chords main claims ahead of the page (`editor-keys.ts`).
    (window as unknown as { emqnote: unknown }).emqnote = {
      platform: "darwin",
      onEditorCommand: () => () => {},
    };
    container = document.createElement("div");
    document.body.appendChild(container);

    ref = createRef<EditorHandle>();
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
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("hands back an offset that puts the caret in the same place again", () => {
    act(() => {
      ref.current!.setDoc(docFromMarkdown("Eerste alinea.\n\nTweede alinea.\n"));
    });

    // Somewhere in the second paragraph — the point is that it is not the document start,
    // which is where `setDoc` leaves it and so where a broken restore would land.
    act(() => {
      ref.current!.setSelection({ anchor: 22, head: 22 });
    });
    const taken = ref.current!.getSelection();
    expect(taken).toEqual({ anchor: 22, head: 22 });

    // Reloading the note throws the whole state away, caret included — that is `setDoc`'s
    // documented job. Restoring is what puts it back.
    act(() => {
      ref.current!.setDoc(docFromMarkdown("Eerste alinea.\n\nTweede alinea.\n"));
    });
    expect(ref.current!.getSelection()).not.toEqual(taken);

    act(() => {
      ref.current!.setSelection(taken!);
    });
    expect(ref.current!.getSelection()).toEqual(taken);
  });

  it("keeps a range, not just a caret", () => {
    act(() => {
      ref.current!.setDoc(docFromMarkdown("Eerste alinea.\n\nTweede alinea.\n"));
      ref.current!.setSelection({ anchor: 1, head: 8 });
    });

    expect(ref.current!.getSelection()).toEqual({ anchor: 1, head: 8 });
  });

  it("survives an offset past the end of a note that has since got shorter", () => {
    // The note could have been edited on the other machine between one visit and the
    // next. The offsets are clamped, so this lands at the end rather than throwing —
    // which, with the restore sitting in an effect, would take the whole reader down.
    act(() => {
      ref.current!.setDoc(docFromMarkdown("Kort.\n"));
    });

    expect(() => {
      act(() => {
        ref.current!.setSelection({ anchor: 9999, head: 9999 });
      });
    }).not.toThrow();

    const landed = ref.current!.getSelection();
    expect(landed).not.toBeNull();
    expect(landed!.head).toBeLessThanOrEqual(6);
  });
});
