// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * B100's search: the field in the head band, filtering across every group at once.
 *
 * It is the affordance the whole design rests on. A rail answers "where is the theme" by
 * name, but only if you already guess that a theme is Appearance rather than General — and
 * the number of settings this panel can hold before that guess gets hard is exactly the
 * number this redesign was for.
 *
 * **What is really being pinned here is that the filter reads the registry**, not the JSX.
 * `Settings.tsx` declares its rows as data for this reason: a search written against the
 * markup would be a second list of what the panel contains, and the first row added without
 * a matching entry would become silently unfindable in the one control whose job is to find
 * things. The test for that is the third one down — a row from a group that is *not*
 * showing has to be reachable.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const onClose = vi.fn();

async function flush(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** The real keys, so a renamed one fails here rather than matching against "settings.theme". */
const STRINGS: Record<string, string> = {
  "settings.title": "Settings",
  "settings.search": "Search settings",
  "settings.noMatch": "No setting matches that.",
  "settings.close": "Close",
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
  "settings.remoteImages": "Load images from the web",
  // The sentence, not the label, is where the word "internet" appears — which is the whole
  // reason the filter reads both halves.
  "settings.remoteImagesWhy":
    "A note can point at a picture on the internet. emqnote fetches it once and keeps it locally.",
};

describe("the settings panel's search", () => {
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
    onClose.mockClear();
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
          onClose,
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

  function field(): HTMLInputElement {
    return container.querySelector<HTMLInputElement>(".settings-search")!;
  }

  /**
   * Types into the controlled box the way every other jsdom test in this suite does.
   *
   * Through the prototype's own setter, not `field.value = …`: React tracks the last value
   * it wrote and skips `onChange` when a plain assignment leaves its tracker in step with
   * the DOM, so the filter never runs and the test reads as "the search does nothing".
   */
  function type(text: string): void {
    act(() => {
      const input = field();
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
        input,
        text,
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function rowLabels(): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>(".settings-pane .settings-row")).map(
      (row) => row.querySelector("span")?.textContent ?? "",
    );
  }

  function headings(): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>(".settings-group h3")).map(
      (node) => node.textContent ?? "",
    );
  }

  it("reaches a row in a group it is not standing on", () => {
    // The panel opens on General; the theme is in Appearance and nobody has clicked there.
    expect(rowLabels()).toEqual(["Language", "Start at login"]);

    type("theme");

    expect(rowLabels()).toEqual(["Theme"]);
  });

  it("keeps each match under the heading of the group it lives in", () => {
    type("t");

    // The group is what tells you *where* the row you were looking for lives, so a flat
    // list of results would answer the question and forget to teach the answer.
    expect(headings().length).toBeGreaterThan(1);
    expect(headings()).toContain("Appearance");
  });

  it("matches the sentence under a row, not only its name", () => {
    // "Load images from the web" never says the word "internet"; the sentence under it is
    // the only place that appears. Matching the label alone would make the search worse
    // than reading the list.
    type("internet");

    expect(rowLabels()).toEqual(["Load images from the web"]);
  });

  it("stands no group up as chosen while it is filtering", () => {
    type("theme");

    const selected = Array.from(
      container.querySelectorAll<HTMLElement>(".settings-category"),
    ).filter((node) => node.getAttribute("aria-selected") === "true");
    // The pane is showing rows from several groups at once; claiming one of them was
    // chosen would be a lie to anything reading the roles.
    expect(selected).toEqual([]);
  });

  it("says so when nothing matches, rather than emptying", () => {
    type("qqqq");

    // Without this the pane simply empties, which reads as the panel having broken rather
    // than as an answer.
    expect(container.querySelector(".settings-empty")?.textContent).toBe(
      "No setting matches that.",
    );
    expect(rowLabels()).toEqual([]);
  });

  it("puts the rail back in charge when a group is clicked", () => {
    type("theme");

    const notes = Array.from(container.querySelectorAll<HTMLElement>(".settings-category")).find(
      (node) => node.textContent === "Notes",
    )!;
    act(() => {
      notes.click();
    });

    // The two are answers to the same question and only one can be showing: a lit rail
    // entry beside a pane still listing something else is the state this prevents.
    expect(field().value).toBe("");
    expect(notes.getAttribute("aria-selected")).toBe("true");
  });

  it("clears the query on the first Escape and closes on the second", () => {
    type("theme");

    const panel = container.querySelector<HTMLElement>(".settings")!;
    act(() => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    // One press undoes one thing — Escape out of a search you are reading must not also
    // throw away the panel you were reading it in.
    expect(field().value).toBe("");
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
