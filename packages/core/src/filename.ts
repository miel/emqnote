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
  const candidate = access.join(directory, fileName);
  if (!access.exists(candidate)) return candidate;

  const base = noteStem(fileName);
  const extension = noteExtension(fileName);
  for (let counter = 2; counter < 1000; counter += 1) {
    const next = access.join(directory, `${base} (${counter})${extension}`);
    if (!access.exists(next)) return next;
  }

  const suffix = access.fallbackSuffix?.() ?? Date.now();
  return access.join(directory, `${base} (${suffix})${extension}`);
}
