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
  "capture.location": "Locatie",
  // De scheidingstekens blijven in de tekst staan: `parseAttendees` splitst op komma
  // *en* puntkomma, omdat Outlook puntkomma's gebruikt.
  "capture.people": "Personen, gescheiden door , of ;",
  "capture.tags": "#tags",
  // De labels in de eerste kolom van het kop-raster.
  "capture.when": "Wanneer",
  "capture.where": "Waar",
  "capture.who": "Wie",
  "capture.tagsLabel": "Tags",
  "capture.placeholder": "Typ maar.",
  "capture.dismiss": "sluit",
  "capture.nothingSaved": "Nog niets bewaard",
  "capture.savedAs": "Bewaard als",
  "capture.changeTime": "Klik om datum en tijd te wijzigen",

  // Sneltoetsenoverzicht. De namen komen uit src/shared/shortcuts.ts; wat een toets
  // *is* staat daar, wat hij heet staat hier.
  "help.title": "Sneltoetsen",
  "help.or": "of",
  "help.group.text": "Tekst",
  "help.group.lists": "Lijsten",
  "help.group.structure": "Structuur",
  "help.group.note": "Notitie",
  "help.group.window": "Venster",
  "shortcut.strong": "Vet",
  "shortcut.em": "Cursief",
  "shortcut.underline": "Onderstreept",
  "shortcut.strike": "Doorgehaald",
  "shortcut.highlight": "Gemarkeerd",
  "shortcut.code": "Code",
  "shortcut.link": "Link",
  "shortcut.bulletList": "Opsomming",
  "shortcut.orderedList": "Nummering",
  "shortcut.task": "Taak met vinkvakje",
  "shortcut.tick": "Afvinken",
  "shortcut.indent": "Niveau dieper",
  "shortcut.outdent": "Niveau omhoog",
  "shortcut.heading1": "Kop 1",
  "shortcut.heading2": "Kop 2",
  "shortcut.heading3": "Kop 3",
  "shortcut.heading4": "Kop 4",
  "shortcut.heading5": "Kop 5",
  "shortcut.heading6": "Kop 6",
  "shortcut.paragraph": "Gewone alinea",
  "shortcut.softBreak": "Regelovergang binnen de alinea",
  "shortcut.undo": "Ongedaan maken",
  "shortcut.redo": "Opnieuw",
  "shortcut.close": "Bewaren en sluiten",
  "shortcut.openLibrary": "Bibliotheek openen",
  "shortcut.help": "Dit overzicht",
  "shortcut.newNote": "Nieuwe notitie (overal)",

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
  "library.newNote": "Nieuwe notitie",
  "library.newFolder": "Nieuwe map",
  "library.renameFolder": "Map hernoemen",
  "library.openInCapture": "Open voor bewerking in het invoervenster",
  "library.vaultRoot": "Hoofdmap",
  "library.trash": "Prullenbak",
  "library.tags": "Tags",
  "library.people": "Personen",
  "library.filterEmpty": "Nog niets gevonden",
  "library.filterUnavailable":
    "De vault staat op Files On-Demand. Zet de map op 'Altijd behouden op dit apparaat' om te kunnen filteren.",
  "library.filterSearch": "Filteren…",
  "library.search":
    "Zoeken… type:meeting tag:klantx attendee:\"Jan de Vries\" after:2026-01-01",
  "library.moveWhere": "Naar welke map?",
  "library.noFolderMatch": "Geen map gevonden",

  // Dialogs
  "ask.renameTitle": "Nieuwe titel",
  "ask.newFolderIn": "Nieuwe map in",
  "ask.renameFolderTitle": "Nieuwe naam voor de map",
  "ask.confirmDelete": "naar de prullenbak verplaatsen?",
  "ask.ok": "OK",
  "ask.cancel": "Annuleren",

  // Waarom een map niet hernoemd kon worden. De namen komen als code uit het
  // hoofdproces, zodat de melding hier in de juiste taal staat.
  "folder.folder-is-root": "De vault zelf kan niet hernoemd worden.",
  "folder.folder-is-reserved": "Die map is van de app zelf.",
  "folder.folder-name-empty": "Een map heeft een naam nodig.",
  "folder.folder-leaves-vault": "Die naam wijst buiten de vault.",
  "folder.folder-not-found": "Die map bestaat niet meer.",
  "folder.folder-already-exists": "Er is al een map met die naam.",
  "folder.failed": "De map kon niet hernoemd worden.",

  // Settings
  "settings.title": "Instellingen",
  "settings.language": "Taal",
  "settings.hotkey": "Sneltoets voor een nieuwe notitie",
  "settings.hotkeyHint": "Klik en druk de toetsencombinatie in.",
  "settings.close": "Sluiten",
  "settings.hotkeyTaken": "Die combinatie is al bezet.",
  "settings.vault": "Waar je notities staan",
  "settings.vaultChoose": "Andere map kiezen…",
  "settings.vaultSynced": "Gesynchroniseerd",
  "settings.vaultLocal": "Lokale map",
  "settings.vaultUnavailable": "Niet beschikbaar",
  "settings.vaultRestart":
    "emqnote start opnieuw op om naar deze vault over te schakelen. Wat nog niet " +
    "bewaard is, wordt eerst weggeschreven.",
  "settings.vaultRestartConfirm": "Opnieuw opstarten",

  // Conflict banner
  "conflict.banner": "notitie is op twee machines gewijzigd — klik om op te lossen",
  "conflict.bannerPlural": "notities zijn op twee machines gewijzigd — klik om op te lossen",
  "conflict.title": "Deze notitie is op twee machines gewijzigd",
  "conflict.loading": "Verschil laden…",
  "conflict.keepThis": "Deze houden",
  "conflict.keepThat": "Die houden",
  "conflict.merge": "Samenvoegen in de editor",

  // Orphaned attachments
  "orphans.title": "Verweesde bijlagen",
  "orphans.loading": "Bezig met zoeken…",
  "orphans.empty": "Geen verweesde bijlagen gevonden.",
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
  "capture.location": "Location",
  // The separator clause stays: `parseAttendees` splits on a comma *and* a semicolon,
  // because Outlook uses semicolons and fingers expect it.
  "capture.people": "People, separated by , or ;",
  "capture.tags": "#tags",
  // The labels down the first column of the header grid.
  "capture.when": "When",
  "capture.where": "Where",
  "capture.who": "Who",
  "capture.tagsLabel": "Tags",
  "capture.placeholder": "Just type.",
  "capture.dismiss": "closes",
  "capture.nothingSaved": "Nothing saved yet",
  "capture.savedAs": "Saved as",
  "capture.changeTime": "Click to change the date and time",

  // The shortcut sheet. What a key *is* lives in src/shared/shortcuts.ts; what it is
  // called lives here.
  "help.title": "Keyboard shortcuts",
  "help.or": "or",
  "help.group.text": "Text",
  "help.group.lists": "Lists",
  "help.group.structure": "Structure",
  "help.group.note": "Note",
  "help.group.window": "Window",
  "shortcut.strong": "Bold",
  "shortcut.em": "Italic",
  "shortcut.underline": "Underline",
  "shortcut.strike": "Strikethrough",
  "shortcut.highlight": "Highlight",
  "shortcut.code": "Code",
  "shortcut.link": "Link",
  "shortcut.bulletList": "Bulleted list",
  "shortcut.orderedList": "Numbered list",
  "shortcut.task": "Task with a checkbox",
  "shortcut.tick": "Tick the box",
  "shortcut.indent": "One level in",
  "shortcut.outdent": "One level out",
  "shortcut.heading1": "Heading 1",
  "shortcut.heading2": "Heading 2",
  "shortcut.heading3": "Heading 3",
  "shortcut.heading4": "Heading 4",
  "shortcut.heading5": "Heading 5",
  "shortcut.heading6": "Heading 6",
  "shortcut.paragraph": "Ordinary paragraph",
  "shortcut.softBreak": "Line break within the paragraph",
  "shortcut.undo": "Undo",
  "shortcut.redo": "Redo",
  "shortcut.close": "Save and close",
  "shortcut.openLibrary": "Open the library",
  "shortcut.help": "This sheet",
  "shortcut.newNote": "New note (from anywhere)",

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
  "library.newNote": "New note",
  "library.newFolder": "New folder",
  "library.renameFolder": "Rename folder",
  "library.openInCapture": "Open for editing in the capture window",
  "library.vaultRoot": "Vault root",
  "library.trash": "Trash",
  "library.tags": "Tags",
  "library.people": "People",
  "library.filterEmpty": "Nothing found yet",
  "library.filterUnavailable":
    "The vault is on Files On-Demand. Set the folder to 'Always keep on this device' to filter.",
  "library.filterSearch": "Filter…",
  "library.search":
    'Search… type:meeting tag:klantx attendee:"Jan de Vries" after:2026-01-01',
  "library.moveWhere": "Move to which folder?",
  "library.noFolderMatch": "No folder matches",

  "ask.renameTitle": "New title",
  "ask.newFolderIn": "New folder in",
  "ask.renameFolderTitle": "New name for the folder",
  "ask.confirmDelete": "Move to the trash?",
  "ask.ok": "OK",
  "ask.cancel": "Cancel",

  "folder.folder-is-root": "The vault itself cannot be renamed.",
  "folder.folder-is-reserved": "That folder belongs to the app.",
  "folder.folder-name-empty": "A folder needs a name.",
  "folder.folder-leaves-vault": "That name points outside the vault.",
  "folder.folder-not-found": "That folder no longer exists.",
  "folder.folder-already-exists": "There is already a folder with that name.",
  "folder.failed": "The folder could not be renamed.",

  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.hotkey": "Shortcut for a new note",
  "settings.hotkeyHint": "Click, then press the key combination.",
  "settings.close": "Close",
  "settings.hotkeyTaken": "That combination is already taken.",
  "settings.vault": "Where your notes live",
  "settings.vaultChoose": "Choose another folder…",
  "settings.vaultSynced": "Synced",
  "settings.vaultLocal": "Local folder",
  "settings.vaultUnavailable": "Unavailable",
  "settings.vaultRestart":
    "emqnote restarts to switch to this vault. Anything not yet saved is written out " +
    "first.",
  "settings.vaultRestartConfirm": "Restart",

  // Conflict banner
  "conflict.banner": "note was changed on two machines — click to resolve",
  "conflict.bannerPlural": "notes were changed on two machines — click to resolve",
  "conflict.title": "This note was changed on two machines",
  "conflict.loading": "Loading diff…",
  "conflict.keepThis": "Keep this one",
  "conflict.keepThat": "Keep that one",
  "conflict.merge": "Merge in the editor",

  // Orphaned attachments
  "orphans.title": "Orphaned attachments",
  "orphans.loading": "Looking…",
  "orphans.empty": "No orphaned attachments found.",
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
