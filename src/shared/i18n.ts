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
  "capture.noTime": "Datum instellen…",

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
  "shortcut.insertImage": "Afbeelding invoegen",
  "shortcut.insertFile": "Bestand invoegen",
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
  "shortcut.contextMenu": "Menu bij de gefocuste rij",
  "shortcut.cyclePanes": "Wissel tussen mappen, lijst en notitie",

  // Rechtermuisknop-menu's. De namen komen uit editor-menu.ts en de menu's op mappen/
  // notities; wat een actie *is* staat bij de sneltoets (hierboven), wat het menu-item
  // zegt staat hier — vaak dezelfde tekst, soms net iets anders omdat een menu-item een
  // werkwoord is en een sneltoetsnaam een zelfstandig naamwoord.
  "menu.bold": "Vet",
  "menu.italic": "Cursief",
  "menu.underline": "Onderstreept",
  "menu.highlight": "Gemarkeerd",
  "menu.bulletList": "Opsomming",
  "menu.orderedList": "Nummering",
  "menu.insertTask": "Taak invoegen",
  "menu.insertImage": "Afbeelding invoegen",
  "menu.insertFile": "Bestand invoegen",

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
  "library.pickHint": "Klik met rechts op een map voor nieuwe map, hernoemen, verwijderen of een nieuwe notitie.",
  "library.saved": "Bewaard",
  "library.saving": "Bezig met bewaren…",
  "library.open": "Openen",
  "library.rename": "Hernoemen",
  "library.move": "Verplaatsen",
  "library.moveLocked":
    "Deze notitie staat open in het notitievenster. Sluit hem daar eerst, dan kan hij verplaatst worden.",
  "library.taskLocked":
    "Deze notitie staat open in het notitievenster. Sluit hem daar eerst, dan kunnen de taken hier aangevinkt worden.",
  "library.renameLocked":
    "Deze notitie staat open in het notitievenster. Sluit hem daar eerst, dan kan hij hernoemd worden.",
  "library.duplicate": "Dupliceren",
  "library.duplicateLocked":
    "Deze notitie staat open in het notitievenster. Sluit hem daar eerst, dan kan hij gedupliceerd worden.",
  "library.tasks": "Taken",
  "library.indexing": "Vault doorzoekbaar maken…",
  "library.reveal": "Tonen in map",
  "library.delete": "Verwijderen",
  /** The reader toolbar's "⋯" button, opening Rename/Move/Duplicate/Reveal/Delete. */
  "library.moreActions": "Meer acties",
  "library.newNote": "Nieuwe notitie",
  "library.clearTrash": "Prullenbak legen",
  /** The folder toolbar's short form of `newFolder` — the panel itself already says
   *  "folders", so "+ Nieuwe map" shrank to "+ Nieuw". The context menu keeps the long
   *  form, where nothing else on screen says what "Nieuw" would otherwise mean. */
  "library.new": "Nieuw",
  "library.newFolder": "Nieuwe map",
  "library.renameFolder": "Map hernoemen",
  "library.deleteFolder": "Map verwijderen",
  "library.deleteFolderLocked":
    "Een notitie in deze map staat open in het notitievenster. Sluit hem daar eerst, dan kan de map verwijderd worden.",
  "library.folder": "map",
  "library.folders": "mappen",
  "library.openInCapture": "Open voor bewerking in het invoervenster",
  "library.vaultRoot": "Hoofdmap",
  "library.trash": "Prullenbak",
  "library.tags": "Tags",
  "library.people": "Personen",
  "library.filterEmpty": "Nog niets gevonden",
  "library.filterUnavailable":
    "De vault staat op Files On-Demand. Zet de map op 'Altijd behouden op dit apparaat' om te kunnen filteren.",
  "library.filterSearch": "Filteren…",
  "library.resizeTree": "Breedte van de mappenboom aanpassen",
  "library.resizeNotes": "Breedte van de notitielijst aanpassen",
  "library.search":
    "Zoeken… type:meeting tag:klantx attendee:\"Jan de Vries\" after:2026-01-01",
  "library.moveWhere": "Naar welke map?",
  "library.noFolderMatch": "Geen map gevonden",

  // Dialogs
  "ask.renameTitle": "Nieuwe titel",
  "ask.newFolderIn": "Nieuwe map in",
  "ask.renameFolderTitle": "Nieuwe naam voor de map",
  "ask.confirmDelete": "naar de prullenbak verplaatsen?",
  "ask.confirmDeleteFolder": "naar de prullenbak verplaatsen, met alles erin?",
  "ask.confirmClearTrash":
    "permanent verwijderen. Dit kan niet ongedaan worden gemaakt.",
  "ask.ok": "OK",
  "ask.cancel": "Annuleren",

  // Waarom een map niet hernoemd of verwijderd kon worden. De namen komen als code uit
  // het hoofdproces, zodat de melding hier in de juiste taal staat. Dezelfde codes
  // gelden voor allebei — alleen de generieke `folder.failed`/`folder.deleteFailed`
  // verschillen per actie.
  "folder.folder-is-root": "De vault zelf kan niet hernoemd of verwijderd worden.",
  "folder.folder-is-reserved": "Die map is van de app zelf.",
  "folder.folder-name-empty": "Een map heeft een naam nodig.",
  "folder.folder-leaves-vault": "Die naam wijst buiten de vault.",
  "folder.folder-not-found": "Die map bestaat niet meer.",
  "folder.folder-already-exists": "Er is al een map met die naam.",
  "folder.failed": "De map kon niet hernoemd worden.",
  "folder.deleteFailed": "De map kon niet verwijderd worden.",

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

  // Conflict banner — "conflict.banner" is a tail appended after the note's own
  // filename ("2026-08-07 Kickoff.md is op twee machines gewijzigd — …"), not a
  // complete sentence on its own; "conflict.bannerPlural" is still prefixed with a count.
  "conflict.banner": "is op twee machines gewijzigd — klik om op te lossen",
  "conflict.bannerPlural": "notities zijn op twee machines gewijzigd — klik om op te lossen",
  "conflict.title": "Deze notitie is op twee machines gewijzigd",
  "conflict.thisOne": "Deze:",
  "conflict.thatOne": "Die:",
  "conflict.loading": "Verschil laden…",
  "conflict.diffError": "Kon het verschil niet laden. Probeer dit venster opnieuw te openen.",
  "conflict.keepThis": "Deze houden",
  "conflict.keepThat": "Die houden",
  "conflict.merge": "Samenvoegen in de editor",
  "conflict.close": "Sluiten",

  // Orphaned attachments
  "orphans.title": "Verweesde bijlagen",
  "orphans.loading": "Bezig met zoeken…",
  "orphans.empty": "Geen verweesde bijlagen gevonden.",
  "orphans.settingsHint": "Bestanden in _attachments/ waar geen notitie meer naar verwijst.",

  // Aggregated Tasks view
  "tasks.openOnly": "Alleen openstaand",
  "tasks.none": "Geen taken gevonden",
  "tasks.one": "taak",
  "tasks.many": "taken",
  "tasks.empty": "(leeg)",

  // Disk-change bar: the open note changed outside the app.
  "diskChange.changed": "Deze notitie is buiten emqnote gewijzigd.",
  "diskChange.removed": "Deze notitie is buiten emqnote verwijderd.",
  "diskChange.reload": "Herladen",
  "diskChange.close": "Sluiten",
  "diskChange.keepMine": "Mijn versie houden",
  // Capture window's status-bar equivalent — no buttons, see CLAUDE.md.
  "diskChange.captureChanged": "Deze notitie is intussen buiten emqnote gewijzigd.",
  "diskChange.captureRemoved": "Deze notitie is intussen buiten emqnote verwijderd.",
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
  "capture.noTime": "Set a date…",

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
  "shortcut.insertImage": "Insert an image",
  "shortcut.insertFile": "Insert a file",
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
  "shortcut.contextMenu": "Menu for the focused row",
  "shortcut.cyclePanes": "Switch between folders, list and note",

  // Right-click menus. The command names come from `editor-menu.ts` and the folder/
  // note-list menus; what an action *is* lives with the shortcut above, what the menu
  // item says lives here — usually the same word, sometimes a verb where the shortcut
  // sheet uses a noun.
  "menu.bold": "Bold",
  "menu.italic": "Italic",
  "menu.underline": "Underline",
  "menu.highlight": "Highlight",
  "menu.bulletList": "Bullet list",
  "menu.orderedList": "Numbered list",
  "menu.insertTask": "Insert task",
  "menu.insertImage": "Insert image",
  "menu.insertFile": "Insert file",

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
  "library.pickHint":
    "Right-click a folder for new folder, rename, delete or a new note.",
  "library.saved": "Saved",
  "library.saving": "Saving…",
  "library.open": "Open",
  "library.rename": "Rename",
  "library.move": "Move",
  "library.moveLocked":
    "This note is open in the note window. Close it there first, then it can be moved.",
  "library.taskLocked":
    "This note is open in the note window. Close it there first, then its tasks can be ticked here.",
  "library.renameLocked":
    "This note is open in the note window. Close it there first, then it can be renamed.",
  "library.duplicate": "Duplicate",
  "library.duplicateLocked":
    "This note is open in the note window. Close it there first, then it can be duplicated.",
  "library.tasks": "Tasks",
  "library.indexing": "Making the vault searchable…",
  "library.reveal": "Reveal",
  "library.delete": "Delete",
  /** The reader toolbar's "⋯" button, opening Rename/Move/Duplicate/Reveal/Delete. */
  "library.moreActions": "More actions",
  "library.newNote": "New note",
  "library.clearTrash": "Clear trash",
  "library.new": "New",
  "library.newFolder": "New folder",
  "library.renameFolder": "Rename folder",
  "library.deleteFolder": "Delete folder",
  "library.deleteFolderLocked":
    "A note in this folder is open in the note window. Close it there first, then the folder can be deleted.",
  "library.folder": "folder",
  "library.folders": "folders",
  "library.openInCapture": "Open for editing in the capture window",
  "library.vaultRoot": "Vault root",
  "library.trash": "Trash",
  "library.tags": "Tags",
  "library.people": "People",
  "library.filterEmpty": "Nothing found yet",
  "library.filterUnavailable":
    "The vault is on Files On-Demand. Set the folder to 'Always keep on this device' to filter.",
  "library.filterSearch": "Filter…",
  "library.resizeTree": "Resize the folder tree",
  "library.resizeNotes": "Resize the note list",
  "library.search":
    'Search… type:meeting tag:klantx attendee:"Jan de Vries" after:2026-01-01',
  "library.moveWhere": "Move to which folder?",
  "library.noFolderMatch": "No folder matches",

  "ask.renameTitle": "New title",
  "ask.newFolderIn": "New folder in",
  "ask.renameFolderTitle": "New name for the folder",
  "ask.confirmDelete": "Move to the trash?",
  "ask.confirmDeleteFolder": "Move to the trash, along with everything inside it?",
  "ask.confirmClearTrash": "permanently deleted. This cannot be undone.",
  "ask.ok": "OK",
  "ask.cancel": "Cancel",

  // Why a folder could not be renamed or deleted. The same codes cover both — only the
  // generic `folder.failed`/`folder.deleteFailed` fallback differs per action.
  "folder.folder-is-root": "The vault itself cannot be renamed or deleted.",
  "folder.folder-is-reserved": "That folder belongs to the app.",
  "folder.folder-name-empty": "A folder needs a name.",
  "folder.folder-leaves-vault": "That name points outside the vault.",
  "folder.folder-not-found": "That folder no longer exists.",
  "folder.folder-already-exists": "There is already a folder with that name.",
  "folder.failed": "The folder could not be renamed.",
  "folder.deleteFailed": "The folder could not be deleted.",

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

  // Conflict banner — "conflict.banner" is a tail appended after the note's own
  // filename ("2026-08-07 Kickoff.md was changed on two machines — …"), not a complete
  // sentence on its own; "conflict.bannerPlural" is still prefixed with a count.
  "conflict.banner": "was changed on two machines — click to resolve",
  "conflict.bannerPlural": "notes were changed on two machines — click to resolve",
  "conflict.title": "This note was changed on two machines",
  "conflict.thisOne": "This one:",
  "conflict.thatOne": "That one:",
  "conflict.loading": "Loading diff…",
  "conflict.diffError": "Could not load the diff. Try opening this dialog again.",
  "conflict.keepThis": "Keep this one",
  "conflict.keepThat": "Keep that one",
  "conflict.merge": "Merge in the editor",
  "conflict.close": "Close",

  // Orphaned attachments
  "orphans.title": "Orphaned attachments",
  "orphans.loading": "Looking…",
  "orphans.empty": "No orphaned attachments found.",
  "orphans.settingsHint": "Files in _attachments/ that no note points to any more.",

  // Aggregated Tasks view
  "tasks.openOnly": "Open only",
  "tasks.none": "No tasks found",
  "tasks.one": "task",
  "tasks.many": "tasks",
  "tasks.empty": "(empty)",

  // Disk-change bar: the open note changed outside the app.
  "diskChange.changed": "This note changed outside emqnote.",
  "diskChange.removed": "This note was deleted outside emqnote.",
  "diskChange.reload": "Reload",
  "diskChange.close": "Close",
  "diskChange.keepMine": "Keep mine",
  // Capture window's status-bar equivalent — no buttons, see CLAUDE.md.
  "diskChange.captureChanged": "This note changed outside emqnote in the meantime.",
  "diskChange.captureRemoved": "This note was deleted outside emqnote in the meantime.",
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
