# History

This file is referenced from `CLAUDE.md`. It is the detailed, batch-by-batch build log
behind this codebase — what landed, in what order, what was confirmed working under
`Xvfb` versus never seen live, and what a given batch is worth remembering for. It is the
English, engineering-diary-detail counterpart to `00-PLAN.md`'s own (Dutch) "Stand van
zaken", which stays at phase-level. Decision numbers (B1, B2, …) refer to
`05-besluitenlog.md`.


Phases 0–3 are done: byte-identical markdown round trip, resident shell, the editor, and the library window. Phase 3 and 4 of `04-bouwplan.md` were swapped in practice — the library window shipped first. **Pasting and images (the `mso-list` reconstruction) is deliberately deferred, not just unstarted.** Real `.eml` samples (2 August 2026) showed the flat `<p class=MsoListParagraph>` pattern §6.3 assumes doesn't appear in genuine Word-authored content (real `<ol>/<li>` already, `mso-list` just decorative on top) or in what's likely Outlook for Mac (new-Outlook/web-style HTML, no `mso-list` at all) — only classic desktop Outlook might still show it, and that's unavailable for about two weeks from 2 August 2026. See `TODO.md` for the full finding before resuming this.

Ten items from real use landed after that, before the paste work: checkbox affordances (the format always supported them, nothing could *make* one), folder rename (the phase-4 item that was never built), a shortcut registry with an in-app help sheet, a chooser for the vault location, and a group of header and list refinements. Two of them are recorded as decisions: **B20** — location and people belong to every note, `type: meeting` survives as a label — and **B21** — changing vault restarts the app.

Tags and People filtering landed after phase 3 and pulled one piece of phase 5 forward, and **phase 5 is now done**. Its index is real: `src/main/index-db.ts` holds the SQLite/FTS5 schema, `index-scan.ts` is the full-scan builder, and `index-watch.ts` wraps `chokidar` for incremental reindexing after that — `src/main/vault-scan.ts` used to be the in-memory cache in front of the filesystem and is now a thin query layer over that index instead, its `facets`/`notesMatching` interface unchanged by the swap. Folder browsing still bypasses the index entirely, straight from disk, so opening a folder never waits on a scan. `src/main/search-query.ts` parses the search bar's own filter language (`type:`, `tag:`, `attendee:"…"`, `after:`/`before:`) and `vault-scan.ts`'s `searchNotes` runs it against the index, wired through `IPC.librarySearch` into a real input in the library window's `NoteList`, debounced the same way a save is. `src/main/conflicts.ts` recognises a OneDrive conflict copy from filenames alone (a machine-name suffix, deliberately not a bare `(N)` suffix — see the module's own comment on why that would collide with `filename.ts`'s own `uniquePath`); `vault-io.ts`'s `resolveConflict` carries out one of the three choices on disk (never a fourth silent one — "merge" touches no file, it just opens the note); `ConflictBanner.tsx` is the banner and its diff dialog, one conflict at a time. `src/main/orphaned-attachments.ts` (with `src/markdown/wiki-targets.ts` underneath it) finds an `_attachments/` file nothing references, and `OrphanedAttachments.tsx` is its cleanup screen, opened from a new entry in `FolderTree.tsx`'s footer. All of it confirmed actually working via `Xvfb` — real file operations on disk, not just rendering — which is also how a CSP gap blocking the attachment preview's `data:` URL got caught before it shipped rather than after.

**A batch of nine fixes from using the packaged macOS build landed on 3 August 2026.** Three of them were one bug: the capture window had no `close` handler, so the red traffic light destroyed it and took the hotkey and the note lock with it (see the constraint above). The rest: Cmd+Q enabled as window-scoped dismissal (B25), the meeting button removed (B23), Clear trash (B24), the caret now starting in the subject field rather than the body, header field widths evened out, the two hardcoded `Ctrl+Enter` labels now formatted through the shortcut registry per platform — with `useBootstrap`'s fallback platform seeded synchronously from the preload, since the `IPC.bootstrap` round trip meant the first paint always said Ctrl — a search result now selecting its own folder, and a second Backspace after leaving a list joining into the previous item instead of resurrecting the bullet it just removed (`joinBackward`'s `deleteBarrier` was re-wrapping the paragraph, because `listItem` has no `group` and so `findWrapping` finds it).

**Five features from daily use landed on 5 August 2026, as PR #2**, on top of `v0.3.3`. Three carry decisions: **B26** — Tasks are their own view and their state lives in the index — **B27** — deleting a folder moves it to the trash — and **B28** — attachments come in by one route and are served over their own protocol. The other two need no decision: both library splitters are draggable with their widths persisted in `settings.json`, and inserting a PDF is the non-image half of B28's one insertion path.

Two things in that batch are **implemented but never seen working**, and are written up for a human in `TEST-PROTOCOL.md` rather than quietly assumed: whether the capture window really draws an inline attachment (its CSP and NodeView are in place, but no image was ever got into that window under `Xvfb`), and the Tasks view's click → IPC wiring (the write path underneath it is proven directly; the click that calls it is not, because `--click-button` does not match task rows).

**Six fixes from using the packaged `v0.3.3` build on macOS landed on 6 August 2026.** The first two reports in that batch — "aggregated tasks not visible" and "no option to delete a folder" — were not bugs: both features are PR #2's, and PR #2 has never been tagged, so `v0.3.3` genuinely does not have them. The rest were real. One decision came out of it, **B29** — a new note is filed where the library is standing, and moving a note leaves the tree where it was. Two are format-level and are written up as constraints above: an empty task item now survives a save (`- [ ]`, which GFM does not read back on its own), and one list stays one list when an item is deleted out of the middle of it. The other two: copying a list now puts its bullets, numbers and boxes on the plain-text clipboard, and the row a drag started from fades while the drag is in the air. Both new-note filing and the move behaviour were confirmed in the real app under `Xvfb`, driven over CDP — the file landed in the vault root and in `01 Projecten`, and the tree stayed on the Inbox after a move.

**`v0.3.3` was a bugfix release for one Windows bug** found by that release pipeline: `checkFilesOnDemand` sliced a fixed 21 characters off each `attrib` line as the attribute field, and `attrib` answers an empty folder with `File not found - C:\Users\…`, whose first 21 characters end in the `U` of `Users`. Every Windows vault on its first run therefore reported itself un-hydrated and lost tags, people and search to a warning about a problem that did not exist. `readAttribOutput` now finds where the path begins instead of assuming a column, and only counts a line whose attribute field holds nothing but attribute letters — which no diagnostic message is, in any language.

**Eight more fixes from daily use landed on 6 August 2026**, built across three disjoint areas of the tree in parallel and merged together. Bug 1: the capture window's file now renames on commit — Ctrl+Enter, close, or quit — when the subject has changed since the file was first written, rather than never; `capture-store.ts`'s `renameSessionFile` does it, and the debounced per-keystroke write still never touches the filename, so OneDrive never sees a trail of half-typed subjects. Bug 2: the reader's note title is click-to-edit in place of the old Rename dialog — Enter or blur commits through the same `rename()` the dialog used, Escape cancels — and `IPC.libraryRenameNote` gained the `writer.activePath()` lock guard its siblings (`librarySaveNote`, `libraryMoveNote`, `libraryToggleTask`) already had, since renaming a note the capture window has claimed is the same "one note in two folders" hazard `libraryMoveNote`'s own comment describes. Bug 3: `.editor-content` gained 25vh of padding below the last line — outside the editable flow, so a click there still lands the caret at the end of the document — giving a long note room to scroll a full screen past its own end. Bug 4: an arrow key now moves the caret across an inline image or PDF link instead of landing on an invisible `NodeSelection` — `wikiEmbed` and `wikiLink` are inline atoms, so a text position already exists on either side of one; `moveOverAtom` takes priority over `baseKeymap` in the keymap for exactly that case, and `.ProseMirror-selectednode` now has a visible outline for the case the same selection is reached by clicking the image directly. Bug 5: clicking a row in the Tasks view moves the caret to that task in the reader — `Editor`'s `focusTask` uses the same `taskItemsIn` ordinal the index and `toggleTask` already agree on — without stealing focus from the Tasks list, which stays open beside the reader exactly as clicked. Bugs 6 and 7 reorganised the folder tree's footer: Tasks now sits beside People rather than at the bottom next to Trash, and Orphaned Attachments moved out of the footer entirely into a section of Settings. Bug 8 fixed two independent causes of a freeze when inserting a large PDF: `dialog.showOpenDialog` now gets a parent window, so the OS can no longer raise it non-modally behind the library window while the renderer sits waiting on it; and the attachment write moved off the main thread onto `fs/promises` (`copyAttachment` for the picker's already-on-disk case, so the bytes are never even read into this process), which measured as cutting the longest IPC-blocking gap during a 19.7 MB copy from the low tens of milliseconds to single digits.

Bugs 3 and 4 stay unconfirmed live, for the same reason earlier batches left things unconfirmed: a felt scroll distance is not something a script can judge, and no image has ever been drawn in the capture window under `Xvfb`. Both are written up in `TEST-PROTOCOL.md` for a human to walk through. Bugs 1, 2, 6, 7 and 8 were all confirmed in the real app under `Xvfb`, driven over CDP.

**Four more features landed on 7 August 2026**, built as four work packages on separate branches by parallel agents and merged in two waves — the same shape as the eight-fixes batch above. **Package A** — pasting a picture from a web page now downloads it into `_attachments/` instead of leaving a dead `https://` link, with the SSRF-guarded fetch pipeline described above. **Package B** — PDF and Office attachments get an OS-drawn first-page thumbnail (B30). **Package C** — the library and the capture window now learn about a note that changed or disappeared outside the app (B31). **Package D** — right-click menus on all three panels and full keyboard-only navigation of the library.

Confirmed in the real app under `Xvfb`, driven over CDP: pasting a real remote image into a note in the library reader, which downloaded, converted to a `wikiEmbed` and rendered inline; a `.pdf` wikiLink's thumbnail request falling back cleanly to the plain chip on this Linux sandbox (no OS provider here — the happy path itself needs real macOS/Windows hardware, B30's own open item); the library's whole disk-change path — silent reload when clean, the Reload/Keep-mine bar with the in-progress edit preserved when dirty, the Close/Keep-mine bar and no auto-close on a deletion, and a full minute of continuous typing producing zero false positives from the app's own autosave; the folder-tree, note-list and note-panel context menus, including a right-click correctly selecting a note-list row first; and keyboard-only navigation — arrow keys moving the roving `tabIndex`, Tab cycling tree → notes → editor, Escape returning from the editor to the note list, and Shift+F10 (since B32, Mod-Shift-M) opening a menu at the focused row. **Not yet confirmed live**, for the same reasons the earlier batches left things open: a pasted image drawing inside the *capture* window specifically (paste was only driven in the library reader), and the capture window's own disk-change notice (no capture-renderer test harness exists to drive it, same limitation `dirtyRef`'s own comment names). Both are `TEST-PROTOCOL.md` items now.

