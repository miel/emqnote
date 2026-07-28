import { app } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The names and tags you have used before, for autocomplete in the capture window.
 *
 * Kept as small files next to the settings rather than gathered by scanning the vault. A
 * scan would mean reading every note on a OneDrive folder that may not even be hydrated
 * yet, at the exact moment the window has to appear — `vault-scan.ts` does exactly that,
 * and it is deliberately never reached from this path. These lists grow by themselves
 * from your own use and cost nothing.
 *
 * They are therefore incomplete on purpose: they know what you typed on this machine,
 * not what is in the vault. That is the right trade for a dropdown and the wrong one for
 * the filter lists in the library, which is why those use the scan instead.
 *
 * The real index arrives in phase 5; both can fold into it then.
 */

const LIMIT = 500;

export interface Remembered {
  known: () => string[];
  remember: (values: string[]) => void;
}

/**
 * Exported because the vault list wants exactly this and nothing more: an atomic write,
 * case-insensitive de-duplication, most recent first, and a cap. Writing a second one of
 * these for `vaults.json` would be writing this one again with a different bug.
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

const attendees = store("attendees.json");
const tags = store("known-tags.json");

export const knownAttendees = attendees.known;
export const rememberAttendees = attendees.remember;
export const knownTags = tags.known;
export const rememberTags = tags.remember;

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
