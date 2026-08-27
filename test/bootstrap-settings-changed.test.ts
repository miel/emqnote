// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "../src/shared/ipc.js";

/**
 * `useBootstrap` asks again when main says a setting changed, and puts B88's note size on
 * the document.
 *
 * Both halves are here because both are one-line effects in a hook nothing else tests, and
 * both were arrived at by finding the same hole from two directions.
 *
 * The subscription closes a gap that predates B88 and was found by driving it: main has
 * been broadcasting a settings change since B60 — `setLocale` sends one to both windows —
 * and *neither window listened*. The library appeared to work only because the Settings
 * panel refreshes its own bootstrap on the way out; the capture window, which has no panel
 * and is where notes are actually typed, kept the old language until the next login. The
 * message was `libraryRefresh`, which means "ask the vault again" and is raised by every
 * save, so the library's handler for it reloads the tree, the notes and the facets — none
 * of which is where a language or a font size lives. It has its own message now, and this
 * hook is its single subscriber, so every window that draws from settings gets it without
 * either of them wiring it up.
 *
 * The custom property is set here rather than in `Capture.tsx` and `Library.tsx` for the
 * same reason: two windows, one rule.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SETTINGS: Bootstrap = {
  locale: "en-US",
  platform: "darwin",
  hotkey: "CommandOrControl+Shift+Y",
  libraryHotkey: "CommandOrControl+Shift+B",
  vaultPath: "/vault",
  libraryPaneWidths: null,
  librarySort: "modified",
  loadRemoteImages: true,
  keepPinnedInView: false,
  editorFontSize: 16,
};

let current: Bootstrap = SETTINGS;
let fire: () => void = () => {};
const bootstrap = vi.fn(async () => current);

async function flush(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("the bootstrap a window draws from", () => {
  let useBootstrap: typeof import("../src/renderer/useBootstrap.js").useBootstrap;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    // `useBootstrap.ts` reads `window.emqnote.platform` at module scope, so the stub has to
    // be installed before the import — the same dance every jsdom file here does.
    (window as unknown as { emqnote: unknown }).emqnote = {
      platform: "darwin",
      bootstrap,
      onSettingsChanged: (handler: () => void) => {
        fire = handler;
        return () => {
          fire = () => {};
        };
      },
    };
    ({ useBootstrap } = await import("../src/renderer/useBootstrap.js"));
  });

  beforeEach(async () => {
    current = SETTINGS;
    bootstrap.mockClear();
    document.documentElement.style.removeProperty("--editor-font-size");

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    // A component that does nothing but call the hook: what is being tested is the hook's
    // effects, and a real window would only add its own reasons to re-render.
    function Probe(): React.ReactElement {
      const app = useBootstrap();
      return createElement("span", null, String(app.editorFontSize));
    }

    await act(async () => {
      root.render(createElement(Probe));
    });
    await flush();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("puts the note size on the document, where the stylesheet reads it", () => {
    expect(document.documentElement.style.getPropertyValue("--editor-font-size")).toBe("16px");
  });

  it("asks again when main says a setting changed", async () => {
    expect(bootstrap).toHaveBeenCalledTimes(1);

    current = { ...SETTINGS, editorFontSize: 20 };
    await act(async () => fire());
    await flush();

    expect(bootstrap).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe("20");
  });

  it("moves the property with it, so an open window redraws without a restart", async () => {
    current = { ...SETTINGS, editorFontSize: 13 };
    await act(async () => fire());
    await flush();

    expect(document.documentElement.style.getPropertyValue("--editor-font-size")).toBe("13px");
  });
});
