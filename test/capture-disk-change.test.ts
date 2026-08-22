// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountCapture, openedNote, type MountedCapture } from "./helpers/capture.js";

/**
 * B31 in the *capture* window — the one item `TEST-PROTOCOL.md` §10 records as never
 * having been reachable by automation at all, because no harness existed to drive this
 * window's renderer. `test/library-disk-change.test.ts` has covered the library reader's
 * half of the same feature since the day it shipped; this is the other half.
 *
 * The three branches are at `Capture.tsx:275–303`, and what separates them is `dirtyRef`
 * read at the instant the event arrives. That is why these go through a real keystroke
 * rather than a flag: see `makeDirty` in the helper.
 *
 * The asymmetry with the library is the point of the feature and so of the test. The
 * reader offers buttons; this window must not, because the person may be mid-sentence and
 * a button that could discard what they are typing is the one failure worth designing
 * against. Two of the assertions below are therefore about something *not* happening.
 */

const CHANGED = "This note changed outside emqnote in the meantime.";
const REMOVED = "This note was deleted outside emqnote in the meantime.";
const PATH = "00 Inbox/2026-08-22 1200 Handed over.md";

describe("the capture window's disk-change notice", () => {
  let capture: MountedCapture;

  const notice = (): string | null =>
    capture.container.querySelector(".disk-notice")?.textContent ?? null;

  beforeEach(async () => {
    capture = await mountCapture();
    // Every one of these events is about a note this window already holds: main only
    // sends them for the path `writer.activePath()` reports (`notifyFileEvent` in
    // `index.ts`), so a hand-over is the honest starting state.
    await capture.fireLoad(openedNote({ path: PATH }));
  });

  afterEach(() => {
    capture.unmount();
  });

  it("rereads the note when it changed on disk and nothing here is unsaved", async () => {
    await capture.fireVaultFileChanged({ path: PATH, kind: "changed" });

    expect(capture.spies.reloadNote).toHaveBeenCalledTimes(1);
    expect(notice()).toBeNull();
  });

  it("shows a notice and does not reread when there is something unsaved", async () => {
    await capture.makeDirty();

    await capture.fireVaultFileChanged({ path: PATH, kind: "changed" });

    // The half that matters: rereading here would replace what the user is typing with
    // whatever landed on disk, which is exactly the loss the notice exists to avoid.
    expect(capture.spies.reloadNote).not.toHaveBeenCalled();
    expect(notice()).toBe(CHANGED);
  });

  it("shows a notice when the note was deleted, even with nothing unsaved", async () => {
    await capture.fireVaultFileChanged({ path: PATH, kind: "removed" });

    // "removed" never rereads, whatever `dirtyRef` says: there is nothing to reread, and
    // this window's next debounced write simply recreates the file — which, unlike in the
    // reader, is what the person composing here wants.
    expect(capture.spies.reloadNote).not.toHaveBeenCalled();
    expect(notice()).toBe(REMOVED);
  });

  it("shows the same notice for a deletion when there is something unsaved", async () => {
    await capture.makeDirty();

    await capture.fireVaultFileChanged({ path: PATH, kind: "removed" });

    expect(capture.spies.reloadNote).not.toHaveBeenCalled();
    expect(notice()).toBe(REMOVED);
  });

  it("offers no buttons alongside the notice", async () => {
    await capture.makeDirty();
    await capture.fireVaultFileChanged({ path: PATH, kind: "changed" });

    const bar = capture.container.querySelector(".disk-notice")!;
    expect(bar.querySelector("button")).toBeNull();
    // The reader's own bar is built from these two; neither may appear in this window.
    const text = capture.container.textContent ?? "";
    expect(text).not.toContain("Keep mine");
    expect(text).not.toContain("Reload");
  });

  it("clears the notice when a note is loaded in", async () => {
    await capture.makeDirty();
    await capture.fireVaultFileChanged({ path: PATH, kind: "changed" });
    expect(notice()).toBe(CHANGED);

    await capture.fireLoad(openedNote({ path: PATH, title: "Reloaded" }));

    expect(notice()).toBeNull();
  });

  it("clears the notice when the window is put away", async () => {
    await capture.makeDirty();
    await capture.fireVaultFileChanged({ path: PATH, kind: "removed" });
    expect(notice()).toBe(REMOVED);

    await capture.fireReset();

    expect(notice()).toBeNull();
  });

  it("goes back to rereading once a load has cleared the unsaved edit", async () => {
    await capture.makeDirty();
    await capture.fireVaultFileChanged({ path: PATH, kind: "changed" });
    expect(capture.spies.reloadNote).not.toHaveBeenCalled();

    // What `reloadNote()` itself ends in, and what clears `dirtyRef` — the timing this
    // whole feature turns on, and the reason a shallow render would prove nothing.
    await capture.fireLoad(openedNote({ path: PATH }));
    await capture.fireVaultFileChanged({ path: PATH, kind: "changed" });

    expect(capture.spies.reloadNote).toHaveBeenCalledTimes(1);
    expect(notice()).toBeNull();
  });
});
