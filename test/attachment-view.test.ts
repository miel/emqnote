// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wikiLinkNodeView } from "../src/renderer/editor/attachment-view.js";

/**
 * `wikiLinkNodeView`'s markup, and B30/B36's addition on top of it: a first-page
 * thumbnail for a previewable attachment, purely additive over the plain chip. Mirrors
 * `checkbox-widget.test.ts`'s precedent of exercising a NodeView's real DOM directly with
 * jsdom rather than at the ProseMirror state level.
 *
 * Since B36 the thumbnail arrives via `fetch()` rather than an `<img src>` load — see
 * `attachment-view.ts`'s own comment on why — so every test here stubs `global.fetch`
 * rather than dispatching synthetic `load`/`error` events on the `<img>` tag itself; only
 * the two file-format extensions have changed from B30's original suite (PDF only now
 * that Office formats lost inline preview), the rest is a rewrite to match the new
 * mechanism, not a behaviour change.
 *
 * `window.emqnote` is stubbed per test rather than at module scope: `wikiLinkNodeView`
 * only reads it inside its click handler, never at NodeView construction, so — unlike
 * `useBootstrap.ts` elsewhere in the app — there is no load-order requirement here.
 */

function fakeNode(target: string, alias: string | null = null) {
  return { attrs: { target, alias } } as never;
}

