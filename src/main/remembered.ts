import { app } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Small lists this machine keeps beside its settings, outside the vault (B9).
 *
 * This used to hold three: attendees, tags, and vaults. The first two fed the
 * `<datalist>` on the tag and people fields, and went when those dropdowns did — they
 * knew only what had been typed on this machine, while the vault holds the real lists
 * and `vault-scan.ts` already serves them to the library's filters. Nothing was lost
 * with them: they were a cache of something derivable, never a source.
 *
 * `attendees.json` and `known-tags.json` may still be sitting in the app data folder on
 * a machine that ran an earlier build. They are harmless and nothing reads them.
 */

const LIMIT = 500;

export interface Remembered {
  known: () => string[];
  remember: (values: string[]) => void;
}

/**
 * Kept as a factory even with one caller left. It is the piece worth having exactly
 * once — atomic write, case-insensitive de-duplication, most recent first, and a cap —
 * and the next list to want it should not be a second copy with a different bug.
 */
export function store(fileName: string): Remembered {
  let cache: string[] | null = null;

  const path = (): string => join(app.getPath("userData"), fileName);

  const known = (): string[] => {
    if (cache !== null) return cache;

    try {
      const parsed = JSON.parse(readFileSync(path(), "utf8")) as unknown;
      cache = Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
    } catch {
      cache = [];
    }

    return cache;
  };

  /** Adds values, most recent first, case-insensitively de-duplicated. */
  const remember = (values: string[]): void => {
    const cleaned = values.map((value) => value.trim()).filter((value) => value !== "");
    if (cleaned.length === 0) return;

    const existing = known();
    const seen = new Set<string>();
    const merged: string[] = [];

    for (const value of [...cleaned, ...existing]) {
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(value);
      if (merged.length >= LIMIT) break;
    }

    if (merged.length === existing.length && merged.every((v, i) => v === existing[i])) {
      return;
    }

    cache = merged;

    try {
      const file = path();
      mkdirSync(app.getPath("userData"), { recursive: true });
      const temporary = `${file}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      renameSync(temporary, file);
    } catch {
      // Autocomplete is a convenience; failing to remember one must never surface.
    }
  };

  return { known, remember };
}

/**
 * Vaults this machine has used, bare paths only.
 *
 * Deliberately not the label alongside — see `vaults.ts`. Remembered only from the
 * explicit act of choosing one, never from `loadSettings`, which applies
 * `launch.vaultOverride` after the merge: a `--vault=` run or a self-test would
 * otherwise leave its temporary folder in the list.
 */
const vaults = store("vaults.json");

export const knownVaults = vaults.known;
export const rememberVault = (path: string): void => vaults.remember([path]);
