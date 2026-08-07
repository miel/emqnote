// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wikiLinkNodeView } from "../src/renderer/editor/attachment-view.js";

/**
 * `wikiLinkNodeView`'s markup, and B30's addition on top of it: a first-page thumbnail
 * for a previewable attachment, purely additive over the plain chip. Mirrors
 * `checkbox-widget.test.ts`'s precedent of exercising a NodeView's real DOM directly
 * with jsdom and synthetic events, rather than at the ProseMirror state level — the
 * interesting behaviour here (`onload`/`onerror` on an `<img>`) only exists once there
 * is a real element to fire an event at.
 *
 * `window.emqnote` is stubbed per test rather than at module scope: `wikiLinkNodeView`
 * only reads it inside its click handler, never at NodeView construction, so — unlike
 * `useBootstrap.ts` elsewhere in the app — there is no load-order requirement here.
 */

function fakeNode(target: string, alias: string | null = null) {
  return { attrs: { target, alias } } as never;
}

beforeEach(() => {
  (window as unknown as { emqnote: { openAttachment: ReturnType<typeof vi.fn> } }).emqnote = {
    openAttachment: vi.fn(),
  };
});

describe("wikiLinkNodeView", () => {
  it("adds an emqnote-thumb <img> for a PDF target, with no data-thumb yet", () => {
    const { dom } = wikiLinkNodeView(fakeNode("2026-07-25-1055-offerte.pdf"));
    const span = dom as HTMLElement;

    expect(span.className).toContain("wiki-link");
    expect(span.dataset.target).toBe("2026-07-25-1055-offerte.pdf");

    const img = span.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe(
      "emqnote-thumb://2026-07-25-1055-offerte.pdf",
    );
    expect(span.dataset.thumb).toBeUndefined();
  });

  it("removes the <img> on error and leaves the chip exactly as before this package", () => {
    const { dom } = wikiLinkNodeView(fakeNode("2026-07-25-1055-kapot.pdf"));
    const span = dom as HTMLElement;
    const img = span.querySelector("img")!;

    img.dispatchEvent(new Event("error"));

    expect(span.querySelector("img")).toBeNull();
    expect(span.querySelector(".wiki-link-label")).toBeNull();
    expect(span.classList.contains("wiki-link-preview")).toBe(false);
    expect(span.dataset.thumb).toBeUndefined();
    expect(span.className).toBe("wiki-link");
    expect(span.textContent).toBe("2026-07-25-1055-kapot.pdf");
  });

  it("sets data-thumb=ok on the outer span on load", () => {
    const { dom } = wikiLinkNodeView(fakeNode("verslag.docx"));
    const span = dom as HTMLElement;
    const img = span.querySelector("img")!;

    img.dispatchEvent(new Event("load"));

    expect(span.dataset.thumb).toBe("ok");
  });

  it("adds no <img> at all for a plain note-to-note link, and never touches window.emqnote", () => {
    const { dom } = wikiLinkNodeView(fakeNode("Some Note"));
    const span = dom as HTMLElement;

    expect(span.querySelector("img")).toBeNull();
    expect(span.textContent).toBe("Some Note");
    expect(
      (window as unknown as { emqnote: { openAttachment: ReturnType<typeof vi.fn> } })
        .emqnote.openAttachment,
    ).not.toHaveBeenCalled();
  });

  it("adds no <img> for a non-previewable attachment like a .txt file", () => {
    const { dom } = wikiLinkNodeView(fakeNode("notes.txt"));
    const span = dom as HTMLElement;

    expect(span.querySelector("img")).toBeNull();
    expect(span.className).toBe("wiki-link");
    expect(span.textContent).toBe("notes.txt");
  });

  it("still calls openAttachment on click — the regression guard for the added child element", () => {
    const { dom } = wikiLinkNodeView(fakeNode("2026-07-25-1055-contract.pdf"));
    const span = dom as HTMLElement;

    // The thumbnail <img> is present (unclicked, unloaded) — this is exactly the case
    // the added child element could have broken: a click landing on the child rather
    // than bubbling up to the span's own listener. Dispatched on the child itself, not
    // the span, so the assertion actually exercises that bubbling.
    const img = span.querySelector("img");
    expect(img).not.toBeNull();

    img!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(
      (window as unknown as { emqnote: { openAttachment: ReturnType<typeof vi.fn> } })
        .emqnote.openAttachment,
    ).toHaveBeenCalledWith("2026-07-25-1055-contract.pdf");
  });

  it("still calls openAttachment on click for a plain non-previewable target too", () => {
    const { dom } = wikiLinkNodeView(fakeNode("Some Note"));
    const span = dom as HTMLElement;

    span.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(
      (window as unknown as { emqnote: { openAttachment: ReturnType<typeof vi.fn> } })
        .emqnote.openAttachment,
    ).toHaveBeenCalledWith("Some Note");
  });
});