**A report of "PDF preview is not showing" on a packaged macOS build (against a business OneDrive) was investigated on 7 August 2026, without being reproducible here** — Linux has no OS thumbnail provider at all, so this sandbox only ever exercises the fallback chip, which stayed correct throughout. `thumbnails.ts`'s `ensureThumbnail` had a `darwin`-only pre-check, `isPlaceholder`, borrowed from `vault.ts`'s `checkFilesOnDemand`: a file reporting a real size but zero disk blocks was treated as a not-yet-hydrated OneDrive placeholder and skipped before `nativeImage` was ever asked, then remembered as failed for the rest of the session. That check made sense for `checkFilesOnDemand`, which samples 40 files and takes a majority vote to answer one low-stakes question for the whole vault ("never blocks anything," its own comment says) — but gating one specific file, permanently, is a different risk profile. The suspicion — untested, and it should stay labelled as such until someone measures it — is that a business OneDrive's File Provider can report `blocks === 0` for a file that is fully hydrated and readable, which would disable the feature for every PDF in the vault and matches the reported symptom exactly. Nobody has observed that directly; the check was removed rather than narrowed because it was cheap to lose and expensive if wrong: a genuinely dataless file now costs one wasted read that `nativeImage.createThumbnailFromPath` already tolerates failing on, which is a strictly better trade-off than a heuristic that can silently and permanently disable the feature. `--thumbnail-probe=<name>` (see the diagnostic helpers above) was added alongside the fix so the remaining question — does `nativeImage` actually draw a first page on real macOS/Windows hardware — can be answered directly instead of guessed at; it is unverified on real hardware, same as the rest of B30's happy path, and is a `TEST-PROTOCOL.md` item (§4.5).

**Twelve items from daily use landed on 7 August 2026**, built as five work packages by parallel agents and merged in two waves. Three carry decisions: **B32** — no function keys in shortcuts, because on a Mac laptop they need `fn`, so `F1`/`F6`/`Shift+F10` became `Mod+/`, `Ctrl+Tab` and `Mod+Shift+M` — **B33** — a weblink opens on Mod+click, http(s) only, decided in main — and **B34** — pasting a task into a list of tasks is a hand-built insertion, never `replaceSelection`. The rest: clicking a task in the Tasks view now scrolls the note to it (the caret and highlight always landed; the scroll was computed in the same tick as `setDoc`, before the new document had been laid out, and now waits a frame — keyboard focus still deliberately stays on the Tasks row); the task highlight is yellow rather than accent-blue, so it cannot be confused with a `==highlight==` mark; attachment chips, inline images and thumbnails have a real border instead of a background fill alone, and `.ProseMirror-selectednode` finally covers `wiki-link` too; inserting an image and inserting a file are two commands with their own shortcuts (`Mod+Shift+I` and `Mod+Shift+A`), two toolbar buttons and two labelled menu items instead of one unfiltered picker; **Duplicate note** is in the note-list menu and the reader toolbar; and the folder toolbar reads `+ New` / `Rename` / `Delete`, the panel being what says they concern folders.

**Twelve more items from daily use landed on 8 August 2026**, built as five work packages (three by parallel agents, two by hand after the agents hit a spend limit) and merged in three waves. Three carry decisions: **B35** — internal note links — **B36** — the app renders its own PDF previews — and **B37** — `.markdown` is read too, and a file keeps its extension. The rest, in one line each: the reader toolbar's five actions collapsed into a `⋯` menu so the note title gets the space; the folder toolbar's buttons are centred like the other two panels'; the note-list sort order survives a relaunch (`librarySort` in `settings.json`, the same shape as the pane widths); Ctrl+Tab now works from a cold click on the background, where it used to be swallowed by `preventDefault` and go nowhere because `paneOf` recognised no focused row; Mod+Shift+M opens the note panel's menu at the caret, which nothing listened for there before; the Tasks view opens scoped to the folder the tree is standing in rather than the vault root; folders inside the trash are dimmed and italic, so they no longer read as live ones (the Trash row itself was dimmed along with them until the 12 August batch below); and the conflict heuristic got the tightening B31's own module comment now describes.

Two of that batch were misdiagnosed by the agents that built them, and both turned out to be real, platform-independent defects rather than the sandbox: **the conflict dialog "only dimming the screen"** was a genuine CSS stacking bug (`.overlay` is `position: fixed` at `z-index: auto`, which creates no stacking context, so the positioned `.library` sitting later in the DOM painted straight over it — `test/styles-overlay.test.ts` guards the `z-index` now), and **the PDF preview never appearing** was the trailing slash Chromium adds to a `standard:` scheme's URL, which `resolveAttachment` was masking. An agent reporting "this only fails in this environment" is worth checking rather than accepting.

Confirmed in the real app under `Xvfb`, driven over CDP: the `⋯` menu and `--click-button="⋯>Rename"` reaching it (which needed the matcher scoped to an open `.context-menu` — the folder toolbar carries the same labels earlier in the document); sort surviving a relaunch; the conflict banner naming its file and its dialog opening with the diff; a real PDF's first page drawn inline in the reader; a hand-written `.md` with no frontmatter and a `.markdown` file both listing and opening with a title and a date; and the whole of B35 — a path-form link opening its note, a bare ambiguous link raising the picker and the chosen note opening, a dead link marking itself on click, the move and rename confirmations counting the referencing notes, both rewriting them on disk, the duplicate-title warning chaining into the link question, and an un-aliased link keeping its displayed text while gaining a path. **Not confirmed live**: a `[[…]]` link clicked from the *capture* window specifically raising the library (the capture renderer still has no test harness, the same limitation earlier batches name), and the felt width of the reader title. Both are `TEST-PROTOCOL.md` items.

Two things that batch is worth remembering for. First, **`-copy` collided with conflict detection**: `conflicts.ts` recognises a OneDrive conflict copy from the filename alone, and stripping `-copy` recovers the original filename exactly — the shape it reads as machine-name evidence. Every duplicated note therefore raised a false "changed on two machines" banner, and resolving it with *keep other* would have trashed the real original and renamed the duplicate over it. It is carved out now the same way the bare `(N)` suffix already was, but the lesson is that `conflicts.ts` constrains any future feature that appends a suffix to a filename. Second, **a clean text merge broke the typecheck**: one package added a test constructing an `Editor` with `onAttachmentRequested` while another split that prop in two, and because vitest does not typecheck, all tests passed while `tsc` failed. `npm test` alone does not gate a parallel batch.

Confirmed in the real app under `Xvfb`, driven over CDP: duplicating a note (the file lands with `-copy` in both title and filename, the source stays byte-identical, and no false conflict banner appears after the fix) and the shortened folder toolbar. **Not confirmed live**: the note-list right-click → Duplicate route specifically (only the toolbar button was driven; both call the same function), the Mod+click cursor affordance and native tooltip, `shell.openExternal` actually raising a browser, and the felt scroll distance and real colours of the Tasks-view changes. All are `TEST-PROTOCOL.md` items.

**Four fixes from daily use landed on 12 August 2026.** Two carry decisions: **B38** — an attachment is found anywhere in the vault, and the protocol URL carries its name in the path — and **B39** — a note says when the file it names is gone. The other two: `[] ` at the start of a plain line now makes a task item (the rule insisted on a `- ` in front of it, so the one spelling everybody actually types was the one that did nothing), and the Trash row in the sidebar is no longer dimmed and italic along with the folders inside it — `trashRoot` seeds the flag for everything below without wearing it, so the one row you deliberately click stops looking like the rows you have thrown away.

The thing that batch is worth remembering for is that **B38's URL half was measured, not reasoned about**, and the measurement changed the design. A twenty-line Electron script under `Xvfb` registered a `standard: true` scheme and fetched the two candidate URL shapes: the host form lowercased the name and refused a `%2F` outright, the path form carried both through verbatim. That took minutes and settled a question that had already produced one shipped bug of the same family (B36's trailing slash) — Chromium's canonicalisation of a custom scheme is not something to reason about from the URL Standard, because a `standard: true` scheme is not a non-special one.

Confirmed in the real app under `Xvfb`, driven over CDP: a path-form `![[99 - Attachments/Pasted image ….png]]` genuinely painting its picture (`naturalWidth` non-zero, not merely an `<img>` in the DOM) and its aliased `[[…|Open: …]]` sibling answering `"attachment"` from `openWikiLink` and reaching `shell.openPath`; a missing embed replaced by a marked chip and a missing `.pdf` link marked, while a plain `[[Nog Te Schrijven]]` note link beside them stayed unmarked and unasked-about; the Trash row carrying no `branch-trashed` while a folder inside it does; and `[] Bellen met Jan` typed into a plain paragraph over CDP producing a real `<li data-checked="false">` with the checkbox widget in it. **Not confirmed live**: any of it in the *capture* window specifically, which still has no test harness — the same limitation every batch since the disk-change work has named.

**Three features from daily use landed on 12 August 2026**, built as three packages on one
branch. All three carry decisions: **B40** — a PDF is read in the app, in a window of its own
— **B41** — a `[[…]]` link is written by picking a note — and **B42** — tables are hand-rolled
on the existing schema, which finally answers the `prosemirror-tables` question B17 left open.

Confirmed in the real app under `Xvfb`, driven over CDP, against a genuine three-page PDF
made with `pdflatex`: the viewer window opening on a chip click with the right page count,
page 1 and page 3 drawn to real canvases with **actual dark pixels counted on them** rather
than merely an `<img>`/`<canvas>` in the DOM (the B38 lesson), and the page counter following
the scroll; `linkCandidates` answering over IPC with the extension-stripped target, the picker
opening from the toolbar and from a typed `[[`, Escape leaving those two brackets exactly
where they were, the chosen note landing as `[[path|Title]]` and that link then resolving
through B35's own path back to the note; and the size grid inserting a 3×3 table, Tab moving
between cells and appending a row off the last one, the trailing paragraph appearing below
it, a file's `:---`/`---:` finally *drawing* as alignment, and the saved file coming back
**byte-identical from `npm run canonical`** — a plain GFM table, three dashes, no cell
padding.

**Not confirmed live**, the same limitation every batch since the disk-change work has named:
all three in the *capture* window specifically, which still has no test harness. Also unseen
by a person: the viewer's font rendering on real macOS/Windows, and the felt behaviour of the
hover grid, which `--click-button` cannot drive. All are `TEST-PROTOCOL.md` items.

