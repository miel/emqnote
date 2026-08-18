/**
 * The editor chords main claims ahead of the window (`src/main/editor-keys.ts`).
 *
 * `Mod-Shift-T` — the checkbox item — was reported doing nothing on Windows, the same
 * shape as the Ctrl-Tab report that put `cyclePanes` into `before-input-event`. What is
 * tested here is the matcher, which is the half that can be tested at all: the claim
 * itself is an Electron event, and whatever eats the chord on Windows is by definition
 * invisible from here.
 *
 * The point of the platform pair is that `Mod` is one binding: the chord is Ctrl+Shift+T
 * off macOS and Cmd+Shift+T on it, and neither may answer to the other's modifier — a
 * claim that fired on both would swallow a key nobody bound.
 */
import { describe, expect, it } from "vitest";
import { editorKeyIntent, type KeyInput } from "../src/main/editor-keys.js";

function press(overrides: Partial<KeyInput>): KeyInput {
  return { key: "T", control: false, meta: false, shift: false, alt: false, ...overrides };
}

describe("editorKeyIntent", () => {
  it("claims Ctrl+Shift+T off macOS", () => {
    expect(editorKeyIntent(press({ control: true, shift: true }), false)).toBe("task");
  });

  it("claims the alias chord too, on both platforms", () => {
    // `task` grew a second binding after the first fix was reported unchanged. Nothing in
    // `editor-keys.ts` changed for it: `editorKeyIntent` asks `matches` about the whole
    // entry, so an alias added to the registry is claimed from the same handler — which
    // is the point of matching against the registry rather than comparing fields by hand.
    expect(editorKeyIntent(press({ key: "D", control: true, shift: true }), false)).toBe("task");
    expect(editorKeyIntent(press({ key: "d", meta: true, shift: true }), true)).toBe("task");
  });

  it("does not claim the alias with the other platform's modifier", () => {
    expect(editorKeyIntent(press({ key: "D", control: true, shift: true }), true)).toBeNull();
    expect(editorKeyIntent(press({ key: "D", meta: true, shift: true }), false)).toBeNull();
  });

  it("does not claim the alias when AltGr is held", () => {
    // The Dutch-layout hazard `heading1`'s own `why` records: Ctrl+Alt is AltGr, and a
    // claim that ignored Alt would swallow a character somebody was typing.
    expect(
      editorKeyIntent(press({ key: "D", control: true, shift: true, alt: true }), false),
    ).toBeNull();
  });

  it("claims Cmd+Shift+T on macOS", () => {
    expect(editorKeyIntent(press({ meta: true, shift: true }), true)).toBe("task");
  });

  it("does not claim the other platform's modifier", () => {
    expect(editorKeyIntent(press({ meta: true, shift: true }), false)).toBeNull();
    expect(editorKeyIntent(press({ control: true, shift: true }), true)).toBeNull();
  });

  it("leaves the unshifted and unmodified forms alone", () => {
    expect(editorKeyIntent(press({ control: true }), false)).toBeNull();
    expect(editorKeyIntent(press({ shift: true }), false)).toBeNull();
    expect(editorKeyIntent(press({}), false)).toBeNull();
  });

  // `matches` compares every modifier, including the ones the binding does not want —
  // which is what keeps Ctrl+Alt+Shift+T (AltGr on a Dutch layout) out of this.
  it("does not claim the chord with an extra modifier held", () => {
    expect(editorKeyIntent(press({ control: true, shift: true, alt: true }), false)).toBeNull();
  });

  it("claims nothing for another letter", () => {
    expect(editorKeyIntent(press({ key: "K", control: true, shift: true }), false)).toBeNull();
  });
});
