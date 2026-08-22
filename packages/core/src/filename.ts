import { noteExtension, noteStem } from "./note-files.js";
import { isoWithOffset } from "./time.js";

export { isoWithOffset };

/** Platform-neutral filename rules shared by desktop and mobile capture. */
const ILLEGAL = /[\\/:*?"<>|]/g;

const RESERVED = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

export const MAX_TITLE_LENGTH = 80;

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

  clean = clean.replace(/[. ]+$/, "");
  if (RESERVED.has(clean.toLowerCase())) clean = `${clean}_`;
  return clean === "" ? "Untitled" : clean;
}

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

export function timestampPrefix(when: Date): string {
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ` +
    `${pad(when.getHours())}${pad(when.getMinutes())}`
  );
}

export function noteFileName(title: string, when: Date): string {
  return `${timestampPrefix(when)} ${sanitiseTitle(title)}.md`;
}

/** The ` (N)` suffix itself, kept in one function so nothing can spell it differently. */
function suffixed(fileName: string, suffix: string | number): string {
  return `${noteStem(fileName)} (${suffix})${noteExtension(fileName)}`;
}

/** How many names `uniquePath` tries before falling back to a non-sequential suffix. */
export const MAX_COLLISION_COUNTER = 1000;

/**
 * The nth name in the product-wide `(2)`, `(3)` collision contract; `1` is the plain name.
 *
 * `uniquePath` below is the desktop's way of using this — it asks a synchronous `exists`
 * which side is free. A remote destination cannot answer that synchronously, so the iPhone's
 * Graph delivery walks the same sequence itself, one round trip at a time. Both go through
 * this function on purpose: `conflicts.ts` deliberately refuses to treat a bare `(N)` as a
 * OneDrive conflict copy *because* it is this contract's own shape, so a second numbering
 * scheme invented for a second client would either collide with desktop's names or make the
 * desktop mistake a perfectly ordinary note for a conflict copy.
 */
export function collisionCandidate(fileName: string, counter: number): string {
  return counter <= 1 ? fileName : suffixed(fileName, counter);
}

export interface PathAccess {
  exists(path: string): boolean;
  join(directory: string, fileName: string): string;
  fallbackSuffix?(): string | number;
}

/** Finds a non-existing path using the product-wide `(2)`, `(3)` collision contract. */
export function uniquePath(
  directory: string,
  fileName: string,
  access: PathAccess,
): string {
  for (let counter = 1; counter < MAX_COLLISION_COUNTER; counter += 1) {
    const next = access.join(directory, collisionCandidate(fileName, counter));
    if (!access.exists(next)) return next;
  }

  const suffix = access.fallbackSuffix?.() ?? Date.now();
  return access.join(directory, suffixed(fileName, suffix));
}