One thing that batch is worth remembering for: **`emqnote-attachment` needed `corsEnabled`**
before the viewer could `fetch()` a single byte, and nothing under `test/` could have caught
it — every test passed while the feature was dead. That is the second time this exact trap has
been sprung (B36 hit it on `emqnote-thumb`), so treat "a renderer will `fetch()` this custom
scheme" as requiring the privilege, not as something to discover in the running app.

**Six items from daily use landed on 13 August 2026.** Two carry decisions: **B43** — a PDF
embedded with `![[…]]` draws its first page in the note — and **B44** — renaming a folder
repairs the links into it, without asking. Of the other four, two were features and two were
not: clicking an internal `[[…]]` link now leaves a `← Back to <note>` button in the reader
(a stack, so a chain of links walks back out one step at a time; main supplies the origin for
a click made in the capture window, and `null` means "whatever the library has open"), and the
Trash branch starts folded, since it sits at depth 0 where `Branch` unfolds everything and so
spent the bottom of the sidebar on folders nobody is looking for. **The two "add table
options" items turned out to be already built** — B42 shipped insert/delete row and column
*and* the four column alignments, all of them right-click-only, which is exactly why they read
as missing; the work was the toolbar described under the context-menu rule above, not the
commands.

Confirmed in the real app under `Xvfb`, driven over CDP, against a three-page PDF made with
`pdflatex`: the inline page drawn at 1240×1754 and displayed at 591 CSS pixels with **5678
genuinely dark pixels counted on it** (the B38 lesson — an `<img>` in the DOM is not proof),
the ⧉ button raising B40's viewer on the right document, the marked chip when the file is
removed and the page returning when it comes back; the back button naming its origin, walking
back, and being absent for a note opened from the list; the Trash row folded on launch and
dimming its contents on unfold; the table toolbar driving all four row/column operations and
the alignment group, the saved file coming back **byte-identical from `npm run canonical`**
as plain GFM, and `--click-button="Row ↓"` reaching a toolbar button; and a folder rename
rewriting a link on disk with no dialog, after which the link opens its note again.

The thing that batch is worth remembering for is that **running it found a bug reading it
would not have**. B43's first version remembered every failed page render, including a 404 —
so a PDF that was missing for one draw stayed a chip for the rest of the session, and a
OneDrive file finishing its download never appeared. That is precisely what B39 forbids, and
the code looked right: the 422 case and the 404 case were one `.catch`. Only the
disappear-and-reappear cycle in the running app showed it.

**Not confirmed live**, the same limitation every batch since the disk-change work has named:
all six in the *capture* window specifically, which still has no test harness. Also unseen by
a person: how a full-width PDF page feels to scroll past on a real display, and the toolbar's
ten buttons at a real window width. Both are `TEST-PROTOCOL.md` items.

**Five items from daily use landed on 13 August 2026**, on top of `v0.7.2`. One carries a
decision: **B46** — the inline PDF page turns pages, through the same render as before. The
other four: the note picker's list scrolls to the row the arrow keys land on (it always
*could* scroll — nothing ever moved it, so a highlight past the bottom edge walked on
invisibly, which is what "the list does not scroll" meant); the four insert glyphs became one
**Insert** menu and `⋯` became **Actions**, in both windows (see the context-menu rule
above); the folder toolbar's three buttons sit against the panel's left edge on the same 8px
the folder rows start from, each keeping its own width and centred text; and the `← Back to
<note>` control moved out of the reader header to a strip at the foot of the pane — the
header is one `nowrap` row, and a second line in it grew and shrank the whole strip every
time a link was followed. It sits outside `.reader-body` deliberately, since `reader-locked`
makes that div unclickable and leaving a note must survive the capture window holding it.

The thing that batch is worth remembering for is that **the scroll fix created a second bug
that only running it could find**. All three palette lists set the highlight from
`onMouseEnter`, which was harmless while the list never moved: a row could only arrive under
the pointer if the pointer went to it. Once the arrow keys scroll, a pointer left resting
over the list has row after row slide beneath it and Chromium dispatches a real `mouseenter`
for each — measured in the running app, sixty arrow presses advanced the selection fifteen
rows. `palette-scroll.ts`'s `createHoverGuard` decides it on the pointer's own coordinates: a
boundary event synthesised because the page moved carries the position the pointer is still
at, so a hover at the same point as the last one is the list moving rather than the hand.
Deliberately not a "suppress hover for 150 ms after a key" timer, which would turn a question
with an exact answer into a race.

Confirmed in the real app under `Xvfb`, driven over CDP, against a three-page PDF made with
`pdflatex`: "Page 1 of 3" on opening, next/previous walking all three pages with **three
genuinely different images counted in a canvas** (the B38 lesson — a changed `src` is not
proof) and page 2 coming back byte-identical to itself, Next disabling on the last page, Fit
taking the page from 836 to 513 pixels tall and back; the Insert menu listing its four items
with their shortcuts and the Actions menu its five; the back button naming its origin at the
foot of the pane with the header staying 58px whether it is there or not; the folder toolbar's
three buttons starting at x=8; and the note picker walking row 0 → 41 → 0 with the list
scrolled to 885 of 889 and the active row on screen throughout.

**Not confirmed live**, the same limitation every batch since the disk-change work has named:
all five in the *capture* window specifically, which still has no test harness — the Insert
button in its status bar most of all, since that window is where notes are actually written.
Also unseen by a person: how the Fit toggle feels against a real display, and whether the
bar's six controls crowd a narrow note column. Both are `TEST-PROTOCOL.md` items.

**Ten items from daily use landed on 14 August 2026**, built as five packages on one branch.
They are not ten unrelated defects: the largest theme is that **a vault this app did not write
was a second-class citizen** — a table written elsewhere could not be typed past, Obsidian's
PDF pairs drew twice, an `Attachments` folder full of pictures was invisible, and Mod+click on
a link took two or three tries. Two decisions came out of it: **B47** — non-note files are
listed and previewed in the library — and **B48** — a link beside its own embed is hidden on
screen and untouched on disk. **B21 gained a paragraph**: the vault can be switched from the
tray, through the same `switchVaultTo` Settings uses.

The rest, in one line each: a note that already *ends* in a table opens with a line to type on
(`trailingParagraph`'s `appendTransaction` only ever ran after a change, and opening a note is
not one — the existing test said so in a comment); a divider can be inserted; the inline PDF
bar moved above the page and took the viewer window's shape; the `![](youtube-url)` chip opens;
and the orphaned-attachment scan stopped stalling at "Looking…".

Confirmed in the real app under `Xvfb`, driven over CDP, against a three-page PDF from
`pdflatex` and hand-written Obsidian-shaped notes: a note ending in a table opening with a
paragraph after it, typing landing in it and reaching disk — and a second such note opened and
left alone with **hash and mtime both unchanged** (B10); the duplicate chip carrying
`wiki-link-duplicated` with a computed `display: none` and a **zero-width box**, the page still
drawn, and the file still holding both spellings; Mod+click on the **last character** of a link
taking the click (`preventDefault` on the `mouseup` ProseMirror calls `handleClick` from) while
a plain click at the same point still places the caret; the YouTube chip taking its own click;
the PDF bar above the page with `1 / 3`, next/previous walking all three pages with **three
genuinely different images fingerprinted from a canvas** and page 1 coming back byte-identical
to itself, a typed `3` + Enter landing on the same page 3 image as the arrows did, Fit going
836 → 513 → 836 px, and **607 truly dark pixels** counted on the full-resolution page; the
Insert menu listing five items and Divider producing a real `<hr>` with the file coming back
**byte-identical from `npm run canonical`**; the imported `99 - Attachments` folder listing its
three files with type and size where it used to say "No notes", the PNG drawing off
`emqnote-attachment://` (`naturalWidth` 64, not merely an `<img>`), the PDF drawing its page
and paging to a different image, and the `.docx` offering the system viewer; and the orphan
screen finishing with its preview drawn off the protocol rather than a base64 data URL.

The thing this batch is worth remembering for is that **running it found a CSS bug reading it
could not**. B48's hide rule was `display: none` on `.wiki-link-duplicated`, which ties
`.wiki-link-preview`'s `display: inline-flex` on specificity and loses on source order — so the
one kind of chip Obsidian ever writes this pair for, a `.pdf` with a thumbnail, went on being
drawn while every unit test passed. That is the same family as B36's trailing slash and B40's
missing `corsEnabled`.

**Not confirmed live**: the tray's vault submenu, which no script can reach — a tray is not
driveable and `--click-button` cannot enter a native menu, which is why `vault-menu.ts` exists
to be tested apart from it. And, the limitation every batch since the disk-change work has
named, all ten in the *capture* window specifically. Both are `TEST-PROTOCOL.md` items.

**Three cornerstone features landed on 14 August 2026**, on top of `v0.7.4`. All three carry
decisions: **B49** — a rectangle of table cells is selectable, with a hand-rolled `Selection`
— **B50** — a picture named by a web address is fetched by main and cached outside the vault
— and **B51** — `/` at the start of a line opens the insert menu and typing filters it. A
fourth, smaller thing came out of the third: the divider inserted by that menu (or by any
other route) no longer disappears when you type the next word.

Confirmed in the real app under `Xvfb`, driven over CDP, against a three-note vault and a
local HTTP server standing in for the web: a drag from cell `a` to cell `e` selecting exactly
`a,b,d,e` and **no other cell**, with the header cell genuinely painted (`getComputedStyle`,
not merely a class in the DOM) and the browser's own selection kept out of the way; Backspace
clearing those four and nothing else; undo restoring them; "Del row" removing both spanned
rows; "Centre" writing `:---:` for both spanned columns, with the file coming back
**byte-identical from `npm run canonical`**. A `![Naam](http://…)` drawing a real picture
(`naturalWidth` 120 — the B38 lesson), the bytes landing in `<userData>/remote-images`, the
same note still drawing **with the server stopped**, a `file:///etc/passwd` and a
`http://169.254.169.254/…` staying chips with nothing written, and the Settings switch turning
the picture into a chip and back. And the `/` menu opening under the caret at `z-index` 20
with `elementFromPoint` confirming it paints on top, filtering to the six headings on `/head`
while the caret stayed in the note, the arrows moving the highlight, Enter making a real `<h1>`
with no stray `/head` left behind, `/divid` making an `<hr>` that **survived the next word
typed**, Escape leaving `/quo` exactly where it was, and a `/` mid-sentence opening nothing.

Two things that batch is worth remembering for, both found by running it and neither visible
in any test. **A drag needs `createSelectionBetween`**: the pointer is still down, so Chromium
extends its own text selection over the cells and `prosemirror-view` reads it back over the
`CellSelection` on every `selectionchange` — a slow drag ended with nothing selected at all.
**A privacy switch has to be honoured on both sides**: main refused the request correctly with
`loadRemoteImages` off, and Chromium drew the picture anyway out of its own image cache,
`no-store` and all, for any URL it had already loaded that session.

