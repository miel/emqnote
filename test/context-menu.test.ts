// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextMenu, type MenuItem } from "../src/renderer/library/ContextMenu.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function mount(items: MenuItem[], onClose = vi.fn()): { onClose: ReturnType<typeof vi.fn> } {
  root = createRoot(container);
  act(() => {
    root.render(createElement(ContextMenu, { x: 40, y: 60, items, onClose }));
  });
  return { onClose: onClose as ReturnType<typeof vi.fn> };
}

function panel(): HTMLElement {
  return container.querySelector(".context-menu")!;
}

function items(): HTMLElement[] {
  return Array.from(container.querySelectorAll(".context-menu-item"));
}

function active(): HTMLElement | null {
  return container.querySelector(".context-menu-active");
}

function keydown(target: Element, key: string, shiftKey = false): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }),
    );
  });
}

describe("ContextMenu", () => {
  it("opens at the given point", () => {
    mount([{ label: "One", onSelect: () => {} }]);
    expect(panel().style.left).toBe("40px");
    expect(panel().style.top).toBe("60px");
  });

  it("closes on Escape", () => {
    const { onClose } = mount([{ label: "One", onSelect: () => {} }]);
    keydown(panel(), "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on an outside mousedown", () => {
    const { onClose } = mount([{ label: "One", onSelect: () => {} }]);
    container.querySelector(".context-menu-overlay")!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("highlights the first selectable item on open", () => {
    mount([{ label: "One", onSelect: () => {} }, { label: "Two", onSelect: () => {} }]);
    expect(active()?.textContent).toContain("One");
  });

  it("moves the highlight with arrow keys", () => {
    mount([
      { label: "One", onSelect: () => {} },
      { label: "Two", onSelect: () => {} },
      { label: "Three", onSelect: () => {} },
    ]);
    keydown(panel(), "ArrowDown");
    expect(active()?.textContent).toContain("Two");
    keydown(panel(), "ArrowDown");
    expect(active()?.textContent).toContain("Three");
    keydown(panel(), "ArrowUp");
    expect(active()?.textContent).toContain("Two");
  });

  it("fires the highlighted item's onSelect on Enter, then closes", () => {
    const onSelect = vi.fn();
    const { onClose } = mount([
      { label: "One", onSelect: () => {} },
      { label: "Two", onSelect },
    ]);
    keydown(panel(), "ArrowDown");
    keydown(panel(), "Enter");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("skips a separator (an item with no onSelect) when arrow-keying past it", () => {
    mount([
      { label: "One", onSelect: () => {} },
      { label: "" },
      { label: "Two", onSelect: () => {} },
    ]);
    keydown(panel(), "ArrowDown");
    expect(active()?.textContent).toContain("Two");

    // A separator renders as its own element, not a `.context-menu-item` button.
    expect(items()).toHaveLength(2);
  });

  it("skips a disabled item when arrow-keying, and it does not fire even if clicked directly", () => {
    const onSelect = vi.fn();
    mount([
      { label: "One", onSelect: () => {} },
      { label: "Disabled", onSelect, disabled: true },
      { label: "Two", onSelect: () => {} },
    ]);
    keydown(panel(), "ArrowDown");
    expect(active()?.textContent).toContain("Two");

    // Force-selecting it directly (a click, bypassing the keyboard highlight entirely)
    // still must not fire — `disabled` is checked at the point of selection, not only
    // during arrow-key traversal.
    const disabledButton = items().find((node) => node.textContent?.includes("Disabled"))!;
    act(() => {
      disabledButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("restores focus to whatever opened it, on close", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    mount([{ label: "One", onSelect: () => {} }]);
    expect(document.activeElement).not.toBe(opener);

    keydown(panel(), "Escape");
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
