import { app } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Locale } from "../shared/i18n.js";
import { DEFAULT_HOTKEY } from "../shared/ipc.js";
import type { SortKey } from "../shared/vault-types.js";
import { readLaunchOptions } from "./launch-options.js";
import { defaultVaultPath } from "./vault.js";

export interface Settings {
  vaultPath: string | null;
  hotkey: string;
  locale: Locale;
  openAtLogin: boolean;
  /**
   * Vaults whose Files On-Demand warning has already been shown; do not nag on every
   * start. Per vault and not one flag: a single boolean meant that switching to a new
   * OneDrive folder landed with the warning permanently suppressed, which is precisely
   * the moment it is worth showing.
   */
  filesOnDemandWarned: string[];
  /** `Date.now()` of the last automatic update check, to throttle it to once a day. */
  updateLastCheckedAt: number | null;
  /**
   * The library window's two draggable splitters, in pixels. Null until the first drag —
   * before that the CSS default (`library.css`'s `--tree-width`/`--notes-width` fallback)
   * applies, so there is no separate "unset" width to keep in sync with it.
   */
  libraryPaneWidths: { tree: number; notes: number } | null;
  /**
   * The note list's last sort order, following the pane-widths precedent above: nothing
   * to keep in sync with a CSS fallback here, so this one just starts on the same default
   * `Library.tsx`'s own `useState` used to hardcode.
   */
  librarySort: SortKey;
  /**
   * Whether a picture a note names by its web address is fetched and drawn (B50).
   *
   * On by default: a vault written elsewhere is full of `![…](https://…)`, and a column of
   * grey chips is not what those notes say. Off is a real position to hold, though —
   * opening such a note means main requests that address, which the host can see — so it
   * is a setting rather than a decision made for everybody. Enforced in main, in the
   * protocol handler, never by the renderer choosing not to ask.
   */
  loadRemoteImages: boolean;
}

export { DEFAULT_HOTKEY };

function defaults(): Settings {
  return {
    vaultPath: defaultVaultPath(),
    hotkey: DEFAULT_HOTKEY,
    locale: "en-US",
    openAtLogin: true,
    filesOnDemandWarned: [],
    updateLastCheckedAt: null,
    libraryPaneWidths: null,
    librarySort: "modified",
    loadRemoteImages: true,
  };
}

function settingsFile(): string {
  return join(app.getPath("userData"), "settings.json");
}

let cache: Settings | null = null;

export function loadSettings(): Settings {
  if (cache !== null) return cache;

  try {
    const raw = JSON.parse(readFileSync(settingsFile(), "utf8")) as Partial<Settings>;
    cache = { ...defaults(), ...raw };

    // `filesOnDemandWarned` used to be a boolean. An old settings.json would put one
    // back here, and `false.includes(...)` throws on the very first start after an
    // update — the least forgivable place to crash. The old `true` carried no vault, so
    // there is nothing to migrate: it becomes an empty list and the warning may appear
    // once more.
    if (!Array.isArray(cache.filesOnDemandWarned)) cache.filesOnDemandWarned = [];
  } catch {
    cache = defaults();
  }

  // For tests and the self-test: point at a vault without touching the real settings,
  // so a measurement run can never write into your own notes.
  const override = readLaunchOptions().vaultOverride;
  if (override !== null) cache.vaultPath = override;

  return cache;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  cache = next;

  const path = settingsFile();
  mkdirSync(app.getPath("userData"), { recursive: true });

  // Settings are written atomically too: a half-written settings.json after a crash
  // would mean the app no longer knows where its vault is.
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(temporary, path);

  return next;
}
