// @vitest-environment jsdom
/**
 * Searching the shortcut sheet (B94).
 *
 * The sheet is two dozen rows in two columns, which is the length at which reading it
 * beats scanning it and also the length at which neither is what you came for: you wanted
 * one key. `/` — one keystroke on from the `Mod-/` that opened the sheet — puts the caret
 * in a box that filters it.
 *
 * Mounted rather than read as text, for `help-columns.test.ts`'s reason: what is asserted
 * is which rows survive a query, and that comes out of the same filtering the balance is
 * then run over.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Help } from "../src/renderer/Help.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

/** The real English labels for the ids these tests search by; every other key passes through. */
const NAMES: Record<string, string> = {
  "shortcut.insertTable": "Insert table",
  "shortcut.strong": "Bold",
  "shortcut.newNote": "New note (from anywhere)",
  "help.search": "Search this sheet",
  "help.noMatch": "No shortcut found.",
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(Help, {
        window: "library",
        isMac: false,
        hotkey: "CommandOrControl+Shift+Y",
        libraryHotkey: "CommandOrControl+Shift+B",
        t: (key: string) => NAMES[key] ?? key,
        onClose: vi.fn(),
      }),
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function box(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(".help-search")!;
}

/**
 * Types into the controlled box the way every other jsdom test in this suite does.
 *
 * Through the prototype's own setter, not `field.value = …`: React tracks the last value
 * it wrote and skips `onChange` when a plain assignment leaves its tracker in step with
 * the DOM, so the filter never runs and the test reads as "the search does nothing".
 */
function type(text: string): void {
  act(() => {
    const field = box();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
      field,
      text,
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function rows(): string[] {
  return [...container.querySelectorAll(".help-row")].map((row) => row.textContent ?? "");
}

describe("searching the shortcut sheet", () => {
  it("starts with every row and an empty box", () => {
    expect(box().value).toBe("");
    expect(rows().length).toBeGreaterThan(20);
  });

  it("does not take the caret on its own", () => {
    // The sheet's job is to be read. A caret waiting in a box is a screen asking a
    // question — the panel itself holds focus, which is what `trapTab` and Escape need.
    expect(document.activeElement).toBe(container.querySelector(".help"));
  });

  it("`/` on the panel puts the caret in the box", () => {
    const panel = container.querySelector<HTMLElement>(".help")!;
    act(() => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true }));
    });
    expect(document.activeElement).toBe(box());
  });

  it("`/` typed into the box is a slash, not a shortcut", () => {
    const field = box();
    act(() => field.focus());
    const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
    act(() => {
      field.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("filters by what a row is called", () => {
    type("table");
    expect(rows()).toEqual(["Insert tableCtrl+Alt+T"]);
  });

  it("filters by the chord as it is printed, not as the registry spells it", () => {
    type("ctrl+alt+t");
    expect(rows()).toEqual(["Insert tableCtrl+Alt+T"]);
  });

  it("ignores the spaces someone types between the parts of a chord", () => {
    type("ctrl alt t");
    expect(rows()).toEqual(["Insert tableCtrl+Alt+T"]);
  });

  it("finds the global hotkeys, which are settings and not registry entries", () => {
    // The whole reason those two rows became ordinary entries. A search that could not
    // find the key that starts a note would be a search that refuses the app's most
    // important chord.
    type("new note");
    expect(rows()).toContain("New note (from anywhere)Ctrl+Shift+Y");
  });

  it("drops a group that has nothing left in it", () => {
    type("bold");
    expect(rows()).toEqual(["BoldCtrl+B"]);
    expect(container.querySelectorAll(".help-group")).toHaveLength(1);
    // One group is one column: an empty second track would be white space beside it.
    expect(container.querySelectorAll(".help-column")).toHaveLength(1);
  });

  it("says so when nothing matches, rather than emptying out", () => {
    type("zzzz");
    expect(rows()).toEqual([]);
    expect(container.querySelector(".help-empty")?.textContent).toBe("No shortcut found.");
  });

  it("Escape clears the query before it closes the sheet", () => {
    const onClose = vi.fn();
    act(() => root.unmount());
    root = createRoot(container);
    act(() => {
      root.render(
        createElement(Help, {
          window: "library",
          isMac: false,
          hotkey: "CommandOrControl+Shift+Y",
          libraryHotkey: "CommandOrControl+Shift+B",
          t: (key: string) => NAMES[key] ?? key,
          onClose,
        }),
      );
    });

    type("table");
    const field = box();
    act(() => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    // One press undoes one thing: the query goes, the sheet stays.
    expect(box().value).toBe("");
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      box().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
