// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachmentNodeView,
  namesAFile,
  wikiLinkNodeView,
} from "../src/renderer/editor/attachment-view.js";

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
  (
    window as unknown as {
      emqnote: {
        openWikiLink: ReturnType<typeof vi.fn>;
        checkAttachments: ReturnType<typeof vi.fn>;
        pdfPageCount: ReturnType<typeof vi.fn>;
      };
    }
  ).emqnote = {
    openWikiLink: vi.fn().mockResolvedValue("attachment"),
    // Nothing missing, unless a test says otherwise: `wikiLinkNodeView` asks this at
    // draw time for any target that names a file, so every case here would otherwise
    // reach an absent bridge.
    checkAttachments: vi.fn().mockResolvedValue([]),
    // Unanswerable unless a test says otherwise — the inline PDF embed asks this beside
    // its first page, and an unknown count is a normal state (the counter simply says
    // "Page 1" and leaves Next available).
    pdfPageCount: vi.fn().mockResolvedValue(null),
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

  it("fetches emqnote-thumb://vault/<target>, not some other URL shape", () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    wikiLinkNodeView(fakeNode("2026-07-25-1055-offerte.pdf"));

    // The name is in the path, not the host — Chromium lowercases a standard scheme's
    // host and refuses a `%2F` in one outright. See `attachment-url.test.ts`.
    expect(fetchMock).toHaveBeenCalledWith("emqnote-thumb://vault/2026-07-25-1055-offerte.pdf");
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
      (window as unknown as { emqnote: { openWikiLink: ReturnType<typeof vi.fn> } })
        .emqnote.openWikiLink,
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

  it("still calls openWikiLink on click — the regression guard for the added child element", () => {
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
      (window as unknown as { emqnote: { openWikiLink: ReturnType<typeof vi.fn> } })
        .emqnote.openWikiLink,
    ).toHaveBeenCalledWith("2026-07-25-1055-contract.pdf");
  });

  it("still calls openWikiLink on click for a plain non-previewable target too", () => {
    const { dom } = wikiLinkNodeView(fakeNode("Some Note"));
    const span = dom as HTMLElement;

    span.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(
      (window as unknown as { emqnote: { openWikiLink: ReturnType<typeof vi.fn> } })
        .emqnote.openWikiLink,
    ).toHaveBeenCalledWith("Some Note");
  });
});

/**
 * The missing-attachment marker.
 *
 * A note that names a picture or a file which is no longer in the vault used to draw the
 * browser's broken-image glyph (an embed) or an ordinary chip that did nothing when
 * clicked (a link). Both read as the app being broken rather than the file being gone.
 *
 * The question is a filesystem one — `resolveAttachment` and nothing else, batched into
 * one IPC per note by `missing-attachments.ts` — which is why it can be asked at draw
 * time at all. A *note* link is deliberately never asked about: that needs the whole
 * index, and B35's own reasoning is that a link to a note not yet written is a normal
 * thing to have.
 */
function check(): ReturnType<typeof vi.fn> {
  return (window as unknown as { emqnote: { checkAttachments: ReturnType<typeof vi.fn> } })
    .emqnote.checkAttachments;
}

describe("namesAFile", () => {
  it("accepts anything with an extension that is not a note's", () => {
    expect(namesAFile("offerte.pdf")).toBe(true);
    expect(namesAFile("99 - Attachments/foto.PNG")).toBe(true);
    expect(namesAFile("verslag.docx")).toBe(true);
  });

  it("refuses a note link, however it is spelled", () => {
    expect(namesAFile("Some Note")).toBe(false);
    expect(namesAFile("01 Projecten/2026-08-05 1030 Rules")).toBe(false);
    expect(namesAFile("01 Projecten/Rules.md")).toBe(false);
    expect(namesAFile("Oud.markdown")).toBe(false);
  });

  it("refuses a dotted folder with no filename extension after it", () => {
    expect(namesAFile("v1.2/Rules")).toBe(false);
  });
});

