import { app } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The names you have used before, for autocomplete in the meeting block.
 *
 * Kept as a small file next to the settings rather than gathered by scanning the
 * vault. A scan would mean reading every note on a OneDrive folder that may not even
 * be hydrated yet, at the exact moment the window has to appear. This list grows by
 * itself from your own use and costs nothing.
 *
 * The real index arrives in phase 5; this can fold into it then.
 */

const LIMIT = 500;

let cache: string[] | null = null;

function file(): string {
  return join(app.getPath("userData"), "attendees.json");
}

export function knownAttendees(): string[] {
  if (cache !== null) return cache;

  try {
    const parsed = JSON.parse(readFileSync(file(), "utf8")) as unknown;
    cache = Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    cache = [];
  }

  return cache;
}

/** Adds names, most recent first, case-insensitively de-duplicated. */
export function rememberAttendees(names: string[]): void {
  const cleaned = names.map((name) => name.trim()).filter((name) => name !== "");
  if (cleaned.length === 0) return;

  const existing = knownAttendees();
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const name of [...cleaned, ...existing]) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(name);
    if (merged.length >= LIMIT) break;
  }

  if (merged.length === existing.length && merged.every((n, i) => n === existing[i])) {
    return;
  }

  cache = merged;

  try {
    const path = file();
    mkdirSync(app.getPath("userData"), { recursive: true });
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  } catch {
    // Autocomplete is a convenience; failing to remember a name must never surface.
  }
}
