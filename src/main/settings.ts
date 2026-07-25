import { app } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readLaunchOptions } from "./launch-options.js";
import { defaultVaultPath } from "./vault.js";

export interface Settings {
  vaultPath: string | null;
  hotkey: string;
  openAtLogin: boolean;
  /** The Files On-Demand warning has been shown; do not nag on every start. */
  filesOnDemandWarned: boolean;
}

export const DEFAULT_HOTKEY = "CommandOrControl+Shift+Space";

function defaults(): Settings {
  return {
    vaultPath: defaultVaultPath(),
    hotkey: DEFAULT_HOTKEY,
    openAtLogin: true,
    filesOnDemandWarned: false,
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
