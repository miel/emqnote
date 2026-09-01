// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Theme } from "../src/shared/ipc.js";

/**
 * B90's theme row: that it reports the choice to main, and that it draws the answer main
 * already gave.
 *
 * Mounted on its own rather than through a whole `Library`, for the reason
 * `settings-keep-pinned.test.ts` beside it states: the question here is one control's
 * wiring, and a fake vault, tree and index would be scenery around it.
 *
 * **What this file cannot reach is the half that does the work.** Nothing in any
 * stylesheet reads the setting — main puts it on `nativeTheme.themeSource` and every
 * window's `prefers-color-scheme` follows — so a jsdom mount can see the choice leave and
 * nothing after that. `TEST-PROTOCOL.md` is where "the window actually went light" is
 * checked; what is pinned here is that the choice leaves at all, and that the three
 * answers are the three the setting has.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setTheme = vi.fn(async () => {});
const onChanged = vi.fn();

async function flush(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("the settings panel's theme row", () => {
  let SettingsComponent: typeof import("../src/renderer/library/Settings.js").Settings;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = {
      listVaults: async () => [],
      setKeepPinnedInView: async () => {},
      setLoadRemoteImages: async () => {},
      setEditorFontSize: async () => {},
      setTheme,
      setLocale: async () => {},
      chooseVault: async () => null,
      switchVault: async () => {},
      // B98: the panel subscribes on mount; the row this file is about is not it.
      onUpdateCheckState: () => () => {},
    };
    ({ Settings: SettingsComponent } = await import("../src/renderer/library/Settings.js"));
  });

  beforeEach(() => {
    setTheme.mockClear();
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

  async function mount(theme: Theme): Promise<void> {
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
          theme,
          vaultPath: "/vault",
          // The real keys, so a renamed one fails here rather than drawing a row labelled
          // "settings.theme" with three options called "settings.themeSystem".
          t: (key: string) => {
            const table = {
              "settings.theme": "Theme",
              "settings.themeSystem": "System",
              "settings.themeLight": "Light",
              "settings.themeDark": "Dark",
            };
            return (table as Record<string, string>)[key] ?? key;
          },
          onChanged,
          onBeforeSwitch: async () => {},
          onClose: () => {},
        }),
      );
    });
    await flush();
  }

  /** The `<select>` on the row labelled "Theme", found the way a reader finds it. */
  function select(): HTMLSelectElement {
    const row = Array.from(container.querySelectorAll<HTMLElement>(".settings-row")).find(
      (node) => node.querySelector("span")?.textContent === "Theme",
    )!;
    return row.querySelector("select")!;
  }

  it("offers the three answers, with the OS's own first", async () => {
    await mount("system");

    const options = Array.from(select().options);
    expect(options.map((option) => option.value)).toEqual(["system", "light", "dark"]);
    // "System" leads because it is the default and because it is a real answer — the
    // question handed to the machine, which goes on answering it — rather than the
    // absence of one.
    expect(options[0]!.textContent).toBe("System");
  });

  for (const theme of ["system", "light", "dark"] as const) {
    it(`starts on ${theme}, which is the answer it was given`, async () => {
      await mount(theme);
      expect(select().value).toBe(theme);
    });
  }

  it("reports the choice to main and refreshes the bootstrap behind it", async () => {
    await mount("system");

    const control = select();
    await act(async () => {
      control.value = "dark";
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();

    expect(setTheme).toHaveBeenCalledWith("dark");
    // Without the refresh the panel's own row is the one thing left showing the old
    // answer, since it holds its choice locally — the same reason every row above it does.
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows the new choice without waiting for that round trip", async () => {
    await mount("system");

    const control = select();
    act(() => {
      control.value = "light";
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(select().value).toBe("light");
  });
});
