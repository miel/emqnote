// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountCapture, type MountedCapture } from "./helpers/capture.js";

/**
 * The `/` menu (B51) in the capture window.
 *
 * `slash-menu.test.ts` already drives this plugin against a bare `EditorView`, and every
 * question about the menu *itself* — the query, the filter, the prefix removal, what each
 * item does to the document — is answered there and is not repeated here. What was never
 * answered is the sentence in `TODO.md`: does any of it reach *this* window. That is not
 * the same question, and it is not idle. The four items that need main go out through
 * `Editor.tsx`'s `onImageRequested` / `onFileRequested` / `onNoteLinkRequested` /
 * `onTableRequested` props, and the capture window's copies of those are different
 * closures from the library's and different again from the ones its own Insert menu uses
 * (`capture-insert.test.ts` covers that second route). A prop dropped here would leave the
 * menu opening, filtering and highlighting perfectly while a third of it did nothing.
 *
 * Typed rather than dispatched: `typeInBody` writes into the DOM and lets ProseMirror read
 * it back, which is what a browser does and which is the only way `handleTextInput` — the
 * thing that opens this menu at all — is ever reached. See `helpers/capture.ts`.
 *
 * Not here, and deliberately: where the panel lands. It flips above the caret in a short
 * window, and jsdom has no boxes to flip within — `TEST-PROTOCOL.md` §19t and
 * `scripts/drive-capture.ts` own that, as they own every other question about position.
 */

function panel(): HTMLElement | null {
  // Appended to `document.body` by the plugin, never into the window's own tree — so it is
  // not reachable through `capture.container`, and `styles-overlay.test.ts` says the same.
  return document.querySelector(".slash-menu");
}

function labels(): string[] {
  return [...document.querySelectorAll(".slash-menu .context-menu-label")].map((node) =>
    (node.textContent ?? "").trim(),
  );
}

describe("the / menu in the capture window", () => {
  let capture: MountedCapture;

  beforeEach(async () => {
    capture = await mountCapture();
    // The window as the hotkey leaves it: a brand-new note, caret in the subject field,
    // then Enter into the note. Nothing here starts in the body by itself.
    await capture.fireShow();
    await capture.focusBody();
  });

  afterEach(() => {
    capture.unmount();
  });

  it("opens on a slash typed at the start of an empty note", async () => {
    await capture.typeInBody("/");

    expect(panel()).not.toBeNull();
    // All sixteen, in this window too. The count is the point rather than the wording:
    // the list is built from `slashMenuItems`, so a window offering fewer would mean one
    // of the four main-side routes had not been handed to the plugin.
    expect(labels()).toHaveLength(16);
    expect(labels()).toContain("Heading 1");
    expect(labels()).toContain("Divider");
  });

  it("narrows as the word is typed", async () => {
    await capture.typeInBody("/tab");

    expect(labels()).toEqual(["Table…"]);
  });

  it("closes on Escape, leaving what was typed in the note", async () => {
    await capture.typeInBody("/tab");
    await capture.pressKeyInBody({ key: "Escape" });

    expect(panel()).toBeNull();
    // The text stays: dismissing the menu is not an undo, and someone who meant to write
    // "/tab" has now written it.
    expect(capture.container.querySelector(".ProseMirror")!.textContent).toBe("/tab");
  });

  it("routes Insert image to this window's picker, and takes the prefix with it", async () => {
    await capture.typeInBody("/image");
    expect(labels()).toEqual(["Insert image"]);

    await capture.clickSlashItem("Insert image");

    // `Capture.tsx`'s own `pickAndInsertImage`, reached through `Editor.tsx`'s
    // `onImageRequested` — a different closure from the Insert menu's, and the one nothing
    // had ever exercised in this window.
    expect(capture.spies.pickAttachment).toHaveBeenCalledWith("image");
    // The `/image` goes with it. The menu removes its own prefix before running the item,
    // which is why the note-link route is handed `""` rather than `"/"`.
    expect(capture.container.querySelector(".ProseMirror")!.textContent).toBe("");
  });

  it("routes Insert file to the same picker with the wider filter", async () => {
    await capture.typeInBody("/file");

    await capture.clickSlashItem("Insert file");

    expect(capture.spies.pickAttachment).toHaveBeenCalledWith("any");
  });

  it("opens this window's table grid, and the size picked lands in the document", async () => {
    await capture.typeInBody("/tab");

    await capture.clickSlashItem("Table…");

    // The grid is a React overlay `Capture.tsx` renders from its own state, so this is the
    // whole `onTableRequested` → `setTableGrid` → `insertTable` chain in this window.
    expect(capture.container.querySelector(".table-grid")).not.toBeNull();

    await capture.clickGridCell(2, 3);

    const table = capture.container.querySelector(".ProseMirror table");
    expect(table).not.toBeNull();
    expect(table!.querySelectorAll("tr")).toHaveLength(2);
  });

  it("opens the note picker with no prefix left to swallow (B41)", async () => {
    await capture.typeInBody("/link");

    await capture.clickSlashItem("Link to note…");

    // `NotePicker` is the shared palette overlay, the same one the link picker and the
    // move dialog use — its presence in *this* window is what the route ends in.
    expect(capture.container.querySelector(".overlay .palette")).not.toBeNull();
  });

  it("runs a plain editor command without going near main", async () => {
    await capture.typeInBody("/bullet");

    await capture.clickSlashItem("Bullet list");

    // No IPC in this one — it is a ProseMirror command, and it has to work in the window
    // whose whole job is typing.
    expect(capture.container.querySelector(".ProseMirror ul")).not.toBeNull();
    expect(capture.spies.pickAttachment).not.toHaveBeenCalled();
  });

  it("is walked and chosen from the keyboard, which is how it is actually used", async () => {
    await capture.typeInBody("/head");

    expect(labels()).toEqual([
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Heading 4",
      "Heading 5",
      "Heading 6",
    ]);

    await capture.pressKeyInBody({ key: "ArrowDown" });
    await capture.pressKeyInBody({ key: "Enter" });

    expect(panel()).toBeNull();
    expect(capture.container.querySelector(".ProseMirror h2")).not.toBeNull();
  });
});
