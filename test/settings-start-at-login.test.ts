// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * B61's login item, in the settings panel at last (B100): that it reports the switch to
 * main, and that it draws the answer main already gave.
 *
 * It has been a persisted setting since B61 and a tray checkbox for just as long — which
 * is the one place in this app nobody looks, the same complaint that moved "Check for
 * updates…" into this panel. The tray item stays; main's handler rebuilds that menu and
 * broadcasts `settingsChanged`, so the two cannot disagree.
 *
 * **What this file cannot reach is either half of the thing that actually happens.**
 * `applyLoginItem` is main's, and whether Windows or macOS really starts the app at sign-in
 * is `TEST-PROTOCOL.md`'s question; so is whether the tray checkbox followed. What is
 * pinned here is that the choice leaves this panel at all.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setOpenAtLogin = vi.fn(async () => {});
const onChanged = vi.fn();

async function flush(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("the settings panel's start-at-login switch", () => {
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
      setOpenAtLogin,
      setLocale: async () => {},
      chooseVault: async () => null,
      switchVault: async () => {},
      onUpdateCheckState: () => () => {},
    };
    ({ Settings: SettingsComponent } = await import("../src/renderer/library/Settings.js"));
  });

  beforeEach(() => {
    setOpenAtLogin.mockClear();
    onChanged.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function mount(openAtLogin: boolean): Promise<void> {
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(SettingsComponent, {
          locale: "en-US",
          hotkey: "CommandOrControl+Shift+Y",
          libraryHotkey: "CommandOrControl+Shift+B",
          isMac: false,
          loadRemoteImages: true,
          keepPinnedInView: false,
          editorFontSize: 16,
          theme: "system" as const,
          openAtLogin,
          appVersion: "0.12.12",
          vaultPath: "/vault",
          // The real table, so a renamed key fails here rather than drawing an empty label.
          t: (key: string) =>
            ({
              "settings.group.general": "General",
              "settings.startAtLogin": "Start at login",
            })[key] ?? key,
          onChanged,
          onBeforeSwitch: async () => {},
          onClose: () => {},
        }),
      );
    });
    await flush();
    // General is where the rail opens, which is where this row is — but say so, so that
    // moving the row to another group fails here rather than passing by luck.
    const tab = Array.from(container.querySelectorAll<HTMLElement>(".settings-category")).find(
      (node) => node.textContent === "General",
    )!;
    act(() => {
      tab.click();
    });
  }

  /** The checkbox on B61's row, found the way a reader finds it. */
  function checkbox(): HTMLInputElement {
    const row = Array.from(container.querySelectorAll<HTMLElement>(".settings-row")).find(
      (node) => node.querySelector("span")?.textContent === "Start at login",
    )!;
    return row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  }

  it("starts on the answer it was given", async () => {
    await mount(true);
    expect(checkbox().checked).toBe(true);
  });

  it("starts unticked when the machine has said no", async () => {
    await mount(false);
    expect(checkbox().checked).toBe(false);
  });

  it("reports the switch to main and refreshes the bootstrap behind it", async () => {
    await mount(false);

    const box = checkbox();
    await act(async () => {
      box.click();
    });
    await flush();

    expect(setOpenAtLogin).toHaveBeenCalledWith(true);
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows the new state without waiting for that round trip", async () => {
    await mount(false);

    const box = checkbox();
    act(() => {
      box.click();
    });

    // Its own state, like every other switch here: a checkbox that snapped back to its old
    // value for a frame while the round trip landed would read as the switch not having
    // taken.
    expect(checkbox().checked).toBe(true);
  });
});
