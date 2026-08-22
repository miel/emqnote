// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountCapture, openedNote, type MountedCapture } from "./helpers/capture.js";

/**
 * What a session in the capture window is: the `session` counter, the `existing` flag and
 * the stamp on `onShow`.
 *
 * All three are load-bearing and none had a test in either window. `session` is
 * `HeaderBlock`'s `key`, so bumping it is the only thing that throws away a half-typed tag
 * or attendee — text sitting in a field's own buffer that was never committed. `existing`
 * decides whether this window may name or throw away the note at all (B20, B68). And the
 * stamp is the stale-clock bug: `freshHeader()` runs at renderer mount, which for this
 * window means once, at login, since it is created at startup and never destroyed.
 */

describe("a capture session", () => {
  let capture: MountedCapture;

  beforeEach(async () => {
    capture = await mountCapture();
  });

  afterEach(() => {
    vi.useRealTimers();
    capture.unmount();
  });

  describe("what a brand-new note may do that a handed-over one may not", () => {
    it("gives a brand-new note a subject field and a Discard button", () => {
      expect(capture.container.querySelector("input.subject")).not.toBeNull();
      expect(capture.container.textContent).toContain("Discard");
    });

    it("takes both away once a note is handed over from the library", async () => {
      await capture.fireLoad(openedNote());

      // The title of an existing note belongs to Rename in the reader — a second way to
      // set it would let the two drift (B20). And a note this window did not begin is not
      // this window's to throw away (B68).
      expect(capture.container.querySelector("input.subject")).toBeNull();
      expect(capture.container.textContent).not.toContain("Discard");
    });

    it("gives them back when the window is put away and begun again", async () => {
      await capture.fireLoad(openedNote());
      await capture.fireReset();

      expect(capture.container.querySelector("input.subject")).not.toBeNull();
      expect(capture.container.textContent).toContain("Discard");
    });
  });

  describe("the half-typed buffer a session bump exists to drop", () => {
    it("drops an uncommitted tag when the window is put away", async () => {
      await capture.typeField("input.tags", "#klantx");
      expect(capture.container.querySelector<HTMLInputElement>("input.tags")!.value).toBe(
        "#klantx",
      );

      await capture.fireReset();

      // Without `key={session}` this text is still sitting in the field for the *next*
      // note, and the following blur commits it to that one — the bug `HeaderBlock`'s own
      // comment on `attendeeText` describes.
      expect(capture.container.querySelector<HTMLInputElement>("input.tags")!.value).toBe("");
    });

    it("drops an uncommitted attendee when a note is handed over", async () => {
      await capture.typeField("input.attendees", "Jan");

      await capture.fireLoad(openedNote());

      expect(
        capture.container.querySelector<HTMLInputElement>("input.attendees")!.value,
      ).toBe("");
    });

    it("shows a handed-over note's own fields, and nothing of the last note's", async () => {
      await capture.typeSubject("Half-written");
      await capture.typeField("input.location", "Amsterdam");

      await capture.fireLoad(
        openedNote({ title: "Offer for KlantX", location: "Utrecht", attendees: ["Jan"] }),
      );

      expect(capture.container.querySelector<HTMLInputElement>("input.location")!.value).toBe(
        "Utrecht",
      );
      // Not a title anywhere in this window: a handed-over note's belongs to Rename in the
      // reader, so it is carried in `header.subject` and deliberately never drawn (B20).
      expect(capture.container.textContent).not.toContain("Half-written");
    });
  });

  describe("the filename in the status bar", () => {
    it("says nothing is saved before there is a file", () => {
      expect(capture.container.querySelector(".filename")!.textContent).toBe(
        "Nothing saved yet",
      );
    });

    it("names the file a handed-over note lives in", async () => {
      await capture.fireLoad(openedNote({ path: "01 Projecten/2026-08-22 1200 Offer.md" }));

      expect(capture.container.querySelector(".filename")!.textContent).toBe(
        "Saved as 2026-08-22 1200 Offer.md",
      );
    });

    it("forgets it again when the window is put away", async () => {
      await capture.fireLoad(openedNote({ path: "01 Projecten/2026-08-22 1200 Offer.md" }));

      await capture.fireReset();

      expect(capture.container.querySelector(".filename")!.textContent).toBe(
        "Nothing saved yet",
      );
    });
  });

  describe("the clock on the way in", () => {
    /** The When button's tooltip carries the formatted stamp; its first line is the date and time. */
    const stamp = (): string =>
      capture.container.querySelector("button.created")!.getAttribute("title")!.split("\n")[0]!;

    it("reads the clock when the note is begun, not when the last one was put away", async () => {
      const before = stamp();

      // The window is created at startup and never destroyed, so `freshHeader()` ran at
      // login. Without the re-stamp, When shows app-launch time for the first note of the
      // day and the previous note's dismissal time for every one after it.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.now() + 3 * 60 * 60 * 1000));
      await capture.fireShow();

      expect(stamp()).not.toBe(before);
    });

    it("leaves the stamp alone once something has been typed", async () => {
      await capture.makeDirty();
      const before = stamp();

      // `reveal()` sends `show` on *every* hotkey press, including one aimed at a window
      // that is already open with a note in it. Re-stamping there would quietly move the
      // date of the note being written.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.now() + 3 * 60 * 60 * 1000));
      await capture.fireShow();

      expect(stamp()).toBe(before);
    });

    it("leaves a handed-over note's own stamp alone", async () => {
      await capture.fireLoad(openedNote({ created: "2026-01-09T09:15:00+01:00" }));
      const before = stamp();

      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.now() + 3 * 60 * 60 * 1000));
      await capture.fireShow();

      // An existing note owns its `created`; it came off the file.
      expect(stamp()).toBe(before);
    });
  });

  it("reports painted only after two frames, with the token it was shown for", async () => {
    await capture.fireShow({ token: 77 });

    // One frame is only *scheduled*; after the second something is actually on screen, and
    // only then is "hotkey to blinking caret" measured honestly.
    expect(capture.spies.painted).not.toHaveBeenCalled();

    await capture.nextFrames(3);

    expect(capture.spies.painted).toHaveBeenCalledWith(77);
  });
});
