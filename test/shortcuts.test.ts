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
import { translate } from "../src/shared/i18n.js";

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

  it("has an English label for every entry", () => {
    // The help sheet renders `shortcut.<id>`, and `translate` falls back to the key name
    // rather than throwing — so a missing label ships as a row reading "shortcut.find".
    const unlabelled = SHORTCUTS.filter(
      (entry) => translate("en-US", `shortcut.${entry.id}`) === `shortcut.${entry.id}`,
    ).map((entry) => entry.id);

    expect(unlabelled).toEqual([]);
  });

  it("lets Mod-F mean two things, in two scopes (B64)", () => {
    // Deliberate, and the test above allows it because the pair it forbids is
    // `where:binding`. What makes it unambiguous is not this table but `outlookKeymap`,
    // which binds only the `editor` entries: with the caret in a note the keymap consumes
    // the key, and everywhere else the library's window listener sees it.
    expect(shortcut("find").keys).toEqual(["Mod-f"]);
    expect(shortcut("find").where).toBe("editor");
    expect(shortcut("searchVault").keys).toEqual(["Mod-f"]);
    expect(shortcut("searchVault").where).toBe("library");

    // And the reason is written down where the next reader will look before "fixing" it.
    expect(shortcut("find").why).toMatch(/B64/);
    expect(shortcut("searchVault").why).toMatch(/B64/);
  });

  it("gives the task item a second chord, and claims both", () => {
    // The order is what the help sheet prints, so first is what a person reads as *the*
    // shortcut. Mod-Shift-T is first because nothing was ever wrong with it: B71 traced
    // three "dead on Windows" reports to an AutoHotkey script on the one machine, not to
    // a property of the platform or of this registry.
    expect(shortcut("task").keys).toEqual(["Mod-Shift-t", "Mod-Shift-d"]);

    // Both work: `matches` asks about the whole entry, never about one binding.
    expect(matches(shortcut("task"), press("t", { ctrlKey: true, shiftKey: true }), false)).toBe(
      true,
    );

    const alias = press("d", { ctrlKey: true, shiftKey: true });
    expect(matches(shortcut("task"), alias, false)).toBe(true);
    // And it belongs to nothing else, in any scope.
    const others = SHORTCUTS.filter(
      (entry) => entry.id !== "task" && matches(entry, alias, false),
    );
    expect(others).toEqual([]);
  });

  it("gives Discard a chord of its own, in the capture window and nowhere else", () => {
    const discard = shortcut("discard");

    // `where: "capture"` is what keeps it out of the library, where there is no such
    // command at all, and out of `outlookKeymap`, which would demand a `COMMANDS` entry.
    expect(discard.where).toBe("capture");
    expect(discard.keys).toEqual(["Mod-Shift-Backspace"]);

    // Escape is the key it must *not* be, and the reason is written where anyone about to
    // "improve" this will read it. B68's Discard is the one command in that window that
    // throws work away, and Escape is the key most likely to be hit by reflex.
    expect(discard.why).toMatch(/Escape/);
    expect(SHORTCUTS.some((entry) => entry.keys.includes("Escape"))).toBe(false);

    // The unshifted form stays free: it is the platform's own "delete to start of line"
    // inside a text field, and this window is mostly text field.
    const unshifted = press("Backspace", { metaKey: true });
    expect(matches(discard, unshifted, true)).toBe(false);
    expect(matches(discard, press("Backspace", { metaKey: true, shiftKey: true }), true)).toBe(
      true,
    );
  });

  it("gives Settings a chord, in the library window and nowhere else", () => {
    const settings = shortcut("settings");

    // ⌘. as asked for on macOS, and one binding rather than two: `Mod` is the whole of
    // what this registry knows about the platform difference, so Ctrl+. is what Windows
    // and Linux get. ⌘, — the macOS Preferences convention — is deliberately not a second
    // alias, and the cost of that is written into `why` rather than left to be discovered.
    expect(settings.keys).toEqual(["Mod-."]);
    expect(matches(settings, press(".", { metaKey: true }), true)).toBe(true);
    expect(matches(settings, press(".", { ctrlKey: true }), false)).toBe(true);
    expect(matches(settings, press(",", { metaKey: true }), true)).toBe(false);

    // The panel lives in the library, so an entry anywhere else would print a row in the
    // capture window's help sheet for a key that does nothing there — and `where:
    // "editor"` would make the first test in this file ask for a `COMMANDS` entry.
    expect(settings.where).toBe("library");
    expect(COMMANDS.settings).toBeUndefined();

    // The panel is what records the global accelerators, so the placement of the handler
    // relative to the overlay guard is load-bearing. That is in `Library.tsx`; what is
    // pinned here is that the reason travels with the binding.
    expect(settings.why).toMatch(/overlay guard/);
  });

  it("keeps the new window chords off the editor keymap's plate", () => {
    // `newNoteHere` and `searchVault` are handled by `Library.tsx`'s window listener, not
    // by `outlookKeymap` — which is why they have no `COMMANDS` entry and must not be
    // `where: "editor"`, or the first test in this file would fail asking for one.
    expect(shortcut("newNoteHere").where).toBe("library");
    expect(shortcut("searchVault").where).toBe("library");
    expect(shortcut("focusTitle").where).toBe("global");
    expect(COMMANDS.find).toBeDefined();
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

  it("draws the keys macOS draws, and spells them out on Windows", () => {
    // The modifiers are already symbols on a Mac, so "⇧⌘Backspace" would be three glyphs
    // and then a word — a sheet that gave up halfway. Only keys whose Mac glyph is the
    // usual spelling get this: Enter and Tab stay words on both platforms, above.
    expect(formatBinding("Mod-Shift-Backspace", true)).toBe("⇧⌘⌫");
    expect(formatBinding("Mod-Shift-Backspace", false)).toBe("Ctrl+Shift+Backspace");
    expect(formatBinding("Mod-Enter", true)).toBe("⌘Enter");
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
