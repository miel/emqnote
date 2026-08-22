// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mountCapture, openedNote, type MountedCapture } from "./helpers/capture.js";
import { docFromMarkdown } from "./helpers/editing.js";

/**
 * What a note *looks like* when it reaches the capture window — `TEST-PROTOCOL.md` §18x,
 * the reachable part of it.
 *
 * Two of its rows are about a note written somewhere else opening here without a dead end
 * in it, and two are about a vault shared with Obsidian keeping both of its spellings while
 * only drawing one. `trailing-paragraph.test.ts` and `duplicate-embed.test.ts` own the
 * rules; what is driven here is that this window's editor carries the plugins that apply
 * them, against a document that arrived over IPC rather than one built in a test.
 *
 * **Three of §18x's rows are not reachable here and are not faked.** 18g, 18h and 18i are
 * Mod+click and plain click on a markdown link, and they go through ProseMirror's own
 * `handleClick`, which starts by asking `posAtCoords` where the pointer is. jsdom computes
 * no boxes, so that answers null and the handler never runs — and the rows are *about*
 * aiming ("the right-hand half of the last character"), which makes them the most
 * layout-dependent rows in the protocol rather than an oversight. They belong to
 * `scripts/drive-capture.ts` and to a person. A `[[…]]` chip is a different matter and is
 * covered in `capture-note-link.test.ts`: its node view listens for a plain DOM click and
 * never asks where the pointer was.
 */

describe("a note opening in the capture window", () => {
  let capture: MountedCapture;

  afterEach(() => {
    capture.unmount();
  });

  async function open(markdown: string): Promise<HTMLElement> {
    capture = await mountCapture();
    await capture.fireLoad(openedNote({ doc: docFromMarkdown(markdown).toJSON() }));
    await capture.flush();
    return capture.container.querySelector<HTMLElement>(".ProseMirror")!;
  }

  it("has a line to type on below a note that ends in a table (18a)", async () => {
    const body = await open("| Wie | Wat |\n| --- | --- |\n| Jan | offerte |\n");

    // Before this there was no caret position after the table at all — a note written
    // elsewhere that ended in one could not be added to, which in the window notes are
    // written in is the whole point of opening it.
    expect(body.lastElementChild!.tagName).toBe("P");
  });

  it("does the same below a code block and below a rule (18c)", async () => {
    const afterCode = await open("```js\nconst x = 1;\n```\n");
    expect(afterCode.lastElementChild!.tagName).toBe("P");
    capture.unmount();

    const afterRule = await open("Tekst\n\n---\n");
    expect(afterRule.lastElementChild!.tagName).toBe("P");
  });

  it("draws one of two adjacent spellings and keeps both (18d, 18e)", async () => {
    const body = await open("![[offerte.pdf]]\n[[offerte.pdf]]\n");

    // Both nodes are still in the document — this is display-only, and a vault shared with
    // Obsidian has to keep saying what Obsidian expects.
    expect(body.querySelectorAll(".wiki-embed-pdf")).toHaveLength(1);
    expect(body.querySelectorAll(".wiki-link")).toHaveLength(1);
    // The chip beside the embed is marked as the duplicate, by decoration rather than by
    // editing the document. Nothing here is undoable, because nothing was done.
    expect(body.querySelectorAll(".wiki-link-duplicated")).toHaveLength(1);
  });

  it("leaves two far-apart mentions alone, being two deliberate mentions (18f)", async () => {
    const body = await open("[[offerte.pdf]]\n\nVeel tekst hier.\n\n![[offerte.pdf]]\n");

    expect(body.querySelectorAll(".wiki-link")).toHaveLength(1);
    expect(body.querySelectorAll(".wiki-link-duplicated")).toHaveLength(0);
  });
});

describe("inserting a divider in the capture window", () => {
  let capture: MountedCapture;

  afterEach(() => {
    capture.unmount();
  });

  it("puts a rule in with a paragraph below it (18n)", async () => {
    capture = await mountCapture();
    await capture.fireShow();
    await capture.focusBody();

    await capture.clickButton("Insert");
    await capture.clickMenuItem("Divider");

    const body = capture.container.querySelector(".ProseMirror")!;
    expect(body.querySelector("hr")).not.toBeNull();
    // A rule at the very bottom would be the same dead end 18a is about, arrived at by
    // insertion rather than by opening.
    expect(body.lastElementChild!.tagName).toBe("P");
  });
});

describe("pasting into the capture window", () => {
  let capture: MountedCapture;

  afterEach(() => {
    capture.unmount();
  });

  /**
   * §23j's "the paste especially". `paste-wiki.test.ts` pins what the transform makes of a
   * slice; what had never been exercised is whether this window's editor carries it — the
   * chain is assembled in `Editor.tsx` and both windows build their own.
   */
  it("turns a pasted [[…|…]] into a real chip, not into text (23j)", async () => {
    capture = await mountCapture();
    await capture.fireShow();
    await capture.focusBody();

    await capture.pasteInBody({ text: "[[01 Klanten/Offerte klantx|Offerte klantx]]" });

    const link = capture.container.querySelector(".wiki-link");
    expect(link).not.toBeNull();
    expect(link!.textContent).toBe("Offerte klantx");
    expect(link!.getAttribute("data-target")).toBe("01 Klanten/Offerte klantx");
  });

  it("recognises an embed's spelling too, and only this app's syntax", async () => {
    capture = await mountCapture();
    await capture.fireShow();
    await capture.focusBody();

    await capture.pasteInBody({ text: "![[foto.png]]" });
    expect(capture.container.querySelector(".wiki-embed-image-box")).not.toBeNull();

    // Not everything with brackets in it: a single pair is ordinary text, and a note full
    // of `[dit]` would otherwise sprout chips.
    await capture.pasteInBody({ text: " en [dit] blijft tekst" });
    expect(capture.container.querySelector(".ProseMirror")!.textContent).toContain(
      "[dit] blijft tekst",
    );
  });
});

describe("a PDF chip in the capture window", () => {
  let capture: MountedCapture;

  afterEach(() => {
    capture.unmount();
  });

  /**
   * The reachable half of §22q. The two routes must not be confused: a plain `[[file.pdf]]`
   * chip is a *link*, and goes to main's own resolution, while the ⧉ on an embedded page's
   * bar hands the file to the OS instead. The ⧉ is not reachable here — the bar only
   * appears once the page arrives, and the page comes over `fetch()` on a custom protocol
   * that jsdom cannot serve — so that half stays a driver and a person question.
   */
  it("goes to the app's own resolution, never straight to the OS (22q)", async () => {
    capture = await mountCapture();
    await capture.fireLoad(
      openedNote({ doc: docFromMarkdown("Zie [[offerte.pdf]] hierover.\n").toJSON() }),
    );

    await capture.clickAt(capture.container.querySelector(".wiki-link")!);

    expect(capture.spies.openWikiLink).toHaveBeenCalledWith("offerte.pdf");
    expect(capture.spies.openInSystemViewer).not.toHaveBeenCalled();
  });
});
