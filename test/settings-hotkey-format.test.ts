// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * B100's chord printing: what the two hotkey buttons *show* and what they *save* are two
 * different strings, and only one of them is Electron's.
 *
 * The panel used to print the accelerator raw — `CommandOrControl+Shift+Y`, on both
 * platforms, in the one place in the app you go to change it. `formatAccelerator` in
 * `src/shared/shortcuts.ts` has existed and been tested since the help sheet needed it and
 * was called from nowhere in `src/`, so the sheet that *lists* the shortcut and the panel
 * that *sets* it disagreed about how to spell it.
 *
 * **The half that matters most is the last test.** Printing is cosmetic; saving is not. A
 * refactor that formatted on the way out as well would register `⌘⇧Y` with
 * `globalShortcut`, which accepts no such string — and the failure would be a hotkey that
 * silently stopped working, on one platform, after a settings change.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setHotkey = vi.fn(async () => true);
const setLibraryHotkey = vi.fn(async () => true);

async function flush(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** The real keys, so a renamed one fails here rather than drawing a row called "settings.hotkey". */
const STRINGS: Record<string, string> = {
  "settings.group.shortcuts": "Shortcuts",
  "settings.hotkey": "Shortcut for a new note",
  "settings.libraryHotkey": "Shortcut for the library",
  "settings.hotkeyHint": "Click, then press the key combination.",
};

describe("the settings panel's two chords", () => {
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
      setHotkey,
      setLibraryHotkey,
      chooseVault: async () => null,
      switchVault: async () => {},
      onUpdateCheckState: () => () => {},
    };
    ({ Settings: SettingsComponent } = await import("../src/renderer/library/Settings.js"));
  });

  beforeEach(() => {
    setHotkey.mockClear();
    setLibraryHotkey.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function mount(isMac: boolean): Promise<void> {
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(SettingsComponent, {
          locale: "en-US",
          hotkey: "CommandOrControl+Shift+Y",
          libraryHotkey: "CommandOrControl+Shift+B",
          isMac,
          loadRemoteImages: true,
          keepPinnedInView: false,
          editorFontSize: 16,
          theme: "system" as const,
          openAtLogin: true,
          appVersion: "0.12.12",
          vaultPath: "/vault",
          t: (key: string) => STRINGS[key] ?? key,
          onChanged: () => {},
          onBeforeSwitch: async () => {},
          onClose: () => {},
        }),
      );
    });
    await flush();

    const tab = Array.from(container.querySelectorAll<HTMLElement>(".settings-category")).find(
      (node) => node.textContent === "Shortcuts",
    )!;
    act(() => {
      tab.click();
    });
  }

  /** The button on the row with the given label, found the way a reader finds it. */
  function button(label: string): HTMLButtonElement {
    const row = Array.from(container.querySelectorAll<HTMLElement>(".settings-row")).find(
      (node) => node.querySelector("span")?.textContent === label,
    )!;
    return row.querySelector("button")!;
  }

  it("prints both chords in the Mac's own notation", async () => {
    await mount(true);

    expect(button("Shortcut for a new note").textContent).toBe("⇧⌘Y");
    expect(button("Shortcut for the library").textContent).toBe("⇧⌘B");
  });

  it("prints both chords in Windows' and Linux's notation", async () => {
    await mount(false);

    expect(button("Shortcut for a new note").textContent).toBe("Ctrl+Shift+Y");
    expect(button("Shortcut for the library").textContent).toBe("Ctrl+Shift+B");
  });

  it("shows neither spelling of the accelerator Electron stores", async () => {
    await mount(true);

    // The specific thing that was on screen before this: the raw setting, on both
    // platforms, in the panel you open to change it.
    expect(container.textContent).not.toContain("CommandOrControl");
  });

  it("asks to record, and says so while it is armed", async () => {
    await mount(false);

    const record = button("Shortcut for a new note");
    act(() => {
      record.click();
    });

    expect(button("Shortcut for a new note").textContent).toBe(
      "Click, then press the key combination.",
    );
    expect(button("Shortcut for a new note").classList.contains("recording")).toBe(true);
  });

  it("still saves the accelerator Electron wants, not the one it drew", async () => {
    await mount(true);

    const record = button("Shortcut for a new note");
    act(() => {
      record.click();
    });
    await act(async () => {
      record.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", metaKey: true, shiftKey: true, bubbles: true }),
      );
    });
    await flush();

    // `globalShortcut` accepts no "⇧⌘K". Formatting on the way out as well would leave a
    // hotkey that silently stopped working after a settings change, on one platform only.
    expect(setHotkey).toHaveBeenCalledWith("CommandOrControl+Shift+K");
    // And the button goes back to printing, in the platform's notation, the chord it saved.
    expect(button("Shortcut for a new note").textContent).toBe("⇧⌘K");
  });
});
