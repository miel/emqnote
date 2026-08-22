// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountCapture, type MountedCapture } from "./helpers/capture.js";

/**
 * Putting something *into* a note, in the capture window.
 *
 * This is the gap four separate features have tripped on, and it is worth being exact
 * about which half of it a jsdom test can close. "Does the capture window really draw an
 * inline attachment" is two questions wearing one coat: whether the route from the status
 * bar to the document exists in this window at all, and whether pixels then appear. The
 * first is what was actually unverified — the same code demonstrably works in the library,
 * but nothing had ever exercised *this* window's copy of it — and it is answered here. The
 * second needs a real display and stays `TEST-PROTOCOL.md` §4.2/§4.5, for
 * `scripts/drive-capture.ts` and for a person.
 *
 * The routes are reached the way a person reaches them — the status bar's Insert button,
 * then the item — rather than by calling the handlers directly, because "is it wired up in
 * this window" is the whole question.
 */

describe("inserting into a note in the capture window", () => {
  let capture: MountedCapture;

  beforeEach(async () => {
    capture = await mountCapture();
  });

  afterEach(() => {
    capture.unmount();
  });

  it("offers the same five things the reader's Insert menu does", async () => {
    await capture.clickButton("Insert");

    const labels = [...capture.container.querySelectorAll(".context-menu-label")].map(
      (node) => (node.textContent ?? "").trim(),
    );
    // One list, built from `insertMenuItems`, so the two windows cannot come to offer
    // different things or spell them differently.
    expect(labels).toEqual([
      "Insert image",
      "Insert file",
      "Link to note…",
      "Table…",
      "Divider",
    ]);
  });

  it("narrows the picker to images for Insert image", async () => {
    await capture.clickButton("Insert");
    await capture.clickMenuItem("Insert image");

    expect(capture.spies.pickAttachment).toHaveBeenCalledWith("image");
  });

  it("keeps the combined filter for Insert file", async () => {
    await capture.clickButton("Insert");
    await capture.clickMenuItem("Insert file");

    expect(capture.spies.pickAttachment).toHaveBeenCalledWith("any");
  });

  it("puts a picked picture into the document", async () => {
    capture.spies.pickAttachment.mockResolvedValueOnce("Pasted image 20260822.png");

    await capture.clickButton("Insert");
    await capture.clickMenuItem("Insert image");

    // A node view in this window's own editor, not merely a call that was made. Whether it
    // then paints is the half a display has to answer — `naturalWidth` is meaningless in
    // jsdom, which loads nothing.
    const box = capture.container.querySelector(".wiki-embed-image-box");
    expect(box).not.toBeNull();
    expect(box!.querySelector("img.wiki-embed-image")).not.toBeNull();
  });

  it("puts a picked PDF into the document", async () => {
    capture.spies.pickAttachment.mockResolvedValueOnce("2026-08-22 offerte.pdf");

    await capture.clickButton("Insert");
    await capture.clickMenuItem("Insert file");

    // A PDF gets its own node view with a page strip (B40/B30), not the plain chip a
    // `.docx` gets. Which of the two appears is the thing worth pinning: they are
    // different code paths and only one of them asks main for a page count.
    expect(capture.container.querySelector(".wiki-embed-pdf")).not.toBeNull();
  });

  it("puts a file with no preview in as a link rather than an embed", async () => {
    capture.spies.pickAttachment.mockResolvedValueOnce("2026-08-22 begroting.xlsx");

    await capture.clickButton("Insert");
    await capture.clickMenuItem("Insert file");

    // `[[…]]`, not `![[…]]`. Embedding something the app cannot draw would leave a hole in
    // the note where a picture is supposed to be; a link is the honest shape for it, and
    // it still opens in the system viewer.
    const link = capture.container.querySelector(".wiki-link");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("data-target")).toBe("2026-08-22 begroting.xlsx");
  });

  it("inserts nothing when the picker is cancelled", async () => {
    // The stub answers null by default, which is what the picker answers on cancel.
    await capture.clickButton("Insert");
    await capture.clickMenuItem("Insert image");

    expect(capture.container.querySelector(".wiki-embed-image-box")).toBeNull();
    expect(capture.container.querySelector(".wiki-embed-pdf")).toBeNull();
    expect(capture.container.querySelector(".wiki-link")).toBeNull();
  });

  it("opens the table grid and inserts what it is asked for (B42)", async () => {
    await capture.clickButton("Insert");
    await capture.clickMenuItem("Table…");

    const grid = capture.container.querySelector(".table-grid");
    expect(grid).not.toBeNull();

    // The grid's cells are the size chooser; clicking one is how a size is picked.
    const cells = grid!.querySelectorAll(".table-grid-cells > *");
    expect(cells.length).toBeGreaterThan(0);

    await capture.clickGridCell(2, 3);

    expect(capture.container.querySelector(".table-grid")).toBeNull();
    const table = capture.container.querySelector(".ProseMirror table");
    expect(table).not.toBeNull();
    expect(table!.querySelectorAll("tr").length).toBe(2);
  });

  it("closes the Insert menu again without inserting anything", async () => {
    await capture.clickButton("Insert");
    expect(capture.container.querySelector(".context-menu")).not.toBeNull();

    // On the menu itself, which is where it listens and where focus actually is — it
    // takes focus when it opens and hands it back on close.
    await capture.pressKeyOn(".context-menu", { key: "Escape" });

    expect(capture.container.querySelector(".context-menu")).toBeNull();
  });
});
