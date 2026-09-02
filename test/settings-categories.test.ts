// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * B100's rail: six groups beside one pane, and only the group you are standing on is
 * drawn.
 *
 * The panel is mounted on its own rather than through a whole `Library`, for the reason
 * `settings-keep-pinned.test.ts` beside it states: the question here is one component's
 * own structure, and a fake vault, tree and index would be scenery around it.
 *
 * **What this file cannot reach is Tab.** jsdom implements no focus navigation at all, so
 * "Tab leaves the rail and lands in the pane" — the whole reason exactly one rail button
 * carries `tabIndex={0}` — is checked by `npm run drive:library` and by `TEST-PROTOCOL.md`,
 * not here. What is pinned here is the roving `tabIndex` itself, which is the input to
 * that behaviour and is something the DOM can be asked about.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function flush(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** The real keys, so a renamed group fails here rather than drawing "settings.group.notes". */
const STRINGS: Record<string, string> = {
  "settings.group.general": "General",
  "settings.group.appearance": "Appearance",
  "settings.group.shortcuts": "Shortcuts",
  "settings.group.notes": "Notes",
  "settings.group.vault": "Vault",
  "settings.group.about": "About",
  "settings.language": "Language",
  "settings.startAtLogin": "Start at login",
  "settings.theme": "Theme",
  "settings.textSize": "Text size in the note",
  "settings.hotkey": "Shortcut for a new note",
  "settings.version": "Version",
};

describe("the settings panel's group rail", () => {
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
      onUpdateCheckState: () => () => {},
    };
    ({ Settings: SettingsComponent } = await import("../src/renderer/library/Settings.js"));
  });

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
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
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function tabs(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(".settings-category"));
  }

  function tab(label: string): HTMLElement {
    return tabs().find((node) => node.textContent === label)!;
  }

  /** The label of every row the pane is drawing, in order. */
  function rowLabels(): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>(".settings-pane .settings-row")).map(
      (row) => row.querySelector("span")?.textContent ?? "",
    );
  }

  it("lists the six groups in the order the rail declares", () => {
    expect(tabs().map((node) => node.textContent)).toEqual([
      "General",
      "Appearance",
      "Shortcuts",
      "Notes",
      "Vault",
      "About",
    ]);
  });

  it("opens on the first group", () => {
    expect(tab("General").getAttribute("aria-selected")).toBe("true");
    expect(rowLabels()).toEqual(["Language", "Start at login"]);
  });

  it("draws only the group it is standing on", () => {
    act(() => {
      tab("Appearance").click();
    });

    expect(rowLabels()).toEqual(["Theme", "Text size in the note"]);
    // Not merely hidden: a row from another group is not in the document at all, which is
    // what stops a `querySelector` in another test from finding a control nobody can see.
    expect(rowLabels()).not.toContain("Language");
  });

  it("marks exactly one group as the chosen one", () => {
    act(() => {
      tab("Vault").click();
    });

    const selected = tabs().filter((node) => node.getAttribute("aria-selected") === "true");
    expect(selected.map((node) => node.textContent)).toEqual(["Vault"]);
    expect(tab("Vault").classList.contains("settings-category-on")).toBe(true);
  });

  it("keeps exactly one rail button in the Tab order", () => {
    act(() => {
      tab("Shortcuts").click();
    });

    // The roving tab stop the three panes use. Tab then moves out of the rail and into the
    // pane rather than walking six names first — which jsdom cannot press, so what is
    // pinned is the arrangement that makes it true.
    expect(tabs().filter((node) => node.tabIndex === 0).map((node) => node.textContent)).toEqual([
      "Shortcuts",
    ]);
  });

  it("walks the rail with the arrows, showing each group as it lands", () => {
    const general = tab("General");
    general.focus();
    act(() => {
      general.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    expect(tab("Appearance").getAttribute("aria-selected")).toBe("true");
    expect(rowLabels()).toEqual(["Theme", "Text size in the note"]);
  });

  it("reaches the ends with Home and End", () => {
    const general = tab("General");
    general.focus();
    act(() => {
      general.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    expect(tab("About").getAttribute("aria-selected")).toBe("true");

    const about = tab("About");
    about.focus();
    act(() => {
      about.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });
    expect(tab("General").getAttribute("aria-selected")).toBe("true");
  });

  it("shows the version it was handed, and does not offer to change it", () => {
    act(() => {
      tab("About").click();
    });

    const value = container.querySelector<HTMLElement>(".settings-value");
    expect(value?.textContent).toBe("0.12.12");
    expect(value?.tagName).toBe("SPAN");
  });
});