**Not confirmed live**, the limitation every batch since the disk-change work has named: all
three in the *capture* window specifically. Also unseen by a person: how a dragged rectangle
feels on a real display, and whether the `/` panel's sixteen rows crowd a short window. Both
are `TEST-PROTOCOL.md` items.

**Five reports from daily use landed on 14 August 2026**, on top of `v0.8.0`, and one of the
five turned out not to be a bug. The four that were: the `/` menu now scrolls to its
highlight (`slash-menu.ts` rebuilds its panel on every move, so the element's `scrollTop` was
thrown away while `active` walked past a `46vh` clip — the same report `palette-scroll.ts`
answers for the three React pickers, fixed with its answer rather than its code, since this
menu is plain DOM by decision); a folder's file list uses the whole pane when there are no
notes above it (`.files-list`'s `max-height: 50%` protects the note list, so it is lifted when
there is no note list to protect — and `.notes-list` grows now, or the leftover height
collected *under* the file list instead, which read as the same truncation); quoted text is
italic, with `.editor-content blockquote em` put back upright, because the browser's own rule
already italicises `<em>` and the one mark whose job is to stand out would otherwise be the
one that disappears; and Shift+arrow in a table now makes the rectangle the mouse makes.

That last one is B49 working as its own text already said it should. `extendCellSelection`
bailed on any selection that was not a caret and read the cell edge off `$from`, and both
assumptions break the moment Shift+Right has grown a text selection: at the end of the cell
the command declined, `prosemirror-view`'s `selectHorizontally` extended a `TextSelection`
across the `isolating` boundary, and `clearCells` then rightly refused that state — so
Backspace did nothing. Exactly the bug B49 exists to prevent, still reachable from the
keyboard. It reads `$head` now (the end that is moving; `$from` is the other one in a
backwards selection), asks `tableContextAt` about **both** ends separately (new in
`table-geometry.ts`, `findTable` is one line over it), and escalates on the press that would
leave the cell — so text selection inside a cell still works, and a cross-cell
`TextSelection` that arrived some other way is repaired rather than refused.

**The fifth was not a bug**: "the alignment buttons work on a whole column instead of one
cell". GFM writes alignment once per column, in the delimiter row, so `align` is an array on
the *table* node and `tableCell` has no attributes at all — a per-cell alignment cannot be
written down, and writing the table as raw HTML to get one is what B6 forbids. The command
already scopes to the caret's column and to the columns a rectangle covers, never the whole
table. B42 has the paragraph; nothing in the code changed.

Confirmed in the real app under `Xvfb`, driven over CDP: the `/` menu in a window short
enough to clip 230px of it, walking all sixteen rows with **every row's box measured inside
the panel's** and `scrollTop` rising to 226 and back to 0 on the wrap — then `/divid` + Enter
still making a real `<hr>` that survived the next words typed; an imported `99 - Attachments`
folder's file list ending exactly at the foot of the pane (733px of 733) with all twelve rows
and a computed `max-height: none`, and a mixed folder keeping the cap with no blank strip
anywhere; `getComputedStyle` answering `italic` on a quote and `normal` on the `<em>` inside
it, with ordinary paragraphs untouched; and Shift+Right five times growing the text selection
*inside* a cell with no cell painted, the sixth press painting **exactly two** cells (a real
computed fill, not a class in the DOM), Shift+Down making it four, Backspace emptying those
four and nothing else, and the file coming back **byte-identical from `npm run canonical`**.

**Not confirmed live**: all four in the *capture* window specifically, the limitation every
batch since the disk-change work has named. Also unseen by a person: whether the `/` list
scrolls smoothly on a real display, and whether an italic quote reads well in the font a real
machine uses. Both are `TEST-PROTOCOL.md` items (§20).

**Three more items from daily use landed on 15 August 2026**, on top of `v0.8.1`. One carries
a decision: **B52** — a `#tag` in the body opens the library on Mod+click, with the Tags list
unfolded and that tag filtering the note list. The other two: double-clicking a folder row
folds and unfolds it, where only the 16px twisty and the arrow keys could before; and the
menus stopped dimming the window behind them.

That last one was reported as a taste question — "make the dimming more subtle" — and turned
out to be a shipped CSS bug of B48's exact family, with the intended behaviour already written
in a comment above the rule that was losing. It is worth taking as the general lesson rather
than as one fix: **a report about how something looks may be a defeated rule, not a value to
tune**, and the way to tell is to read what the stylesheet says it meant to do.

Confirmed in the real app under `Xvfb`, driven over CDP: a right-click menu's overlay
computing `rgba(0, 0, 0, 0)` while keeping its `z-index: 20` and staying the element on top
at a sampled point, with **Move to…'s overlay still computing `rgba(0, 0, 0, 0.35)`** in the
same session; a plain click on `#klantx` landing the caret **inside the tag at offset 3** and
moving nothing else, then a Ctrl+click **on the same pixel** unfolding the Tags list, lighting
`#klantx` and cutting the note list to the two notes carrying it across two folders;
`#KlantX` clicked in another note lighting the `#klantx` facet row and listing all three
(the fold); and a folder row double-clicked unfolding to reveal its child, double-clicked
again folding it, with a leaf row gaining no `aria-expanded` and changing nothing.

**And, for the first time since the disk-change work, the capture window itself was driven**
— `Input.dispatchMouseEvent` and `Input.dispatchKeyEvent` over CDP reach it perfectly well;
what it has never had is a *unit-test* harness, which is a narrower statement than the one
every batch since has been making. A tag typed into a new note there, Ctrl+clicked, raised the
library with the filter applied and left the capture window's own text untouched — and with
the library window genuinely closed first (only `index.html` left), the same click **created**
it and it came up already filtered, which is the `isLoading()` / `did-finish-load` deferral
B35 introduced doing its job.

**Not seen by a person**: whether an undimmed menu still reads as being in front of the page
on a real display, and how the double-click feels against the click that selects the folder
first. Both are `TEST-PROTOCOL.md` items (§21).

**Fourteen items from daily use landed on 16 August 2026**, built as three work packages in
parallel worktrees and merged in one wave. They are not fourteen unrelated defects: **the
trash was a place things could only go into** (no restore, no drag in, no per-item delete,
and a right-click menu whose every entry was disabled), **a file that is not a note was a
second-class citizen** (no menu, orphans still behind a modal in Settings, AVIF missing from
four of six extension lists), and **Windows had never been looked at** (a menu bar above the
folder tree, a dead Ctrl+Tab, a vault chooser nobody was ever shown). Three carry decisions:
**B54** — the trash is reversible — **B55** — orphaned attachments are a place, not a modal —
and **B56** — the ⧉ over an embedded PDF goes to the OS. The rest: the Tags panel can be
collapsed again while a tag is selected (its B52 unfold effect listed `open` in its own
dependencies, so folding it re-ran the effect and re-opened it on the same commit); Reveal is
in the folder tree's menu; a disabled menu entry is dimmed by `opacity` as well as colour,
having been the same `--muted` as the shortcut column; the date button truncates with an
ellipsis instead of painting across the field beside it; and `autoHideMenuBar` takes the
Edit strip off the two framed windows.

Two things this batch is worth remembering for, and both are about a diagnosis rather than a
fix. **The Ctrl+Tab cause was never found**, and the fix ships anyway: the chord was measured
arriving perfectly well on Linux with real XTEST keys, cycling panes exactly as designed, and
the binding spells `Ctrl` literally so it cannot be misreading the platform. It is claimed in
`library-window.ts`'s `before-input-event` now and forwarded over `IPC.libraryCyclePanes` —
not because Chromium was proven to eat it, but because that is the earliest point in the
window anything can be claimed from, which is the only kind of fix available for a bug that
will not reproduce. It *replaces* the renderer's `keydown` branch rather than joining it:
main calls `preventDefault`, so a second branch could only ever run when the first had
already failed. The Windows menu bar, removed in the same batch, is the other candidate
cause and would also be covered. **And the vault was never hardcoded** — it was guessed, once,
and then never mentioned again, which reads identically from the outside.

Confirmed in the real app under `Xvfb`, driven over CDP, against a fixture vault holding an
Obsidian-shaped `99 - Attachments` folder, a real two-page PDF from `pdflatex` and a genuine
AVIF from `ffmpeg`: the Tags panel folding with a tag still selected *and* still unfolding
when a different tag arrives; a note dragged onto Trash landing in `_trash` on disk with the
row lit as a destination first, the folder it already sits in staying unlit, and no dialog in
the way; a trashed note's menu being exactly Restore and Delete permanently, the restore
picker opening with `00 Inbox` first, and the file arriving back in the Inbox; a whole folder
trashed and restored with its note inside it, driven from the **toolbar** buttons rather than
the menu; Delete permanently removing a file from disk behind a confirmation naming it; the
orphans row listing the one unreferenced picture and not the referenced one, with no overlay
on screen; **Copy link** putting `![[_attachments/wees.png]]` on the real X clipboard, read
back with `xclip`; Delete absent from a file row outside the orphans pane; a disabled menu
entry computing `opacity: 0.55` against an enabled one's `1`; a real `.avif` drawing at its
true 120×80 (`naturalWidth`, not merely an `<img>` in the DOM — the B38 lesson); the ⧉ over
an embedded PDF opening **no** in-app window while a `[[…pdf]]` chip still raises one; and
Ctrl+Tab driven with **real XTEST key events** — the only way to exercise
`before-input-event` at all, since `Input.dispatchKeyEvent` is injected past it — walking
editor → tree → notes and back, with the renderer's own listener recording that the chord
never reached it while a plain Tab still did.

**Not confirmed live**: the Windows half of all of it — the menu bar, Ctrl+Tab, and the
first-run chooser on a machine with exactly one business OneDrive (measured here only against
a mocked-up one). And, the limitation every batch since the disk-change work has
named, all fourteen in the *capture* window specifically. All are `TEST-PROTOCOL.md` items
(§22).

**Six more items from daily use landed on 16 August 2026**, and they are three pairs rather
than six defects. **Two are one bug about a path losing its identity**: a pasted `![[…]]`
stayed literal text until the file was written and read back, and the capture window's
"changed outside emqnote" notice fired because `own-writes.ts` is keyed by path and no rename
carried the entry over. **Two Windows reports have one cause**, chokidar holding an `fs.watch`
handle on every folder and none on a file — which is precisely why deleting a file out of the
trash worked and deleting a folder did not, and why OneDrive could not replace a folder
renamed on the other machine. **Two are the unlinked-attachment pane**: its name, and its list
blanking to "Looking…" on every `library:refresh`. Two carry decisions: **B57** — the watcher
polls on Windows — and **B58** — pasted wiki syntax becomes a real node. *Orphaned* became
*Unlinked* in the strings and in the code alike, since nothing is persisted under those names.

