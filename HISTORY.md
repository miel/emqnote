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

**The workflow actions, the branch list, and the cornerstones in the capture window landed
on 22 August 2026**, on top of `v0.10.5`. Nothing under `src/` changed for any of it either
— it is the second batch running that is entirely about what can be checked and what can be
maintained.

**Two pieces of housekeeping, both of which had gone stale in the file that tracked them.**
GitHub's deprecation notice of 19 September 2025 had been warning on every run since, and
the eight `actions/checkout@v4` and `actions/setup-node@v4` pins are `@v7` now. `TODO.md`
asked for `@v5`, which was current when the bullet was written and no longer is; the node24
move that ends the deprecation is in v5.0.0 of *both* actions, so every major from v5 up
answers the warning equally and v5 alone would have bought a bump that needs doing again.
The two behaviour changes in between were read rather than assumed — setup-node v5's
automatic caching keys off a `packageManager` field this project has not got, and
checkout v6's separate credential file cannot reach `release.yml`'s `git fetch --force
--tags origin` because this repo is public and that fetch needs no credentials.
`actions/upload-artifact` was **left alone at first, on evidence that did not say what it
was read as saying** — `v0.10.4`'s annotations name checkout and setup-node and nothing
else, including on the `package` job that is the only user of upload-artifact, and that
absence was taken for proof its v4 already ran on node24. The moment the other two were
bumped, `v0.10.5`'s `package` jobs warned about `upload-artifact@v4` by name and nothing
else. The notice does not enumerate every offender, so **an action missing from one run's
annotation is not evidence that it is fine** — the same shape as inferring a capability
from a mechanism, two paragraphs down, in the same batch. It is `@v7` now, and `@v5` would
not have done: upload-artifact's own v5 notes call its node24 support preliminary and say
the action by default still runs on Node 20, so v5 would have left the warning exactly
where it was while looking like a fix. And the branch bullet named three
branches, two of which no longer existed locally, while nineteen fully-merged ones had piled
up behind it; all nineteen are gone, deleted with `git branch -d` so the command is its own
check.

`v0.10.5` was tagged on top of all of this rather than beneath it, so that the one run this
project cannot repeat cheaply would be the run that exercised the new pins. It went green
end to end, `create-release`'s `git fetch --force --tags origin` included — the one step
`build.yml` never covers, and the only reason there was any doubt.