/** Lets every pending microtask in `applyThumbnail`'s `.then()` chain settle. */
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  (window as unknown as { emqnote: { openAttachment: ReturnType<typeof vi.fn> } }).emqnote = {
    openAttachment: vi.fn(),
  };
  // A safe default so a test that does not care about the network path never makes a
  // real request in jsdom — overridden per test where the response actually matters.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ status: 404, ok: false, text: () => Promise.resolve("") }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wikiLinkNodeView", () => {
  it("adds a hidden <img> and a label for a PDF target before the fetch settles", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})), // never resolves — inspect the synchronous state
    );

    const { dom } = wikiLinkNodeView(fakeNode("2026-07-25-1055-offerte.pdf"));
    const span = dom as HTMLElement;

    expect(span.className).toContain("wiki-link");
    expect(span.className).toContain("wiki-link-preview");
    expect(span.dataset.target).toBe("2026-07-25-1055-offerte.pdf");
    expect(span.querySelector("img")).not.toBeNull();
    expect(span.querySelector(".wiki-link-label")?.textContent).toBe(
      "2026-07-25-1055-offerte.pdf",
    );
    expect(span.dataset.thumb).toBeUndefined();
  });

  it("fetches emqnote-thumb://<target>, not some other URL shape", () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    wikiLinkNodeView(fakeNode("2026-07-25-1055-offerte.pdf"));

    expect(fetchMock).toHaveBeenCalledWith("emqnote-thumb://2026-07-25-1055-offerte.pdf");
  });

  it("sets the image from the fetched blob and data-thumb=ok once it loads", async () => {
    const blob = new Blob(["fake-png-bytes"]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, ok: true, blob: () => Promise.resolve(blob) }),
    );
    const createObjectURL = vi.fn(() => "blob:fake-thumb");
    vi.stubGlobal("URL", { ...URL, createObjectURL });

    const { dom } = wikiLinkNodeView(fakeNode("2026-07-25-1055-jaarverslag.pdf"));
    const span = dom as HTMLElement;
    await flushAsync();

    const img = span.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("blob:fake-thumb");
    expect(span.dataset.thumb).toBeUndefined(); // not "ok" until the <img> itself loads

    // jsdom does not actually decode the blob URL, so — same as the pre-B36 suite did
    // for the real `emqnote-thumb://` src — the browser's own `load` is simulated.
    img.dispatchEvent(new Event("load"));
    expect(span.dataset.thumb).toBe("ok");
  });

  it("reverts to exactly the plain chip when the file has nothing to preview (404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 404, ok: false, text: () => Promise.resolve("") }),
    );

    const { dom } = wikiLinkNodeView(fakeNode("2026-07-25-1055-weg.pdf"));
    const span = dom as HTMLElement;
    await flushAsync();

    expect(span.querySelector("img")).toBeNull();
    expect(span.querySelector(".wiki-link-label")).toBeNull();
    expect(span.classList.contains("wiki-link-preview")).toBe(false);
    expect(span.dataset.thumb).toBeUndefined();
    expect(span.className).toBe("wiki-link");
    expect(span.textContent).toBe("2026-07-25-1055-weg.pdf");
  });

  it("reverts to the plain chip when the fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { dom } = wikiLinkNodeView(fakeNode("2026-07-25-1055-netwerk.pdf"));
    const span = dom as HTMLElement;
    await flushAsync();

    expect(span.querySelector("img")).toBeNull();
    expect(span.className).toBe("wiki-link");
    expect(span.textContent).toBe("2026-07-25-1055-netwerk.pdf");
  });

  it("marks a real render failure (422) instead of reverting to a plain chip — B36", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ status: 422, ok: false, text: () => Promise.resolve("bad XRef table") }),
    );

    const { dom } = wikiLinkNodeView(fakeNode("2026-07-25-1055-kapot.pdf"));
    const span = dom as HTMLElement;
    await flushAsync();

    expect(span.dataset.thumb).toBe("error");
    expect(span.title).toBe("bad XRef table");
    expect(span.querySelector(".wiki-link-error-marker")).not.toBeNull();
    expect(span.querySelector("img")).toBeNull();
    // Still a chip a click can act on — a real failure is visible, not dead.
    expect(span.className).toBe("wiki-link");
  });

  it("falls back to a generic title when the 422 body is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 422, ok: false, text: () => Promise.resolve("") }),
    );

    const { dom } = wikiLinkNodeView(fakeNode("2026-07-25-1055-leeg.pdf"));
    const span = dom as HTMLElement;
    await flushAsync();

    expect(span.dataset.thumb).toBe("error");
    expect(span.title.length).toBeGreaterThan(0);
  });

  it("redraws a known error marker on a second render without fetching again", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ status: 422, ok: false, text: () => Promise.resolve("bad PDF") });
    vi.stubGlobal("fetch", fetchMock);

    wikiLinkNodeView(fakeNode("2026-07-25-1055-herhaald.pdf"));
    await flushAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const { dom } = wikiLinkNodeView(fakeNode("2026-07-25-1055-herhaald.pdf"));
    const span = dom as HTMLElement;

    expect(span.dataset.thumb).toBe("error");
    expect(span.title).toBe("bad PDF");
    expect(span.querySelector(".wiki-link-error-marker")).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // not asked again
  });

  it("adds no <img> at all for a plain note-to-note link, and never touches window.emqnote or fetch", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { dom } = wikiLinkNodeView(fakeNode("Some Note"));
    const span = dom as HTMLElement;

    expect(span.querySelector("img")).toBeNull();
    expect(span.textContent).toBe("Some Note");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      (window as unknown as { emqnote: { openAttachment: ReturnType<typeof vi.fn> } })
        .emqnote.openAttachment,
    ).not.toHaveBeenCalled();
  });

  it("adds no <img> for a non-previewable attachment like a .txt file", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { dom } = wikiLinkNodeView(fakeNode("notes.txt"));
    const span = dom as HTMLElement;

    expect(span.querySelector("img")).toBeNull();
    expect(span.className).toBe("wiki-link");
    expect(span.textContent).toBe("notes.txt");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds no <img> for a .docx target — Office formats lost inline preview in B36", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { dom } = wikiLinkNodeView(fakeNode("verslag.docx"));
    const span = dom as HTMLElement;

    expect(span.querySelector("img")).toBeNull();
    expect(span.className).toBe("wiki-link");
    expect(span.textContent).toBe("verslag.docx");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still calls openAttachment on click — the regression guard for the added child element", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    const { dom } = wikiLinkNodeView(fakeNode("2026-07-25-1055-contract.pdf"));
    const span = dom as HTMLElement;

    // The thumbnail <img> is present (unfetched) — this is exactly the case the added
    // child element could have broken: a click landing on the child rather than
    // bubbling up to the span's own listener. Dispatched on the child itself, not the
    // span, so the assertion actually exercises that bubbling.
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
