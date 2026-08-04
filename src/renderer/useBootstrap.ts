import { useCallback, useEffect, useState } from "react";
import { DEFAULT_HOTKEY, type Bootstrap } from "../shared/ipc.js";
import { translate, type Locale } from "../shared/i18n.js";

export interface Bootstrapped extends Bootstrap {
  /** Look up a visible string in the chosen language. */
  t: (key: string) => string;
  isMac: boolean;
  reload: () => Promise<void>;
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
  vaultPath: null,
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

  const reload = useCallback(async () => {
    setState(await window.emqnote.bootstrap());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    ...state,
    t: (key: string) => translate(state.locale as Locale, key),
    isMac: state.platform === "darwin",
    reload,
  };
}
