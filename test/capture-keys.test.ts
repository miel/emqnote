// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountCapture, openedNote, type MountedCapture } from "./helpers/capture.js";

/**
 * The capture window's own window-level chords — the handler at `Capture.tsx:323`.
 *
 * `test/shortcuts.test.ts` already checks the registry, and `editor-keys.test.ts` the
 * pure matching. Neither covers what this window *does* with a match, which is where the
 * bug that prompted `matches()` lived: a chain of `if (mod && event.key === …)`
 * conditions ignored the modifiers a binding did not ask for, so Ctrl+Shift+Enter —
 * ticking a checkbox — reached the "save and close" branch and dismissed the note being
 * written. Two of the assertions below exist for that failure specifically, and both are
 * about a chord that must *not* fire.
 *
 * Linux, so Mod is Ctrl. The mapping itself is `matches()`'s business, not this file's.
 */

describe("the capture window's window-level chords", () => {
  let capture: MountedCapture;

  beforeEach(async () => {
    capture = await mountCapture({ platform: "linux" });
  });

  afterEach(() => {
    capture.unmount();
  });

  it("commits and puts the note away on Mod+Enter", async () => {
    await capture.pressKey({ key: "Enter", ctrlKey: true });

    expect(capture.spies.close).toHaveBeenCalledTimes(1);
  });

  it("does not put the note away on Mod+Shift+Enter", async () => {
    // The regression this handler was rewritten for. Mod+Shift+Enter ticks a checkbox;
    // reaching `close` here dismissed the note the user was in the middle of writing.
    await capture.pressKey({ key: "Enter", ctrlKey: true, shiftKey: true });

    expect(capture.spies.close).not.toHaveBeenCalled();
  });

  it("does not put the note away on a bare Enter", async () => {
    await capture.pressKey({ key: "Enter" });

    expect(capture.spies.close).not.toHaveBeenCalled();
  });

  it("closes on Mod+W as well, the registry's second binding", async () => {
    await capture.pressKey({ key: "w", ctrlKey: true });

    expect(capture.spies.close).toHaveBeenCalledTimes(1);
  });

  it("discards a brand-new note on Mod+Shift+Backspace (B68)", async () => {
    await capture.pressKey({ key: "Backspace", ctrlKey: true, shiftKey: true });

    expect(capture.spies.discard).toHaveBeenCalledTimes(1);
  });

  it("declines to discard a note handed over from the library", async () => {
    await capture.fireLoad(openedNote());

    await capture.pressKey({ key: "Backspace", ctrlKey: true, shiftKey: true });

    // The outer of two independent locks — `CaptureWriter.discard` refuses such a session
    // too. A chord that silently does nothing beats one that reaches a handler to be
    // refused, so the refusal belongs here as well as there.
    expect(capture.spies.discard).not.toHaveBeenCalled();
  });

  it("raises the library on Mod+O", async () => {
    await capture.pressKey({ key: "o", ctrlKey: true });

    expect(capture.spies.openLibrary).toHaveBeenCalledTimes(1);
  });

  it("opens and closes the help sheet on Mod+/", async () => {
    const sheetOpen = (): boolean => capture.container.querySelector(".help") !== null;
    expect(sheetOpen()).toBe(false);

    await capture.pressKey({ key: "/", ctrlKey: true });
    expect(sheetOpen()).toBe(true);

    await capture.pressKey({ key: "/", ctrlKey: true });
    expect(sheetOpen()).toBe(false);
  });

  it("puts the caret in the subject field on Mod+Shift+R, and selects what is there", async () => {
    await capture.typeSubject("Offer for KlantX");

    await capture.pressKey({ key: "r", ctrlKey: true, shiftKey: true });

    const subject = capture.container.querySelector<HTMLInputElement>("input.subject")!;
    expect(document.activeElement).toBe(subject);
    expect(subject.selectionStart).toBe(0);
    expect(subject.selectionEnd).toBe("Offer for KlantX".length);
  });

  it("declines Mod+Shift+R on a handed-over note, which has no subject field", async () => {
    await capture.fireLoad(openedNote());
    expect(capture.container.querySelector("input.subject")).toBeNull();

    // Nothing to assert but the absence of a throw and of a stolen focus: the title of a
    // note handed over belongs to Rename in the reader (B20), so the chord simply
    // declines rather than falling back to somewhere else.
    await capture.pressKey({ key: "r", ctrlKey: true, shiftKey: true });

    expect(capture.spies.close).not.toHaveBeenCalled();
  });

  it("puts the caret in When on Mod+Shift+W (B94)", async () => {
    await capture.pressKey({ key: "w", ctrlKey: true, shiftKey: true });

    // The first of the four fields, and Tab walks on to the other three: they are four
    // inputs in DOM order, so one chord is enough for all of them. The library window has
    // the same chord over the same block, which is why the entry is `where: "global"`.
    const when = capture.container.querySelector<HTMLElement>(".header-capture .created")!;
    expect(document.activeElement).toBe(when);
  });

  it("hands the keyboard to an open overlay rather than acting on the window", async () => {
    // While the note picker or the table grid is up it owns the keyboard: a window-level
    // chord would otherwise throw focus back into the note and leave the overlay hanging
    // there. Reached the way a person reaches it — the status bar's Insert button, then
    // the item — rather than by setting the state directly.
    await capture.clickButton("Insert");
    await capture.clickMenuItem("Table…");
    expect(capture.container.querySelector(".table-grid")).not.toBeNull();

    await capture.pressKey({ key: "Enter", ctrlKey: true });

    expect(capture.spies.close).not.toHaveBeenCalled();
  });
});