One thing found by running it rather than by reading it, and outside the six: the pane
compared the **bare filename** against the reference set, so a picture linked with the file
row's own **Copy link** — which writes the path form `![[_attachments/…/foto.png]]` — went on
being listed as unlinked, an offer to delete a file a note was drawing. It matches the
vault-relative path as well now. Nobody reported it; the fixture vault built to test the
paste is what showed it, because the paste and the pane disagreed about the same file.

Confirmed in the real app under `Xvfb`, driven over CDP: the sidebar row reading **Unlinked
attachments** and listing exactly the file nothing references; the list sampled every 10 ms
across six refreshes landing on it (571 samples, **zero** of them showing "Looking…" and zero
showing an empty list) while the rows stayed put; a plain-text paste of
`![[_attachments/wees.png]]` drawing a real picture **immediately** at `naturalWidth` 120 —
not merely an `<img>` in the DOM — with the saved file holding exactly the text that was
pasted; a note whose subject changed, committed by *blurring the window* (which is what
`flush()` does, and so the reported "after a certain time or after certain events"), renaming
on disk with **no notice at all** — and, with `renameOwnWrite` disabled and the app rebuilt,
the very sentence that was reported appearing on that same run; and a folder trashed and then
permanently deleted, gone from disk, with a folder the filesystem refuses answering
`{ deleted: false, failed: true }` and `emptyTrash` answering `{ removed: 0, failed: 1 }`
instead of rejecting into nothing.

**Not confirmed live**: the Windows half, which is the half both C-items are about — the
folder lock is a Windows kernel property this sandbox cannot reproduce, and what a two-second
stat sweep costs on a real business OneDrive vault can only be felt there. Both are
`TEST-PROTOCOL.md` §23. And the paste in the *capture* window specifically, the limitation
every batch since the disk-change work has named.

**Six items from daily use landed on 17 August 2026**, and four of them are one theme: **the
app was hard to reach**. There was no way to raise the library from outside the capture
window, starting the app from its shortcut showed nothing at all, a chord printed in the help
sheet did nothing on Windows, and closing the help sheet dropped keyboard focus on the floor.
Three carry decisions: **B60** — the library gets its own global hotkey, which reverses
`shortcuts.ts`'s own "window-local on purpose" — **B61** — a deliberate launch opens the
library and a login start stays silent — and **B62** — no numbered headings.

Two of the six were not what the report said, and both are worth remembering. **There already
was a shortcut for the library**, `Mod+O`, marked `where: "capture"` — so from Outlook, from
Word, from the library itself it did not exist, which is indistinguishable from not being
there. And **there is no Tasks-view shortcut in this app at all**: `Ctrl+Shift+T` is the
editor's "Task with a checkbox", which is what the report was about. Reading the registry
before believing the sentence is what turned a missing feature into a delivery bug.

The other two: markers follow their own line's bold and italic, and the help sheet gives
focus back. **B62 is a `no` with code behind it anyway** — two cases in
`test/limitations.test.ts`, because the boundary between "a heading under a numbered item"
(fine, byte-identical) and "a heading as the item's first content" (escapes the list on the
second read) is exactly the kind of thing that gets rediscovered.

Confirmed in the real app under `Xvfb`, driven over CDP and real XTEST keys, against a
fixture vault: a plain launch putting the library on screen (`visibilityState` "visible", not
merely a target in the list), a `--login` launch producing **only the hidden capture window
and no library at all**, and a second launch while that silent instance was resident raising
the library rather than the capture window; `Ctrl+Shift+B` pressed with the *capture* window
focused creating the library window from nothing and showing it; `Ctrl+Shift+T` driven with
**real XTEST keys** — the only thing that reaches `before-input-event` — producing a real
`<li data-checked="false">` in the **capture** window, with a listener recording that the `T`
never reached the page while an unclaimed `Ctrl+Shift+L` did; a fully bold bullet and a fully
bold numbered item computing `font-weight: 700` on `::marker` against `400` for a half-bold
one, a fully italic item computing `italic`, and a bold task's checkbox stroke measuring
2.2px against a plain one's 1.4px — with the note coming back **byte-identical from
`npm run canonical`** afterwards; and the help sheet opened from a focused note row and closed
both ways (Escape, and `Ctrl+/` again, which never calls `onClose`) putting focus back on that
same row, with the following Tab staying in the note list instead of jumping to `+ New`.

**Not confirmed live**: the Windows half of the `Ctrl+Shift+T` claim, which is the whole point
of it — the failure does not reproduce here, exactly as with Ctrl+Tab. Nor the login item on a
real Windows or macOS sign-in: `setLoginItemSettings` is a no-op on Linux, so what was measured
is the flag being read, not the flag being written by the OS. `TEST-PROTOCOL.md` §25.

**Six items from daily use landed on 18 August 2026**, and four of them are one theme: **the
note itself was hard to reach with the keyboard.** There was no way to search inside a note at
all, no chord to start one from the library, none to reach the search box, and none to reach a
note's own title. Two carry decisions: **B63** — finding inside a note is a decoration and
nothing else — and **B64** — `Ctrl+F` means two things and the plugin is what decides which.
The other two: one Escape stopped doing two things, and `Ctrl+Shift+T` got the second chord its
own code comment had already named as the next step.

The new chords, in one line each: `Ctrl+F` finds inside the note when the caret is in one and
focuses the vault search box everywhere else (two registry entries, one spelling, B64);
`Ctrl+N` files a new note where the tree is standing, through the very expression the "+ New
note" button calls (B29); `Ctrl+Shift+R` puts the caret in the title — the subject field in the
capture window, the click-to-edit title in the reader, and it declines on a note the capture
window has claimed, the guard `IPC.libraryRenameNote` already carries.

Two things this batch is worth remembering for, and both were found by running it. **The
contextual `Ctrl+F` did not work as designed and every test passed** — `outlookKeymap` binds
`find`, its command returns `true`, and that makes ProseMirror call `preventDefault()` and
nothing else, so the chord went on bubbling to the library's window listener and *both* fired.
Same family as B36's trailing slash and B40's missing `corsEnabled`. And **the fix for
`Ctrl+Shift+T` shipped and the report came back word for word**, which is the second time this
project has been at that exact place (B57 → B59). So the alias went in *and* `--key-probe` did,
because a diagnosis that survives its own report has been shown to be incomplete rather than
wrong.

Confirmed in the real app under `Xvfb`, driven over CDP and — where nothing else reaches
`before-input-event` — real XTEST keys, against a two-note fixture vault: `Ctrl+F` in the
reader drawing the bar with its input focused, `offerte` counting **4 matches in 5 spans**
(one match split across a `**offer**te` mark boundary, which is the case a per-text-node
search would miss), the active match computing `rgb(87, 201, 168)` against a plain one's
`rgb(191, 233, 220)` — real computed colours, not classes in the DOM, and neither of them one
of the two yellows already in a note — Enter and Shift+Enter walking `1 of 4` → `2 of 4` → `1
of 4`, Escape leaving the caret **on** the match with the bar and every decoration gone, and
the searched note's **hash and mtime both unchanged** (B10); `Ctrl+F` from a folder row
focusing the search box and opening **no** bar, in the same session; `Ctrl+Shift+R` selecting
the whole title in both windows; `Ctrl+N` from the tree raising the capture window
(`visibilityState` "visible", subject field present, "Nothing saved yet") and doing nothing at
all with the help sheet up; Escape out of a right-click menu, out of the help sheet, and out
of the `/` menu each leaving focus **in the editor** and the `/quo` text exactly where it was,
while a plain Escape still leaves for the note list; `Ctrl+Shift+T` and `Ctrl+Shift+D` both
producing a real `<li data-checked="false">` with the letter never reaching the page while an
unclaimed `Ctrl+Shift+L` did; and `--key-probe` writing one line per press, naming
`task:editor` for both chords and `find:editor,searchVault:library` for the shared one.

**And the whole of it was driven in the *capture* window as well** — the find bar, the caret
to the subject field, and the task chords. That is the limitation every batch since the
disk-change work has named, and it is narrower than it has been stated: what that window lacks
is a *unit-test* harness, not the ability to be driven.

**Not confirmed live**: the Windows half, which is the whole point of both the alias and the
probe — `--key-probe`'s own output from a real Windows machine is the deliverable this batch
is waiting on. `TEST-PROTOCOL.md` §26.

**Two changes to tags landed on 19 August 2026**, and a third thing that nobody asked for.
Both carry decisions: **B65** — the body's `#tag`s are hoisted into `frontmatter.tags` on
save, which reverses B19's second half — and **B66** — the Tags field completes from the
vault's own list, which reverses `HeaderBlock`'s own "no completion, deliberately". The
report behind B65 was that the header showed an empty Tags field for a note whose tags are
all in the sentences, which is the shape an imported vault has; the argument behind B66 had
simply expired, since the index it said would need a scan has existed since phase 5.

**The third thing is a data-loss bug that only running it found, and it was already there.**
`HeaderBlock` keeps its own raw text for the tag and attendee fields so a separator survives
being typed — and nothing in that component knows when the note underneath it changes. Type
into the Tags field, open another note without leaving the field first, and the leftovers were
shown for the *new* note and committed to it on the next blur. Measured in the running app: a
note whose `tags: [klantx, offerte, klachten]` became `tags: [kla]`. Both callers give the
block a `key` that changes with the note now, so switching remounts it and the buffers go with
it — `Editor`'s own `setDoc` reasoning ("undo history from the previous note cannot leak into
this one") applied to the header. It is not a B65 bug; B65 is only what made anyone look.

Confirmed in the real app under `Xvfb`, driven over CDP, against an imported note carrying
only body tags and a hand-written one carrying only header tags: the imported note opening
with an **empty field, two chips and its file's hash and mtime both unchanged** (B10); one
keystroke producing `tags: [klantx, q3]` with the body byte-identical apart from the typed
character, no backslash before the line-initial `#`, and the file coming back
**byte-identical from `npm run canonical`**; deleting `#klantx` out of the sentence removing
it from `tags:` and from the chips while `q3` stayed — the sticky-tag case the provenance rule
exists to prevent; the completion list appearing on the field's first focus and not before,
narrowing on `kl`, painting on top at `z-index: 20` (`elementFromPoint`, not merely a class in
the DOM), arrow-then-Enter accepting and leaving the caret in the field, Escape closing it with
the typed text exactly where it was and focus still in the field; `#q3` never offered because
the note already carries it; `library-window.ts`'s own `--click-button` matcher, run verbatim
against the page, finding the row by `#klantx` while the button's own text reads `#klantx1` —
which is what the `.context-menu-label` on the name is for; and the leak fixed, with `kla`
typed into one note's field not following to the next and that note's file untouched.

