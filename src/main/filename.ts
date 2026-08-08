import { existsSync } from "node:fs";
import { join } from "node:path";
import { noteExtension, noteStem } from "./note-files.js";

export { isoWithOffset } from "../shared/time.js";

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

/**
 * The same rules for a folder name, minus the fallback.
 *
 * Folder creation used to strip the illegal characters and nothing else — no control
 * characters, no reserved device names, no trailing dot or space — which are exactly
 * the rules that exist because Windows enforces them. A folder is worse than a note
 * here: every note filed inside it inherits the unreachable path.
 *
 * Returns `""` for a name with nothing left in it rather than inventing "Untitled".
 * A note with no title still has to land somewhere, so a fallback is right there; a
 * folder the user named entirely out of illegal characters is a mistake to report, not
 * to guess at.
 */
export function sanitiseFolderName(name: string): string {
  let clean = stripControlCharacters(name)
    .replace(ILLEGAL, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length > MAX_TITLE_LENGTH) {
    clean = clean.slice(0, MAX_TITLE_LENGTH).trimEnd();
  }

  clean = clean.replace(/[. ]+$/, "");

  if (RESERVED.has(clean.toLowerCase())) clean = `${clean}_`;

  return clean;
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

  // The name's own extension, not `.md`: this is called for `.markdown` notes the app
  // did not create as well, and `attachments.ts` has its own `uniqueAttachmentPath`
  // precisely because this one used to hardcode one. A name with no note extension at
  // all keeps its whole self as the base and gains none — better a `report (2)` than a
  // `report (2).md` invented for a file that never had it.
  const base = noteStem(fileName);
  const extension = noteExtension(fileName);
  for (let counter = 2; counter < 1000; counter += 1) {
    const next = join(directory, `${base} (${counter})${extension}`);
    if (!existsSync(next)) return next;
  }

  return join(directory, `${base} (${Date.now()})${extension}`);
}

