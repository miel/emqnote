import { app } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultVaultPath } from "./vault.js";

export interface Settings {
  vaultPath: string | null;
  hotkey: string;
  openAtLogin: boolean;
  /** Waarschuwing over Files On-Demand is getoond; niet elke start opnieuw zeuren. */
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

  // Voor tests en de zelftest: een vault meegeven zonder de echte instellingen aan te
  // raken, zodat een meetsessie nooit in je eigen notities schrijft.
  const override = process.env.EMQNOTE_VAULT;
  if (override !== undefined && override !== "") cache.vaultPath = override;

  return cache;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  cache = next;

  const path = settingsFile();
  mkdirSync(app.getPath("userData"), { recursive: true });

  // Ook instellingen atomair: een half geschreven settings.json bij een crash zou
  // betekenen dat de app de volgende keer zijn vault niet meer weet te vinden.
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(temporary, path);

  return next;
}
