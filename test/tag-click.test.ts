// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "../src/markdown/schema.js";
import { handleTagClick } from "../src/renderer/editor/tag-click.js";
import { tagHighlight } from "../src/renderer/editor/tag-decoration.js";
import { docFromMarkdown, caretAfter } from "./helpers/editing.js";

/**
 * Mod+click opens a body `#tag` in the library; a plain click keeps placing the caret
 * (B52). Driven exactly the way `link-click.test.ts` drives B33's twin, and for the same
 * reason: `handleClick` receives a document position, so a position is what to pass.
 *
 * The state carries `tagHighlight()` because that plugin is where the answer lives —
 * `tagAt` reads the decoration set rather than the document, which is what stops the
 * click and the colour from disagreeing about where a tag is.
 */

let openTag: ReturnType<typeof vi.fn>;

beforeEach(() => {
  openTag = vi.fn().mockResolvedValue(undefined);
  (window as unknown as { emqnote: unknown }).emqnote = {
    platform: "darwin",
    openTag,
  };
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(markdown: string): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return new EditorView(host, {
    state: EditorState.create({
      schema,
      doc: docFromMarkdown(markdown),
      plugins: [tagHighlight()],
    }),
  });
}

function clickEvent(mac: boolean): MouseEvent {
  return new MouseEvent("click", mac ? { metaKey: true } : { ctrlKey: true });
}

describe("handleTagClick", () => {
  it("opens the tag on Mod+click and eats the event", () => {
    const view = mount("Afspraak met #klantx over de offerte.\n");
    const pos = caretAfter(view.state.doc, "#klan");
    const event = clickEvent(true);
    const preventDefault = vi.spyOn(event, "preventDefault");

    const handled = handleTagClick(view, pos, event);

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    // The `#` is not part of the name: it is the punctuation that opens one.
    expect(openTag).toHaveBeenCalledWith("klantx");
    view.destroy();
  });

  it("uses ctrlKey on Windows, not metaKey", () => {
    (window as unknown as { emqnote: { platform: string } }).emqnote.platform = "win32";
    const view = mount("Afspraak met #klantx over de offerte.\n");
    const pos = caretAfter(view.state.doc, "#klan");

    expect(handleTagClick(view, pos, clickEvent(true))).toBe(false);
    expect(openTag).not.toHaveBeenCalled();

    expect(handleTagClick(view, pos, new MouseEvent("click", { ctrlKey: true }))).toBe(true);
    expect(openTag).toHaveBeenCalledWith("klantx");
    view.destroy();
  });

  it("a plain click leaves the caret path alone, so a typo in a tag stays fixable", () => {
    const view = mount("Afspraak met #klantx over de offerte.\n");
    const pos = caretAfter(view.state.doc, "#klan");

    expect(handleTagClick(view, pos, new MouseEvent("click"))).toBe(false);
    expect(openTag).not.toHaveBeenCalled();
    view.destroy();
  });

  it("Mod+click outside any tag does nothing", () => {
    const view = mount("Afspraak met #klantx over de offerte.\n");
    const pos = caretAfter(view.state.doc, "offer") - 2;

    expect(handleTagClick(view, pos, clickEvent(true))).toBe(false);
    expect(openTag).not.toHaveBeenCalled();
    view.destroy();
  });

  it("opens from the trailing edge of the tag, where a pointer aimed at a short one lands", () => {
    const view = mount("Afspraak met #klantx over de offerte.\n");
    const end = caretAfter(view.state.doc, "#klantx");

    expect(handleTagClick(view, end, clickEvent(true))).toBe(true);
    expect(openTag).toHaveBeenCalledWith("klantx");
    view.destroy();
  });

  it("says nothing about a `#` inside inline code, which the colour ignores too", () => {
    const view = mount("Draai `git log #klantx` nog eens.\n");
    const pos = caretAfter(view.state.doc, "#klan");

    expect(handleTagClick(view, pos, clickEvent(true))).toBe(false);
    expect(openTag).not.toHaveBeenCalled();
    view.destroy();
  });

  it("keeps the tag's own spelling, capitals and all — folding happens where it is matched", () => {
    const view = mount("Afspraak met #KlantX over de offerte.\n");
    const pos = caretAfter(view.state.doc, "#Klan");

    expect(handleTagClick(view, pos, clickEvent(true))).toBe(true);
    expect(openTag).toHaveBeenCalledWith("KlantX");
    view.destroy();
  });

  it("answers a nested tag by its whole path", () => {
    const view = mount("Zie #klant/x voor de rest.\n");
    const pos = caretAfter(view.state.doc, "#klant/");

    expect(handleTagClick(view, pos, clickEvent(true))).toBe(true);
    expect(openTag).toHaveBeenCalledWith("klant/x");
    view.destroy();
  });
});
