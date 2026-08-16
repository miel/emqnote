// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MoveDialog } from "../src/renderer/library/MoveDialog.js";

/**
 * `preferred` — the one folder Restore wants at the top of an unfiltered list (the
 * Inbox), and the two halves of that rule that are easy to lose.
 *
 * It has to be lifted *before* the fifty-row cap, since with nothing typed every folder
 * scores 0 and the fifty that survive are simply the first fifty in tree order; and it
 * has to stop applying the moment anything is typed, or the dialog would be quietly
 * overruling the search it had just offered.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** More folders than the dialog shows, with the Inbox deliberately last of all. */
const MANY = [
  ...Array.from({ length: 60 }, (_, index) => `10 Projects/Klant ${String(index).padStart(2, "0")}`),
  "00 Inbox",
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(preferred?: string): void {
  act(() => {
    root.render(
      createElement(MoveDialog, {
        folders: MANY,
        current: "_trash",
        preferred,
        onMove: () => {},
        onCancel: () => {},
        t: (key: string) => key,
      }),
    );
  });
}

function rows(): string[] {
  return [...container.querySelectorAll(".palette-list li")].map((node) => node.textContent ?? "");
}

function type(value: string): void {
  const box = container.querySelector("input") as HTMLInputElement;
  // React tracks the last value it wrote, so assigning `.value` directly reads as "no
  // change" and `onChange` never fires. Same helper, same reason, as `note-picker.test.ts`.
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(box, value);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("MoveDialog's preferred folder", () => {
  it("is offered first while nothing is typed, from past the fifty-row cap", () => {
    render("00 Inbox");

    expect(rows()[0]).toBe("00 Inbox");
    expect(rows()).toHaveLength(50);
  });

  it("is not even on the list without it — which is what the lifting is for", () => {
    render();

    expect(rows()).not.toContain("00 Inbox");
  });

  it("stops applying the moment something is typed", () => {
    render("00 Inbox");
    type("klant 3");

    // The ranking is now the answer to what was typed. Pinning a folder above better
    // matches would be the dialog overruling the search it just offered.
    expect(rows()[0]).not.toBe("00 Inbox");
    expect(rows()[0]).toContain("Klant 3");
  });

  it("changes nothing when the preferred folder is already at the top", () => {
    render("10 Projects/Klant 00");

    expect(rows()[0]).toBe("10 Projects/Klant 00");
    expect(rows()[1]).toBe("10 Projects/Klant 01");
  });
});
