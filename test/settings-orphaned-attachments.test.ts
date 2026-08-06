// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "../src/renderer/library/Settings.js";
import type { VaultLocation } from "../src/shared/vault-types.js";

// Tells React this jsdom environment is a testing one, so `act(...)` batches updates
// synchronously instead of warning that nothing is configured to flush them.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Bug 7 moves the "Orphaned attachments" entry point out of the folder tree's footer
 * and into Settings, as a button beside a short description. `FolderTree`'s own test
 * (`folder-tree-footer.test.ts`) checks the row is gone from there; this one checks the
 * replacement actually exists here and calls the right prop.
 */

const englishText = (key: string): string => {
  const labels: Record<string, string> = {
    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.hotkey": "Shortcut for a new note",
    "settings.hotkeyHint": "Click, then press the key combination.",
    "settings.close": "Close",
    "settings.vault": "Where your notes live",
    "settings.vaultChoose": "Choose another folder…",
    "orphans.title": "Orphaned attachments",
    "orphans.settingsHint": "Files in _attachments/ that no note points to any more.",
    "ask.cancel": "Cancel",
  };
  return labels[key] ?? key;
};

function textOf(node: Element): string {
  return node.textContent ?? "";
}

describe("Settings > Orphaned attachments section (bug 7)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    (window as unknown as { emqnote: unknown }).emqnote = {
      listVaults: () => Promise.resolve<VaultLocation[]>([]),
    };
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows a button labelled with the reused orphans.title key", async () => {
    const onOpenOrphanedAttachments = vi.fn();

    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(Settings, {
          locale: "en-US",
          hotkey: "CommandOrControl+Shift+Space",
          vaultPath: null,
          t: englishText,
          onChanged: () => {},
          onBeforeSwitch: () => Promise.resolve(),
          onClose: () => {},
          onOpenOrphanedAttachments,
        }),
      );
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const orphanButton = buttons.find((button) => textOf(button) === "Orphaned attachments");
    expect(orphanButton).toBeDefined();

    // The hint sits beside it, for context — not load-bearing on its own, but it is
    // the one other visible trace of this section.
    expect(container.textContent).toContain(
      "Files in _attachments/ that no note points to any more.",
    );

    await act(async () => {
      orphanButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenOrphanedAttachments).toHaveBeenCalledTimes(1);
  });

  it("places the section after the vault list and before the close button", async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(Settings, {
          locale: "en-US",
          hotkey: "CommandOrControl+Shift+Space",
          vaultPath: null,
          t: englishText,
          onChanged: () => {},
          onBeforeSwitch: () => Promise.resolve(),
          onClose: () => {},
          onOpenOrphanedAttachments: () => {},
        }),
      );
    });

    const html = container.innerHTML;
    const vaultAt = html.indexOf("Where your notes live");
    const orphanAt = html.indexOf("Orphaned attachments");
    const closeAt = html.lastIndexOf("Close");

    expect(vaultAt).toBeGreaterThan(-1);
    expect(orphanAt).toBeGreaterThan(-1);
    expect(closeAt).toBeGreaterThan(-1);
    expect(vaultAt).toBeLessThan(orphanAt);
    expect(orphanAt).toBeLessThan(closeAt);
  });
});