**And all of it was driven in the capture window too** — the chips, the completion, and a
whole note written there committing to disk as `tags: [klantx, kwartaal]`, one from the field
and one hoisted out of the sentence.

**Not confirmed live**: what the extra frontmatter rewrite costs on a real business OneDrive,
which is B65's accepted price and the one thing a sandbox cannot weigh. And, as always, how
the chips and the dropdown read at a real window width. `TEST-PROTOCOL.md` §27.

**A folder's badge grew a second number on 19 August 2026**, from daily use, and it carries
one decision: **B67** — a folder shows `[# notes] / [# open tasks]`, out of the index, not
rolled up.

Nothing had to be built to *count* them: `note_tasks` has held every task item since B26, and
`openTaskCountsByFolder` is one `GROUP BY` over the rows that are already there. What the work
was about is the seam — the tree comes off disk at once and this comes from behind the index
scan, so it is a second IPC call that the renderer merges in (`folder-tasks.ts`), and
`openTasks` stays *absent* until it lands so a folder cannot briefly claim it is clear.

Confirmed in the real app under `Xvfb`, driven over CDP, against a fixture vault: `00 Inbox`
reading `2 / 2` with two notes and one of its three boxes already ticked, `01 Projecten` — a
folder with a note-bearing child and no notes of its own — carrying **no badge at all**, and
`Klant X` unfolded beneath it reading `1 / 0`; the two states in real computed colours, not
classes in the DOM (`rgb(27, 28, 31)` at weight 600 for the folder with work left against
`rgb(107, 112, 121)` at 400 for the one without); a task ticked through
`IPC.libraryToggleTask` taking the badge from `2 / 2` to `2 / 1` with `- [x] Offerte
versturen` on disk afterwards; and a note carrying three open tasks written into an empty
folder **from outside the app** making a `1 / 3` badge appear there, which is the watcher's
own path.

**Not confirmed live**: what the extra query costs on a real vault of a few thousand notes —
it is one indexed `GROUP BY` on rows already in memory, but the only machine that can weigh it
is the one with the business OneDrive on it. And, as always, whether two numbers and a slash
crowd a folder name at a real sidebar width. `TEST-PROTOCOL.md` §28.

**Three items from daily use landed on 19 August 2026**, and a fourth was deliberately left
alone. Three carry decisions: **B68** — a new note can be thrown away, and it goes to the
trash — **B69** — the note list says `[open] of [total]` under the date — and **B70** — the
caret survives a note switch for as long as the window is open.

**The fourth was `Ctrl+Shift+T` on Windows, reported dead for the third time**, and nothing was
changed for it — not as a deferral, but because `--key-probe` was run instead of guessing a
fourth time and the cause turned out to be outside the app entirely. See **B71** below, closed
the same day.

One thing B69 is worth remembering for: **the fold now reads the per-note answer instead of
asking its own question.** `openTaskCountsByFolder` was a second query over the same table, and
two queries answering one question is how a folder badge and the rows inside that folder come
to disagree. It is `openTaskCountsByPath` folded in JS now — which was not extra work, since the
per-note map was already B67's own intermediate value, thrown away a line later.

Confirmed in the real app under `Xvfb`, driven over CDP, against a three-note fixture vault:
a note with unfinished boxes reading `2 of 3` in a **real computed `rgb(26, 99, 216)`** against
a finished note's `0 of 2` in `rgb(107, 112, 121)` — the accent and the muted token, not class
names in the DOM — a note with no task items drawing **no element at all**, both counts sitting
at the same right edge with and without People beside them, the folder badge reading `3 / 2` in
the same breath, and a box ticked through `IPC.libraryToggleTask` taking the row to `1 of 3` and
the badge to `3 / 1` with `- [x] Offerte versturen` on disk afterwards. A note opened cold
starting at paragraph 0 offset 0, a real click placing the caret at paragraph 1 offset 14,
another note opening at 0/0 (so `setDoc` genuinely does throw it away), the first note coming
back to **1/14**, and its **hash and mtime both unchanged** through all of it (B10). And a draft
typed in the capture window landing on disk after the debounce, **Discard** taking it out of the
folder and putting it in `_trash` with the typed sentence still in it, the window resetting to
"Nothing saved yet", the folder **still** clean two seconds later — the `finish()`-after-discard
hazard — a discard inside the 800 ms debounce creating no file then or later, and a note handed
over from the library offering `["Insert", "?"]` and no Discard at all.

**Not confirmed live**: nothing about the chord any more (B71 settled it from the machine
itself). Also unseen by a person: whether "Discard" beside "Insert" and "?" reads as a button
you could hit by accident at a real window size, and whether a long list of attendees and a
count share a row comfortably in a narrow note pane. All are `TEST-PROTOCOL.md` §29.

**And on the same day `--key-probe` closed a question three reports old** (B71). On the
reporting Windows machine, in the capture window: plain `Shift+T` logs a `KeyT` line, `Ctrl+T`
logs a `KeyT` line, and `Ctrl+Shift+T` logs **no `KeyT` line at all** — a
`key="c" code=KeyC ctrl=true shift=false` arrives in its place, while five of five
`Ctrl+Shift+D` presses come through as `claim=task:editor`.

**That something arrived *instead* was the clue.** A passive `RegisterHotKey` grab produces
silence; an injected keystroke, Shift stripped and lowercase, means a macro tool — a much
smaller set of suspects than "something takes it". It was **an AutoHotkey script the machine's
own owner had written**, intercepting `Ctrl+Shift+T` and sending `Ctrl+C` to escape another
command. Not Windows, not Chromium, not this source tree.

**So nothing changed.** `Mod-Shift-t` stays first — it is the guessable one beside the other two
list keys, and no property of the platform or of this app demotes it — with `Mod-Shift-d` beside
it, kept rather than removed because it costs nothing and is the one that went on working while
the cause was unknown. Both claims in `editor-keys.ts` stay too: they are correct on their own
terms, and `before-input-event` is still the right place for a chord that has to be claimed.

**The general lesson is the one this file keeps paying for, now three times over** (B57 → B59,
B62's batch, and this): a diagnosis that survives its own report is incomplete rather than
wrong, and the way out is to measure rather than repair again. Three reports, two fixes that
repaired a healthy limb, one log file. The probes exist for this — reach for them earlier.

**Two bugs and two additions from daily use landed on 19 August 2026**, on top of
`v0.8.13`. Two carry decisions: **B72** — a bullet can be flagged with a star, and that
star is in the file — and **B73** — the Where field completes from the vault's own
locations. The two bugs are written up as constraints above: a new note's When field showed
a stale time, and the Unlinked attachments row was there for vaults with nothing unlinked.

The thing this batch is worth remembering for is that **the two bugs turned out to be the
same bug in two places**. The When field was stamped on hide, and the filename was stamped
from a second clock stamped at the same moment — so fixing only the visible half would have
left the file named after the moment the *previous* note was put away, invisibly, in the
one field nobody re-reads. The fix collapses the two clocks into one rather than
re-stamping both, which is this file's own rule about two answers to one question, applied
to a timestamp.

Two things about B72 are worth knowing before touching it. **The spelling was measured
before anything was built on it** — `- ⭐ Aandacht voor dit punt` was put through this
repo's own `writeProcessor` options and came back byte-identical, which settled that `⭐`
needs no `state.safe` carve-out the way B19's `#` does. And **the ordered-list case was
found by running the round trip rather than by reading it**: the first version lifted a
star out of `1. ⭐ Eerste stap` quite happily, and the file survived — but the CSS draws the
star on `ul > li`, so the flag would have been set, saved, and invisible. Both the reader
and `to-mdast.ts` decline it now, at the one place that knows which kind of list an item is
in.

**Not confirmed live**: none of it in the real app yet — this batch is tested and built but
has not been driven under `Xvfb` over CDP, which every batch before it was. That is the
outstanding work, and `TEST-PROTOCOL.md` §30 is what it should be driven against.

**Three items from daily use landed on 20 August 2026**, and only one of them is new work.
One carries a decision: **B74** — an embed's pipe field means three things and none of them is
thrown away, with a corner drag as the way to set the first. The other two are written up as constraints above:
the note list's task badge says `Tasks: 2` and says nothing at all for a finished note (B69
revised), moving up onto the excerpt row when a note names nobody; and the bullet, B72's star
and the task checkbox now sit on one line and in one column.

**A fourth was dropped at the reporter's request**: the Where field's type-ahead. It is worth
recording what happened around it, because the investigation went wrong in a way that is easy
to repeat. B73 is fully implemented (`location-typeahead.ts`, `HeaderBlock.tsx`,
`IPC.locationSuggestions` → `locationFacets`) and its two test files pass, so the report was
answered with "it is built but never released" — on the strength of `git tag | tail -6`, which
sorts **lexically**: `v0.8.9` comes after `v0.8.14` in that ordering, so the newest tag looked
five releases older than it was. `v0.8.14` exists, is published, and contains B73.

**Use `git tag --sort=-v:refname`, or `gh release list`.** A version is not a string, and the
one command that made this look like a delivery problem is the default one. The 6 August 2026
batch — where "aggregated tasks not visible" really was an untagged PR — is what made the wrong
answer plausible, which is exactly why it needed checking rather than pattern-matching.

So the report stands unexplained: it was made against a build that does carry the feature. It
was dropped at the reporter's request and nothing was investigated further; the next person to
pick it up should start from `--key-probe`'s lesson (B71) and measure on the reporting machine
rather than reason from here.

The thing this batch is worth remembering for is that **the marker alignment was measured
rather than guessed, and the measurement changed the design**. The obvious fix for a star that
sits wrong is `font-size` on its `::marker`; rendering the real stylesheet in a real Chromium
at 4× and reading the ink centroids out of the PNG showed that shrinking it moved it *lower*
and further out of column, because the em space in `--marker-gap` scales with the glyph and
`::marker` accepts no `vertical-align` to compensate with. Twenty minutes of measuring turned a
one-line change that would have shipped wrong into a construction that is right at every depth
and on any emoji font. B38's URL shapes and B71's `--key-probe` are the same lesson.

