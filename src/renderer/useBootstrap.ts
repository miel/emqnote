import { useCallback, useEffect, useState } from "react";
import { DEFAULT_HOTKEY, DEFAULT_LIBRARY_HOTKEY, type Bootstrap } from "../shared/ipc.js";
import { translate, type Locale } from "../shared/i18n.js";

export interface Bootstrapped extends Bootstrap {
  /** Look up a visible string in the chosen language. */
  t: (key: string) => string;
  isMac: boolean;
  reload: () => Promise<void>;
  /**
   * False until the `bootstrap()` round trip has resolved at least once. `libraryPaneWidths`
   * has `null` to tell "not real yet" apart from "genuinely unset" — `librarySort` has no
   * such spare value (every `SortKey` is a real sort), so a component seeding local state
   * from it once (`Library.tsx`'s `sort`) needs an explicit signal instead of overloading one.
   */
  bootstrapped: boolean;
}

/**
 * Everything but `platform` is a guess until `bootstrap()` answers. `platform` does not
 * have to be: the preload can read `process.platform` synchronously (see
 * `src/preload/index.ts`), so the fallback is seeded from that rather than a hardcoded
 * `"win32"` — otherwise every shortcut label on a Mac briefly says "Ctrl" before flipping
 * to "⌘" once the round trip resolves.
 */
const FALLBACK: Bootstrap = {
  locale: "en-US",
  platform: window.emqnote.platform,
  hotkey: DEFAULT_HOTKEY,
  libraryHotkey: DEFAULT_LIBRARY_HOTKEY,
  vaultPath: null,
  libraryPaneWidths: null,
  librarySort: "modified",
  librarySortDirection: "desc",
  loadRemoteImages: true,
  keepPinnedInView: false,
  editorFontSize: 13,
  theme: "system",
  openAtLogin: true,
  // Empty rather than a guess: this is the one field with no sensible fallback, and the
  // About row draws it. A number invented here would be a wrong version number on screen
  // for the length of a round trip, which is worse than a blank one.
  appVersion: "",
};

/**
 * Language, platform and shortcut, fetched once when a window opens.
 *
 * It starts on the fallback rather than waiting, so the first paint is never delayed
 * by an IPC round trip — which matters for the capture window, where the whole point
 * is that it is already there.
 */
export function useBootstrap(): Bootstrapped {
  const [state, setState] = useState<Bootstrap>(FALLBACK);
  const [bootstrapped, setBootstrapped] = useState(false);

  const reload = useCallback(async () => {
    setState(await window.emqnote.bootstrap());
    setBootstrapped(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * A setting a window draws with has changed — the language, or B88's note size — so ask
   * again.
   *
   * Here rather than in `Capture.tsx` and `Library.tsx`, because "what the bootstrap says"
   * is exactly what this hook owns and both windows already call it. It also closes a hole
   * that predates B88: main has been broadcasting a settings change since B60 and neither
   * window listened, so changing the language in the panel reached the library only by way
   * of the panel refreshing itself on the way out, and never reached the capture window at
   * all.
   */
  useEffect(() => window.emqnote.onSettingsChanged(() => void reload()), [reload]);

  /**
   * B88's note size, put on the document as `--editor-font-size` — the token
   * `.editor-content` reads (`styles.css`).
   *
   * Here rather than in `Capture.tsx` and `Library.tsx` separately: both windows draw a
   * note, both already call this hook, and two copies of one rule is how the two of them
   * come to disagree. The `:root` declaration is what covers the frames before the
   * bootstrap round trip resolves, and it holds the same 16px the default does, so
   * nothing flickers on the way.
   */
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${state.editorFontSize}px`,
    );
  }, [state.editorFontSize]);

  /**
   * How far the left edge of the window's top band has to stand clear of macOS's traffic
   * lights (B101), as `--lights-inset` in `styles.css`.
   *
   * Written from here for `--editor-font-size`'s reason — both windows have a top band and
   * both already call this hook — and *from the renderer at all* for `PaneHeader`'s
   * `trafficLights` reason: there is no `env()` that answers this. `env(titlebar-area-x)`
   * exists only where there is a Window Controls Overlay, which is Windows, so CSS alone
   * cannot tell macOS's inset title bar from Linux's ordinary frame. The caller knows
   * which platform it is; the stylesheet does not.
   *
   * 92px is `.pane-header-lights`' own clearance, and the same number for the same reason:
   * the lights sit at `trafficLightPosition: { x: 12 }` and run about 52px, so they end
   * near 64 and this leaves a good 28.
   */
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--lights-inset",
      state.platform === "darwin" ? "92px" : "0px",
    );
  }, [state.platform]);

  return {
    ...state,
    t: (key: string) => translate(state.locale as Locale, key),
    isMac: state.platform === "darwin",
    reload,
    bootstrapped,
  };
}
