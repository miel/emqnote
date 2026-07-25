import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Bestandsnamen volgens 02-technisch-ontwerp.md §4.1.
 *
 * De regels zijn streng omdat Windows dat is: tekens die macOS accepteert maken een
 * bestand daar onbereikbaar, en een naam die op een spatie of punt eindigt wordt stil
 * afgekapt. Een notitie die op de Mac prima wordt weggeschreven en op de werkmachine
 * niet te openen is, is een fout die je pas een week later merkt.
 */

const ILLEGAL = /[\\/:*?"<>|]/g;

/** Namen die Windows voor apparaten gebruikt, met of zonder extensie. */
const RESERVED = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

export const MAX_TITLE_LENGTH = 80;

/**
 * Stuurtekens eruit. Uitgeschreven als lus in plaats van als tekenklasse, zodat er
 * geen onzichtbare bytes in de broncode terechtkomen.
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

  // Windows verwijdert een punt of spatie aan het eind zonder iets te zeggen, waarna
  // het bestand niet meer te vinden is onder de naam die wij denken te hebben gebruikt.
  clean = clean.replace(/[. ]+$/, "");

  if (RESERVED.has(clean.toLowerCase())) clean = `${clean}_`;

  return clean === "" ? "Zonder titel" : clean;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `2026-07-25 1432` — sorteert chronologisch in elke bestandsbeheerder. */
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
 * Zoekt een naam die nog niet bestaat, door er ` (2)`, ` (3)` … achter te zetten.
 * Overschrijven is nooit een optie: twee notities in dezelfde minuut met dezelfde
 * eerste regel is zeldzaam, maar er eentje van kwijtraken is onvergeeflijk.
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

/** ISO 8601 met tijdzone-offset, zoals de frontmatter voorschrijft. */
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
