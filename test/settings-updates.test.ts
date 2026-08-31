// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Settings panel's "Check for updates…" row.
 *
 * The check itself was reachable from the tray icon's menu and from nowhere else, which is
 * where nobody looks — and on Windows that icon can be folded away under the overflow
 * chevron entirely. This is the same check from the place people go looking for it.
 *
 * Mounted on its own, for `settings-theme.test.ts`'s reason: the question is one control's
 * wiring, and a fake vault, tree and index would be scenery around it. What this file
 * cannot reach is everything past the IPC call — every answer the check has is a native
 * dialog raised in main, which is `TEST-PROTOCOL.md`'s to watch.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const checkForUpdates = vi.fn(async () => {});

async function flush(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("the settings panel's update check", () => {
  let SettingsComponent: typeof import("../src/renderer/library/Settings.js").Settings;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = {
      listVaults: async () => [],
      setKeepPinnedInView: async () => {},
      setLoadRemoteImages: async () => {},
      setEditorFontSize: async () => {},
      setTheme: async () => {},
      setLocale: async () => {},
      chooseVault: async () => null,
      switchVault: async () => {},
      checkForUpdates,
    };
    ({ Settings: SettingsComponent } = await import("../src/renderer/library/Settings.js"));
  });

  beforeEach(async () => {
    checkForUpdates.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(SettingsComponent, {
          locale: "en-US",
          hotkey: "CommandOrControl+Shift+Y",
          libraryHotkey: "CommandOrControl+Shift+B",
          loadRemoteImages: true,
          keepPinnedInView: false,
          editorFontSize: 16,
          theme: "system",
          vaultPath: "/vault",
          // The real keys, so a renamed one fails here rather than drawing a button
          // labelled "settings.updatesCheck".
          t: (key: string) =>
            ({
              "settings.updates": "Updates",
              "settings.updatesCheck": "Check for updates…",
            })[key] ?? key,
          onChanged: () => {},
          onBeforeSwitch: async () => {},
          onClose: () => {},
        }),
      );
    });
    await flush();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  /** The button under the row labelled "Updates", found the way a reader finds it. */
  function button(): HTMLButtonElement {
    const row = Array.from(container.querySelectorAll<HTMLElement>(".settings-row")).find(
      (node) => node.querySelector("span")?.textContent === "Updates",
    )!;
    return row.querySelector("button")!;
  }

  it("draws the row, named by the same key the tray item is named by", () => {
    expect(button().textContent).toBe("Check for updates…");
  });

  it("asks main to run the check", async () => {
    await act(async () => {
      button().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });
});
