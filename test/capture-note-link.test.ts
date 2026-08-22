// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountCapture, openedNote, type MountedCapture } from "./helpers/capture.js";
import { docFromMarkdown } from "./helpers/editing.js";

/**
 * Linking to another note (B41) from the capture window, and following one.
 *
 * `TEST-PROTOCOL.md` §13h calls this "the row most worth walking", and the reason is not
 * that the code is unusual: it is that this is the window notes are actually written in,
 * and a link is something you reach for mid-sentence. §16i is the other end of the same
 * thing — clicking a chip that is already in the note.
 *
 * `insert-note-link.test.ts` and `note-picker.test.ts` cover the pieces: the input rule,
 * the prefix removal, the ranking, the palette's own keyboard. What is driven here is the
 * route through *this* window — the `[[` reaching `Editor.tsx`'s `onNoteLinkRequested`,
 * `Capture.tsx` turning that into a `NotePicker` with the right prefix, and the pick coming
 * back through `insertNoteLink` into this window's document.
 *
 * The picker asks main behind a 150 ms debounce, so this file waits on the *result* — see
 * `waitFor` in `helpers/capture.ts`, and `capture-writer.test.ts` for what waiting on a
 * duration costs instead.
 */

const OFFERTE = {
  path: "01 Klanten/Offerte klantx.md",
  title: "Offerte klantx",
  folder: "01 Klanten",
  // The path with its extension taken off, which is what a `[[…]]` has to spell. It comes
  // over IPC rather than being derived here — `linkTargetFor` lives in main.
  target: "01 Klanten/Offerte klantx",
};

describe("linking to a note from the capture window", () => {
  let capture: MountedCapture;

  beforeEach(async () => {
    capture = await mountCapture();
    capture.spies.linkCandidates.mockResolvedValue([OFFERTE]);
    await capture.fireShow();
    await capture.focusBody();
  });

  afterEach(() => {
    capture.unmount();
  });

  function body(): string {
    return capture.container.querySelector(".ProseMirror")!.textContent ?? "";
  }

  function rows(): string[] {
    return [...capture.container.querySelectorAll(".palette-list li")].map(
      (node) => node.textContent ?? "",
    );
  }

  async function listed(): Promise<void> {
    await capture.waitFor(
      () => capture.container.querySelector(".palette-empty") === null && rows().length > 0,
      "the picker to list a note",
    );
  }

  it("opens on a typed [[, mid-sentence, with the brackets still showing (13a)", async () => {
    await capture.typeInBody("Zie [[");

    expect(capture.container.querySelector(".overlay .palette")).not.toBeNull();
    // Still visible behind the picker. Nothing has been silently eaten, so nothing needs
    // undoing if the picker is dismissed.
    expect(body()).toBe("Zie [[");
  });

  it("closes on Escape and leaves the [[ exactly as typed (13b)", async () => {
    await capture.typeInBody("Zie [[");
    await listed();

    // On the input, which is where the picker listens and where it puts focus when it
    // opens — the palette itself handles no keys.
    await capture.pressKeyOn(".palette input", { key: "Escape" });

    expect(capture.container.querySelector(".overlay .palette")).toBeNull();
    expect(body()).toBe("Zie [[");
  });

  it("swallows the brackets and writes the path, not the title (13c)", async () => {
    await capture.typeInBody("Zie [[");
    await listed();
    expect(rows()[0]).toContain("Offerte klantx");
    expect(rows()[0]).toContain("01 Klanten");

    await capture.clickPaletteRow("Offerte klantx");

    const link = capture.container.querySelector(".wiki-link");
    expect(link).not.toBeNull();
    // The chip reads the title and the node carries the path. Writing a bare
    // `[[Offerte klantx]]` would make the click ambiguous the moment a second note shares
    // the name, which is the whole reason the path is written.
    expect(link!.textContent).toBe("Offerte klantx");
    expect(link!.getAttribute("data-target")).toBe("01 Klanten/Offerte klantx");
    expect(body()).toBe("Zie Offerte klantx");
  });

  it("opens the target when the chip is clicked, from this window (13d, 16i)", async () => {
    await capture.fireLoad(
      openedNote({
        doc: docFromMarkdown("Zie [[01 Klanten/Offerte klantx|Offerte klantx]] hierover.\n").toJSON(),
      }),
    );

    const link = capture.container.querySelector(".wiki-link")!;
    await capture.clickAt(link);

    // Main does the rest — raising the library on the target and giving it a way back to
    // the note being typed here. What this window owes is the call, with the path it was
    // handed rather than the title it draws.
    expect(capture.spies.openWikiLink).toHaveBeenCalledWith("01 Klanten/Offerte klantx");
  });

  it("says so when nothing matches, rather than showing an empty box (13f)", async () => {
    capture.spies.linkCandidates.mockResolvedValue([]);

    await capture.typeInBody("Zie [[");
    await capture.waitFor(
      () => capture.container.querySelector(".palette-empty") !== null,
      "the picker to say nothing matches",
    );

    expect(capture.container.querySelector(".palette-empty")!.textContent).toBe(
      "No note matches",
    );
  });

  it("opens from the chord too, with no prefix to swallow (13e)", async () => {
    // `Mod+Shift+K` through the editor's own keymap. The half of 13e that needs a
    // selection to seed the filter is not here: jsdom moves no selection of its own, so
    // `getSelectedText` has nothing to read — `note-picker.test.ts` covers the seeding.
    await capture.pressKeyInBody({ key: "k", ctrlKey: true, shiftKey: true });
    await listed();

    await capture.clickPaletteRow("Offerte klantx");

    // No stray characters: the chord route hands `""` as the prefix, so there is nothing
    // for `insertNoteLinkOverPrefix` to remove and nothing left behind either.
    expect(body()).toBe("Offerte klantx");
  });
});
