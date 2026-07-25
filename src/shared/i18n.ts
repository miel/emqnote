export type Locale = "en-US" | "nl-NL";

export const LOCALES: Locale[] = ["en-US", "nl-NL"];

/**
 * The visible strings, in the two languages that matter here.
 *
 * A plain object rather than a library: there are two locales and one user, and every
 * key is used somewhere in this repository. An i18n framework would add a build step
 * and a lookup layer to solve a problem this size.
 *
 * English is the source language, so a missing Dutch key falls back to it rather than
 * showing a key name.
 */
const DUTCH: Record<string, string> = {
  // Capture window
  "capture.subject": "Onderwerp (optioneel)",
  "capture.meeting": "Vergadering",
  "capture.location": "Locatie",
  "capture.attendees": "Aanwezigen, gescheiden door , of ;",
  "capture.placeholder": "Typ maar.",
  "capture.dismiss": "Ctrl+Enter sluit",
  "capture.nothingSaved": "Nog niets bewaard",
  "capture.savedAs": "Bewaard als",
  "capture.changeTime": "Klik om datum en tijd te wijzigen",

  // Link prompt
  "link.new": "Link",
  "link.edit": "Link bewerken",
  "link.placeholder": "https://…  (leeg maakt de link weg)",

  // Library window
  "library.notes": "notities",
  "library.note": "notitie",
  "library.noNotes": "Geen notities",
  "library.sort.modified": "Gewijzigd",
  "library.sort.created": "Gemaakt",
  "library.sort.title": "Titel",
  "library.pick": "Kies links een notitie.",
  "library.pickHint": "Klik met rechts op een map om er een nieuwe in te maken.",
  "library.saved": "Bewaard",
  "library.saving": "Bezig met bewaren…",
  "library.rename": "Hernoemen",
  "library.move": "Verplaatsen",
  "library.reveal": "Tonen in map",
  "library.delete": "Verwijderen",
  "library.newFolder": "Nieuwe map",
  "library.vaultRoot": "Hoofdmap",
  "library.moveWhere": "Naar welke map?",
  "library.noFolderMatch": "Geen map gevonden",

  // Dialogs
  "ask.renameTitle": "Nieuwe titel",
  "ask.newFolderIn": "Nieuwe map in",
  "ask.confirmDelete": "naar de prullenbak verplaatsen?",
  "ask.ok": "OK",
  "ask.cancel": "Annuleren",

  // Settings
  "settings.title": "Instellingen",
  "settings.language": "Taal",
  "settings.hotkey": "Sneltoets voor een nieuwe notitie",
  "settings.hotkeyHint": "Klik en druk de toetsencombinatie in.",
  "settings.close": "Sluiten",
  "settings.hotkeyTaken": "Die combinatie is al bezet.",
};

export function translate(locale: Locale, key: string): string {
  if (locale === "nl-NL") {
    const dutch = DUTCH[key];
    if (dutch !== undefined) return dutch;
  }
  return ENGLISH[key] ?? key;
}

const ENGLISH: Record<string, string> = {
  "capture.subject": "Subject (optional)",
  "capture.meeting": "Meeting",
  "capture.location": "Location",
  "capture.attendees": "Attendees, separated by , or ;",
  "capture.placeholder": "Just type.",
  "capture.dismiss": "Ctrl+Enter closes",
  "capture.nothingSaved": "Nothing saved yet",
  "capture.savedAs": "Saved as",
  "capture.changeTime": "Click to change the date and time",

  "link.new": "Link",
  "link.edit": "Edit link",
  "link.placeholder": "https://…  (empty removes the link)",

  "library.notes": "notes",
  "library.note": "note",
  "library.noNotes": "No notes",
  "library.sort.modified": "Modified",
  "library.sort.created": "Created",
  "library.sort.title": "Title",
  "library.pick": "Pick a note on the left.",
  "library.pickHint": "Right-click a folder to make a new one inside it.",
  "library.saved": "Saved",
  "library.saving": "Saving…",
  "library.rename": "Rename",
  "library.move": "Move",
  "library.reveal": "Reveal",
  "library.delete": "Delete",
  "library.newFolder": "New folder",
  "library.vaultRoot": "Vault root",
  "library.moveWhere": "Move to which folder?",
  "library.noFolderMatch": "No folder matches",

  "ask.renameTitle": "New title",
  "ask.newFolderIn": "New folder in",
  "ask.confirmDelete": "Move to the trash?",
  "ask.ok": "OK",
  "ask.cancel": "Cancel",

  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.hotkey": "Shortcut for a new note",
  "settings.hotkeyHint": "Click, then press the key combination.",
  "settings.close": "Close",
  "settings.hotkeyTaken": "That combination is already taken.",
};

/**
 * Dates and times, always on a 24-hour clock.
 *
 * `hour12` is set rather than left to the locale: en-US would otherwise show 2:32 PM,
 * and a notes app for someone who writes 14:32 should show 14:32 whatever language the
 * interface happens to be in.
 */
export function formatDateTime(locale: Locale, iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;

  return parsed.toLocaleString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Short form for the note list: time for today, date and time otherwise. */
export function formatListTime(locale: Locale, iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";

  const today = new Date();
  const sameDay =
    parsed.getFullYear() === today.getFullYear() &&
    parsed.getMonth() === today.getMonth() &&
    parsed.getDate() === today.getDate();

  return parsed.toLocaleString(locale, {
    day: sameDay ? undefined : "numeric",
    month: sameDay ? undefined : "short",
    year: sameDay || parsed.getFullYear() === today.getFullYear() ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