describe("a target that names a file which is gone", () => {
  it("marks the chip, with the same ⚠ B36 uses for a file it cannot draw", async () => {
    check().mockResolvedValue(["verslag.docx"]);

    const { dom } = wikiLinkNodeView(fakeNode("verslag.docx"));
    const span = dom as HTMLElement;
    await flushAsync();

    expect(span.dataset.link).toBe("missing");
    expect(span.querySelector(".wiki-link-error-marker")).not.toBeNull();
    expect(span.title).toContain("verslag.docx");
  });

  it("leaves a chip alone when the file is there", async () => {
    check().mockResolvedValue([]);

    const { dom } = wikiLinkNodeView(fakeNode("verslag.docx"));
    const span = dom as HTMLElement;
    await flushAsync();

    expect(span.dataset.link).toBeUndefined();
    expect(span.querySelector(".wiki-link-error-marker")).toBeNull();
  });

  it("never asks about a note link — that question needs the index", async () => {
    wikiLinkNodeView(fakeNode("Some Note"));
    wikiLinkNodeView(fakeNode("01 Projecten/Rules"));
    wikiLinkNodeView(fakeNode("01 Projecten/Rules.md"));
    await flushAsync();

    expect(check()).not.toHaveBeenCalled();
  });

  it("asks once for a whole note's worth of chips, not once each", async () => {
    check().mockResolvedValue([]);

    wikiLinkNodeView(fakeNode("een.pdf"));
    wikiLinkNodeView(fakeNode("twee.docx"));
    wikiLinkNodeView(fakeNode("een.pdf"));
    await flushAsync();

    expect(check()).toHaveBeenCalledTimes(1);
    expect(check()).toHaveBeenCalledWith(["een.pdf", "twee.docx"]);
  });

  it("survives the bridge answering nothing at all — no marker, no throw", async () => {
    check().mockRejectedValue(new Error("no vault"));

    const { dom } = wikiLinkNodeView(fakeNode("verslag.docx"));
    const span = dom as HTMLElement;
    await flushAsync();

    expect(span.dataset.link).toBeUndefined();
  });

  /**
   * A missing PDF reaches the marker twice — the check says it is gone, and the thumbnail
   * fetch 404s on the same file and rewrites the chip's text. `setChipLabel` is what keeps
   * the second from erasing the first, whichever order they land in.
   */
  it("keeps its marker when a failed thumbnail redraws the chip's label", async () => {
    check().mockResolvedValue(["2026-07-25-1055-kwijt.pdf"]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 404, ok: false, text: () => Promise.resolve("") }),
    );

    const { dom } = wikiLinkNodeView(fakeNode("2026-07-25-1055-kwijt.pdf"));
    const span = dom as HTMLElement;
    await flushAsync();

    expect(span.dataset.link).toBe("missing");
    expect(span.querySelector(".wiki-link-error-marker")).not.toBeNull();
    expect(span.textContent).toContain("2026-07-25-1055-kwijt.pdf");
  });
});

describe("an embedded picture that is gone", () => {
  const embed = (target: string): HTMLElement =>
    attachmentNodeView(fakeNode(target), undefined as never, (() => undefined) as never)
      .dom as HTMLElement;

  it("draws the picture while nothing says otherwise", async () => {
    check().mockResolvedValue([]);

    const box = embed("2026-08-05-1030-foto.png");
    await flushAsync();

    const img = box.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("emqnote-attachment://vault/2026-08-05-1030-foto.png");
    expect(box.dataset.link).toBeUndefined();
  });

  it("puts a marked chip where the picture was", async () => {
    check().mockResolvedValue(["2026-08-05-1030-weg.png"]);

    const box = embed("2026-08-05-1030-weg.png");
    await flushAsync();

    expect(box.querySelector("img")).toBeNull();
    expect(box.dataset.link).toBe("missing");

    const chip = box.querySelector(".wiki-embed") as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.dataset.link).toBe("missing");
    expect(chip.querySelector(".wiki-link-error-marker")).not.toBeNull();
    expect(chip.textContent).toContain("2026-08-05-1030-weg.png");
  });

  /**
   * The other route to the same fact, and the one that arrives without a round trip: the
   * protocol handler's own 404 is decided by the very `resolveAttachment` the check asks
   * about. Whichever lands first wins; the second must not undo it.
   */
  it("takes the <img> load failing as the same answer", async () => {
    check().mockResolvedValue([]);

    const box = embed("2026-08-05-1030-stuk.png");
    box.querySelector("img")!.dispatchEvent(new Event("error"));

    expect(box.querySelector("img")).toBeNull();
    expect(box.dataset.link).toBe("missing");

    await flushAsync();
    expect(box.dataset.link).toBe("missing"); // the "nothing missing" answer does not undo it
  });

  it("marks a non-image, non-drawable embed on the chip it already draws", async () => {
    check().mockResolvedValue(["2026-08-05-1030-begroting.xlsx"]);

    const chip = embed("2026-08-05-1030-begroting.xlsx");
    await flushAsync();

    expect(chip.className).toBe("wiki-embed");
    expect(chip.dataset.link).toBe("missing");
    expect(chip.querySelector(".wiki-link-error-marker")).not.toBeNull();
  });
});

