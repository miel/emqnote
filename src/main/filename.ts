import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * File names per 02-technisch-ontwerp.md §4.1.
 *
 * The rules are strict because Windows is: characters macOS accepts make a file
 * unreachable there, and a name ending in a space or a dot is silently truncated. A
 * note that writes fine on the Mac and cannot be opened on the work machine is the
 * kind of bug you only notice a week later.
 */

const ILLEGAL = /[\\/:*?"<>|]/g;

/** Names Windows reserves for devices, with or without an extension. */
const RESERVED = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

export const MAX_TITLE_LENGTH = 80;

/**
 * Strip control characters. Written as a loop rather than a character class so that no
 * invisible bytes end up in the source code.
 */
function stripControlCharacters(value: string): string {
  let result = "";
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code < 32 || code === 127) continue;
    result += character;
  }
  return result;
}

export function sanitiseTitle(title: string): string {
  let clean = stripControlCharacters(title)
    .replace(ILLEGAL, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length > MAX_TITLE_LENGTH) {
    clean = clean.slice(0, MAX_TITLE_LENGTH).trimEnd();
  }

  // Windows drops a trailing dot or space without saying anything, after which the
  // file can no longer be found under the name we think we used.
  clean = clean.replace(/[. ]+$/, "");

  if (RESERVED.has(clean.toLowerCase())) clean = `${clean}_`;

  return clean === "" ? "Untitled" : clean;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `2026-07-25 1432` — sorts chronologically in any file browser. */
export function timestampPrefix(when: Date): string {
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ` +
    `${pad(when.getHours())}${pad(when.getMinutes())}`
  );
}

export function noteFileName(title: string, when: Date): string {
  return `${timestampPrefix(when)} ${sanitiseTitle(title)}.md`;
}

/**
 * Finds a name that does not exist yet by appending ` (2)`, ` (3)` and so on.
 * Overwriting is never an option: two notes in the same minute with the same first
 * line is rare, but losing one of them is unforgivable.
 */
export function uniquePath(directory: string, fileName: string): string {
  const candidate = join(directory, fileName);
  if (!existsSync(candidate)) return candidate;

  const base = fileName.replace(/\.md$/, "");
  for (let counter = 2; counter < 1000; counter += 1) {
    const next = join(directory, `${base} (${counter}).md`);
    if (!existsSync(next)) return next;
  }

  return join(directory, `${base} (${Date.now()}).md`);
}

/** ISO 8601 with a timezone offset, as the frontmatter spec requires. */
export function isoWithOffset(when: Date): string {
  const offsetMinutes = -when.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `T${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
}
