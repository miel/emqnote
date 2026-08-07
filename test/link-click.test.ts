// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "../src/markdown/schema.js";
import { handleLinkClick } from "../src/renderer/editor/link-click.js";
import { docFromMarkdown, caretAfter } from "./helpers/editing.js";

/**
 * Mod+click opens a weblink; a plain click keeps placing the caret (B33).
 *
 * `handleClick` fires before ProseMirror moves the selection to the click, so this
 * drives `handleLinkClick` directly with a document position rather than trying to
 * fake a real click through the DOM — the position is exactly what the real prop
 * receives.
 */

let openExternal: ReturnType<typeof vi.fn>;

beforeEach(() => {
  openExternal = vi.fn().mockResolvedValue(undefined);
  (window as unknown as { emqnote: unknown }).emqnote = {
    platform: "darwin",
    openExternal,
  };
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(markdown: string): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return new EditorView(host, { state: EditorState.create({ schema, doc: docFromMarkdown(markdown) }) });
}

function clickEvent(mac: boolean): MouseEvent {
  return new MouseEvent("click", mac ? { metaKey: true } : { ctrlKey: true });
}

describe("handleLinkClick", () => {
  it("opens the link on Mod+click and eats the event", () => {
    const view = mount("Zie [Anthropic](https://www.anthropic.com/) voor meer.\n");
    const pos = caretAfter(view.state.doc, "Anthro") - 3; // inside the link text
    const event = clickEvent(true);
    const preventDefault = vi.spyOn(event, "preventDefault");

    const handled = handleLinkClick(view, pos, event);

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith("https://www.anthropic.com/");
    view.destroy();
  });

  it("uses ctrlKey on Windows, not metaKey", () => {
    (window as unknown as { emqnote: { platform: string } }).emqnote.platform = "win32";
    const view = mount("Zie [Anthropic](https://www.anthropic.com/) voor meer.\n");
    const pos = caretAfter(view.state.doc, "Anthro") - 3;

    // metaKey alone (as if on a Mac) must not fire on Windows.
    expect(handleLinkClick(view, pos, clickEvent(true))).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();

    expect(handleLinkClick(view, pos, new MouseEvent("click", { ctrlKey: true }))).toBe(true);
    expect(openExternal).toHaveBeenCalledWith("https://www.anthropic.com/");
    view.destroy();
  });

  it("a plain click (no modifier) leaves the caret path alone", () => {
    const view = mount("Zie [Anthropic](https://www.anthropic.com/) voor meer.\n");
    const pos = caretAfter(view.state.doc, "Anthro") - 3;

    const handled = handleLinkClick(view, pos, new MouseEvent("click"));

    expect(handled).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
    view.destroy();
  });

  it("Mod+click outside any link does nothing", () => {
    const view = mount("Zie [Anthropic](https://www.anthropic.com/) voor meer.\n");
    const pos = caretAfter(view.state.doc, "voor") - 2; // plain text, not the link

    const handled = handleLinkClick(view, pos, clickEvent(true));

    expect(handled).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
    view.destroy();
  });

  it("refuses a non-http(s) href without ever asking main", () => {
    const view = mount("Mail [mij](mailto:iemand@example.com) gerust.\n");
    const pos = caretAfter(view.state.doc, "mi") - 1;

    const handled = handleLinkClick(view, pos, clickEvent(true));

    expect(handled).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
    view.destroy();
  });
});
