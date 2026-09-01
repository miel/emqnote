// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * B76's checkbox in the settings panel: that it reports the switch to main, and that it
 * draws the answer main already gave.
 *
 * The panel is mounted on its own rather than through a whole `Library`, unlike
 * `test/note-list-pin.test.ts` beside it. The questions there were about DOM order and
 * which dialog ended up on screen, which only the real thing can answer; the question here
 * is one control's wiring, and a fake vault, tree and index would be scenery around it.
 *
 * The row deliberately holds its own state rather than re-reading the bootstrap on every
 * render — the round trip that refreshes it happens on `onChanged`, and a checkbox that
 * flicked back to its old value for a frame while that landed would read as the switch not
 * having taken. That is what the last test here pins.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setKeepPinnedInView = vi.fn(async () => {});
const onChanged = vi.fn();

async function flush(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("the settings panel's pinned-notes switch", () => {
  let SettingsComponent: typeof import("../src/renderer/library/Settings.js").Settings;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    (window as unknown as { emqnote: unknown }).emqnote = {
      listVaults: async () => [],
      setKeepPinnedInView,
      setLoadRemoteImages: async () => {},
      setLocale: async () => {},
      chooseVault: async () => null,
      switchVault: async () => {},
      // B98: the panel subscribes on mount; the row this file is about is not it.
      onUpdateCheckState: () => () => {},
    };
    ({ Settings: SettingsComponent } = await import("../src/renderer/library/Settings.js"));
  });

  beforeEach(() => {
    setKeepPinnedInView.mockClear();
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

  async function mount(keepPinnedInView: boolean): Promise<void> {
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(SettingsComponent, {
          locale: "en-US",
          hotkey: "CommandOrControl+Shift+Y",
          libraryHotkey: "CommandOrControl+Shift+B",
          loadRemoteImages: true,
          keepPinnedInView,
          editorFontSize: 16,
          theme: "system" as const,
          vaultPath: "/vault",
          // The real table, so a renamed key fails here rather than drawing an empty label.
          t: (key: string) => {
            const table = { "settings.keepPinned": "Keep pinned notes in view while scrolling" };
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

  /** The checkbox on the row whose label is B76's, found the way a reader finds it. */
  function checkbox(): HTMLInputElement {
    const row = Array.from(container.querySelectorAll<HTMLElement>(".settings-row")).find(
      (node) =>
        node.querySelector("span")?.textContent === "Keep pinned notes in view while scrolling",
    )!;
    return row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  }

  it("starts on the answer it was given", async () => {
    await mount(true);
    expect(checkbox().checked).toBe(true);
  });

  it("starts unticked, which is what a vault that has never been asked gets", async () => {
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

    expect(setKeepPinnedInView).toHaveBeenCalledWith(true);
    // The refresh is what redraws the note list — without it the setting is saved and
    // nothing on screen moves until the window is reopened.
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows the new state without waiting for that round trip", async () => {
    await mount(false);

    const box = checkbox();
    act(() => {
      box.click();
    });

    expect(checkbox().checked).toBe(true);
  });
});
