// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { docFromMarkdown } from "./helpers/editing.js";
import { Editor, type EditorHandle } from "../src/renderer/editor/Editor.js";

/**
 * "Just type." under the caret of an empty note.
 *
 * Mounted for real, like `editor-selection.test.ts`, and asserted on the **rendered DOM**
 * rather than on plugin state — because the absence of exactly that is what let this ship
 * broken for as long as it did. The placeholder drew nothing at all, for two independent
 * reasons at once: the attribute sat on the contenteditable root while the stylesheet read
 * it from the paragraph inside (and `attr()` sees only its own element's attributes), and
 * the selector asked for `:empty`, which no ProseMirror paragraph ever is, because an
 * empty textblock carries a trailing `<br>` so the caret has somewhere to sit.
 *
 * Both are questions about what ends up in the document, and neither is visible from the
 * state or from the sheet alone. So the last test here reads the stylesheet and checks its
 * selector against the element the tests above actually produce: a rule aimed at the wrong
 * element is the whole bug, and it can only be caught by holding the two halves together.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PLACEHOLDER = "Just type.";

let container: HTMLDivElement;
let root: Root;
let ref: React.RefObject<EditorHandle | null>;

/**
 * `null` for "mounted without a placeholder at all" rather than `undefined`, since a
 * default parameter answers to `undefined` as readily as to nothing — passing that would
 * quietly have mounted *with* one, and the test asserting its absence would have been
 * testing the default.
 */
async function mount(placeholder: string | null = PLACEHOLDER): Promise<void> {
  // `Editor.tsx` reads `window.emqnote.platform` on mount (B33's Mod+click) and subscribes
  // to the chords main claims ahead of the page.
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
        ...(placeholder === null ? {} : { placeholder }),
      }),
    );
  });
}

/** The contenteditable root the view was given, and the block the caret sits in. */
function content(): HTMLElement {
  return container.querySelector(".editor-content") as HTMLElement;
}

function firstBlock(): HTMLElement {
  return content().firstElementChild as HTMLElement;
}

/** What the sheet's `attr()` will be handed, by the element that will hand it over. */
function drawn(): string | null {
  return firstBlock().getAttribute("data-placeholder");
}

/** jsdom's `import.meta.url` is not a `file:` URL, so project files are read from the root. */
function projectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("the empty editor's placeholder", () => {
  it("lands on the paragraph, which is the element the sheet reads it from", async () => {
    await mount();

    expect(firstBlock().tagName).toBe("P");
    expect(drawn()).toBe(PLACEHOLDER);
    // And not on the contenteditable root, which is where it used to be and where nothing
    // could reach it: `attr()` does not read an ancestor's attributes.
    expect(content().hasAttribute("data-placeholder")).toBe(false);
  });

  it("goes when a note is opened, and comes back when the window is cleared", async () => {
    // `setDoc` and `reset` rather than synthetic typing, because those are the two calls
    // the app itself makes — a note opened from the list, and the clear that happens on
    // hide. Typing arrives at the same place through an ordinary transaction.
    await mount();
    expect(drawn()).toBe(PLACEHOLDER);

    act(() => {
      ref.current!.setDoc(docFromMarkdown("Hallo\n"));
    });
    expect(drawn()).toBeNull();

    act(() => {
      ref.current!.reset();
    });
    expect(drawn()).toBe(PLACEHOLDER);
  });

  it("is not drawn on a note that merely ends in an empty line", async () => {
    // `trailing-paragraph.ts` puts an empty paragraph after a table so there is somewhere
    // to type past it. A note that has one is not an empty note, and prompting "Just
    // type." underneath a table the user is looking at would be nonsense. This is what
    // `isBlank`'s `childCount === 1` is for, and the reason it is not "the doc has no text".
    await mount();
    act(() => {
      ref.current!.setDoc(docFromMarkdown(projectFile("test/corpus/13-tabel-uitlijningen.md")));
    });

    expect(content().querySelector("[data-placeholder]")).toBeNull();
  });

  it("is absent altogether from an editor mounted without one", async () => {
    // The library window's editor, and every test that mounts this component bare. No
    // attribute at all, so the rule below matches nothing rather than drawing an empty box.
    await mount(null);
    expect(content().querySelector("[data-placeholder]")).toBeNull();
  });

  it("follows a language change, rather than staying in the one the app started in", async () => {
    // The view is built once and lives as long as the window, so the text is read through
    // a ref on each draw instead of being captured when the view was created. It reaches
    // the screen on the next draw of the empty document — which is `reset`, the same call
    // that empties it.
    await mount();

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
          placeholder: "Typ maar.",
        }),
      );
    });
    act(() => {
      ref.current!.reset();
    });

    expect(drawn()).toBe("Typ maar.");
  });

  it("is read by the stylesheet from the element that carries it", async () => {
    const sheet = projectFile("src/renderer/styles.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const declaration = sheet.match(/([^{}]*)\{[^}]*content:\s*attr\(data-placeholder\)[^}]*\}/);
    expect(declaration).not.toBeNull();

    // The selector, minus its `::before`, has to match the paragraph the app really draws.
    // Asked of the element rather than compared against an expected string, so the rule
    // can be rewritten freely and still be checked against the real DOM.
    await mount();
    const selector = declaration![1]!.trim().replace("::before", "");
    expect(firstBlock().matches(selector)).toBe(true);

    // And the shape that did not match: a ProseMirror paragraph is never `:empty`, because
    // an empty textblock holds a trailing `<br>` for the caret to sit on. Pinned from both
    // ends, so a selector that reaches for emptiness in CSS cannot come back quietly.
    expect(firstBlock().matches("p:only-child:empty")).toBe(false);
    expect(selector).not.toMatch(/:empty/);
  });
});
