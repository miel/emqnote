// @vitest-environment jsdom
/**
 * The help sheet hands focus back.
 *
 * Reported from daily use: open the sheet with `Mod-/` from the note editor, close it
 * again, and the next Tab starts at the folder tree's `+ New` button rather than where you
 * were. The sheet focused its own panel and recorded nothing, so closing it left focus on
 * `document.body` and Tab began at the top of the document.
 *
 * The restore lives in the mount effect's cleanup rather than in a `close()` of its own,
 * and that is what the second test is about: `Mod-/` a second time is caught by the
 * window-level listener in `Capture.tsx`/`Library.tsx`, which flips the flag and unmounts
 * the sheet without ever calling `onClose`.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Help } from "../src/renderer/Help.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let opener: HTMLButtonElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  opener = document.createElement("button");
  document.body.appendChild(opener);
});

afterEach(() => {
  container.remove();
  opener.remove();
});

function mount(onClose = vi.fn()): ReturnType<typeof vi.fn> {
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(Help, {
        window: "library" as const,
        isMac: false,
        hotkey: "CommandOrControl+Shift+Y",
        libraryHotkey: "CommandOrControl+Shift+B",
        t: (key: string) => key,
        onClose,
      }),
    );
  });
  return onClose;
}

function unmount(): void {
  act(() => {
    root.unmount();
  });
}

function panel(): HTMLElement {
  return container.querySelector(".help")!;
}

describe("the help sheet and focus", () => {
  it("takes focus while open and gives it back on close", () => {
    opener.focus();
    expect(document.activeElement).toBe(opener);

    mount();
    expect(document.activeElement).toBe(panel());

    unmount();
    expect(document.activeElement).toBe(opener);
  });

  it("gives it back even when it is dismissed without onClose being called", () => {
    opener.focus();
    const onClose = mount();

    // What `Mod-/` a second time does: the window listener flips its own state and the
    // sheet simply disappears.
    unmount();

    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
  });

  it("closes on Escape, from the panel that holds focus", () => {
    opener.focus();
    const onClose = mount();

    act(() => {
      panel().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(onClose).toHaveBeenCalled();
    unmount();
  });
});
