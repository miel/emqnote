import { describe, expect, it } from "vitest";
import {
  formatAccelerator,
  formatBinding,
  formatEntry,
  formatFirstKey,
  matches,
  SHORTCUTS,
  shortcut,
  shortcutsWhere,
  type KeyEvent,
} from "../src/shared/shortcuts.js";
import { COMMANDS } from "../src/renderer/editor/commands.js";

/**
 * The registry is the single definition of the bindings, so what it has to be tested for
 * is that it stays one: every editor entry has a command behind it, no key is claimed
 * twice, and `matches` compares the modifiers a hand-written `if` chain forgot.
 */

function press(key: string, held: Partial<KeyEvent> = {}): KeyEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...held,
  };
}

describe("the registry holds together", () => {
  it("has a command for every editor shortcut", () => {
    const missing = shortcutsWhere("editor")
      .map((entry) => entry.id)
      .filter((id) => COMMANDS[id] === undefined);

    expect(missing).toEqual([]);
  });

  it("claims no key twice", () => {
    const seen = new Map<string, string>();

    for (const entry of SHORTCUTS) {
      for (const binding of entry.keys) {
        // Two windows may claim the same key; the same window may not.
        const claim = `${entry.where}:${binding}`;
        expect(seen.get(claim), `${binding} claimed by ${seen.get(claim)}`).toBeUndefined();
        seen.set(claim, entry.id);
      }
    }
  });

  it("keeps the decisions that used to live in keymap.ts comments", () => {
    // Not decoration: these two pairings look like duplication until you know why.
    expect(shortcut("heading1").why).toMatch(/AltGr/);
    expect(shortcut("paragraph").why).toMatch(/incognito/);
    expect(shortcut("openLibrary").why).toMatch(/global/);
  });
});

describe("matches", () => {
  it("resolves Mod to Cmd on a Mac and Ctrl elsewhere", () => {
    const bold = shortcut("strong");

    expect(matches(bold, press("b", { metaKey: true }), true)).toBe(true);
    expect(matches(bold, press("b", { ctrlKey: true }), true)).toBe(false);

    expect(matches(bold, press("b", { ctrlKey: true }), false)).toBe(true);
    expect(matches(bold, press("b", { metaKey: true }), false)).toBe(false);
  });

  it("requires the modifiers the binding does *not* ask for to be up", () => {
    // The bug this exists to prevent: the capture window treated any Mod+Enter as "save
    // and close" without looking at Shift, so Ctrl+Shift+Enter — ticking a checkbox —
    // dismissed the note instead.
    const close = shortcut("close");

    expect(matches(close, press("Enter", { ctrlKey: true }), false)).toBe(true);
    expect(
      matches(close, press("Enter", { ctrlKey: true, shiftKey: true }), false),
    ).toBe(false);
  });

  it("matches a shifted letter, which arrives uppercase", () => {
    const strike = shortcut("strike");

    expect(matches(strike, press("X", { ctrlKey: true, shiftKey: true }), false)).toBe(true);
  });

  it("fires on any of an entry's aliases", () => {
    const heading = shortcut("heading1");

    expect(matches(heading, press("1", { ctrlKey: true }), false)).toBe(true);
    expect(matches(heading, press("1", { ctrlKey: true, altKey: true }), false)).toBe(true);
    expect(matches(heading, press("1", { altKey: true }), false)).toBe(false);
  });

  it("does not fire a bare key on its modified twin", () => {
    const indent = shortcut("indent");
    expect(matches(indent, press("Tab"), false)).toBe(true);
    expect(matches(indent, press("Tab", { ctrlKey: true }), false)).toBe(false);
  });

  it("reads the pane cycle the same on both platforms, which is what main asks it", () => {
    // `library-window.ts` builds a `KeyEvent` out of `before-input-event`'s `input` and
    // asks this, rather than comparing the fields itself, so that the chord has one
    // spelling — the one the help sheet prints. It is worth pinning because the binding
    // is written `Ctrl-Tab` and not `Mod-Tab`: it must *not* become Cmd on a Mac, where
    // that chord belongs to the OS, and the Windows report this claim was built for makes
    // "does it read the platform right" the first question anyone will ask of it.
    const cycle = shortcut("cyclePanes");

    for (const isMac of [true, false]) {
      expect(matches(cycle, press("Tab", { ctrlKey: true }), isMac)).toBe(true);
      expect(matches(cycle, press("Tab", { ctrlKey: true, shiftKey: true }), isMac)).toBe(true);
      expect(matches(cycle, press("Tab", { metaKey: true }), isMac)).toBe(false);
      expect(matches(cycle, press("Tab"), isMac)).toBe(false);
    }
  });
});

describe("formatting, on both platforms", () => {
  it("uses the symbols on macOS and the words elsewhere", () => {
    expect(formatBinding("Mod-b", true)).toBe("⌘B");
    expect(formatBinding("Mod-b", false)).toBe("Ctrl+B");

    expect(formatBinding("Mod-Shift-l", true)).toBe("⇧⌘L");
    expect(formatBinding("Mod-Shift-l", false)).toBe("Ctrl+Shift+L");

    expect(formatBinding("Mod-Alt-h", true)).toBe("⌥⌘H");
    expect(formatBinding("Mod-Alt-h", false)).toBe("Ctrl+Alt+H");
  });

  it("spells named keys out rather than as one letter", () => {
    expect(formatBinding("Mod-Shift-Enter", false)).toBe("Ctrl+Shift+Enter");
    expect(formatBinding("Shift-Tab", true)).toBe("⇧Tab");
    expect(formatBinding("ContextMenu", false)).toBe("ContextMenu");
  });

  it("collapses an entry's aliases into one row", () => {
    expect(formatEntry(shortcut("heading1"), false, "or")).toBe("Ctrl+1 or Ctrl+Alt+1");
    expect(formatEntry(shortcut("indent"), true, "of")).toBe("Tab of ⌘M");
  });

  it("formats only the lead binding, not every alias", () => {
    // `close` has two aliases; the status bar's dismiss hint wants just the one people
    // actually use, not `formatEntry`'s full "⌘Enter or ⌘W".
    expect(formatFirstKey("close", true)).toBe("⌘Enter");
    expect(formatFirstKey("close", false)).toBe("Ctrl+Enter");
  });

  it("translates the stored Electron accelerator", () => {
    // The global hotkey is a setting, so it arrives spelled the way Electron wants it.
    expect(formatAccelerator("CommandOrControl+Alt+N", false)).toBe("Ctrl+Alt+N");
    expect(formatAccelerator("CommandOrControl+Alt+N", true)).toBe("⌥⌘N");
    expect(formatAccelerator("CommandOrControl+Shift+Space", false)).toBe(
      "Ctrl+Shift+Space",
    );
  });
});