Confirmed in the real app under `Xvfb`, driven over CDP, against a five-note fixture vault and
a genuine 240×160 PNG: a note with People reading `Tasks: 2` on `.note-bottom` beside them, a
note with none reading `Tasks: 1` on `.note-middle` with **no `.note-bottom` element at all**, a
note whose boxes are all ticked and a note that never had one both drawing **nothing**, both
counts at the same right edge, and the surviving badge in a real computed `rgb(26, 99, 216)`
with `Open tasks: 2 / 3` in its `title`. The three markers' ink centroids measured off a live
screenshot at x 18.75 / 18.88 / 18.75 and y 9.75 / 9.23 / 9.97, against a star that was 5px out
of column before. And a picture selected by a **real click** growing four handles that sit on
its own corners (the SE handle's centre on the picture's bottom-right, not the paragraph's), a
**real corner drag** tracking the pointer live at 212 → 172 → 140, the file coming back
`![[_attachments/foto.png|140]]` and **byte-identical from `npm run canonical`**, the note
closed and reopened still at 140px with its hash and mtime unchanged (B10), and a double-click
on a handle putting it back to 242px with the suffix gone from the file.

**And all of it in the capture window as well**: a pasted `![[…]]` there drew a real picture
with four hidden handles, a real click selected it, a real corner drag took it to 152×102 with
the proportions kept, and the committed note landed on disk as `![[_attachments/foto.png|152]]`.

**B74 shipped narrow and was widened the same day, and that is the part worth remembering.**
The first version read only `|400` and went on discarding `|250x180` and `|een foto van het
kantoor` — which is the very bug the decision existed to fix, reproduced one case narrower. The
mistake was reading the *feature* (resize the picture) instead of the *format* (one slot, three
readings): a syntax with a slot in it has to be handled at the slot, not at the one meaning
that happened to be wanted. Understanding something and keeping it are two different jobs, and
`readEmbedField` now answers "not a size" by putting the string in `alt` rather than by
dropping it — which is also how a capital `X`, an out-of-bounds number and an empty slot all
survive without being understood at all.

Confirmed in the real app after that widening, driven over CDP: `|250x180` drawing at exactly
250×180 (deliberately distorted from the file's own 240×160 natural size, because the file said
so), `|een foto van het kantoor` drawing at its own size with **nothing on the `<img>`**, and
`|140` at 140×94 with the proportions kept — then a real edit and save leaving **all three
suffixes intact on disk**, which is the sentence this whole change is about. A corner drag on
the box took it to `|170x122`, the same shape it started with (1.389 → 1.393); a corner drag on
the alt-text picture wrote `|182` and replaced the text, the documented cost of one slot. The
file byte-identical from `npm run canonical` throughout.

**Not confirmed live**: how the star and checkbox land against **Apple Color Emoji and Segoe UI
Emoji** — the box centres the glyph whatever its metrics, which is why the construction was
chosen over a tuned `font-size`, but only a Mac and a Windows machine can say how the two
actually read. Also unseen by a person: whether four 9px handles are comfortable to grab on a
real display, and whether a picture dragged very small still reads as deliberate rather than
broken. `TEST-PROTOCOL.md` §31.


**Seven items from daily use landed later on 20 August 2026**, four of them landing on work
that had shipped that same morning. One carries a decision: **B75**, a note can be pinned to
the top of the list, and the pin is in the file. The rest are written up as constraints
above.

**The thing this batch is worth remembering for is that a measurement can be right and
answer the wrong question.** The morning's batch put the bullet, B72's star and the task
checkbox into one column, measured in a real Chromium at 4× by ink centroid, and got them to
within 0.4px of each other. It was reported still out of column by 3px and 4px — and the
report was right. `.task-check` is a `<button>`, and a button does not inherit its font, so
every `em` in its rule resolved against the UA's 13.333px instead of the editor's 16px:
`var(--marker-slot)` was 20px inside that one rule and 24px in every other. That put the
box's *ink* 3.4px left of the bullet's while its *centre* sat right on the bullet's. A
centroid is not what a reader is reading; the left edge is. **Twenty minutes of measuring
the previous day had turned a one-line change into a construction that was right at every
depth and still wrong on the axis nobody had thought to read.**

The second report — a checkbox sitting at the top of a pasted picture while the bullet drops
to the bottom with the text — turned out to be the same defect seen from the other side, and
is what forced the real fix. A marker positioned against the *item* agrees with the bullet
only while the line is one line tall; a picture in the line is what tells them apart.
Measured with a 240×160 picture: the bullet 13.3px above the item's bottom, the checkbox and
the star **232px** above it. Both now hang off a zero-sized inline anchor sitting on the
line's own baseline, which also made the star a widget rather than a `::before` — a
pseudo-element on an `li` whose content is `paragraph block*` gets an anonymous block of its
own and cannot join the first line at all.

**And the star cannot be measured at 4× in the first place**, which is the methodological
catch worth carrying forward. The bullet and the checkbox are outlines and read honestly at
any size; `⭐` is a colour *bitmap* font, drawn from whichever fixed strike is nearest. The
4× reading put it 1.4px too high at real size, and its ink snaps to whole pixels, so a sweep
at 16px finds a plateau rather than a value. The shipped number is the middle of that
plateau. B38's URL shapes, B71's `--key-probe` and the previous day's own marker work are
all the same lesson; this one adds a second half to it, which is that a harness has to be
checked against the thing it stands in for.

**"No reliable way to reproduce" was reproducible, and the repro is one space.** Enter on an
empty bullet ends the list; it was reported doing that sometimes and giving a second empty
bullet other times. Type a word, change your mind, hold Backspace until the bullet *looks*
empty and stop one press early: the item holds a single invisible space, and
`content.size === 0` says it is not empty. The shape matrix written to find it
(`test/list-enter.test.ts`) also turned up a second defect nobody had reported — leaving a
deeply nested list flattened every item below it to the top level, as one list per level.
The text survived and the outline did not. A matrix is the right answer to a report of the
form "sometimes it works": it turns "sometimes" into a list of shapes that can be read.

The remaining three were ordinary. A numbered list's gutter now grows to fit the widest
number in the note, so `1000.` is not cut off at the window edge — and grows *only* when a
digit would otherwise be lost, rather than whenever the marker outgrows the gutter, which
would have moved the text of every numbered list already written to fix something nobody can
see. The sidebar's arrow keys reach Tags, People, Tasks, Settings, Help and Unlinked instead
of stepping from the last folder straight to Trash. And Enter after a starred item goes back
to the marker the list was using rather than always to a plain bullet, which used to end a
checklist at the flagged line.

Confirmed in the real app under `Xvfb` against a four-note fixture vault and a genuine
240×160 PNG, with the ink read off live screenshots rather than looked at: bullet, checkbox
and star all starting at the same x **to the pixel**, at depths one, two and three, and
within 0.42px of the same 22.4px line grid — including on the lines holding the picture,
where two of them used to be 232px away. `1000.` drawing in full with its full stop in the
same column as `998.`. A pinned note at the top of the list under every sort key with its
pin drawn beside the title. And the index on disk at `user_version = 4` with a `pinned`
column carrying a 1 for exactly the note whose frontmatter says so.

**Not confirmed live**: the pin limit's refusal dialog and the sidebar's widened arrow walk.
Both have real-DOM tests that dispatch real events and read `document.activeElement`, and
neither has been driven in the packaged app — see `TEST-PROTOCOL.md` §17.

**Five items from daily use landed on 21 August 2026**, on top of `v0.10.1` — two of them
corrections to work that had shipped the day before. Four carry decisions.

**B77 narrows B75's pin limit from the vault to the folder, and stops a pin ordering
anything but a folder.** Three-for-the-whole-vault reads at design time as "three things you
are working on this week"; in use it is three things *per project*, and once three folders
had spent the allowance the fourth got a refusal about something that had nothing to do with
it. The count moves to `pinnedNotesIn(db, folderOf(path))` — the immediate folder, so a
subfolder has an allowance of its own — and stays in main, where the argument for it got
*stronger* rather than weaker: the folder being counted is very often not the one the tree is
standing in, since a note can be pinned from a tag's list or a search result. No new column
and no `SCHEMA_VERSION` bump; `notes_pinned` is a partial index over `pinned = 1`, so the
filter reads a handful of rows. The second half follows arithmetically from the first: three
pins in each of eight folders is one tag click from a list whose top two dozen rows are
pinned, and with `keepPinnedInView` on that is a sticky slab covering the pane. So a pin
orders a folder and nothing else — `pinsApplyTo` is `selection.kind === "folder"` **and** an
empty search box, the query half being load-bearing because a search wins over the tree
selection entirely while the tree still says "folder". The mark stays drawn wherever the note
appears; only the order goes.

**B78 turns the three sort labels into one field chooser** — a glyph plus the current field,
opening a `ContextMenu` with the current field ticked. The three labels were a state you had
to already know how to read: nothing said they were a group, nothing said the tinted one was
the answer rather than a link. The menu is the shared component and not a list drawn in
place, which is what buys the arrow/Home/End walk, Escape, focus returned to the trigger, the
viewport clamp, the tick — and reachability from `--click-button`, which searches an open
`.context-menu` in preference to the page.

**B79 reshapes the capture window from 720×440 to 600×720** — a notepad rather than an index
card on its side. `.editor` is `flex: 1` and the only elastic row, so this roughly doubles the
body, which is the whole content of that window. Clamped against the primary display's work
area, because 720 tall clears a 1366×768 laptop only just and a window taller than its screen
is one whose status bar hangs below the edge; `minWidth`/`minHeight` added for the first time,
since the status bar has no `flex-wrap` and the header is a four-column grid.

**B80 gives Discard a chord, `Mod-Shift-Backspace`, in the capture window only** — and the
decision worth keeping is the one about the key it is *not*. Escape is bound to nothing at
window level there on purpose, and Discard is the one command in that window that throws work
away, so it is the last thing that reflex key should reach. `formatBinding` learned `MAC_KEYS`
along the way, so a Mac prints ⇧⌘⌫ rather than three symbols and then a word.

The fifth item needed no decision: a **Tasks** button in the note list's header, beside
+ New note, handed `openTasks` itself rather than a copy of what it does. `.notes-header`
distributes with `space-between`, so the two buttons went into a `.notes-actions` wrapper —
a fourth loose child would have spread the bar evenly and moved the sort chooser.

Confirmed in the real app under `Xvfb`, against a seven-note fixture vault spanning four
folders: the folder view floating its three pins and the `#klantx` tag view — the same notes
— standing in plain modified order with the pins still marked; the sort chooser opening with
Modified ticked, `--click-button="01 Projects>Modified>Title"` walking two levels into it, the
menu collapsing on the choice and `librarySort: "title"` in `settings.json` afterwards; the
header's Tasks button opening the Tasks view scoped to the folder the tree was standing in,
with the sidebar's own row lighting up; **the refusal reading "No more notes can be pinned in
one folder than 3." for a fourth pin in `01 Projects`, and the very next pin in `00 Inbox`
being accepted** — a fourth pin in the vault, with `modified` untouched, which is the whole
bug in one pair of gestures; the capture window at 608×724 with all four header cells and all
five status-bar items legible at that width; and Ctrl+Shift+Backspace moving a brand-new note
from `00 Inbox` into `_trash` and hiding the window.

**Not confirmed live**: the Discard chord declining for a note handed over from the library
(there is still no capture-renderer test harness, the limitation `dirtyRef`'s own comment
names — the registry test covers the binding, not the guard), and the shelf's scroll behaviour
with `keepPinnedInView` on, which needs a list longer than the pane. Both are
`TEST-PROTOCOL.md` §33 items.

**Four fixes to the shared header block landed on 21 August 2026**, on top of `v0.10.2`, all
of them in `HeaderBlock.tsx` and its two — now three — completion modules. One carries a
decision: **B81**, the Who field completes from `facets().people` over a new
`IPC.peopleSuggestions`, which revises the sentence B66 wrote saying people deliberately would
not get completion. The argument there was that a name is not drawn from a closed set the way a
tag is; the answer is B73's, which had already accepted the same argument the other way round
for Where — the set is as closed as the vault's own history of it, and it is the same handful
of colleagues typed again and again with a slightly different spelling each time.
`people-typeahead.ts` is `tag-typeahead.ts`'s token maths with whitespace taken out of the
separator set, because "Jan de Vries" is one name and `,`/`;` is exactly what `parseAttendees`
splits on.

The three fixes beside it were each a small thing with a mechanism worth writing down. **Tab
from Tags landed in the suggestion list rather than on Where**, because the rows were plain
buttons with no `tabIndex` sitting between the input and the next field, and the list is open
from the moment the field has focus — so the first Tab entered the list, the input's blur
closed it and unmounted the button holding focus, and the press after that started again from
the top of the document. One press in, one press wasted: the reported "extra Tab". Where → Who
had it identically. **A tag deleted from the Tags field stopped being offered**, because
`applied` was read off `values.tags` — the committed array, which `commitTags` only refreshes
on blur or Enter — so for as long as the field had focus it disagreed with the text on screen
and filtered a tag out of the vault's own list on the strength of a note that no longer carried
it. `test/header-tags.test.ts` had pinned that behaviour as if it were a rule and had to be
rewritten, which is the thing to remember from this one: a test encodes a bug exactly as
faithfully as it encodes a decision. **And the Tags field could be squeezed to zero width** by
the body-tag chips beside it (B65) — the cell is a flex row, `.header-cell input` is
`flex: 1; min-width: 0`, and a chip is `0 0 auto`, so the chips took the line and the field was
left with nothing. It needed both halves: a `flex: 1 1 10ch; min-width: 10ch` floor on the field
and a cap of three chips with a `+N` carrying the rest in its tooltip. The cap is a count and
not a measured fit, deliberately — nothing under `test/` puts the stylesheet through a layout
engine, so a measured version would have been the one piece of this header no test could reach.

**None of the four was driven live**, and that is not an oversight to be tidied away later: the
capture window remains the one route with no renderer harness, and all four are things you find
with your hands — how many Tabs cross a header, whether a list offers a tag back, whether a
field is wide enough to type in. `jsdom` implements no sequential focus navigation at all, so
the Tab fix in particular is asserted as a property of the rows (`tabIndex === -1`) rather than
by pressing anything; a test that dispatched a Tab keydown there would have passed whatever the
markup said. `TEST-PROTOCOL.md` §34 is the whole batch, written for a human.

**Two items from the same day's list are not in this release**: an "Exit tasks" button with
Escape beside it, and Escape out of a search returning focus to the note list. Both are the
library window's half — `Library.tsx`'s `focusPane` has to come out of the pane-cycle effect
before either can be wired — and both are still open in `TODO.md`.

**The two items v0.10.3 left behind landed on 21 August 2026**, with the DOM test that
release was also missing. The Tasks view and a live search now each have a way out: a
labelled control — "Exit tasks" in the task toolbar, a `×` in the search box while there is
something to clear — and Escape. Both end by handing focus to the roving row of the list
that replaces what was on screen, through a `focusNotesOnNextList` flag consumed by an
effect keyed on `notes`: the reload is a round trip, so anything focused at the moment the
exit runs belongs to the list being unmounted. `focusPane` and `paneOf` came out of the
pane-cycle effect to make that possible, which is the groundwork `TODO.md` had named.

**Driving it in the real app is what made this batch worth more than its diff.** Under
`Xvfb`, over `--library --click-button` for the button and `xdotool` for the keys: the "Exit
tasks" button returned to `00 Inbox` with the row focused, and Escape in the search box
cleared the query, restored the folder's list and put focus on the selected note — both
first time. **Escape out of the Tasks view did not.** The handler was on `.task-list`, where
the key looks like it belongs, and it did nothing for the two commonest ways of standing in
that view: arriving by the sidebar row leaves focus in the tree, and a click on the empty
space below the last task leaves it on `<body>` — neither is inside the pane, so neither
reached a React handler on it. The window listener owns the key now, which sees it from
anywhere, with the editor asked about first so a note open beside the list keeps Escape's
older meaning. The jsdom test had passed against the broken version, because it dispatched
the key on the pane; it presses on `document.body` now, which is the case that was actually
broken. That is this project's recurring lesson in its usual shape — a handler placed where
the key seems to belong rather than where focus actually is.

One more thing came out of the same session, and it is a difference rather than a defect:
clicking a search hit and then pressing Escape takes **two** presses, because the click puts
focus in the editor and the first press means "back to the note list". Written down in
`CONSTRAINTS.md` rather than smoothed over — collapsing the two would take Escape's older
meaning away from the editor.

**And `test/header-who.test.ts` closes the gap v0.10.3 shipped with**: fourteen cases over
the Who field's panel — asked on first focus and once per window, what is offered and what
is filtered out, the arrows and Enter, a name accepted in the middle of a list, Escape not
travelling on to the window, the rows kept out of the Tab order, and three lists open at
once keeping separate highlights. The Who completion itself was also confirmed live in this
session, in the reader window: the caret in "Pieter Jansen" offered exactly that name with
its count, with "Jan de Vries" filtered out as already in the field.

**The capture window's test harness landed on 22 August 2026**, on top of `v0.10.4`, and
nothing under `src/` changed for it. It closes the sentence every batch since the
disk-change work has ended on — and the first thing worth recording is that the sentence
was wrong, in a specific and instructive way. "The capture window has no test harness" was
two claims wearing one coat. The window has been *reachable* over CDP since 15 August 2026,
which is written down in this file ("`Input.dispatchMouseEvent` and `Input.dispatchKeyEvent`
over CDP reach it perfectly well; what it has never had is a *unit-test* harness, which is a
narrower statement than the one every batch since has been making"). Every batch since went
on making the broad one anyway. **A claim that is repeated rather than re-checked drifts**,
and this one drifted for a week while the correction sat in the same file.

**The unit-test half was never blocked by anything.** `test/library-disk-change.test.ts` has
mounted a real `Library` against a stubbed `window.emqnote` since Package C shipped;
`Capture.tsx` reaches for twelve members of the same interface, and four existing suites
already mount ProseMirror's `Editor` in jsdom. `test/helpers/capture.ts` is that pattern
pointed at the other window, and four suites came out of it — 41 tests, no display, running
in CI on all three platforms:

- `capture-disk-change.test.ts` — B31's three branches in this window (`TEST-PROTOCOL.md`
  §10, the one item recorded as never reachable by automation at all). Reread when clean,
  a buttonless notice when dirty, a buttonless notice on deletion whatever `dirtyRef` says,
  and the two ways the notice clears. Two of its assertions are about something *not*
  happening, which is the whole asymmetry with the reader: a window where the user may be
  mid-sentence must never offer a button that could discard what they are typing.
- `capture-keys.test.ts` — the window-level chords, including the Ctrl+Shift+Enter
  regression `matches()` was written for. Breaking `fires("close")` back into
  `event.ctrlKey && event.key === "Enter"` reproduces the original bug and turns two of
  these red, which is the check that the test is worth having.
- `capture-session.test.ts` — what a session is: the subject field and Discard appearing
  only for a note this window began (B20, B68), the half-typed tag and attendee buffer that
  `key={session}` exists to drop, and the stamp on `onShow` — read at the moment the note is
  begun, left alone once anything is typed, and never applied to a handed-over note.
- `capture-insert.test.ts` — the Insert routes reaching the document in *this* window's copy
  of them: the picker's filter, an image, a PDF, and a file with no preview going in as a
  link rather than an embed.

**The stub has to cover the window's children, and forgetting that is what broke first.**
`Capture.tsx` never mentions `tagSuggestions`, `peopleSuggestions`, `locationSuggestions` or
`pdfPageCount` — but `HeaderBlock` calls three of them the moment anything is typed into
Tags, Where or Who, and `attachment-view.ts` calls the fourth the moment a `.pdf` embed gets
a node view. An absent one throws out of a `void` promise chain and arrives as an unhandled
rejection attributed to whichever test was running by then: the reported test and the broken
one are two different tests, the same shape as `capture-writer.test.ts`'s rename race.

**The other half is `scripts/drive-capture.ts` (`npm run drive:capture`)** — the real window,
under its own `Xvfb`, over CDP, with no new dependency: Node's global `fetch` and `WebSocket`
are all CDP needs, so `check:bundle` stays quiet. It scaffolds a throwaway vault holding a
real PNG and a note that embeds it, raises the hidden window with the **real global hotkey**
(`xdotool key ctrl+shift+y`; `globalShortcut` works on a bare `Xvfb`), and runs five steps.
The headline one is the gap four separate features have been unverified on for months:
**`naturalWidth` non-zero on the picture in the capture window** — decoded, not merely an
`<img>` in the DOM. It also walks the caret across that picture, measures the header fields'
real widths (§34's "a field with no room", which every jsdom rectangle reports as zero), and
re-runs §21j's Mod+clicked tag raising the library filtered. All five green, twice in a row,
and each confirmed to go red when broken on purpose; the run exits non-zero naming the step,
and keeps the vault on a failure because that is the evidence.

**Two things cost a run each and are now in `CONSTRAINTS.md`.** `xvfb-run` writes a fresh
`Xauthority` into a temp directory and exports `XAUTHORITY` to its own child only, so the app
drew perfectly while every `xdotool` and `xwininfo` beside it was refused — a harness failure
that reads exactly like a failure of the window under test. The script starts a bare `Xvfb`
on a display number it picks itself instead. And killing the pid rather than the process
group left the Electron tree and the X server behind, so the *next* run died on a
`--remote-debugging-port` bind: `detached: true` and a negative pid, SIGTERM then SIGKILL.

**What none of it reaches, and is not claimed:** the PDF/Office thumbnail happy path, which
has no OS provider here or in CI; every "does this feel right" row; and everything Windows.
`TEST-PROTOCOL.md` §36 is what this batch owes a human, and it is mostly judging by eye what
a 40px floor cannot — including the first photograph this project has of the capture window
with real content in it.