/**
 * B43: `![[offerte.pdf]]` draws the first page at the width of the column, where
 * `[[offerte.pdf]]` stays B36's small chip. The two spellings mean two different things,
 * and every case below is about one of them not quietly becoming the other.
 *
 * Each test uses a filename of its own: `failedThumbnails` is module-level state that
 * outlives one test, exactly as it outlives one note-open in the app.
 */
describe("a PDF embedded with ![[…]]", () => {
  const embed = (target: string): HTMLElement =>
    attachmentNodeView(fakeNode(target), undefined as never, (() => undefined) as never)
      .dom as HTMLElement;

  function respondWithPage(): void {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        blob: () => Promise.resolve(new Blob([new Uint8Array([1])], { type: "image/png" })),
      }),
    );
    // jsdom has no object URLs of its own. `revokeObjectURL` matters as much as
    // `createObjectURL` here: turning a page revokes the one before it, and a missing
    // stub would throw out of the fetch chain rather than fail visibly.
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:page", revokeObjectURL: () => {} });
  }

  /** How many pages main says the document has, for the bar's counter and its arrows. */
  function sayPageCount(pages: number): void {
    (window as unknown as { emqnote: { pdfPageCount: ReturnType<typeof vi.fn> } }).emqnote
      .pdfPageCount = vi.fn().mockResolvedValue(pages);
  }

  const bar = (box: HTMLElement, className: string): HTMLElement =>
    box.querySelector(className) as HTMLElement;

  const navButtons = (box: HTMLElement): HTMLButtonElement[] =>
    [...box.querySelectorAll<HTMLButtonElement>(".wiki-embed-pdf-nav")];

  it("asks for the page-sized render, not the chip-sized one", async () => {
    respondWithPage();

    embed("2026-08-05-1030-offerte.pdf");
    await flushAsync();

    expect(fetch).toHaveBeenCalledWith(
      "emqnote-thumb://vault/2026-08-05-1030-offerte.pdf?size=page",
    );
  });

  it("draws the page, with the filename and a way into the viewer beneath it", async () => {
    respondWithPage();

    const box = embed("2026-08-05-1030-notulen.pdf");
    await flushAsync();

    expect(box.className).toBe("wiki-embed-pdf");
    expect(box.dataset.page).toBe("ok");
    expect(box.querySelector("img")!.getAttribute("src")).toBe("blob:page");
    expect(box.querySelector(".wiki-embed-pdf-name")!.textContent).toBe(
      "2026-08-05-1030-notulen.pdf",
    );
    expect(box.querySelector(".wiki-embed-pdf-open")).not.toBeNull();
  });

  it("opens the viewer window from the bar, through the one channel a click already uses", async () => {
    respondWithPage();

    const box = embed("2026-08-05-1030-jaarplan.pdf");
    await flushAsync();

    (box.querySelector(".wiki-embed-pdf-open") as HTMLButtonElement).click();

    const emqnote = (window as unknown as { emqnote: { openWikiLink: ReturnType<typeof vi.fn> } })
      .emqnote;
    expect(emqnote.openWikiLink).toHaveBeenCalledWith("2026-08-05-1030-jaarplan.pdf");
  });

  it("falls back to a marked chip when the file is gone", async () => {
    check().mockResolvedValue(["2026-08-05-1030-verdwenen.pdf"]);

    const box = embed("2026-08-05-1030-verdwenen.pdf");
    await flushAsync();

    expect(box.dataset.page).toBe("missing");
    expect(box.querySelector("img")).toBeNull();

    const chip = box.querySelector(".wiki-embed") as HTMLElement;
    expect(chip.dataset.link).toBe("missing");
    expect(chip.querySelector(".wiki-link-error-marker")).not.toBeNull();
  });

  it("says why when pdf.js could open the file and not draw it (422)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 422,
        ok: false,
        text: () => Promise.resolve("password-protected"),
      }),
    );

    const box = embed("2026-08-05-1030-beveiligd.pdf");
    await flushAsync();

    // Not "missing": the file is very much there. B36's distinction, kept.
    expect(box.dataset.page).toBe("error");
    const chip = box.querySelector(".wiki-embed") as HTMLElement;
    expect(chip.dataset.link).toBeUndefined();
    expect(chip.dataset.thumb).toBe("error");
    expect(chip.title).toBe("password-protected");
    expect(chip.querySelector(".wiki-link-error-marker")).not.toBeNull();
  });

  /**
   * B39, the other way round from the 422 below: an attachment that is not there *yet* is
   * a fact about this moment — a OneDrive file still downloading — and a page that never
   * reappeared until the app was restarted was exactly what B39 set out to prevent.
   * Caught by running it, not by reading it.
   */
  it("asks again after a missing PDF reappears, rather than staying a chip for the session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 404, ok: false, text: () => Promise.resolve("") }),
    );
    check().mockResolvedValue(["2026-08-05-1030-onderweg.pdf"]);

    const gone = embed("2026-08-05-1030-onderweg.pdf");
    await flushAsync();
    expect(gone.dataset.page).toBe("missing");

    // The file lands.
    respondWithPage();
    check().mockResolvedValue([]);

    const back = embed("2026-08-05-1030-onderweg.pdf");
    await flushAsync();

    expect(back.dataset.page).toBe("ok");
    expect(back.querySelector("img")!.getAttribute("src")).toBe("blob:page");
  });

  it("does not ask again on a second render of a PDF it already failed on", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 422, ok: false, text: () => Promise.resolve("stuk") }),
    );

    embed("2026-08-05-1030-tweemaal.pdf");
    await flushAsync();
    expect(fetch).toHaveBeenCalledTimes(1);

    const again = embed("2026-08-05-1030-tweemaal.pdf");
    await flushAsync();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(again.dataset.page).toBe("error");
    expect((again.querySelector(".wiki-embed") as HTMLElement).title).toBe("stuk");
  });

  it("leaves a linked PDF as B36's chip — `[[…]]` and `![[…]]` are not the same thing", async () => {
    respondWithPage();

    const link = wikiLinkNodeView(fakeNode("2026-08-05-1030-contract.pdf")).dom as HTMLElement;
    await flushAsync();

    expect(link.className).toContain("wiki-link");
    expect(link.querySelector(".wiki-embed-pdf-bar")).toBeNull();
    expect(fetch).toHaveBeenCalledWith("emqnote-thumb://vault/2026-08-05-1030-contract.pdf");
  });

  /**
   * The page controls (next/previous, "Page X of Y", Fit). The point of every case here
   * is that turning a page is the *same* request one number apart — same scheme, same
   * traversal guard, same 404/422 split — and that the bar never claims to know something
   * it has not been told.
   */
  describe("its page controls", () => {
    it("says which page it is on before anything knows how many there are", async () => {
      respondWithPage();

      const box = embed("2026-08-13-1000-eenpagina.pdf");
      await flushAsync();

      // No total: `pdfPageCount` answered null. The counter still says where you are, and
      // Next stays available — a control that appeared a moment later would read as the
      // app changing its mind.
      expect(bar(box, ".wiki-embed-pdf-counter").textContent).toBe("Page 1");
      expect(navButtons(box)[1]!.disabled).toBe(false);
    });

    it("counts the pages once main answers, and stops at the last one", async () => {
      respondWithPage();
      sayPageCount(3);

      const box = embed("2026-08-13-1000-drie.pdf");
      await flushAsync();

      expect(bar(box, ".wiki-embed-pdf-counter").textContent).toBe("Page 1 of 3");
      const [previous, next] = navButtons(box);
      expect(previous!.disabled).toBe(true);
      expect(next!.disabled).toBe(false);
    });

    it("asks for the page it moved to, at the page size, and updates the counter", async () => {
      respondWithPage();
      sayPageCount(3);

      const box = embed("2026-08-13-1000-bladeren.pdf");
      await flushAsync();

      navButtons(box)[1]!.click();
      await flushAsync();

      expect(fetch).toHaveBeenLastCalledWith(
        "emqnote-thumb://vault/2026-08-13-1000-bladeren.pdf?size=page&page=2",
      );
      expect(bar(box, ".wiki-embed-pdf-counter").textContent).toBe("Page 2 of 3");

      navButtons(box)[1]!.click();
      await flushAsync();

      // The end of the document: nothing further to offer.
      expect(bar(box, ".wiki-embed-pdf-counter").textContent).toBe("Page 3 of 3");
      expect(navButtons(box)[1]!.disabled).toBe(true);
    });

    it("goes back the way it came", async () => {
      respondWithPage();
      sayPageCount(4);

      const box = embed("2026-08-13-1000-terug.pdf");
      await flushAsync();

      navButtons(box)[1]!.click();
      await flushAsync();
      navButtons(box)[0]!.click();
      await flushAsync();

      // Page 1 is spelled without the parameter, which is what keeps its cache key — and
      // every key written before the bar existed — exactly what it was.
      expect(fetch).toHaveBeenLastCalledWith(
        "emqnote-thumb://vault/2026-08-13-1000-terug.pdf?size=page",
      );
      expect(bar(box, ".wiki-embed-pdf-counter").textContent).toBe("Page 1 of 4");
    });

    it("hides both arrows for a one-page document rather than showing two dead ones", async () => {
      respondWithPage();
      sayPageCount(1);

      const box = embed("2026-08-13-1000-losbladig.pdf");
      await flushAsync();

      expect(navButtons(box).every((button) => button.hidden)).toBe(true);
      expect(bar(box, ".wiki-embed-pdf-counter").textContent).toBe("Page 1 of 1");
    });

    it("toggles between the column width and the whole page, and says which is next", async () => {
      respondWithPage();

      const box = embed("2026-08-13-1000-passend.pdf");
      await flushAsync();

      const fit = bar(box, ".wiki-embed-pdf-fit") as HTMLButtonElement;
      expect(box.dataset.fit).toBe("width");
      expect(fit.title).toBe("Fit the whole page");

      fit.click();
      expect(box.dataset.fit).toBe("page");
      expect(fit.getAttribute("aria-pressed")).toBe("true");
      expect(fit.title).toBe("Fit the column width");

      fit.click();
      expect(box.dataset.fit).toBe("width");
      expect(fit.getAttribute("aria-pressed")).toBe("false");
    });

    it("still opens the viewer window, which is where zoom and the system viewer live", async () => {
      respondWithPage();

      const box = embed("2026-08-13-1000-venster.pdf");
      await flushAsync();

      (box.querySelector(".wiki-embed-pdf-open") as HTMLButtonElement).click();

      const emqnote = (window as unknown as { emqnote: { openWikiLink: ReturnType<typeof vi.fn> } })
        .emqnote;
      expect(emqnote.openWikiLink).toHaveBeenCalledWith("2026-08-13-1000-venster.pdf");
    });

    it("falls back to the marked chip when a later page cannot be drawn", async () => {
      respondWithPage();
      sayPageCount(2);

      const box = embed("2026-08-13-1000-halfstuk.pdf");
      await flushAsync();
      expect(box.dataset.page).toBe("ok");

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          status: 422,
          ok: false,
          text: () => Promise.resolve("page 2 is damaged"),
        }),
      );
      navButtons(box)[1]!.click();
      await flushAsync();

      expect(box.dataset.page).toBe("error");
      expect((box.querySelector(".wiki-embed") as HTMLElement).title).toBe("page 2 is damaged");
    });
  });

  it("leaves an embedded picture alone — it never goes near the render pipeline", async () => {
    check().mockResolvedValue([]);

    const box = embed("2026-08-05-1030-plaatje.png");
    await flushAsync();

    expect(box.className).toBe("wiki-embed-image-box");
    expect(fetch).not.toHaveBeenCalled();
  });
});