**The three cornerstone features of 14 August 2026 (B49, B50, B51) now have suites in the
capture window** — the item `TODO.md` had carried for eight days on the grounds that the
window had no harness, which stopped being true the day before. Three files, 25 tests:
`capture-slash-menu.test.ts` (the `/` menu opening, filtering, Escape, the keyboard walk,
and all four of its main-side items — image, file, note link, table — routed through *this*
window's own closures, which are different objects from the library's and different again
from the ones its own Insert menu uses), `capture-table.test.ts` (a rectangle built with
Shift+arrow, cleared with Backspace, and the toolbar acting on it — including alignment
taken from a rectangle rather than a caret), and `capture-remote-images.test.ts` (B50's
switch reaching every image node view, the chip and its click, and the `data:` case that
only this window's CSP forces through main). The suite is 1765 tests over 134 files.

**Two halves of that are jsdom's by definition, and `scripts/drive-capture.ts` took them**:
a rectangle of cells dragged out with a real pointer — `cellPointerAt` goes through
`posAtCoords`, which reads boxes — and whether B51's sixteen-row panel *fits* with the caret
near the foot of the window. It flips above it, 331px of panel in a 600×720 window, which
is the first time that has been observed rather than reasoned about. Seven steps now, green
twice in a row, each confirmed to go red when broken on purpose (the drag by neutering
`table-drag.ts`'s dispatch, the panel by forcing its `fits` true, which put its bottom edge
at 1017px in a 720px window).

**The drag cost a run, and the diagnosis it invited was plausible and wrong.** It selected a
one-by-two rectangle instead of two-by-two, which reads exactly like a rectangle that will
not grow downwards. `table-toolbar.ts` draws its bar as a widget decoration *above* the
table and it appears the moment the caret enters a cell — so the mousedown that starts the
drag pushes every row below it down by a toolbar's height, and coordinates measured before
the click aim one row high. Click once, re-measure, then drag. It is in `CONSTRAINTS.md`,
along with the failure message that now carries the coordinates and the viewport, for the
reason `--trash-probe` reports evidence rather than asserting a cause.

**And a claim in yesterday's own harness was wrong.** It said character input was
unreachable in jsdom, "through `beforeinput` and the DOM observer, neither of which jsdom
drives for a `contenteditable`". Half of that is wrong and it is the half that matters:
jsdom implements `MutationObserver`, ProseMirror's `DOMObserver` is built on it and its
callback flushes synchronously, so writing a character into the contenteditable and moving
the DOM selection is read back exactly as a browser's own typing is — `handleTextInput`
fires, input rules apply, and the `/` menu opens. `typeInBody` is nothing more than that. It
had never been tried; it was inferred from the name of one event. That is the same failure
as the "no test harness" sentence retired the day before, in the same file, in the same
week — **a capability inferred from a mechanism is a guess**, and this project has now made
that particular one twice.

What jsdom really lacks there is narrower and is a hole rather than an absence:
`Element.getClientRects` answers zeros and `Range.getClientRects` is not implemented at all,
so ProseMirror's `singleRect` throws where it would otherwise read a zero — reached from
`scrollToSelection`, which every text-editing transaction sets. Unhandled, inside a
MutationObserver callback, attributed to whichever test was running by then: the third time
this codebase has met that exact shape. The harness gives `Range` the zeros `Element`
already gives, which is consistency rather than a fake measurement.

**What is still owed a human is the feel, and only the feel.** `TEST-PROTOCOL.md` §19b and
§19t stay open for what they were always about: whether the rectangle keeps up with the
pointer, and whether the flip reads as a decision rather than a jump. Fitting is not
gracefulness. Untouched by any of this: the reader window's drag, which nothing drags in
yet, and everything about B50 that needs a real network.

**The rest of the capture-window backlog was walked the same day, 22 August 2026.** Six
rows in `TEST-PROTOCOL.md` had read "reachable by the harness now, not yet written against
it" — §13h, §14n, §15k, §16i, §17h, §18x, and §20m, §22s and §23j said much the same. That
sentence had been true since the harness landed and was doing no work, so each row got one
of two answers: written, or measured and told why it cannot be.

**Written** (`test/capture-note-link.test.ts`, `test/capture-document.test.ts`, and
additions to `test/capture-table.test.ts`; the suite is 1784 tests over 136 files):

- **§13h and §16i** — the note picker in the window notes are actually written in, which
  §13h calls "the row most worth walking". The typed `[[` opening it mid-sentence with the
  brackets still showing, Escape leaving them exactly as typed, the pick writing
  `[[path|Title]]` rather than a bare title, "No note matches" instead of an empty box, the
  `Mod+Shift+K` route, and a chip's click reaching `openWikiLink` with the path it was
  handed rather than the title it draws.
- **§14n** — `Mod+Alt+T` opening the grid, the grid walked and chosen entirely from the
  keyboard (a shortcut that opens something the mouse has to finish does not finish what it
  starts), Tab selecting the next cell's contents, and Tab off the last cell adding a row.
- **§18x's reachable half** — a line to type on below a note that ends in a table, a code
  block or a rule; one of two adjacent spellings drawn with both kept, and two far-apart
  mentions left alone; the divider with a paragraph under it.
- **§23j's paste** — a `[[path|Title]]` on the clipboard becoming a real chip in this
  window, an `![[foto.png]]` becoming an embed, and a bare `[dit]` staying text.
- **§33p** turned out to be covered already, by `capture-keys.test.ts` and
  `capture-session.test.ts` between them — worth checking before writing rather than after.

**Measured and written down instead**, which is the more useful half of this batch, because
three of the four look like ordinary behaviour rather than layout:

- **An inline PDF's page arrives over `fetch()` on `emqnote-thumb://`**, which jsdom cannot
  serve — so the embed never gets past its chip and the bar the arrows, the counter and the
  ⧉ live on is never drawn. That is §15k, §17h, §18k–§18m and §22q's ⧉ in one sentence.
- **A click on a markdown link goes through ProseMirror's `handleClick`, which asks
  `posAtCoords` first.** Those rows are about aiming at the right-hand half of the last
  character, so they are layout wearing a behaviour's clothes (§18g–§18i). A `[[…]]` chip is
  the opposite and does work: its node view listens for a plain DOM click.
- **Shift+arrow within a cell's text is a selection the browser moves and ProseMirror reads
  back**, so the step `extendCellSelection`'s guard is about never happens here
  (§20h–§20k) — and **a panel scrolling is not something jsdom does at all** (§20a).

The harness grew what the work needed and no more: `openWikiLink`, `openInSystemViewer` and
`linkCandidates` on the stub (the "cover the children" rule collecting its third instalment),
a `pdfPageCount` option, `pasteInBody` — a hand-made clipboard, since jsdom has neither
`DataTransfer` nor `ClipboardEvent`, and ProseMirror only ever asks it for four things — and
`waitFor`, which is there because `NotePicker` debounces 150 ms behind a real timer and
`flush` pumps only microtasks. `waitFor` waits on the *result* with a generous ceiling, for
`index-watch.test.ts`'s reason: it returns the moment the condition holds, so a high ceiling
costs nothing on the happy path and a `sleep(200)` would have been the thing that failed a
release later.

**What this leaves is a driver step nobody has tried**: a real multi-page PDF in the
scaffolded vault and a pdf.js render under `Xvfb` would close §17h and §15k, which have never
been seen in this window at all. `TEST-PROTOCOL.md` says so on both rows rather than leaving
them to look like an oversight.

**And the driver took the PDF, the same day.** §15k and §17h had just been written down as
unreachable by the harness, with "a real multi-page PDF and a pdf.js render under `Xvfb`,
neither of which has been tried" as the next step. It was tried, and it works.

`scripts/drive-capture.ts` builds a three-page PDF of its own rather than carrying a binary:
the xref offsets are computed, and the pages differ by the **area** of a filled bar — page n
gets a bar n times as tall — so a pixel count can tell them apart. That is the whole design
of the fixture, because §17b asks for "the page *picture* changes each time, not only the
counter", and a changed `src` is exactly what would pass without it.

Two steps came out of it. The first asserts `naturalWidth` on the drawn page (1240 — pdf.js
genuinely rendered into this window), the counter reading "/ 3", and ◀ **dimmed but not
hidden**, hiding being a one-page document's state and a different thing. The second clicks
▶ with a real pointer and counts dark pixels off a canvas: 321788 on page 1, 630813 on page
2, which is the bar doubling in height exactly as the fixture was built to. Nine steps now,
green twice in a row, both new ones confirmed red when broken on purpose — and the page-turn
one, broken by letting `draw` move the counter and return, produced word for word the
message it exists for.

**Two things cost a run each, and both are in `CONSTRAINTS.md`.** Adding the PDF to the
fixture note broke the *table drag* two steps later, which had been green twice: the page
arrives asynchronously and relaid the document out from under coordinates that had already
been re-measured once. Ordering the PDF steps first — each waits for its own picture — fixed
it, and the general rule is that a step which measures anything owes the steps before it a
finished layout. And the page-turn check first passed for the wrong reason: it waited for
the picture to be `complete && naturalWidth > 0`, which the page **already on screen**
satisfies immediately, so it counted the old page. It has to remember the `src` and wait for
a *different* blob — the identity of what arrived, never its readiness. A check that can be
satisfied by the state it is meant to detect a change from is not a check.

What is still owed on those rows: §15c's ⧉ hands the file to an OS viewer nothing here can
watch, §17c wants a second one-page fixture, and §17d is a judgement about whether a page at
70vh actually reads.

**Six defects and two feature groups from daily use landed on 23 August 2026**, on top of
`v0.10.6`. Three carry decisions. **B82** — the capture window and the library's note editor
share one title field and one status bar, and that bar is at the *foot* in both. **B83** —
search is scoped to the folder the tree is standing in, and everything under it, with a
switch to the whole vault. **B84** — the query language leaves the search box's placeholder
for a panel under it that stays readable while you type. The other five needed no decision:
"Exit tasks" moved down beside the task count, the header's completion panels stopped painting
out through the right-hand window edge, the shortcut sheet's two columns are balanced, the
Tasks scope chooser offers only folders that have tasks, and the Empty-trash confirmation
counts folders and files as well as notes.

**The bullet fix is the one worth reading the reasoning for, because the report was wrong in
two useful ways.** It came in as "levels one and two are smaller than the square at level
three, on macOS". Measured at four times size in a real Chromium, `\2022` and `\25E6` carry
0.293em of ink against `\25AA`'s 0.504em *in a single face* — U+25AA is small next to U+25A0
rather than next to a bullet, so no font was ever going to make the old three agree, and this
was never only macOS. What macOS added is that `\2022` is General Punctuation and SF has it
while the other two are Geometric Shapes and SF does not, so a Mac drew level one from the
system face and the rest from a fallback. Levels one and two are `\25CF` and `\25CB` now:
all three levels are Geometric Shapes, so they fall back *together*, and no `font-family` had
to be pinned. `font-size` on the `::marker` was tried first and rendered wrong — the gap is an
em space in the marker's own font, so it scaled with the glyph and the enlarged marker grew
every line box with it. The wider glyph cost one number instead, `--marker-slot`, now
per-depth; the square's new 1.66em is a fix rather than a consequence, since the single 1.5em
it replaces was tuned to the old bullet and left level three's checkbox 2.5px off its own
marker. All three levels now land within a quarter-pixel on both axes, which the version they
replace did not.

**One bug in this batch shipped past a green suite and was caught by driving the app**, and it
is the batch's most useful hour. B82's shared title rule was written as a bare `.title-field`
— one class — while the capture window's title sits inside `.header`, where `.header input` is
one class *and one element*. It lost the cascade, the window it was mostly for did not change
at all, and the comment above the rule asserted in so many words that it was "two classes
deep". B48's bug and the `.overlay` bug for the third time. Two things about finding it are
worth keeping. It was **stacked with a second cause**: `npm run drive:capture` runs `out/` and
does not build, so the first three attempts at confirming the fix were looking at a stale
bundle — the same symptom, a change that appears to do nothing. And it was settled by reading
`getComputedStyle` off the real field rather than judging a screenshot, which needed
`Emulation.setFocusEmulationEnabled` before `:focus` would match at all: under `Xvfb` there is
no window manager, so `document.activeElement` was the field while `field.matches(":focus")`
was false. All three are in `CONSTRAINTS.md`.

**Most of this batch was driven live and photographed** — the capture window's new title and
its Actions menu holding Discard, the reader's footer with status left and Insert/Actions
right, the search hint panel with the caret still in the box, the scope button correctly
absent under a tag, and "Exit tasks" on the count row. The nine `drive:capture` steps stay
green. What is left to a human is narrow and on `TEST-PROTOCOL.md` §37: the bullets on macOS
and on Windows, which is a claim about font fallback made from a sandbox that has only DejaVu
Sans; the shortcut sheet's balance, which is arithmetic here and a judgement there; and the
title field's swap between `<h1>` and input, which is exactly the thing that looked fine while
being broken.

**The release's first attempt went red, on a flake older than the batch.** Both windows
debounced a change onto a `setTimeout` and neither cancelled it on unmount — unreachable in
the app, since neither tree is ever unmounted, and routine in jsdom, where the timer fires
after teardown into a missing `window` and the throw is attributed to whichever test is
running by then. It had already taken down a `main` build the day before. It has never
failed locally: sixteen runs of the capture suites did not reproduce it, and what identified
it was the stack in the CI annotation naming the debounce. The library's copy had not been
reported and was fixed alongside it, which is the rule worth keeping — a defect class found
in one window is a grep, not a fix.

The suite is 1845 tests over 145 files. Nine new files: the shared title field's specificity
and the two windows' focus colour, the completion panels' anchoring, the shortcut sheet's
column balance, the trash count, the search scope, the syntax panel, the Tasks scope
chooser's fold, and the two windows' timers-after-teardown.

**Twelve items from the same day's use landed on 23 August 2026**, on top of that batch and
before a tag — the shape those two batches make together is the point: the first one built the
two windows' shared chrome, and this one is what a day of actually using it reported back.
Two carry decisions: **B85** — discard asks first, unless the note is empty — and **B86** — the
Empty-trash question says what emptying it *costs*, not only what is in it. B82 is revisited on
two points in its own entry.

**The bullets are the second decision made twice, and it is the useful one to read.** The batch
before this one enlarged levels one and two to `\25CF`/`\25CB` so all three levels would agree
in size, having measured that `\25AA` really is 1.7× the bullet in a single face. In daily use
that read as far too heavy — a filled circle at 0.668em of ink against the 0.293em it replaced,
at the two depths every note actually uses. The small glyphs came back. What survives from the
first fix is the half that was genuinely about the square: its own 1.66em `--marker-slot`, and
its own ink centre, now carried per depth as `--check-bottom`/`--star-bottom` rather than by the
single constant that could only ever match one of the two — tuned to the bullet it left level
three's checkbox 0.115em high, tuned to the square it did the same to every note. So the state
after this batch is strictly better than either version before it, and the stated cost is one
sentence: `\2022` is General Punctuation where the other two are Geometric Shapes, so on a Mac
level one falls back to a different face than the levels under it. A fallback difference at one
depth, against a marker that was too large at two. `font-size` on the `::marker` is still not
the way, for the reason the last batch measured.

**Focus after a move was the report with a cause one layer below where it was reported.** "After
moving a note the focus within the folder list is lost — it takes multiple tabs to get back."
Nothing takes focus away; the `<li>` holding it is *unmounted*, because the note it drew is no
longer in this folder, and focus falls to `<body>`. `NoteList` already recovers its roving row
on its own — `active` falls back to the first note when the path it was on is gone — and cannot
recover focus, because nothing told it to take any. The fix is the flag the Tasks and search
exits already use, plus a decision about which row to stand on: the one above the note that
left, since after taking something out of a list the eye is where the thing above it was. Only
when the note that moved is the one being read, which is every move made from the list or the
reader; a row dragged out while something else is open changes neither the reader nor where
focus is, because the caret may be in the editor.

**The trash question grew two numbers that are not counts of things in the trash.** The open
tasks in the notes about to go — because what someone wants to know first is whether anything
still to be *done* leaves with them — and the attachments that would be left unreferenced,
which are not in the trash and are not deleted at all. That second one is exact rather than a
guess: a trashed note counts as a reference for as long as it can be restored, so a picture only
that note embeds is not unlinked today and becomes unlinked the moment the trash is emptied;
`attachmentsOrphanedByTrash` subtracts every target the index knows for the live notes, which is
the same set the Unlinked attachments pane already reads and the reason the vault is not walked
a second time. Per item, the "Delete permanently" question counts the same way, walking a folder
in the trash for the reason the whole-trash count is recursive.

**Discard's confirmation is a reversal with a stated reason, not a change of mind about B54.**
Discarding writes the draft to `_trash` and Restore is the way back — which is exactly why
dragging a note onto the trash asks nothing, and why this asked nothing either. What that misses
is that discard here is bound to a chord, sits one item into a menu at the foot of a window
someone is typing in, and takes the window with it: there is nothing left on screen afterwards
to notice by. The question is only ever raised for a note with something in it, and "something"
is judged by the document's **structure** rather than its text — a note holding nothing but a
pasted picture has no text at all, and is the one thing that could not be retyped. `dirtyRef`
was the obvious signal and the wrong one: it over-reports by design and stays true after a
character is typed and deleted again, so a visibly empty window would still have asked.

**One report in this batch was not reproducible and is written down as such.** "In the Tasks
view, sub-folders at any level that hold no tasks should not be in the scope dropdown." Read
against `foldersWithTasks`, that is what the code already does — the filter matches note paths
by prefix, so it rolls up through any depth — and two new tests at three and four levels deep
pass unchanged. What can still put a taskless folder in that list is documented and deliberate:
the vault root, which is never a lie; the folder the view is currently scoped to, because a
`<select>` whose value is not among its options renders blank; and the window before the index
has answered, when everything is offered rather than nothing. A fourth possibility is worth
naming because it is the likeliest thing to have been seen: the filter asks `total`, not `open`,
so a folder whose tasks are all finished stays in the list — keying it off `open` would rebuild
the chooser under the "open only" checkbox, with the folder you were standing in able to vanish
from it. That trade-off is unchanged and is the one thing here that could be decided the other
way.

The rest, in one line each: Empty trash replaces Clear trash on the button (clearing is what a
filter and a search box do, and both are one click away in this window); the capture window's
title placeholder says "Title (optional)" and is dimmed further than every other placeholder,
being the only one drawn at 17px bold; the library's note editor gained the Help button its
footer did not have, third after Insert and Actions; `.reader-header`, `.reader-footer` and
`.notes-header` are shaded on `--surface` like the capture window's own strips, with the note
list itself deliberately left on `--background`; and the three footer buttons are one rule in
`styles.css` naming both windows' groups instead of two copies that had drifted to 11px against
12px, a 4px radius against 5px, and a Help button with no border at rest beside two that had one.

Nothing in this batch has been seen on real hardware. The bullet sizes in particular are a
judgement about ink at two depths, made here from a sandbox with DejaVu Sans and no Mac — they
are `TEST-PROTOCOL.md` §38's, along with the two shaded headers and the footer buttons, which
are claims about colour that a screenshot from this machine cannot settle for a real display.

The suite is 1882 tests over 150 files. Five new files: the discard confirmation, the move's
focus hand-off, the Empty-trash question's wording, the attachments a trash-emptying would
orphan, and the two windows' shared chrome.

**Five items from a day of using `v0.11.1` landed on 23 August 2026.** Four of them are about a
surface being the wrong colour or a group of buttons standing in the wrong place, which is
exactly what the batch before this one could not settle: nothing in it had been seen on a real
display. No new decision number — **B86 is extended** to the two ordinary deletes, and the one
question §38q put to a human came back answered.

**The Tasks scope chooser asks whichever count the tick is asking.** §38's own writeup named
this as the likeliest cause of a report it could not otherwise reproduce, and as the one
trade-off in that batch that could reasonably go the other way; it went the other way. The
chooser asked `total` so that ticking "open only" could not rebuild the list under the user's
hands — but the view *opens* with that box ticked, so a folder whose tasks were all finished
stood in the list and led to an empty pane. The rebuild that argument was avoiding is real and
is answered by the rule beside it rather than by refusing to ask: `scope` is never dropped, so
the folder being stood in survives its own last task going out of scope. A filter and the list
it feeds have to ask the same question.

**Delete and Delete folder count the open tasks going with them** (B86, extended). The two
permanent deletes have counted them since the previous batch; the two that move something to
`_trash` had not, on the unstated reasoning that a reversible action needs less of a question.
It is the same fact either way — a trashed note is out of the Tasks view and out of every folder
badge at once — and Restore is a difference in the buttons rather than in the count. On a folder
the tasks are the third number in the same bracket as the notes and subfolders, walked through
the whole subtree. Two things fell out of doing it: the count's own function, `trashItemTasks`,
never had anything to do with the trash and is now `openTasksAt`, and the `delete` dialog now
carries the path it asked about, so confirming trashes **the note the sentence named** rather
than whatever `openRef` happened to hold — the same note in practice, since right-clicking a row
opens it, but not the same thing to reach for.

**The two strips B82 left out are the two you type into.** `.notes-search` and `.header-reader`
had no background of their own, so in the light theme they sat on `#fbfbfc` between strips that
are `#ffffff`. `.header-reader` is the worse of the pair: it is the same component the capture
window draws inside `.header`, which has always been `--surface`, so one shared block drew
itself two colours depending on the window it was in.

**And the capture window's footer had no left-hand group at all.** `[Insert] [Actions] [Help]`
stood in the middle of the bar while the library's stood in the corner, with both wearing the
same rule for the buttons themselves — which is why it read as a mystery rather than as drift.
`.statusbar` is `space-between` and had **four** children: three pieces of status text and the
group. The library has always had two. `.reader-status` moved into `styles.css` and names
`.capture-status` beside it, the way the buttons' rule already did. The invisible part is worth
keeping: the latency readout renders as an *empty* `<span>` until the first measurement, and an
empty element still takes a slot and a gap — it was that fourth child holding the right-hand end
of the bar, and it now sits inside the status group where it belongs anyway.

**Three of the five were driven here, and read out rather than judged.** `--library
--screenshot` and `--screenshot` under `Xvfb` on the real renderer, with the pixels taken out of
the PNGs: the search strip and the field block both measure `(255, 255, 255)` where they
measured `(251, 251, 252)` before, and the capture window's three buttons end against the right
margin. That is as far as this sandbox goes — a real display and a real theme are still
`TEST-PROTOCOL.md` §39's, along with the two behaviour rows (§39a and §39g) that no screenshot
speaks to.

The suite is 1898 tests over 151 files. One new file: the Delete folder question.

**One surface system, six roles, landed on 26 August 2026** (B87), out of a document written
the same day: `DESIGN-CRITIQUE.md`, a photographed reading of the library window that this
batch answers the second finding of and leaves the other seven open. It is the first batch
here whose subject is the *look* of the app rather than what it does, and the first whose
whole content is a colour.

**The light theme's two surface tokens were the wrong way round, and had been since the light
theme first existed** (`5051ca7`, phase 1, 25 July 2026).
`--surface: #ffffff` framing a `--background: #fbfbfc` page — so the chrome was *lighter* than
the thing it framed, which is exactly backwards. Finding 2 measured what that costs rather
than asserting it: the note list and the reader came out the same colour, divided by one pixel
at **1.28 : 1**, with the tree a further 1.6 % away. A three-pane window rested on a hairline
nobody could see. It is also why a code block, a wiki-link chip and a tag chip were all drawn
white on off-white. **The dark theme had none of it, from the same two variables** — which is
the tell, and the shape this log keeps rediscovering: a pair chosen where it works and never
checked where it doesn't.

**Six roles, declared once per theme.** `--background` is the page, `--surface` is bars, headers
and floating panels, `--field` is anything you type a value into, `--hover` and `--selected` are
the two states a row can be in, `--border` is the line between any two of them. The last three
had no name at all before. Hover and selection were `rgba(127, 127, 127, α)` with
α ∈ {0.08, 0.09, 0.10, 0.12, 0.14, 0.18, 0.20} across **fifteen** rules, which put a hovered
branch four hundredths from a selected note and made a selected branch pixel-identical to a
hovered title-bar button — two things with nothing to do with each other, in the same colour,
for no reason. They stay **translucent** and deliberately get no per-theme value: a state tint
lands on two different grounds, a white list row and a grey chrome button, and an overlay steps
relative to whatever is under it where a solid grey can only be right on one of the two.

**The dark theme keeps its five surfaces to the value** and gains the three names only —
`--field` is `#1e1f22` there, the old `--background`, because every field in this app sits
inside a `--surface` container, so that one choice leaves every dark field where it was. **The
note list stays `--background`**: "a list is not a surface" was already in `CONSTRAINTS.md` and
still holds, so the separation between the list and the reader is the divider plus the reader's
own header band, and that divider went from 1.28 : 1 to **1.39 : 1**. A third grey between them
was considered and rejected: a fourth surface to maintain for a separation something else
already draws.

**Three things fell out of the same reading.** `.header input` filled itself with its own tint
at rest and with `--background` on focus; rest is `--field` now — the same colour as every other
field in both windows — and focus stays `--background`, so a field being typed in turns the
colour of the page. In the dark theme those two are one value and the accent border carries
focus alone, which it already did for `.ask input` and `.settings select`. `color-scheme` is
finally declared, so scrollbars and the popup a `<select>` opens follow the app's theme instead
of the OS's — most visible now the content pane is pure white. And `var(--bg)` and `var(--fg)`
had been sitting in `styles.css` **declared nowhere**, resolving to nothing, in rules that
therefore did nothing and looked fine in every review; `styles-surfaces.test.ts` now holds every
`var()` against the tokens that actually exist.

**The window stopped flashing dark before its first frame.** `backgroundColor` was a hardcoded
`#1e1f22` in both window files and asked `nativeTheme` nothing. That was mildly wrong against a
`#fbfbfc` page and is the whole distance between the themes against a white one.
`windowBackground()` is the one place now, read once at construction — no `nativeTheme`
listener, because this colour exists only in the moment before the first paint and the capture
window is the one waiting on a hotkey with an 80 ms budget.

**What did not go in.** `pdfview.css` keeps its own separate variables on purpose: that window
does not load `styles.css` and taking the variables would take the whole cascade with them. Its
`--pdf-chrome` is `#f4f4f5` — the same system, arrived at separately — so there was nothing to
repair. The two amber bars (`.disk-change-bar`, `.conflict-banner`) are still hardcoded in one
colour for both themes; that is a warning colour rather than a surface, and it wants its own
thinking rather than a value picked in passing.

**Measured in a sandbox, and none of it seen on a real display.** Under `Xvfb` with the pixels
read out of the PNGs, at the five points the critique sampled: light is
`#f4f5f7` / `#d7dbe1` / `#ffffff` / `#ffffff` where the critique measured
`#ffffff` / `#dfe1e5` / `#fbfbfc` / `#fbfbfc`, and the dark theme is byte-identical at the same
five. `drive:capture` gives its nine `ok` lines. That is as far as a sandbox goes on this
subject, which is why `TEST-PROTOCOL.md` §40 is nine rows of colour for a human on both
machines — and why §39b and §39c had to be rewritten, having been telling that human to look
for white.

The suite is 1910 tests over 152 files. One new file: the surface system itself, which pins the
polarity, the two state tints, the count of grey literals left outside `:root`, and that every
`var()` names something declared.

**Four defects and two features from a day of using that batch landed on 27 August 2026**, on
top of it. Two decisions — **B88**, the note's own text size, and **B89**, a heading being
reversible — and **B87 gains an addendum** covering the two colour items. Not a patch release
like the three before it: two of the six are things the app could not do at all.

**Two of the four defects were the same variable doing two unrelated jobs.** `.branch-on
.branch-name` carried `color: var(--accent)` *and* `font-weight: 600` on top of the
`--selected` fill, while `.note-on` carried the fill alone — Finding 3's "the folder shouts and
the note whispers", so the eye reads the tree as the live pane whichever pane the keyboard is
actually in. The colour is gone and the weight stays: a folder name is one word in a column of
words and has no second line to be recognised by. "Selected" now means the fill in both panes,
which is what Finding 3 asked for in the first place. Separately and from the other end of the
same variable, `.note:focus-visible` drew `outline: 2px solid var(--accent)` with
`outline-offset: -2px`, and **Windows at 125 % display scaling paints those two pixels as
three** — a saturated `#1a63d8` box around a full-width row, reported as jarring, which is hard
to disagree with. The note list loses that ring; the tree and the task list keep theirs.

That asymmetry is deliberate and is the interesting call in the batch. Removing the ring
everywhere was the other option and is worse: `roveArrowKey` would then walk three panes with
nothing on screen following it. The note list is where the ring did least — the row the arrows
are on is nearly always the row that is open — so it is the one that can afford to lose it.
**What it costs is written down rather than left to be discovered**: focus moves without
selecting, so while arrowing through the list the focused row is now invisible until Enter
opens it. Finding 3 is therefore slightly *worse* after this batch, not better, and the answer
to it is still the pane-level treatment the critique describes — an accent edge on the active
row of the pane that has the keyboard — and not this ring back.

**A note held over a collapsed folder unfolds it after 600 ms.** The gesture every file manager
on both platforms has, and the one thing about the implementation that is not obvious is the
whole of it: the countdown is armed **before** `canDropNote` is consulted. `accepts` is false
for the note's own folder and for everything inside `_trash`, so gating the timer on it — the
obvious reading of that handler — would leave exactly the rows a drag most often has to pass
through on its way down the tree unable to open. Unfolding is not dropping, so the drop's
question is not its question. Three smaller things are load-bearing: the timer arms on a null
ref rather than on `!over`, which is still false for a whole render after `setOver(true)` while
`dragover` fires continuously; it is cleared in `dragleave`, in `drop`, on unmount, and in an
effect on `dragging` going null, because a drag released over a row that refuses it fires
*neither* `dragleave` nor `drop` here; and that last clause incidentally fixes a highlight that
used to survive an abandoned drag until the next one came past. A folder that springs open
**stays** open — Explorer's behaviour rather than Finder's, chosen because what unfolded during
the drag is where the note now is.

**A heading became reversible two ways, which is how it was reported** (B89). The complaint was
one sentence — a line that becomes a heading will not become anything else — and it was two
holes with separate causes. `setHeading` was a one-way `setBlockType`, so `Mod+1` on an H1 set
H1 again; it is a toggle now, on the same level only, judged over every textblock in the
selection rather than from `$from.parent`, since half a selection is not "already H1". The
second hole was not a bug in the sense of anything being broken, and that is exactly why it was
invisible: `listItem`'s content is `paragraph block*`, so a `heading` can never be a list item's
first child, `wrapInList` finds no wrapping and correctly returns **false** — and a `Command`
returning false is a key press that does nothing and says nothing. The heading is lifted to a
paragraph on the way in now, which is what the press meant anyway, a bulleted heading being a
shape this dialect cannot write. `test/limitations.test.ts` still holds unchanged: this route
*avoids* that shape rather than relaxing it. **The two halves go out as one transaction** — the
wrapped command runs against the intermediate state and its steps are replayed onto the first
`tr`, which is sound because `state.apply(tr).doc` *is* `tr.doc` — because undone separately,
the first Ctrl+Z would leave a paragraph where a heading was, a state nobody asked for and
nobody can name.

**The note has a text size** (B88): five steps in Settings, 13 to 20, per machine. One token
does all of it, and only because the groundwork was already there — everything inside
`.editor-content` was already expressed in `em` against a single `px` literal, the headings at
`1.5em` / `1.28em` / `1.12em`, `pre` at `0.86em`, `code` at `0.88em`, the wiki chips at `0.9em`,
the list gutter at `1.5em`. That was taste rather than rule, which is precisely the kind of
property that quietly stops being true, so `styles-editor-font-size.test.ts` now holds every
`font-size` under `.editor-content` to `em` or the token, with one exemption named out loud
rather than pattern-matched away: `.table-tool`, the table toolbar's buttons, which are chrome
that happens to be drawn inside the document. The chrome around the note does not scale — the
OS already has a setting for that question. **Per machine and not per note**, which was the
question actually asked: a size per note would put a display preference in the frontmatter,
where `03-markdown-dialect.md` defines none, travelling to the other machine and to Obsidian as
noise and making "reading a note on a laptop" a change to that note. Main clamps the value
between 10 and 32, because `settings.json` is a file a person can open and
`--editor-font-size: 0px` is a window with no note in it and no way back to the panel that
would fix it.

**And that setting turned up a hole three decisions old.** Main has been broadcasting "a
setting changed" to both windows since B60, and **neither window ever acted on it**. It was
sent as `libraryRefresh` — which means "ask the vault again", and every save raises it — so the
library answered it by reloading the tree, the notes, the facets and the conflicts, none of
which is where a language or a font size lives, and the capture window subscribed to that
channel not at all. Changing the language had only ever taken effect because the Settings panel
refreshes its own window on the way out. There is a real `IPC.settingsChanged` now with
`useBootstrap` as its single subscriber, so every window that draws from settings follows it
without either of them wiring it up separately — which also means the language finally reaches
the capture window. It was found by driving it: the note size landed in the capture window and
not in the library's own reader, which is the same hole seen from the other side.

**The pin on a pinned row is a button.** It only ever unpins — the mark is only drawn on a note
that has one — and it goes through the same `Library.tsx` `setPinned` the context-menu item and
the chord already use, which is where main's two refusals become a dialog and where the list is
reloaded. Both pointer events are stopped at the button, or taking a pin off would also select
the row and, on a double-click, open it in the capture window.

**More of this batch was driven than usual, and two items with real input rather than synthetic
events.** Twelve CDP checks under `Xvfb`, all `ok`. The spring-loaded folder went through
`Input.setInterceptDrags` + `Input.dispatchDragEvent`, which is a genuine HTML5 drag and not a
`dispatchEvent` that happens to be named one — including the case the feature turns on, a
parent that unfolds while refusing the drop itself — and the note really left the folder it was
dragged out of. The heading chords went through `Input.dispatchKeyEvent` into the capture
window's own keymap. The pin was clicked at real coordinates and left the selection where it
was. The pixels were read out of the PNGs: no `#1a63d8` on any of the four edges of the selected
note row, the selected folder's label at `--text`, and the H1 "Kwartaalplan" measuring
142 / 174 / 219 px wide at 13 / 16 / 20, against 141.4 and 217.5 predicted — within a pixel of
hinting, which is the evidence for "everything scales evenly". `drive:capture`'s nine still
pass after the editor CSS change.

**What a sandbox still could not answer** is `TEST-PROTOCOL.md` §41: Windows at a real scaling
factor, both themes on a real panel, and the two judgements no measurement makes — whether
600 ms is the right dwell, and whether losing the note list's focus ring costs more in use than
the harsh border did.

The suite is 1945 tests over 157 files. Four new files — the spring-loaded folder, the two ways
out of a heading, the two accent rules, and the note's own text size — plus `useBootstrap`'s
settings subscription, which nothing had tested before.


**Four items from a day of using `v0.12.0` landed on 27 August 2026.** Two carry decisions:
**B90** — the theme is a choice of this machine, system / light / dark — and **B91** — the
note list gets its focus ring back, because removing it never removed one. The other two are
a measurement and a missing chord.

**The theme is `nativeTheme.themeSource` and nothing else** (B90). A row in Settings beside
the text size, per machine, defaulting to "system". What makes it three lines of main rather
than a second set of rules in three stylesheets is the choice of mechanism: `themeSource` is
the knob `prefers-color-scheme` answers from, so `styles.css`, `library.css` and `pdfview.css`
go on asking exactly the question they already asked, and the parts nobody writes CSS for —
scrollbars, the popup a `<select>` opens — come along because `color-scheme: light dark` was
already declared for them. Chromium re-evaluates the query in every open renderer the moment
the source changes, so nothing is broadcast and no window reloads. It is applied in `main()`
above `createCaptureWindow()` rather than with the rest of the IPC, because
`windowBackground()` reads `shouldUseDarkColors` at each window's construction to pick the
colour painted before the first frame — set later, a machine whose choice differs from its OS
opens every window with a flash of the wrong theme, which is the defect that function exists
to have fixed. Driven under `Xvfb`: on a light-mode box, choosing dark put both the library
*and* the hidden capture window on `prefers-color-scheme: dark` with `--surface` at `#26282c`,
"system" came back to `#ffffff`/`#f4f5f7`, and the choice survived the bootstrap round trip.

**The note list's focus ring is back, and the interesting part is why removing it did nothing**
(B91). Reported as "the border round the selected note is orange, and in the folder tree it is
blue". Yesterday's batch had taken `.note:focus-visible` out of `library.css` on a Windows
report — 2px of `--accent` on a full-width row paints as three at 125 % scaling — and a `.note`
carries a roving `tabIndex`, so the row is focusable whether or not the stylesheet says
anything about it. The removal handed the ring to the UA, which draws it in the platform's own
accent colour; on the reporting Mac that was orange. So the outcome was the worst of the three
available: not "no ring" and not "the tree's ring", but a second ring in a colour chosen by a
slider in System Settings. `.branch`, `.note` and `.task-row` share one rule again, and sharing
it is the decision. The general lesson is written into `CONSTRAINTS.md`: **a rule that
suppresses a UA default cannot be deleted, only replaced by the default** — a different act
with a different result, invisible on whichever machine draws that default unobtrusively. It
also retires the cost §41b was written to weigh: with our ring gone the focused row was never
invisible, it was orange. Measured after the change: `rgb(26, 99, 216) solid 2px` at `-2px`
offset, which is `--accent` to the byte.

**The checkbox came 1 px left and the star 2 px left.** Reported against a real display after
every number in those rules had been read off a rendering at four times size — which is what
makes the report worth taking at face value: two marks placed by hand, each out by its own
amount, is each mark's own ink extent (the SVG's box, the emoji strike's) rather than one
shared mistake in `--marker-slot`, which the bullet itself is measured against and which must
not move. So each is pulled back by what it was measured out by, in `em` at the editor's own
16 px: `0.018em` → `0.0805em` for the checkbox, `0.102em` → `0.227em` for the star. `em` and
not `px` because B88's `--editor-font-size` moves the whole note at once, and a marker
corrected in pixels comes apart from its own bullet at every size but the one it was read at.
Driven as a delta rather than judged: measured in the real reader against each item's own
content edge, the boxes moved exactly 1.000 px and 2.000 px at a 16 px note.

**Settings has a chord: `Mod-.`** — `⌘.` as asked for on macOS, `Ctrl+.` elsewhere. The panel
was reachable by the title bar's gear and by nothing else, which made it the one part of the
app the `--click-button` harness could reach and the keyboard could not; the same rule B75's
pin exists for. One binding rather than two: `Mod` is the whole of what the registry knows
about the platform difference, and the cost is stated in the entry's own `why` — a Mac user who
tries `⌘,` first finds nothing. It is handled *below* `Library.tsx`'s overlay guard, unlike
`help`, and that placement is the whole of the thought: the Settings panel is where global
accelerators are recorded, a `HotkeyRow` armed inside it owns every key so that this chord can
be recorded as one, and a toggle above the guard would close the panel out from under it.

The suite is 1955 tests over 158 files. One new file — the theme row — plus the settings
chord in `keyboard-nav.test.ts`, the two corrected marker offsets, and
`styles-selection-accent.test.ts` rewritten around the ring coming back.


**The Settings chord became `Mod-,` on 27 August 2026**, one release after it shipped. It went
out as `Mod-.` — "⌘. on macOS" asked for and taken literally — and the comma was what was
meant: ⌘, is Preferences on a Mac in every application since the HIG said so, and Ctrl+, is
Settings in VS Code and its neighbours on Windows and Linux. That is what makes it a better
binding rather than merely the right one: the registry has no per-platform `keys`, `Mod` being
the whole of what it knows about the difference, so a chord that is conventional on both
platforms at once is one entry instead of a compromise. `Mod-.` is not kept as an alias — it
was a mis-spelling of this chord rather than a second way anyone reaches for it, and a claim
costs the key for as long as the app runs. Released as `v0.12.2`.


**Two defects, found by looking at the app rather than at the tests, on 30 August 2026.**
Both came out of `npm run ui:kit`: the first was in its own commit message as a known gap,
the second was hiding behind a step of `scripts/drive-capture.ts` that had been failing
about half its runs and getting away with it.

**The empty capture window draws its hint.** "Just type." had never once appeared, for two
independent reasons at the same time — `data-placeholder` was written onto the contenteditable
root while the sheet read it back from the paragraph inside, and `attr()` sees only its own
element's attributes; and the selector asked for `:empty`, which no ProseMirror paragraph is,
an empty textblock carrying a trailing `<br>` for the caret. The second reason is the one that
generalises: **CSS cannot see text**, so emptiness is not a question a stylesheet can answer at
all, and any future attempt to do this in the sheet alone is the same bug again.
`empty-placeholder.ts` decides it where the document is and carries the answer out as a
decoration, which puts the attribute on the very paragraph whose `::before` reads it — and,
like `tag-decoration.ts`, can never reach the serializer. The text arrives as a getter rather
than a string, so it follows a language change instead of staying in the one the app started
in. What let it live so long is that nothing tested the *rendered* result: three test files
mentioned "placeholder" and all three meant an `<input>`.

**A cell drag keeps its rectangle after the button comes up.** `createSelectionBetween` was
guarded by "while the button is down", and the read-back it defends against is not synchronous
with the drag — `prosemirror-view`'s DOM observer reads the native selection whenever it next
flushes, which under load is *after* `mouseup`. The guard was disarmed by then and a
`TextSelection` built out of the DOM replaced the rectangle. It is now a `SelectionClaim`
released by the next `mousedown` instead, which is safe in both directions: that press runs
before any `selectionchange` it can produce, so a caret still lands in a cell, and the claim is
asked of the live state, so it can never outlast the rectangle it protects. The investigation
is worth more than the fix: the failure looked like a flaky driver for a long time, and every
probe added to explain it made it go away. **A Heisenbug that a probe silences is still a
bug** — what found it was raising the failure rate rather than lowering it, three busy loops
on a two-core box, where it failed three runs in six and every failing timeline had the same
shape. Eight loaded runs green after the fix.

The suite is 1966 tests over 160 files. Two new files, and both exist because of where the
bugs were: `editor-placeholder.test.ts` mounts the real component and then checks the
stylesheet's own selector against the paragraph that mount produced, since a rule aimed at the
wrong element is invisible from either half alone; and `table-drag-claim.test.ts` drives the
claim directly, the pointer half of that plugin still being out of reach under vitest — which
is what this bug had been hiding behind. Released as `v0.12.3`.


**And `v0.12.3` broke the caret on its way past the rectangle, fixed the same day.** The
claim that stops a drag's stale read-back from replacing the rectangle was released by
`mousedown` and by nothing else, which reads as enough right up until you remember how little
caret motion ProseMirror performs itself: an arrow, Home, End and Ctrl+End are all moved by
the browser and read back out of the DOM afterwards, through the very guard the claim arms.
After a drag the caret could not move until something was clicked. `keydown` now drops the
claim too, as a `handleDOMEvents` entry rather than a keymap so that it runs *ahead* of the
keymaps — the key that drops the claim is the same key that then acts, not the one after it.
**A guard that has to be released is only as good as its list of releases**, and for a
selection that list is not just the mouse.

It also settled the `/` menu step of `scripts/drive-capture.ts`, which had been failing every
so often for weeks and had been written off as flaky twice. It was reading a rectangle the
drag step above it had left behind: Ctrl+End is not bound in any keymap, the browser performs
it on the native selection, and `CellSelection` is `visible = false`, so while a rectangle is
up there is nothing native to move. The step presses an arrow until the rectangle is gone and
checks rather than assumes. **A step that measures owes the steps before it a settled layout,
and a step that types owes itself a known selection** — the same lesson as the PDF ordering
one, in the other half of the state. Five runs green under six busy loops on two cores, where
it had been failing about half. Released as `v0.12.4`.

## Pane consistency: one header line across the window, both windows frameless (30 August 2026)

B92, and the answer to `DESIGN-CRITIQUE.md`'s Finding 7 — the last of the three that the
26 August photographs produced and the only one about the shape of the window itself. It
began from a worked-up design bundle (`design/design-handoff-pane-consistency/`, variant
1a). About a third of that bundle was already shipped — it had been written from screenshots
rather than from the code, so it proposed moving Insert into the footer (B82 had), removing a
duplicate sort control (B78 had) and shading the reader's strips (B87 had). **What is worth
recording is the third that was translated rather than taken.**

**The palette was kept and put on the roles.** Eleven named colours became six: the design's
pane ground and its header band are one `--surface`, its four text shades are `--text` and
`--muted`, and its two hover tints do not appear at all — that is one *state* landing on two
different grounds, which a translucent `--hover` already solves and which is exactly the
seven-alpha drift B87 cleared. Only the light theme's values move; the dark theme already
stepped the same way.

**The heights are rules, not numbers.** `PaneHeader` (40px) and `PaneFooter` (28px) draw all
four bands across both windows, and `ChromeButton` draws every button in either window's
chrome at one of three sizes. That is the whole mechanism: the failure mode Finding 7
measured was not a wrong height but *three* heights, so `styles-pane-bands.test.ts` counts
that no third one is written down anywhere in either sheet. The note list gave up two chrome
rows (78px) for one band and one footer; the search field moved into the heading, which had a
consequence the design had not seen — the heading was what said which folder you were
standing in, so the scope switch (B83) now reads the folder's own name.

**Icon-only buttons, without breaking the self-test.** `ChromeButton` makes `label`
mandatory and puts it on `aria-label` when the button draws only a glyph, and
`--click-button` falls back from `textContent` to `aria-label`. So the tree's three verbs
could become 26px icons without anything moving out of the packaged self-test's reach —
CLAUDE.md's rule met in one place instead of five. The footer buttons keep their words.

**And the glyphs are drawn, which only looking could have told us.** The design specified
`＋ ✎ ✕` as text. In the running window U+270E came out of a fallback font as something most
people would call a paperclip — beside a real paperclip six rows down, in the same column.
`npm run ui:kit` is what saw it; nothing under `test/` can see which font a character
resolves to. The same pass caught the scope switch ellipsising its own label to "All …" at
the note list's default width, which was fixed by folding "+ New note" down to its plus while
the field is open. **Two defects, both found by photographing the app**, which is the
recurring lesson of the last three batches rather than a new one.

**Both windows went frameless, with the platform's own controls inside the band.**
`titleBarStyle: "hidden"` on macOS and Windows, plus `titleBarOverlay` on Windows 11 so the
caption buttons stay the system's — which keeps the snap-layouts flyout and the system menu,
and is why that was chosen over `frame: false` with three buttons of our own. `TitleBar.tsx`
is gone, and with it the `window:minimise` / `window:toggle-maximise` IPC: the real Close
already meant save-and-put-away, because `capture-window.ts` has always intercepted it.
40px covers both platforms' controls, so the chrome costs no vertical space and the three
headings stay on one line. Linux keeps its native frame — `titleBarOverlay` is a no-op there
and hiding the frame would only lose the window manager's controls.

**What is confirmed and what is not.** The light theme was photographed at two widths and
corrected twice from what the photographs showed. Everything involving a window frame is
unseen: this sandbox is Linux, which is the one platform deliberately left framed.
`TEST-PROTOCOL.md` §45 walks it, and §45f is the row that matters most — on Windows the
application menu can no longer be drawn in a frameless window, and its Edit accelerators
used to be reachable through that bar. Chromium handles those natively in a text field, but
that is a claim about Chromium rather than a thing anyone here has watched happen.

**Six items from using that build landed on 31 August 2026**, and four of them are things no
test in this suite could have seen. Two are regressions of B92 itself, and they are the same
mistake from opposite sides.

**Both windows went frameless, which made `.pane-header` a drag region — and Chromium hands
a press inside one to the window move, never to the element under the pointer.** Two
controls in the band were never given `no-drag`: the reader's `<h1>`, which you click to
rename a note, and the `.title-field` `<input>` it trades places with in either window. So
the library's note title stopped being editable and the capture window's could not be
clicked into at all. `library-title-edit.test.ts` drives that very click, end to end, with a
real `Library` and a real ProseMirror under it — and stayed green throughout, because jsdom
implements no app-region. `styles-pane-bands.test.ts` counts the `no-drag` rules by hand now,
the two title controls included; a jsdom test asserting that a click works is not evidence
that it does.

**And the shared title rule stopped matching anything, in the window it was mostly written
for.** It was spelled `.header .title-field, .reader-header .title-field` — two classes deep
on purpose, to out-rank `.header input` — and B92 moved that input *out of* `.header` and
into the band. The rule went on reading exactly as correct as it always had while selecting
nothing, and the capture window's title fell back to a bare UA `<input>`: a box, a border,
13px, against the library's 15px/600 on nothing. It is `.pane-header .title-field` now, one
selector for both windows, because `.reader-header` **is** a `.pane-header`. The lesson is
the one `styles-title-field.test.ts` exists for, arriving a second time: a selector makes two
claims — these declarations, on these elements — and that file had only ever pinned the
first. It pins the container against the markup now.

The other four are new work. **The traffic-light clearance is 92px**, up from the 78 that was
the width of the controls and nothing more; a heading starting 14px after the last light
reads as crowding it. **The pane ring has four stops**: the note's own When / Tags / Where /
Who block sits between the list and the note, entered at whichever end you arrive at — Who
coming back, When coming forward — because from the editor, which is where a wrong date is
noticed, there was no way back up to those fields at all. It is a stop in *both* directions
so the two chords go on undoing each other. `paneOf` deliberately does not claim those
fields; the ring asks a separate `inHeaderBlock`, because the moment `paneOf` recognises one,
a plain Shift-Tab inside the block cycles the pane instead of moving one field. **`Mod-[` is
Back** after following a `[[…]]` link — ⌘[ is Back system-wide on macOS and Ctrl+[ is free on
Windows, the same trade `settings` took with the comma — and the footer's ← button keeps a
gap from the file path beside it.

**Driven, not guessed.** Five of the six were run in the real app under `Xvfb` over CDP
before this was written, with real XTEST keys and real pointer coordinates: the capture title
measured `15px`/`600` on a transparent ground and took a real click, the reader's `<h1>`
reported `no-drag` and opened its rename from a real click, the ring walked
editor → Who → row → When → editor, Shift-Tab from Who reached Where, and `Ctrl+[` walked
back from a followed link. Two things about the harness are worth keeping: `Ctrl+Tab` is
claimed by main in `before-input-event`, so a CDP `Input.dispatchKeyEvent` never reaches it —
only a real X press does; and `xdotool key --window` sends with `XSendEvent`, which Chromium
drops as untrusted, so the whole run reads as "the chord does nothing" when nothing was ever
delivered. `windowfocus` and then a global XTEST press is the form that works.

**The sixth cannot be driven here at all.** Linux keeps its native frame and never insets the
traffic lights, so the 92px is the one number in this batch nobody has looked at. Both
drag-region regressions *do* reproduce here, which is the useful half of the same fact:
app-region is honoured whether or not the frame is hidden. `TEST-PROTOCOL.md` §46 carries the
thirteen rows; §46a is that one. The suite is 1983 tests over 161 files.


**A data-loss bug, reported from real use on 31 August 2026 and fixed the same day (B93).**
The report was three symptoms that looked unrelated: two notes captured that morning were
silently not saved after Ctrl+Enter, a third note came back cut off at about a third of its
length, and an attempt to update from `v0.12.2` to `v0.12.4` failed with a dialog titled
"Could not check for updates" whose detail was `EPERM: operation not permitted, rename
'…\00 Inbox\2026-08-31 0914 …md.tmp' -> '…md'`.

That dialog was the evidence rather than a fourth bug. The path in it is a note, not an
update: `updater.ts`'s "Restart now" branch calls `beforeInstall()`, which is
`writer.flush()`, and its `.catch(fail)` reported the result through `reportError`. And
because `CaptureWriter.enqueue` chained every write onto one promise with no `catch`, the
error in that evening dialog was the *morning's* — `then` on a rejected promise short-
circuits and hands the same rejection on for ever, so the queue had been dead since 09:14
and was still replaying the rejection that killed it. One `EPERM` from OneDrive holding a
just-created file therefore explained all three symptoms: the two later notes were never
written at all, and the third was frozen at its last successful write. OneDrive's version
history held one version for exactly the same reason.

The recovery avenue turned out to be narrower than it first looked, and that is worth
recording. The failed write's `.tmp` was the only place the missing text ever existed —
but the writes are debounced twice (300 ms in the renderer, 800 ms in main), so the gap
between the last successful write and the failed one is a single typing burst, not the
missing two thirds. Everything after that was typed into a document that never touched the
disk in any form. The `.tmp` was gone by the time it was looked for, too, and the fixed
`${file}.tmp` name is why: the next successful write of that note overwrote it and renamed
it away, which is what happened when the app restarted after the update and the note was
opened again.

The fix is `src/main/atomic-write.ts` — one module where there were two private
`writeAtomic` copies — plus the `catch` in `enqueue`, and a save-failure notice in both
windows' footers where "Saved as …" and "Saved" used to sit unconditionally. `CaptureWriter`
now *requires* a failure handler in its constructor, so a writer that can lose work silently
is not a thing that can be built. Seventeen tests came with it, in three files:
`test/atomic-write.test.ts` for the bytes (recovery copy, unique temporaries, the temporary
kept when there is nowhere to recover to), a "a write that could not land" block in
`test/capture-writer.test.ts` for the queue, and `test/capture-save-error.test.ts` for the
window — where the assertion that matters is not that the failure appears but that
"Saved as …" *disappears* while it does. The queue block's three cases were each checked to
fail against the old `enqueue` before being kept. Suite: 2000 tests.

One thing the unique temporary name settles as a side effect: the `ENOENT … rename
'….md.tmp'` race that `test/CLAUDE.md` records as having failed the `v0.10.0` release, where
two writes of one note shared the fixed temporary and the second renamed a file the first
had already consumed. That was worked around in the test by waiting for each write's result
before provoking the next — which is the right rule for a test regardless — and the cause is
now gone from the code as well.

**Not confirmed on real hardware.** Every test here provokes the failure with a vault path
that cannot be written to, which is a faithful stand-in for the *shape* of the failure and
not for OneDrive's own timing. Whether the retry actually rides out a real OneDrive lock on
Windows — and whether `clearReadOnly` is the thing that clears it — is `TEST-PROTOCOL.md`
material and has not been seen live.
