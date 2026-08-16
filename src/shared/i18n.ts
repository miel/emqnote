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
  "shortcut.insertNoteLink": "Link naar notitie invoegen",
  "shortcut.insertTable": "Tabel invoegen",
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
  "menu.insertNoteLink": "Link naar notitie…",
  "menu.insertTable": "Tabel…",
  "menu.insertRule": "Scheidingslijn",
  "menu.quote": "Citaat",
  "menu.tableRowAbove": "Rij hierboven invoegen",
  "menu.tableRowBelow": "Rij hieronder invoegen",
  "menu.tableColumnLeft": "Kolom links invoegen",
  "menu.tableColumnRight": "Kolom rechts invoegen",
  "menu.tableDeleteRow": "Rij verwijderen",
  "menu.tableDeleteColumn": "Kolom verwijderen",
  "menu.tableDelete": "Tabel verwijderen",
  "menu.tableAlignLeft": "Kolom links uitlijnen",
  "menu.tableAlignCenter": "Kolom centreren",
  "menu.tableAlignRight": "Kolom rechts uitlijnen",
  "menu.tableAlignDefault": "Kolomuitlijning wissen",

  // De knoppenbalk boven de tabel waar de cursor in staat. Kort, want er staan er tien
  // naast elkaar; de volledige zin uit `menu.table*` hierboven staat in de tooltip.
  // Het /-menu (B51).
  "slash.nothing": "Niets gevonden",
  "slash.label": "Invoegmenu",

  "table.toolbar": "Tabelbewerkingen",
  "table.rowAbove": "Rij ↑",
  "table.rowBelow": "Rij ↓",
  "table.columnLeft": "Kol ←",
  "table.columnRight": "Kol →",
  "table.deleteRow": "Rij weg",
  "table.deleteColumn": "Kol weg",
  "table.alignLeft": "Links",
  "table.alignCenter": "Midden",
  "table.alignRight": "Rechts",
  "table.alignDefault": "Auto",

  // De balk boven een ingesloten pdf-pagina (B43/B46), sinds 14 augustus 2026 in de vorm
  // van de werkbalk van het pdf-venster zelf. Bladeren gebeurt in de notitie; ⧉ ging
  // eerst naar het pdf-venster (B40) en gaat nu rechtstreeks naar de systeemviewer —
  // wie een pdf in de notitie leest, wil daarvandaan naar afdrukken en annoteren, niet
  // naar een derde lezer. Het venster van B40 blijft bereikbaar via een gewone
  // `[[bestand.pdf]]`-chip en via Openen in de bestandenlijst.
  "pdf.previousPage": "Vorige pagina",
  "pdf.nextPage": "Volgende pagina",
  "pdf.pageNumber": "Paginanummer",
  "pdf.fit": "Passend maken",
  "pdf.fitPage": "Hele pagina",
  "pdf.fitWidth": "Kolombreedte",
  "pdf.openSystem": "Openen in systeemviewer",

  // Link prompt
  "link.new": "Link",
  "link.edit": "Link bewerken",
  "link.placeholder": "https://…  (leeg maakt de link weg)",

  // Library window
  "library.notes": "notities",
  "library.note": "notitie",
  "library.noNotes": "Geen notities",
  "library.file": "bestand",
  "library.files": "bestanden",
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
  // Het menu van een bestandsrij (B47). Kopieert `![[pad]]` of `[[pad]]` — dezelfde
  // spelling die het invoegen zelf schrijft, zodat de twee niet uiteen kunnen lopen.
  "library.copyLink": "Link kopiëren",
  "library.duplicateLocked":
    "Deze notitie staat open in het notitievenster. Sluit hem daar eerst, dan kan hij gedupliceerd worden.",
  "library.tasks": "Taken",
  "library.indexing": "Vault doorzoekbaar maken…",
  "library.reveal": "Tonen in map",
  // Het bestandsvoorbeeld naast de notitielijst (B47).
  "library.openFile": "Openen",
  "library.noPreview": "Geen voorbeeld voor dit bestandstype. Open het in het systeem.",
  "library.previewFailed": "Dit bestand kon niet getoond worden.",
  "library.delete": "Verwijderen",
  /** Uit de prullenbak terug de vault in: vraagt naar welke map, de Inbox bovenaan. */
  "library.restore": "Terugzetten",
  /** Het enige menu-item dat echt iets weggooit (B24), naast Prullenbak legen. */
  "library.deletePermanently": "Permanent verwijderen",
  "library.deletePermanentlyLocked":
    "Dit staat open in het invoervenster. Sluit het daar eerst, dan kan het verwijderd worden.",
  /** Niet dit programma maar het besturingssysteem weigert: op Windows houdt OneDrive,
   *  de Verkenner of een virusscanner een map soms even vast. Er is al een seconde lang
   *  opnieuw geprobeerd (`REMOVE_OPTIONS`) voordat dit op het scherm komt. */
  "library.deletePermanentlyFailed":
    "Dit kon niet verwijderd worden: iets anders op deze computer heeft het nog open. Probeer het zo nog eens.",
  "library.clearTrashFailed":
    "Een deel van de prullenbak kon niet verwijderd worden: iets anders op deze computer heeft het nog open. Probeer het zo nog eens.",
  "library.clearTrashLocked":
    "Er staat iets uit de prullenbak open in het invoervenster. Sluit het daar eerst.",
  /** The reader toolbar's overflow button, opening Rename/Move/Duplicate/Reveal/Delete.
   *  Its `title`; `library.actions` is what is written on it. */
  "library.moreActions": "Meer acties",
  /** On the button itself, where "⋯" used to be. */
  "library.actions": "Acties",
  /** The button that opened as four icons (🖼 🔗 ▦ 📎), in both windows. */
  "library.insert": "Invoegen",
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
  // De weg terug uit een gevolgde [[…]]-link. `{title}` is de notitie waar geklikt werd.
  "library.backTo": "Terug naar {title}",
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
  // Voor één ding uit de prullenbak, waar `ask.confirmClearTrash` er een aantal telt.
  "ask.confirmDeletePermanently":
    "permanent verwijderen? Dit kan niet ongedaan worden gemaakt.",
  "ask.ok": "OK",
  "ask.cancel": "Annuleren",

  // Interne notitieverwijzingen (B35). "link.notesLinkHere" telt notities die naar deze
  // verwijzen; de vraag stelt zich alleen als dat er meer dan nul zijn.
  "link.noteLinksHere": "notitie verwijst hiernaar",
  "link.notesLinkHere": "notities verwijzen hiernaar",
  "link.updateThem": "meeverhuizen?",
  "link.update": "Bijwerken",
  "link.leave": "Laten staan",
  "link.whichNote": "Welke notitie bedoel je met",
  "link.whichNoteToLink": "Link naar welke notitie?",
  "link.noNoteMatch": "Geen notitie gevonden",
  "table.size": "tabel van {columns} × {rows}",
  "link.duplicateTitle": "Er staat al een notitie met deze titel in",
  "link.renameAnyway": "toch hernoemen?",

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
  "folder.folder-holds-open-note": "Er staat een notitie in die open is in het invoervenster.",
  "folder.folder-into-itself": "Een map kan niet in zichzelf gezet worden.",
  "folder.failed": "De map kon niet hernoemd worden.",
  "folder.deleteFailed": "De map kon niet verwijderd worden.",
  "folder.moveFailed": "De map kon niet verplaatst worden.",

  // Settings
  "settings.title": "Instellingen",
  "settings.language": "Taal",
  "settings.hotkey": "Sneltoets voor een nieuwe notitie",
  "settings.hotkeyHint": "Klik en druk de toetsencombinatie in.",
  "settings.close": "Sluiten",
  "settings.hotkeyTaken": "Die combinatie is al bezet.",
  "settings.remoteImages": "Afbeeldingen van het web laden",
  "settings.remoteImagesWhy":
    "Een notitie kan naar een afbeelding op internet verwijzen. emqnote haalt die \u00e9\u00e9n keer op en bewaart hem lokaal, zodat de notitie ook zonder internet klopt.",
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

  // Niet-gekoppelde bijlagen — sinds 16 augustus 2026 een plek in de zijbalk (tussen
  // Sneltoetsen en Prullenbak) in plaats van een venster: de bestandenlijst van B47 in
  // het notitiepaneel, de preview van B47 in de lezer, en Verwijderen in het menu van de
  // rij. `unlinked.title` is dus ook het label van die rij. De twee toestanden hieronder
  // zijn geen versiering: dit is de enige bestandenlijst die een zoekopdracht is en dus
  // kan mislukken, en precies daarop liep het oude venster vast op "Bezig met zoeken…".
  //
  // "Verweesd" heette het tot 16 augustus 2026. Het zei wat er met het bestand aan de
  // hand was in een beeld, waar de lijst juist zegt wat er *niet* is: een verwijzing.
  "unlinked.title": "Niet-gekoppelde bijlagen",
  "unlinked.loading": "Bezig met zoeken…",
  "unlinked.failed": "Zoeken is niet gelukt. Kies de rij opnieuw om het nog eens te proberen.",
  "unlinked.empty": "Geen niet-gekoppelde bijlagen gevonden.",

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
  "shortcut.insertNoteLink": "Insert a link to a note",
  "shortcut.insertTable": "Insert a table",
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
  "menu.insertNoteLink": "Link to note…",
  "menu.insertTable": "Table…",
  "menu.insertRule": "Divider",
  "menu.quote": "Quote",
  "menu.tableRowAbove": "Insert row above",
  "menu.tableRowBelow": "Insert row below",
  "menu.tableColumnLeft": "Insert column left",
  "menu.tableColumnRight": "Insert column right",
  "menu.tableDeleteRow": "Delete row",
  "menu.tableDeleteColumn": "Delete column",
  "menu.tableDelete": "Delete table",
  "menu.tableAlignLeft": "Align column left",
  "menu.tableAlignCenter": "Align column centre",
  "menu.tableAlignRight": "Align column right",
  "menu.tableAlignDefault": "Clear column alignment",

  // The toolbar above whichever table the caret is in. Short, because ten of them sit in
  // a row; the full sentence from `menu.table*` above is the tooltip. "Auto" is the
  // fourth alignment state — a plain `---`, which is not the same as left.
  "slash.nothing": "Nothing matches",
  "slash.label": "Insert menu",

  "table.toolbar": "Table operations",
  "table.rowAbove": "Row ↑",
  "table.rowBelow": "Row ↓",
  "table.columnLeft": "Col ←",
  "table.columnRight": "Col →",
  "table.deleteRow": "Del row",
  "table.deleteColumn": "Del col",
  "table.alignLeft": "Left",
  "table.alignCenter": "Centre",
  "table.alignRight": "Right",
  "table.alignDefault": "Auto",

  // The bar above an embedded PDF page (B43/B46). Pages are turned in the note itself;
  // ⧉ used to raise B40's PDF window and now goes straight to the OS's own viewer —
  // somebody reading a PDF inside a note wants printing and annotating from there, not a
  // third reader in between. B40's window is still reached by a plain `[[file.pdf]]`
  // chip and by the file list's Open button, so neither way to read one was lost.
  "pdf.previousPage": "Previous page",
  "pdf.nextPage": "Next page",
  // The total is one round trip behind the picture, so the box beside it reads "/ –"
  // until the count lands rather than appearing a moment after the page does.
  "pdf.pageNumber": "Page number",
  "pdf.fit": "Fit",
  "pdf.fitPage": "Fit page",
  "pdf.fitWidth": "Fit width",
  "pdf.openSystem": "Open in system viewer",

  "link.new": "Link",
  "link.edit": "Edit link",
  "link.placeholder": "https://…  (empty removes the link)",

  "library.notes": "notes",
  "library.note": "note",
  "library.noNotes": "No notes",
  "library.file": "file",
  "library.files": "files",
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
  // A file row's menu (B47). Copies `![[path]]` or `[[path]]` — the very spelling
  // insertion writes, so a copied link and an inserted one cannot disagree.
  "library.copyLink": "Copy link",
  "library.duplicateLocked":
    "This note is open in the note window. Close it there first, then it can be duplicated.",
  "library.tasks": "Tasks",
  "library.indexing": "Making the vault searchable…",
  "library.reveal": "Reveal",
  // The file preview beside the note list (B47).
  "library.openFile": "Open",
  "library.noPreview": "No preview for this file type. Open it in the system viewer.",
  "library.previewFailed": "This file could not be shown.",
  "library.delete": "Delete",
  /** Out of the trash and back into the vault: asks which folder, the Inbox offered first. */
  "library.restore": "Restore",
  /** The only menu item that really throws something away (B24), beside Clear trash. */
  "library.deletePermanently": "Delete permanently",
  "library.deletePermanentlyLocked":
    "This is open in the note window. Close it there first, then it can be deleted.",
  /** Not this app refusing but the operating system: on Windows OneDrive, Explorer or a
   *  virus scanner can hold a folder for a moment. A second of retries has already been
   *  spent (`REMOVE_OPTIONS`) by the time this reaches the screen. */
  "library.deletePermanentlyFailed":
    "This could not be removed: something else on this machine still has it open. Try again in a moment.",
  "library.clearTrashFailed":
    "Part of the trash could not be removed: something else on this machine still has it open. Try again in a moment.",
  "library.clearTrashLocked":
    "Something in the trash is open in the note window. Close it there first.",
  "library.moreActions": "More actions",
  "library.actions": "Actions",
  "library.insert": "Insert",
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
  // The way back out of a followed [[…]] link. `{title}` is the note that was clicked in.
  "library.backTo": "Back to {title}",
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
  // For one thing out of the trash, where `ask.confirmClearTrash` counts several.
  "ask.confirmDeletePermanently": "delete permanently? This cannot be undone.",
  "ask.ok": "OK",
  "ask.cancel": "Cancel",

  // Internal note links (B35). The count in front of these is the number of notes that
  // link here, so both halves have to read as one sentence with a number in front.
  "link.noteLinksHere": "note links to this one",
  "link.notesLinkHere": "notes link to this one",
  "link.updateThem": "update them to follow?",
  "link.update": "Update",
  "link.leave": "Leave them",
  "link.whichNote": "Which note is meant by",
  "link.whichNoteToLink": "Link to which note?",
  "link.noNoteMatch": "No note matches",
  "table.size": "{columns} × {rows} table",
  "link.duplicateTitle": "A note with this title already exists in",
  "link.renameAnyway": "rename anyway?",

  // Why a folder could not be renamed, deleted or moved. The same codes cover all three —
  // only the generic `folder.failed`/`folder.deleteFailed`/`folder.moveFailed` fallback
  // differs per action.
  "folder.folder-is-root": "The vault itself cannot be renamed or deleted.",
  "folder.folder-is-reserved": "That folder belongs to the app.",
  "folder.folder-name-empty": "A folder needs a name.",
  "folder.folder-leaves-vault": "That name points outside the vault.",
  "folder.folder-not-found": "That folder no longer exists.",
  "folder.folder-already-exists": "There is already a folder with that name.",
  "folder.folder-holds-open-note": "A note in it is open in the capture window.",
  "folder.folder-into-itself": "A folder cannot be moved inside itself.",
  "folder.failed": "The folder could not be renamed.",
  "folder.deleteFailed": "The folder could not be deleted.",
  "folder.moveFailed": "The folder could not be moved.",

  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.hotkey": "Shortcut for a new note",
  "settings.hotkeyHint": "Click, then press the key combination.",
  "settings.close": "Close",
  "settings.hotkeyTaken": "That combination is already taken.",
  "settings.remoteImages": "Load images from the web",
  "settings.remoteImagesWhy":
    "A note can point at a picture on the internet. emqnote fetches it once and keeps a local copy, so the note still reads offline.",
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

  // Unlinked attachments — a place in the sidebar since 16 August 2026 (between Keyboard
  // shortcuts and Trash) rather than a modal: B47's file list in the note pane, B47's
  // preview in the reader, and Delete in the row's own menu. So `unlinked.title` is the
  // label on that row as well as the name of the thing. The two states below are not
  // decoration: this is the one file list that is a *search* and so can fail, which is
  // exactly what the old screen used to hang on at "Looking…".
  //
  // "Orphaned" until 16 August 2026. It named the file's predicament in a metaphor, where
  // what the list actually says is what is *missing*: a link to it.
  "unlinked.title": "Unlinked attachments",
  "unlinked.loading": "Looking…",
  "unlinked.failed": "The search did not finish. Pick the row again to retry.",
  "unlinked.empty": "No unlinked attachments found.",

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
