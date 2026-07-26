import { useCallback, useEffect, useState } from "react";
import { DEFAULT_HOTKEY, type Bootstrap } from "../shared/ipc.js";
import { translate, type Locale } from "../shared/i18n.js";

export interface Bootstrapped extends Bootstrap {
  /** Look up a visible string in the chosen language. */
  t: (key: string) => string;
  isMac: boolean;
  reload: () => Promise<void>;
}

const FALLBACK: Bootstrap = {
  locale: "en-US",
  platform: "win32",
  hotkey: DEFAULT_HOTKEY,
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
