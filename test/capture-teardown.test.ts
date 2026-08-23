// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mountCapture, type MountedCapture } from "./helpers/capture.js";

/**
 * The change debounce is cancelled when the window's tree goes away.
 *
 * **This is a CI fix, not a runtime one, and the distinction is the whole entry.** In the
 * app the cleanup can never run: the capture window is created once and only ever hidden
 * (destroying it is unrecoverable, see `CONSTRAINTS.md`), so nothing unmounts this tree.
 * In jsdom it is unmounted between every single test, and a timer armed by the last
 * keystroke of one test fires 300 ms later into an environment that has been torn down —
 * `window` is gone, `send` throws `ReferenceError: window is not defined`, and it is
 * **attributed to whichever test happens to be running by then**. The reported test and
 * the broken one are two different tests, which is exactly the shape `capture-writer`'s
 * rename race had one file over.
 *
 * It never once failed locally. It failed the `v0.11.0` release on the Windows runner and
 * a `main` build the day before, because a loaded runner is what widens the gap between
 * the last keystroke and teardown enough for a 300 ms timer to land inside it.
 *
 * The rule it pins is the general one: **a component that arms a timer owns cancelling
 * it**, whether or not the window it lives in can plausibly go away.
 *
 * **Fake timers cannot test this and the first attempt at it silently could not fail.**
 * `vi.useFakeTimers()` replaces `setTimeout` from the moment it is called; the debounce
 * was armed with the real one before that, so advancing fake time never reaches it and a
 * test written that way passes just as happily with the fix ripped out. Both tests below
 * were confirmed to go red against a disabled cleanup, which is the only thing that makes
 * either of them worth having.
 */

/**
 * Long enough that the 300 ms debounce would certainly have fired, and expressed as a
 * multiple of it rather than as a round number nobody can check.
 *
 * A duration, which this codebase's own rule says to avoid — but the rule is "wait for a
 * result, never for a duration", and what is being waited for here is the *absence* of
 * one. A non-event has no result to wait on, so a margin is the only instrument there is,
 * and the honest thing is to say so and make it generous.
 */
const CHANGE_DEBOUNCE_MS = 300;
const WELL_PAST_THE_DEBOUNCE = CHANGE_DEBOUNCE_MS * 4;

describe("the capture window's change debounce and teardown", () => {
  let capture: MountedCapture;

  it("does not fire after the tree has been unmounted", async () => {
    capture = await mountCapture();
    capture.spies.change.mockClear();

    // Arms the debounce and does not wait it out: `makeDirty` pumps microtasks only, so
    // the timer is still pending on the next line. That ordering is the test.
    await capture.makeDirty();
    capture.unmount();

    await new Promise((done) => setTimeout(done, WELL_PAST_THE_DEBOUNCE));

    // Without the cleanup the timer lands here, calls `send`, and reaches `window`. In a
    // real run that `window` is gone and the throw is charged to another test entirely.
    expect(capture.spies.change).not.toHaveBeenCalled();
  });

  it("still sends the change when the window stays put", async () => {
    // The other half, or the fix could be "clear the timer immediately" and this file
    // would be perfectly happy about a window that never saved anything.
    capture = await mountCapture();
    capture.spies.change.mockClear();
    await capture.makeDirty();

    await capture.waitFor(
      () => capture.spies.change.mock.calls.length > 0,
      "the debounced change to reach main",
    );
    expect(capture.spies.change).toHaveBeenCalled();
    capture.unmount();
  });
});
