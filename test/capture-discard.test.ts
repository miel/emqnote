// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountCapture, type MountedCapture } from "./helpers/capture.js";

/**
 * Discard asks first, unless there is nothing in the note to lose (B85).
 *
 * It asked nothing at all, on the argument that the draft is written to `_trash` and
 * Restore is the way back — the same argument B54 makes for dragging a note onto the
 * trash, and it does not carry here. Discard in this window is bound to a chord, sits one
 * item into a menu at the foot of a window someone is typing in, and takes the window with
 * it: there is nothing left on screen afterwards to notice the note by. A recoverable
 * action nobody realises they took is not recoverable in the way that argument assumed.
 *
 * What is pinned is both halves. A confirmation in front of an *empty* note is the kind
 * that teaches people to click through confirmations, so the question is only ever asked
 * when the window has something in it — and "something in it" is judged by the document's
 * structure, never by its text, or a note holding nothing but a pasted picture would be
 * thrown away without a word.
 */

describe("discarding a note that has something in it", () => {
  let capture: MountedCapture;

  beforeEach(async () => {
    capture = await mountCapture();
  });

  afterEach(() => {
    vi.useRealTimers();
    capture.unmount();
  });

  const asking = (): boolean => capture.container.querySelector(".ask") !== null;

  it("throws an untouched note away without asking", async () => {
    await capture.clickButton("Actions");
    await capture.clickMenuItem("Discard");

    expect(asking()).toBe(false);
    expect(capture.spies.discard).toHaveBeenCalled();
  });

  it("asks first once something has been typed", async () => {
    await capture.typeInBody("een halve zin");

    await capture.clickButton("Actions");
    await capture.clickMenuItem("Discard");

    expect(asking()).toBe(true);
    // Nothing has gone yet, which is the whole point of the question.
    expect(capture.spies.discard).not.toHaveBeenCalled();
  });

  it("asks first once a header field has been filled in", async () => {
    // The body is what most notes are, but a note that is only a subject and a couple of
    // attendees is a note someone typed. `HeaderValues` is compared field by field
    // against a fresh one, so this covers the other fields without naming them.
    await capture.typeSubject("Offerte Klant X");

    await capture.clickButton("Actions");
    await capture.clickMenuItem("Discard");

    expect(asking()).toBe(true);
    expect(capture.spies.discard).not.toHaveBeenCalled();
  });

  it("asks for a note holding nothing but a picture, which has no text at all", async () => {
    // The subtle half, and the reason the check reads the document's structure rather than
    // its `textContent`: a pasted picture is exactly the thing someone could not retype,
    // and it would be thrown away without a word by any test that asks whether the note
    // has any text in it.
    capture.spies.pickAttachment.mockResolvedValueOnce("Pasted image 20260822.png");
    await capture.clickButton("Insert");
    await capture.clickMenuItem("Insert image");

    await capture.clickButton("Actions");
    await capture.clickMenuItem("Discard");

    expect(asking()).toBe(true);
    expect(capture.spies.discard).not.toHaveBeenCalled();
  });

  it("throws it away when the question is answered", async () => {
    await capture.typeInBody("een halve zin");
    await capture.clickButton("Actions");
    await capture.clickMenuItem("Discard");

    await capture.clickButton("Discard");

    expect(capture.spies.discard).toHaveBeenCalled();
  });

  it("keeps the note when the question is cancelled", async () => {
    await capture.typeInBody("een halve zin");
    await capture.clickButton("Actions");
    await capture.clickMenuItem("Discard");

    await capture.clickButton("Cancel");

    expect(asking()).toBe(false);
    expect(capture.spies.discard).not.toHaveBeenCalled();
  });

  it("asks the same question when the chord is what asked for it", async () => {
    // The chord and the menu item go through one function, so the two cannot come to
    // disagree about when the question is asked — the same rule the `existing` check they
    // also share is written under.
    await capture.typeInBody("een halve zin");
    await capture.pressKey({ key: "Backspace", ctrlKey: true, shiftKey: true });

    expect(asking()).toBe(true);
    expect(capture.spies.discard).not.toHaveBeenCalled();
  });

  it("does not let Escape hide the window out from under the question", async () => {
    // While it is up the dialog owns the keyboard, exactly as the note picker and the
    // table grid do. Escape reaching `fires("close")` would put the window away with the
    // question still on it — and the note still there, unanswered.
    await capture.typeInBody("een halve zin");
    await capture.clickButton("Actions");
    await capture.clickMenuItem("Discard");

    await capture.pressKeyOn(".ask", { key: "Escape" });

    expect(capture.spies.close).not.toHaveBeenCalled();
    // And it does cancel the question rather than doing nothing at all: `Ask` focuses its
    // confirm button when there is no text field, so the key lands inside the panel.
    expect(asking()).toBe(false);
    expect(capture.spies.discard).not.toHaveBeenCalled();
  });
});
