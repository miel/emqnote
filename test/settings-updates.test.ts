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

/**
 * Main's "a check is running" broadcast, held so a test can raise it (B98).
 *
 * The panel learns this from main rather than setting it on click, because the tray runs
 * the same check and a flag set here would describe only half of them — so the fake has
 * to be able to speak, not merely to exist.
 */
let announce: ((checking: boolean) => void) | null = null;

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
      setOpenAtLogin: async () => {},
      setLocale: async () => {},
      chooseVault: async () => null,
      switchVault: async () => {},
      checkForUpdates,
      onUpdateCheckState: (handler: (checking: boolean) => void) => {
        announce = handler;
        return () => {
          announce = null;
        };
      },
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
          isMac: false,
          openAtLogin: true,
          appVersion: "0.0.0-test",
          vaultPath: "/vault",
          // The real keys, so a renamed one fails here rather than drawing a button
          // labelled "settings.updatesCheck".
          t: (key: string) =>
            ({
              "settings.updates": "Updates",
              "settings.updatesCheck": "Check for updates…",
              "settings.updatesChecking": "Checking for updates…",
              "settings.group.about": "About",
            })[key] ?? key,
          onChanged: () => {},
          onBeforeSwitch: async () => {},
          onClose: () => {},
        }),
      );
    });
    await flush();

    // The update check is in the About group now (B100), and a row is only in the DOM
    // while its own group is showing — so the rail has to be stood on it first. By the
    // name it draws, for the reason the `t` table above is the real one.
    const tab = Array.from(container.querySelectorAll<HTMLElement>(".settings-category")).find(
      (node) => node.textContent === "About",
    )!;
    act(() => {
      tab.click();
    });
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

  it("says it is checking while main is checking, and stops when main stops", async () => {
    // The report is the gap between the click and the dialog (B98): `checkForUpdates`
    // resolves as soon as the check has been *started*, deliberately, so a slow GitHub
    // left a button that had visibly done nothing and then a dialog out of nowhere.
    expect(button().disabled).toBe(false);

    await act(async () => {
      announce?.(true);
    });
    await flush();

    expect(button().textContent).toBe("Checking for updates…");
    // Disabled as well as relabelled: a second check while the first is in the air is one
    // `updater.ts` refuses anyway, and a button that can be pressed to no effect is the
    // same complaint again one layer down.
    expect(button().disabled).toBe(true);

    await act(async () => {
      announce?.(false);
    });
    await flush();

    // `false` means the *check* is over, not the update — on Windows a download and a
    // restart prompt still follow, and a button describing those would be describing
    // something that finished minutes earlier.
    expect(button().textContent).toBe("Check for updates…");
    expect(button().disabled).toBe(false);
  });
});
