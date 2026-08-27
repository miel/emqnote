# Constraints

This file is referenced from `CLAUDE.md`. Read it before touching code in an area a
constraint below names — each one records a rule, why it exists, and what broke when it
wasn't followed. Entries are appended as they're discovered, not reorganized, so the order
is roughly chronological rather than topical; the bold lead sentence of each is the rule
itself. Decision numbers (B1, B2, …) refer to `05-besluitenlog.md`, which has the fuller
reasoning and rejected alternatives, in Dutch per this project's language convention.


**Opening a note must not touch the file** (B10). No reformatting, no `modified` bump, no normalisation. Writes happen 800 ms after the last keystroke (or on blur/close), atomically via `.tmp` + `rename()`, and only when the serialized bytes actually differ. This is the cheapest and most effective OneDrive conflict prevention there is, and it costs only discipline — the great majority of conflict copies come from apps touching files the user did not change. `test/vault-io.test.ts` guards it.

**`package.json` `dependencies` is kept minimal on purpose.** electron-vite externalises everything listed there, so a listed package produces a bare `import` in the bundle without the folder being shipped — `ERR_MODULE_NOT_FOUND` on startup, and invisible when tested from the project directory where `node_modules` happens to exist. Build packages live in `devDependencies`. `npm run check:bundle` is the static guard and runs as part of `npm run build`. A genuine runtime package that can't be bundled (`electron-updater`, since B22; a native module like `better-sqlite3` in phase 5) *does* belong in `dependencies`, and electron-builder ships it via its own dependency walk — `electron-builder.yml`'s `files` list no longer excludes `node_modules` wholesale for exactly this reason.

**Windows gets a real installer and auto-updater; macOS gets a version check and a link** (B22). `electron-builder.yml`'s `win.target` is a per-user NSIS installer (`perMachine: false` — no admin rights needed, same as unzipping a folder), and `src/main/updater.ts` drives `electron-updater` on that path with two explicit confirmations: one before downloading, one before restarting to install. macOS deliberately does not get that: no Developer ID, no notarization, so no Squirrel.Mac-based silent install. Instead it does a plain `fetch` against the GitHub releases API and opens the release page for a manual reinstall, the same upgrade step as before. Both paths read the same public GitHub repo; `src/main/update-check.ts` holds the Electron-free parsing/comparison logic, tested directly.

**`autoUpdater` is reached with `require`, never with `await import`** (17 August 2026). That
one line is why "Check for updates…" did nothing at all on Windows for every release since
B22. electron-updater is CJS, and `autoUpdater` is its single export written as a lazy
`Object.defineProperty(exports, "autoUpdater", { get })` rather than a plain assignment —
a shape `cjs-module-lexer` does not recognise, so Node leaves it out of the ESM namespace it
synthesises while all seventeen other exports come through. `const { autoUpdater } = await
import(…)` therefore yielded `undefined`, the next line threw on `undefined.autoDownload`,
and both callers are `void checkForUpdates(…)`, so the throw became an unhandled rejection
and the tray click produced nothing. Three things follow. **It could only ever fail on
Windows**, because `checkMac` is a plain `fetch` and `checkWindows` is the only code in the
app that loads electron-updater at all — so the one platform running that line was the one
platform nobody could debug. **No test could have caught it, and the obvious test would have
asserted it away**: under vitest the import goes through Vite's own interop, which builds the
namespace by reading the exports object, so `autoUpdater` is right there and passing —
`test/updater-import.test.ts` spawns a real `node` for that case specifically. Same family as
B36's trailing slash and B40's missing `corsEnabled`: a property of the runtime, not of this
source tree. And **`checkForUpdates` now catches its own failures** and routes them through
`reportError`, so the next thing that goes wrong on this path says so instead of doing
nothing — `trash-delete.ts`'s "a refusal names itself", applied to the one feature whose only
output is a dialog. Verified by driving the built bundle's own `createRequire` line inside
the real packaged `app.asar` against the live GitHub release: a genuine `NsisUpdater`, "Up to
date" at 0.8.8 and "Update available → 0.8.8" at 0.8.0.

**Electron's default application menu is removed** (`installMinimalMenu`). Its accelerators are the reason: it claimed Ctrl+M for Minimise, so indenting inside a list minimised the window. This entry used to say the menu was "invisible on a frameless window", which is true of the capture window and of nothing else — and saying it here, in the one place that sets the menu for the whole app, is what kept a Windows bug invisible for months: on Windows the menu is drawn *per window*, so the library and PDF windows, both natively framed, grew a real "Edit" strip above their contents. Both carry `autoHideMenuBar: true` now — a no-op on macOS, and deliberately not `setMenu(null)`, which would take the Edit roles with it. Only the Edit clipboard roles stay, because on macOS the menu is what makes Cmd+C/Cmd+V work at all. macOS additionally gets an application submenu, because without one Cmd+Q was dead — but its Quit item is a custom click, never `{ role: "quit" }`: **Cmd+Q closes a window, it does not quit the app** (B25). The library window closes; the capture window commits and hides; the resident process survives both, which is the whole premise of B2/B3. The item is still labelled "Quit emqnote" for muscle memory, and the tray item of that name remains the only real exit.

**The capture window is hidden, never destroyed.** `capture-window.ts` holds exactly one `BrowserWindow` reference, assigned once, so a destroyed window is unrecoverable: `reveal()` fails on `isDestroyed()` forever — hotkey and New note silently dead — and `hideCaptureWindow()` never runs, so `writer.finish()` never releases the loaded note and the library reports it "open for editing" in a window that no longer exists. On macOS the traffic lights are real (`titleBarStyle: "hidden"`), so the red button would do exactly that. The `close` handler therefore calls `preventDefault()` and routes to `hideCaptureWindow()`, the same commit-and-put-away path `IPC.captureClose` uses. A `quitting` flag, set from `before-quit`, lets a genuine quit through — without it the tray's Quit hangs on that `preventDefault()`. `reveal()` keeps its `isDestroyed()` guard but now recreates the window rather than returning.

**The pane cycle is claimed in main, not in the window.** `Ctrl+Tab`/`Ctrl+Shift+Tab` (`cyclePanes`, B32) is caught by `library-window.ts`'s `before-input-event`, which `preventDefault`s it and forwards the *intent* over `IPC.libraryCyclePanes`; `Library.tsx` runs the tree → notes → editor ring from there, and its `keydown` listener now handles only plain Tab and Escape. Main asks `matches(shortcut("cyclePanes"), …)` rather than comparing `input`'s fields, so the chord has one spelling — the one the help sheet prints. This is a fix for a Windows report whose cause was never found (see the batch note below), so the thing to know before changing it is *why* it is there rather than in the renderer: `before-input-event` runs ahead of every native accelerator and ahead of the page, which is the only position that helps against an unidentified consumer. It replaced the renderer branch rather than joining it — with main preventing the default, a second branch could only fire when the forward had already failed.

**An editor chord can be claimed in main too, and one of them is** (`editor-keys.ts`, 17 August 2026). `Mod+Shift+T` — the checkbox item — was reported doing nothing on Windows, which is the Ctrl+Tab report's exact shape: the command is fine (`toggleTask` covers a plain paragraph, a bullet list and a numbered one), the chord is spelled once in `shortcuts.ts`, and nothing here can see what eats it. So it takes the same fix at the same position, extended to the window that had no `before-input-event` handler at all — the capture window, which is where notes are written. Three things are load-bearing. **The matching is a pure function** (`editorKeyIntent`), so the half that can be tested is; the claim itself is an Electron event. **The renderer runs it only when the editor has focus** — `Editor.tsx` subscribes to `IPC.editorCommand` and checks `view.hasFocus()`, because main cannot tell the caret in the note from the caret in the subject field, and a chord that suddenly worked from the note list would be a second behaviour nobody asked for. And **the keymap entry stays** even though it no longer fires: it is what the help sheet prints and what `shortcuts.test.ts` checks, and the registry is where a chord is defined. Measured on Linux with real XTEST keys: after the claim the `T` never reaches the page while an unclaimed `Ctrl+Shift+L` still does, and the task item appears anyway.


**A list command lifts a heading first, in one transaction** (B89, `overParagraphs` in
`commands.ts`). `listItem`'s content is `paragraph block*`, so a `heading` can never be a
list item's first child: `wrapInList` finds no wrapping and returns **false**, which is a
key press that does nothing and says nothing. The heading is turned into a paragraph on the
way in — the shape the dialect cannot write is avoided, never allowed, and
`test/limitations.test.ts` still holds. **The two halves go out as one transaction**: the
wrapped command runs against the intermediate state and its steps are replayed onto the
first `tr`, which is sound because `state.apply(tr).doc` *is* `tr.doc`. Dispatching twice
would put a paragraph-where-a-heading-was between two presses of Ctrl+Z — a state nobody
asked for and nobody can name. (`withList` in the same file dispatches twice and is right
to: both of its halves are list edits that read as one change either way.) The probe runs
first with no `dispatch`, so a command that would genuinely decline still declines rather
than flattening the heading on its way to doing nothing. And `setHeading` is a **toggle** on
the same level only, judged over every textblock in the selection rather than from
`$from.parent`: half a selection is not "already H1".
**Windows reported it unchanged twice more, and `--key-probe` then closed it** (B71). On the
reporting machine `Shift+T` logs a `KeyT` line and `Ctrl+T` logs a `KeyT` line, while
`Ctrl+Shift+T` logs **no `KeyT` at all** — a `Ctrl+C` arrives in its place, Shift stripped and
lowercase. That substitution was the clue: a passive `RegisterHotKey` grab produces silence,
an injected keystroke means a macro tool. It was **an AutoHotkey script the machine's own owner
had written**, rewriting the chord to `Ctrl+C` to escape another command. Not Windows, not
Chromium, not this source tree — so **nothing was changed**: `Mod-Shift-t` is still first and
`Mod-Shift-d` still sits beside it. Keep both claims above; they are correct on their own terms
and cost nothing. What this is worth remembering for is that two repairs shipped against a cause
nobody had measured, and the measurement took one log file.

**Both global accelerators are registered by one function** (B60). `registerGlobalHotkeys` in `index.ts` reads `settings.hotkey` and `settings.libraryHotkey` and claims both; every path that changes a chord goes through it. That is not tidiness: `globalShortcut` cannot give up one claim without knowing what it was, so every caller used `unregisterAll()` — which, the moment there are two hotkeys, silently drops the other one. The handlers save first and register second, then roll the setting back if the OS refused, because the register step reads the settings file. `Mod+O` stays as the in-window form; the global chord is a *setting*, not a `shortcuts.ts` entry, and the help sheet draws it the same way it draws the capture hotkey.

**A deliberate launch opens the library; a login start stays silent** (B61). `shouldOpenLibraryAtLaunch` in `launch-options.ts` is the whole rule, pure and separate from the launch that carries it out, because two entry points ask it: the first instance about its own argv, and `second-instance` about the argv the relaunch handed over — clicking the shortcut of a running app is the same gesture as clicking the shortcut of a stopped one. macOS asks a third time through `activate`, since an `LSUIElement` app with no dock icon never sees a second instance. **The signal is an argument on the login item**, written by `applyLoginItem` and nowhere else: `setLoginItemSettings` used to be called with `{ openAtLogin }` alone, so nothing distinguished the two launches, and the tray's own checkbox set it directly — a second call site that would have dropped the argument on the first toggle. macOS's `wasOpenedAtLogin` is read alongside the flag rather than instead of it, because an entry written by an older version carries no flag until it is rewritten.

**Windows path limits and reserved names.** Filenames follow `YYYY-MM-DD HHmm Subject.md`, truncated at 80 chars, forbidden characters `\ / : * ? " < > |` replaced by `-`, reserved names (`CON`, `PRN`, `COM1`…) suffixed with `_`, no trailing dot or space. `src/main/filename.ts`, tested in `test/filename.test.ts`.

**A `#` that opens a tag is not escaped at the start of a line** (B19). Everywhere else a line-initial `#` becomes `\#`, because it could begin a heading — but `\#klantx` is not a tag to Obsidian, and half the tags in the vault being silently inert is exactly what B7 forbids. The exception is narrow: `startsWithTag` in `src/markdown/tags.ts` requires a tag character immediately after the hash, so `\# Dit is geen kop` keeps its backslash. It is implemented as a custom `text` handler in `pipeline.ts` that cuts the value around the hash and runs the pieces through `state.safe` separately — never by unescaping the output afterwards, which would eat a literal backslash the user typed.

**`HeaderBlock` serves two windows, through a `variant` prop.** One shape now, not two: a fixed two-row grid of When / Tags / Where / Who, on every note, in both windows (B20). `capture` adds the subject field; `reader` has none, because the title belongs to Rename, which renames the file with it, and a second way to change it would let the two drift. One component so the attendee/tag parsing and the date editing exist once.

**There is no meeting button** (B23). A meeting is marked with a tag like anything else. `type:` stays in the format — required field, both values, seven corpus fixtures, and `type:meeting` still works in the search bar — but nothing in the UI sets it, and `HeaderValues.kind` only ever passes through whatever the note already had. Removing the field from the format instead would rewrite every existing meeting note's frontmatter on the first save, which is B10 approached from the wrong side.

**The four header fields are the same width, and the grid is what makes them so.** `grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr)` — the `minmax(0, …)` matters: a plain `1fr` is `minmax(auto, 1fr)`, so the When cell's nowrap date button sets a min-content floor and widens its column past the other. `.header-cell input, .header-cell button` share `flex: 1`, so the date control fills its cell like the text fields do rather than sitting at its intrinsic width.

The English word for the `attendees:` field is **People** in the UI and **attendees** everywhere else, and that asymmetry is deliberate: the frontmatter key is `attendees:`, and renaming it would break every existing note and Obsidian compatibility (B7). Only `capture.people` — the placeholder — carries the new word.

In the library the header values live in their own `header` state, deliberately not folded into `open`: an effect reloads the document into the editor whenever `open` changes, so header values there would rebuild the document on every keystroke and throw the caret away.

**The index scan starts at launch, not at the first question.** `main()` calls `vault-scan.ts`'s `startScan` right after `prepareVault()` — beside the watcher, skipped during `--selftest` for the same reason, and deliberately not awaited, so it never sits in front of the tray, the hotkey or the capture window's first paint. It shares `ensureScanned`'s collapse, so a library opened mid-walk joins the scan already running rather than starting a rival one over the same files on the thread the hotkey also uses. Progress goes to a thin bar at the top of the library (`IPC.libraryScanProgress`, throttled; `IPC.libraryScanState` for a window that opened partway through and missed the events).

**The walk itself runs in a worker thread** (`scan-worker.ts`, started by `scan-host.ts`) — the last thing §7.2 asked for. `vault-scan.ts` does not know that: it owns *when* a scan happens and the collapse that keeps two from running at once, and calls a `ScanRunner`; `index.ts` installs the worker one, and the default is the plain in-process `fullScan`, which is what keeps the whole module testable without a build. Three things this forced, each of which is load-bearing:

- **The worker opens the index a second time**, because a `better-sqlite3` handle cannot cross a thread. That works because of WAL (`index-db.ts`'s `migrate`): a reader never waits on a writer, and every library question is a read. Two *writers* (the worker, and the watcher on the main thread) can still collide, so `busy_timeout` is set — without it the loser throws `SQLITE_BUSY` and silently drops an update.
- **The worker must reach no Electron module**, since a worker thread has none. That is not a source-tree property but a rollup-chunking one, so `check:bundle` walks the worker's import graph and fails on `electron`; it also walks every emitted chunk now, not just the two entries, or a bare import could hide one indirection away.
- **The fallback is deliberate and logs.** If the worker cannot start, `scan-host.ts` scans on the main thread instead. A missing worker entry is the same class of bug as a missing `dependencies` entry (invisible from the project directory, fatal in the package), and without the fallback the symptom would be an empty index — no tags, no people, no search, no conflict banner — with nothing on screen saying why.

Measured on a generated 4000-note vault (this Linux sandbox, not the Mac mini): the worst single main-thread stall went from ~470–535 ms to 7–29 ms, with the total scan time unchanged. The old figure is the honest one to remember about the in-process version — `fullScan` yields every hundred files, but a hundred files is half a second of work, so the yielding bounded nothing that mattered next to an 80 ms hotkey budget. ESM workers were confirmed to load from inside a packaged `app.asar`, shared chunks and all, before this was built on.

**Dragging a note onto a folder and "Move to…" are one operation, not two.** `Library.tsx`'s `moveNoteTo` is what both call; the dialog reaches a folder four levels deep without hunting for it, the drag reaches one already in front of you. The rules live in `src/renderer/library/drag.ts` — `canDropNote` answers for the drop *and* for the highlight that precedes it, so a folder can never light up and then refuse. **The trash is a destination since B54**, and the drop routes through the same `trashNote` Delete uses rather than through `moveNoteTo`, so there is one way into `_trash`. It takes no confirmation, which reverses this file's own earlier reasoning on purpose: that argument ("the one gesture with no confirmation must not be the one that destroys something") held only while there was no way back, and Restore is now the named handling that undoes it. Only the trash *root* is a destination, never a folder inside it — Delete files everything flat, so a deeper drop would mean nothing. Nothing drags out of the trash, which is the same sentence read the other way: restoring is a deliberate act, not a consequence of having grabbed the wrong row. The drag type is private (`application/x-emqnote-path`), never `text/plain`, which would make every row draggable into any text field on the machine. `onDrop` re-checks `canDropNote` against the path in the drop rather than trusting the highlight's state, so the consequential half never depends on a render having landed.


**The spring-open timer is armed before `canDropNote` is asked, and that ordering is the
whole feature.** A note held over a collapsed folder unfolds it after `SPRING_MS` (600 ms,
in `drag.ts` with the rest of the drag rules). `Branch`'s `onDragOver` has an early return
on `accepts` — the highlight, the `dropEffect` and `preventDefault` all belong behind it —
and putting the countdown behind it as well is the obvious reading and is wrong: `accepts`
is false for the note's *own* folder and for everything inside `_trash`, so exactly the
rows a drag most often has to pass through on its way down the tree would be the ones
unable to open. Unfolding is not dropping, so the drop's question is not its question.
Three other things are load-bearing. The timer is armed on `springTimer.current === null`
and never on `!over`, which is still false for a whole render after `setOver(true)` while
`dragover` fires continuously. It is cleared in `onDragLeave`, in `onDrop`, on unmount, and
in an effect on `dragging` going null — a drag released over a row that refuses it, or
cancelled with Escape, fires *neither* `dragleave` nor `drop` here, and that same effect is
what finally clears a highlight that used to survive until the next drag came past. And a
folder that springs open **stays** open: what unfolded during the drag is where the note
now is, and folding it again would hide the answer. `test/folder-tree-spring.test.ts` pins
all of it; the real HTML5 drag, which is the half jsdom cannot have, was driven over CDP
with `Input.setInterceptDrags` + `Input.dispatchDragEvent`.
**`IPC.libraryMoveNote` refuses a note the capture window has claimed.** `CaptureWriter`'s session holds the path it will write to, decided when the note was loaded; moving the file does not update it, so the next debounced write recreates the note where it used to be — one note in two folders, the second written by a window that thinks it is still editing the first. The move dialog could only ever reach a note the reader had open; dragging can reach any row in the list, which is what turned this from a note into a guard.

**Task state lives in the index, and the index knows its own schema version** (B26). `checked` is an attribute on `listItem`, not text, so `plainText()` drops it and FTS5 can say nothing about it — the Tasks view is answered from a `note_tasks` table filled by `buildRecord`, which the full scan and the watcher already share, and never by re-parsing a folder subtree on demand. That walk is the 470–535 ms main-thread stall that pushed the scan into a worker; reaching for it again through the back door undoes that. Because `needsRefresh` short-circuits on unchanged `mtime`+`size`, an existing index can never gain new columns on its own, so `migrate()` carries a `PRAGMA user_version` and drops its tables on a bump. That is allowed *because* of B9: the index is a derived cache outside the vault, so a rebuild costs one scan and destroys nothing. Any future column added to `NoteRecord` must bump that version.

**Pinning a note does not touch `modified`** (B75, `setPinned` in `vault-io.ts`). This is
the thing about the feature most likely to be undone by accident, since every other write in
that file stamps it. A pin is not an edit of the note: bumping `modified` would push the
note to the top of the default sort for a reason that has nothing to do with its contents —
reordering the very list the pin exists to fix — and would tell the other machine that
something inside the file changed. It is why `setPinned` cannot go through `saveNote`, which
always stamps. Otherwise it is `toggleTask`'s shape exactly: read, `parseNote`, change one
thing, `serializeNote`, `writeAtomic` — never a text substitution (B6), and `writeAtomic`
calls `rememberOwnWrite` so the watcher does not flash a "changed on disk" bar at the person
who just clicked Pin. Unpinning removes the key rather than writing `pinned: false`, so a
note that has been pinned and unpinned is byte-identical to one that never was.

**The limit of three is per folder, and counted in main against the index** (B75, narrowed
by B77 — `MAX_PINNED` in `index.ts`, `pinnedNotesIn` in `index-db.ts`). Three *per folder*
because the folder is the unit the feature is about: three current things in this project,
and a fourth project must not be refused because three others spent the allowance. The
immediate folder only — `folderOf` takes the last segment off, so a subfolder has an
allowance of its own; rolling subfolders up would make one note count against several
folders at once, and then the answer depends on which of them you happened to be standing
in. Counted in main and not in the renderer, and **that argument got stronger rather than
weaker when the limit narrowed**: the folder being counted is very often not the one the
tree is standing in, because a note can be pinned from a tag's list or from a search
result, where the rows come from everywhere. Filtered in JS over `pinnedNotes`, with no
`folder` column and no `SCHEMA_VERSION` bump — `notes_pinned` is a partial index over
`pinned = 1`, so it reads a handful of rows. (The column and the 3 → 4 bump that B75 *did*
need are still why the index knows about pins at all: `needsRefresh` only re-reads a file
whose `mtime` or `size` moved, and a column coming into existence does neither, so an older
index would have reported every note in the vault as unpinned for good.) **Unpinning is
never refused for the limit**, only for the capture-window lock: if four ever exist in one
folder — a half-finished startup scan, or a fourth arriving from the other machine through
OneDrive — the list draws four and every one of them can be taken off. The file says what
it says, and hiding one would be the app disagreeing with the vault.

**A pin orders a folder, and nothing else** (B77, `pinsApplyTo` and `sortNotes` in
`Library.tsx`, the `pinsApply` prop in `NoteList.tsx`). In a tag's list, a person's, the
tasks view or anything a search query produced, the flag is ignored: the rows stand in the
chosen sort and that is all. This follows from the limit being per folder rather than being
a taste: three pins in each of eight folders is one tag click from a list whose top two
dozen rows are pinned, and with `keepPinnedInView` on that is a sticky slab covering the
pane — the opposite of what the feature was for. Two things about it are easy to get wrong.
The predicate is `selection.kind === "folder" && searchQuery.trim() === ""` and **the query
half is not optional**: a search wins over the tree selection entirely (`loadNotes`), so
the tree still says "folder" while the rows on screen came from the whole vault. And the
shelf must be given the *same* predicate rather than inferring one from the rows — a tag's
list can open with a pinned note on top by coincidence of the sort, and shelving that row
would be the app claiming an order it did not apply. **The mark stays drawn everywhere**,
and Pin stays offered everywhere but Trash: the flag is a fact about the note, only the
order is a fact about the folder, and hiding the mark would leave a row disagreeing with
the tick in its own Pin menu item.

**The shelf of pinned rows is one wrapper, and drawn only when it is asked for** (B76,
`.notes-pinned` in `library.css`, `NoteList.tsx`). Keeping the pinned rows against the top
edge while the list scrolls is `position: sticky` on a single `li` holding them all, not on
each row: rows stuck at the same `top` paint over one another, and giving each its own
offset means measuring three variable-height rows and re-measuring on every resize. Three
things about it are load-bearing and each looks like tidying-up. The **opaque background**
is the mechanism, not styling — `.note-on` and the hover are translucent, so without it the
rows scrolling underneath read straight through the shelf and the pinned notes appear
twice. The **`role="presentation"` / `role="group"` pair** is what lets a listbox hold that
wrapper at all; the rows themselves stay in document order, which is the one thing
`roveArrowKey`'s `querySelectorAll` needs to keep Up and Down walking across the shelf's
edge. And with the setting off **no wrapper is rendered at all**, so the list is exactly
what it was before B76 — which is why the tests assert against the flat `.notes-list .note`
run in both states, and why `styles-pinned-shelf.test.ts` reads the rule rather than trusting
jsdom, which has neither a cascade nor scrolling to lose it in.

**The sort is one chooser, and its menu is `ContextMenu`** (B78, `.notes-sort .sort-choose`
in `NoteList.tsx`). It was three labels with one of them tinted — a state you had to already
know how to read. What matters for anyone editing it: the menu is the shared component
rather than a list drawn in place, because that component already carries the arrow/Home/End
walk, Escape, focus handed back to the trigger, the clamp against the window edge and the
tick, and because `--click-button` searches an open `.context-menu` in preference to the
page, so `--click-button="Modified>Title"` walks straight through it. The glyph deliberately
does **not** show a direction: there is none to choose in this app — dates are always newest
first and titles always A–Z — and an arrow implying a toggle that does not exist is an
invitation to click it. `library-sort-persist.test.ts` asserts the trigger *and* the tick,
which are two different bugs.

**`.notes-header` distributes three children, not four** (B78, `.notes-actions` in
`library.css`). It is `justify-content: space-between`, so the Tasks button added beside
+ New note is wrapped with it rather than left loose: four loose children spread count,
sort, Tasks and New note evenly across the bar and move the sort chooser away from where it
has always been. The Tasks button is handed `openTasks` itself — the very function the
sidebar's row gets, not a copy — so the two gestures cannot come to mean different scopes;
`tasks-default-scope.test.ts` drives both. Note that `"Tasks"` now matches two nodes for
`--click-button`, and `FolderTree` renders before `NoteList`, so existing selftest sequences
still reach the sidebar row.

**The capture window is portrait, and clamped to the screen it opens on** (B79,
`capture-window.ts`). 600×720 rather than the old landscape 720×440, because `.editor` is
`flex: 1` and the only elastic row: every pixel of window height lands in the body, which is
the whole content of that window. The clamp against `screen.getPrimaryDisplay().workAreaSize`
is not defensive habit — 720 tall fits a 1366×768 laptop only just, and a window taller than
the space it opens into is one whose status bar (Discard, Insert, Help) hangs below the edge
with no way to reach it. The minimums exist for the same reason: the status bar is a flex row
with no `flex-wrap` and the header is a four-column grid, so a window dragged narrow enough
crushes both rather than reflowing. Still no geometry persisted — the window is created once
and only hidden, so a drag survives the session and nothing more.

**Every row the sidebar's arrows walk through is named in one place** (`SIDEBAR_ROWS` in
`roving.ts`, 20 August 2026). Arrowing down the folder tree used to reach Trash and nothing
in between, skipping Tags, People, every facet, Tasks, Settings, Help and Unlinked — those
were click-only, with no `tabIndex`, no `onFocus` and no key handler, and `roveArrowKey`'s
selector was `[role="treeitem"]`, which only the tree's own rows carry. Trash was reachable
only because the rover's container is the whole `<nav class="tree">` and Trash is a second
`<ul role="tree">` past the footer. The footer's rows deliberately do **not** gain
`role="treeitem"`: they are destinations sitting beside a tree, not items in one, and saying
otherwise to a screen reader for the sake of a `querySelectorAll` would be a lie. So the two
sets are named together in one constant instead. **`Library.tsx`'s `paneOf` has to recognise
that same constant**, or Tab and Ctrl+Tab stop knowing which pane focus is in the moment it
lands on one of the new rows. A row needs all three of `tabIndex`, `onFocus` and `onKeyDown`
or it stops the walk dead, which is why `sidebarRowProps` hands out the trio rather than
each row spelling them out.

**Ticking a checkbox from the Tasks view re-reads and re-checks first.** `toggleTask` in `vault-io.ts` re-parses the file, walks to the n-th task item, and **verifies its text still matches what the caller was shown** before flipping anything. An index row can lag the disk, and flipping the wrong line in a file the user does not have open is the one failure mode worth designing against. Then `serializeNote` + `writeAtomic`, never a text edit — B6 applies here like everywhere else. The IPC handler refuses a note the capture window has claimed, same as `IPC.libraryMoveNote`.

**Deleting a folder is a rename into `_trash`** (B27), never `rmSync`. `trashFolder` reproduces `renameFolder`'s refusals code for code, so the renderer decodes both through one `folderErrorOf`, and the handler refuses a folder holding a note the capture window has claimed.

**Anything in the trash comes back out, and one thing at a time can be destroyed** (B54). `moveFolder` is what Restore needs that did not exist — a rename never changes which parent a folder hangs off — and it repeats `trashFolder`'s refusals with three differences that are the whole operation: the *source* may be inside `_trash`, the *destination* may not (that is `trashFolder`, and two routes to one act is how they drift), and a folder cannot move inside itself. A collision is survived rather than refused, unlike in `renameFolder`, because nobody typed this name. Its handler *is* `IPC.libraryRenameFolder`'s, extracted into one shared function so B44's and B45's two link-repair passes cannot come to differ between them. `deleteFromTrash` is `emptyTrash` at a smaller scale and sits directly beside it, sharing its guard exactly — `realpathSync` on both sides, and the target resolved as well as the folder, which `emptyTrash` never has to do because it works on `readdirSync`'s own entries while this one takes a path off IPC. **Those two are now the only code in the app that permanently deletes anything**, which is B24 restated rather than relaxed: same folder, same guard, same confirmation naming what goes. Restore and Delete permanently both keep a non-menu route — the folder toolbar swaps its three buttons for them in the trash, exactly as `NoteList` swaps *New note* for *Clear trash* there, and the reader's Actions menu does the same for a note — because `--click-button` cannot open a right-click menu, so anything living only behind one does not exist for the self-test.

**Attachments are served over `emqnote-attachment://`, not as `data:` URLs** (B28). A note with three screenshots would otherwise push each one through IPC a third larger, on every render; the orphaned-attachments screen's thumbnail kept its `data:` URL because it was one file, once — that screen is B55's pane now and draws off the protocol like everything else. `resolveAttachment` refuses anything that lands outside the vault after `realpathSync` — following the symlinks *is* the guard, the same reasoning as `emptyTrash`, which is also why its tests compare against the real path and not the one `mkdtemp` returned. Both windows carry `emqnote-attachment:` in `img-src`; the capture window had no `img-src` at all before.

**An attachment is found anywhere in the vault, and the protocol URL carries its name in the path** (B38). `resolveAttachment` tries `_attachments/` first and then the vault itself, so `![[99 - Attachments/foo.png]]` — the shape an Obsidian-written vault is full of — draws. **It never resolves a note file**, which is what keeps `IPC.openWikiLink`'s two halves apart: it asks this first and falls through to the index only on `null`, so without the exclusion `[[01 Projecten/Rules.md]]` would go to the OS viewer instead of the library. The URL shape is the other half and is not cosmetic: Chromium canonicalises the host of a `standard: true` scheme, which was **measured against a real Electron build, not reasoned about** — it lowercases the host (so every name this app did not itself write came back wrong, invisibly on macOS/Windows and fatally on Linux), and it refuses a `%2F` in one outright, `fetch` throwing "Failed to parse URL" before anything is sent. A path-form target therefore could not be *expressed*, whatever resolution was willing to find. `src/shared/attachment-url.ts` is the one place such a URL is composed and read back; the old host form is still parsed because clipboard HTML copied inside the app carries it, and `paste-images.ts` reads exactly that.

**A note says when the file it names is gone** (B39). A missing picture drew the browser's broken-image glyph and a missing file drew an ordinary chip that did nothing when clicked — both read as the app being broken. The question is asked **at draw time, but only for a target that names a file** (an extension, and not a note's): looking a file up is one `statSync`, while looking a note up needs the whole index, and a link to a note not yet written is a normal thing to have — so a note link keeps B35's click-time answer, and `styles.css`'s note on `[data-link="missing"]` still describes that case correctly. Three things hold it up: one IPC per note rather than one per chip (`missing-attachments.ts` batches on a microtask, since `setDoc` builds every NodeView in one synchronous pass); **nothing is remembered between two openings**, because an attachment can appear — a OneDrive file finishing its download, a picture just pasted — where B36's thumbnail cache remembers for the opposite reason, a render failure being a property of the bytes; and an unanswerable question marks nothing, since the marker is an accusation. The marker is B36's own ⚠, deliberately not a second one. `imageView`'s `<img>` gained a plain inline wrapper so the chip can take the picture's place — a NodeView cannot swap the element ProseMirror mounted — which is why `.wiki-embed-image-box` is in the `.ProseMirror-selectednode` list.

**Paste claims image files only.** `handlePaste` returns false for everything else so the existing text/HTML path is untouched. The Outlook `mso-list` reconstruction (§6.3) is deferred, not abandoned, and this must not preempt or complicate it. Inserting an attachment also deliberately does **not** write the `attachments:` frontmatter array: `saveNote` does not manage that field, and writing it would rewrite the header of every note that gains an image — B10 from the other side, the same objection that keeps body tags out of the frontmatter. **If that deferred work ever claims the paste itself, it must call `transformPastedImages(slice)` and dispatch with `.setMeta("paste", true)`, or the image pipeline below stops running.**

**Pasted `[[…]]`/`![[…]]` text becomes the node it names, on the spot** (B58). Nothing
claimed a plain-text paste before, so ProseMirror's stock parser put the characters in as
characters, and they only turned into a picture or a chip on the way back *off disk*, where
`normalize-phrasing.ts` reads the same syntax — which is why the app's own **Copy link**
appeared to do nothing until the note was closed and opened again. `paste-wiki.ts` is a
second `transformPasted` pass composed with the image one in `Editor.tsx`, so both windows
get it from `createEditorState`. Two things hold it up. **The syntax is not written down
twice**: `matchWikiSyntax` is the parser's own matcher, exported for exactly this, because
two spellings of one syntax is how a paste and a reopen come to disagree about the same
characters. And **this does not reopen the no-markdown-autoformat rule** — `**bold**` still
pastes as five characters and two asterisks. The `[[…]]` family is the exception because it
is the spelling this app itself puts on the clipboard, and because the literal text is not a
plainer rendering of the same thing but a broken one. A code block is left alone, its
contents being characters by definition.

**A pasted picture is downloaded into `_attachments/`, never left pointing at the web.** ProseMirror's stock HTML paste produces an `image` node holding the remote address, which serializes to `![alt](https://…)` — a note that is empty offline, empty on the other machine, and blocked by the CSP even online. `paste-images.ts` is the two halves this takes: `transformPastedImages` runs inside `transformPasted` and turns an `emqnote-attachment://` image into a `wikiEmbed` on the spot (an in-app copy, never re-downloaded), and the `remoteImages()` plugin asks main for the rest and swaps in the `wikiEmbed` when the file lands. In-flight images are tracked as a `DecorationSet`, not as positions: a download takes seconds, and `DecorationSet.map` moves the marker with the text while the user types — and collapses it away if the image is deleted or undone, so a late resolution finds nothing and does nothing. The side effect lives in the plugin's `view.update`, never in `appendTransaction`, which runs inside the dispatch cycle. **Everything the renderer might be talked into is decided again in main**, which is the point: `remote-image.ts` (Electron-free, tested directly) holds the scheme allowlist — `https:`, `http:`, `data:`, and `file:` conspicuously not — the content-type allowlist, the magic-byte sniff and the naming; `fetch-attachment.ts` does the I/O with `redirect: "manual"` and **re-checks the allowlist on every `Location` header**, which is the single check standing between a pasted URL and `file:///etc/passwd` or `http://169.254.169.254/…`. Also `credentials: "omit"`, a 10 s timeout, a 20 MB cap checked against `Content-Length` *and* while streaming, and three downloads at a time. Two asymmetries are deliberate and easy to "fix" by mistake: **SVG is refused on this path though the picker still allows one** (the user chose the picker's file; nobody chose what a pasted page's server returns, and `openAttachment` hands attachments to a viewer where script in an SVG runs), and the extension comes from the sniff, then the header, then `.png` — **never from the URL path**, so a `.png` address whose bytes are JPEG cannot produce a lying filename. A refusal answers `null`, the remote `image` node stays put, and `externalImageView` draws it as a label rather than a broken-image glyph — which also fixes the same glyph for notes written in Obsidian that already carried remote image markdown.

**A picture a note names by its web address is fetched by main, cached outside the vault, and
never fetched by the renderer** (B50). A vault written elsewhere is full of
`![Name](https://…)`, and every one of them used to draw as a grey chip. The CSP is still
closed to `https:` — what changed is *who* asks: `emqnote-remote://vault/<url>` carries the
whole address in the path (B38's measurement is why it cannot be a host: case and `%2F`), the
handler runs it through the very same `fetchImageBytes` a pasted image goes through, and the
bytes land in `<userData>/remote-images` (B9 — not `_attachments/`, which would mean opening a
note wrote into the vault, B10 from the wrong side). A note read once reads offline
afterwards. Four things are load-bearing. **The scheme has no `corsEnabled`** because nothing
`fetch()`es it — an `<img>` loads it — and that is the privilege whose absence has twice
killed a shipped feature (B36, B40), so it is the first line to change if a renderer ever
does. **The chip is drawn first and stays on any refusal**, so a blocked address, an empty
cache offline, or the setting being off all end in the state this NodeView always had.
**`loadRemoteImages` is enforced in main**, in the handler — but the renderer holds a copy and
stops asking when it is off, because Chromium answers a URL it has already drawn out of its
own image cache without consulting the handler at all (measured: the switch went off and the
pictures stayed). And **a `data:` address goes the same way** rather than straight into an
`<img>`: the capture window's CSP allows no `data:` in `img-src`, so the short cut would draw
in one window and not the other.

**An item is blank when it *draws* blank, not when its content size is zero**
(`commands.ts`'s `drawsBlank`, 20 August 2026). Enter on an empty bullet ends the list; it
was reported doing that sometimes and producing a second empty bullet other times, with no
reliable way to reproduce it. The difference is one space. Type a word on a bullet, change
your mind and hold Backspace until the bullet *looks* empty — stop one press early and the
item holds a single space, which is invisible on screen and is not `content.size === 0`, so
Enter fell through to `splitListItem`. The two cases are indistinguishable to look at, which
is the whole of the "sometimes". `exitList` also clears the whitespace it forgave, or the
caret lands after two invisible spaces on a line that is not empty and is not at its own
start. A `hardBreak` is deliberately *not* blank, and neither is an inline atom: an empty
second line is something Shift+Enter was pressed on purpose to make, and an item holding
only a picture has content even though it has no text.

**The direct-child check in `onEmptyListItem` is measured, not assumed.** A blank paragraph
deeper inside an item — inside a quote in a bullet — must not end the list, and needs no
handling here at all: `baseKeymap.Enter`'s own `liftEmptyBlock` takes it out of the quote
and leaves it in the item, which is the useful reading and the one every other editor has.

**Leaving a list must not flatten what is below it** (`nothingIsFlattened`, same day).
`exitList` escapes by lifting repeatedly, and every lift splits the list it climbs out of —
so anything still to come at a *nested* level was carried up with it and arrived at the top,
one list per level. Measured on `- A / - B / - C, ▮, - D / - E`: one press left `- A`,
`- B`, `- C`, the new line, and then `- D` and `- E` both at the top level as two separate
lists. The text survived and the outline did not, which is the one thing a note in this app
is for. It now climbs one level per press — Shift+Tab's step — whenever something nested
follows, and only takes the one-press exit when nothing does. A following item at the
*outermost* level is not counted, since it is already where the lift would leave it: that is
what keeps the common shape, an empty item at the bottom of an outline, a single press.

**And `exitList` returns `false` when it dispatched nothing.** It used to answer `true` on
the strength of having *tried*, so a lift that declined swallowed the key and Enter did
nothing at all. Whether the lift will work is asked with a dry run before anything is
dispatched, so the key falls through to `splitListItem` instead. `test/list-enter.test.ts`
is the shape matrix all three came out of — the answer to a report of the form "sometimes it
works", since it turns "sometimes" into a list of shapes that can be read.

**A star hands the marker back to the list it interrupted** (`markerBeforeStar`, B75's
neighbour, 20 August 2026). B72's star stands *where the bullet stood* rather than beside
it, so it replaces a marker instead of adding one — and Enter after one used to hand back a
plain bullet, which ends a checklist at the flagged line. It reads the marker off the items
*before* it rather than remembering anything on the node, so nothing new reaches the file
(B6) and a star that arrived from Obsidian, from a paste or from an undo answers the same as
one just typed. Starred siblings are skipped, so several flagged lines in a row still know
what they interrupted. A numbered list never reaches it: `toggleStar` declines one and
`to-mdast.ts` would drop the star anyway, the number being the marker already.

**A numbered list's gutter grows to fit the widest number in the note** (`number-gutter.ts`,
20 August 2026). An `ol` marker box is right-aligned against the content edge, so a wider
number grows *leftwards*: out of the list's 1.6em gutter, through the editor's 18px of
padding, and then off the window, which is where `1000.` was losing its first digits.
Measured at four times size, a marker's ink reaches one `ch` per digit plus two to the left
of the text column. **The floor stays 1.6em and the gutter grows only when a digit would
otherwise be cut off**, rather than whenever the marker outgrows the gutter — it outgrows it
immediately, even at one digit, and every numbered list in the vault has always leaned that
little way into the padding beside it with nothing to show for it. Sizing the gutter to
contain the marker outright would have been the tidier rule and would have moved the text of
every numbered list already written, two digits by fifteen pixels, to fix something nobody
can see. Subtracting `var(--editor-pad-x)` is what keeps one- and two-digit lists exactly
where they are. The plugin reports a **digit count and nothing else**; the arithmetic is in
`styles.css`, where `1ch` is a digit's width in the font actually in use and `1.6em` is
already written down once. Per note rather than per list, as asked. Presentation only —
nothing reaches the serializer, so there is no B6 or B10 question, the same as
`list-marker-style.ts`.

**One list stays one list.** Two lists of the same kind cannot sit against each other in a
file: the serializer alternates the bullet character to keep them apart, so `- one` is
followed by `* two`, which reads back as two lists and draws with a gap down the middle.
`liftListItem` — what Backspace does to a list item everywhere else — opens exactly that
gap when it is used from the *middle* of a list, which is how "press Enter for a new task,
change your mind, press Backspace" produced two task lists. `commands.ts` closes it from
both ends: `deleteEmptyItemBetweenSiblings` removes an empty item with items on either side
of it rather than lifting it out, and `joinAdjacentLists` rejoins the halves when a
paragraph between them is removed. An empty item at the *end* of a list still lifts out —
nothing follows, so nothing can split, and leaving the list is the useful reading there.

**Copying a list carries its markers.** `clipboardTextSerializer` is
`clipboard-text.ts`, not ProseMirror's default `textBetween`, which knows nothing about
structure and hands a plain-text target a checklist with every bullet, number and box
stripped off. The `text/html` flavour was always fine, so this is only about the plain-text
one — and it stays plain: no escaping, nothing that would make it markdown.

**A bullet can carry a star instead, and that star is in the file** (B72). `- ⭐ Bel Jan`
on disk; `starred` on `listItem` beside `checked` in memory, so the star stands where the
bullet stood and is not editable text — Backspace, Home, select-all, the plain-text
clipboard, `plainText()`, the excerpt and the Tasks view all go on treating it as the
ordinary bullet it is. `star-items.ts` reads the `⭐ ` prefix off, `pipeline.ts`'s own
`listItem` handler writes it back, and neither half means anything without the other —
exactly the `empty-tasks.ts` pair, and built on it. Four things are load-bearing.

**It has to reach the file at all**, which is the line `list-marker-style.ts` draws from the
other side: a marker that goes bold carries no meaning the file does not already hold, so
that is a `DecorationSet`; a star carries the whole point, so it is content and there is no
B6 or B10 question to answer. **An attribute and not two characters of text** — the cheap
version puts `⭐ ` in the item and styles the bullet away, and then the star is in the
search index, in the excerpt, in the task row's label and under the caret, which is what
"treated as an ordinary bullet for every other purpose" rules out. **It is exclusive with a
checkbox and with a numbered list**, because in both the marker is already taken — the box
is positioned into the marker slot and the number is the item's meaning — and that is
enforced at three doors rather than one: `toggleStar` clears `checked`, `toggleTask` and
`toggleList` clear `starred`, and `liftStarMarkers` declines to read a star out of an item
that has either, which is what lets an Obsidian-written `- [ ] ⭐ …` round-trip byte for
byte with its star as literal text. And **the spelling was measured before anything was
built on it**: `⭐` (U+2B50) is not in `mdast-util-to-markdown`'s unsafe set — that is
ASCII punctuation only — so it is never escaped in any position and needs no `state.safe`
carve-out, unlike B19's `#`. The cost is stated rather than discovered: a bullet whose text
genuinely begins `⭐ ` cannot be expressed, there being no escaped form to tell apart the
way `\[ ]` is told apart from `[ ]`. `test/limitations.test.ts` pins that;
`test/corpus/29-sterretjes.md` pins the bytes.

**Bullet, star and checkbox sit on one line and in one column** (20 August 2026, rewritten
the same day). Three things can stand in the marker slot: the bullet is a native `::marker`,
B72's star was a `::marker` with a colour emoji in it, and the task checkbox is a positioned
widget. The first attempt tuned the other two onto the bullet by **ink centroid**, measured
in a real Chromium at 4x, and got them within 0.4px of it. It was reported still wrong, in
two ways, and both reports were right.

**A centroid is not what a reader is reading.** A `<button>` does not inherit its font, so
every `em` in `.task-check`'s rule resolved against the UA's 13.333px rather than the
editor's 16px — `var(--marker-slot)` came out 20px inside that one rule and 24px in every
other, which is the single thing that variable exists to prevent, and the click target was
20px wide rather than 1.5em. It put the box's *ink* 3.4px left of the bullet's while its
*centre* sat within 0.2px of the bullet's centre. So the measurement said aligned, the
column did not look aligned, and the reported "3px too far left" was exactly right.
`font: inherit` is the fix, and **ink left edge to ink left edge** is the reference on that
axis now: what "the same column" means to a reader is where the mark starts, not where its
middle is. Vertically the centroid is still the reference — that is where its weight is.
The star moved the same way for the same reason, its glyph being more than twice the
bullet's width. The cost is stated rather than discovered: the ink extent of `⭐` varies by
platform font, so the left edge is now what is pinned where the centre would have been
stable.

**A marker positioned against the *item* is only right while the line is one line tall.**
The bullet is laid out against the **baseline of the item's first line box**; the star and
the checkbox were `position: absolute` against the `li`, at `top: 0`. On a plain item those
two frames coincide, which is why the first measurement could not tell them apart. Paste a
picture into the line and they come apart entirely: `.wiki-embed-image-box` is
`vertical-align: text-bottom`, so the line box grows *upward*, the bullet and the text ride
down to the bottom of the picture together, and the other two stay pinned to the top.
Measured with a 240x160 picture in the line: bullet 13.3px above the item's bottom, checkbox
and star **232px** above it.

**`marker-widget.ts`'s anchor is the fix, and it is why the star is a widget now.** An empty
inline-block of no size (`width: 0; height: 0; line-height: 0; vertical-align: baseline`)
joins the first line box, contributes nothing to it, and — an empty inline-block taking its
baseline from its bottom margin edge — sits exactly *on* that line's baseline. Markers hang
off it and are placed with **`bottom`**, so every vertical offset is a distance from the
baseline, the same thing the bullet is placed by. A `top` in either rule is the bug coming
back, and `styles-list-marker.test.ts` asserts the absence of one. The star could not stay a
`::before` and do this: `listItem` is `paragraph block*`, so an inline pseudo-element on the
`li` is wrapped in an anonymous block of its own and never joins the paragraph's first line
at all — which is exactly why B72's version had to be absolutely positioned in the first
place. It is a widget decoration now (`star-widget.ts`), at `pos + 2` — into the
*paragraph*, not into the item, since `pos + 1` is a block position and renders as a sibling
before the paragraph, on a line of its own. `checkbox.ts` moved from `pos + 1` to `pos + 2`
for the same reason, and its click handler walks back two positions instead of one.
**Nothing about B72's file format moves with it**: the star is still the `starred` attribute
and still reaches disk as a `⭐ ` prefix, and a widget is not content, so Backspace, Home,
select-all, `clipboard-text.ts`, `plainText()`, the excerpt and the Tasks view all go on
treating a starred item as the ordinary bullet it is.

`transform: scale()` and never `font-size` for the star's size, or every `em` in that rule —
`left`, `width`, `height` — would resolve against the new size and move the box along with
the glyph. The `::marker` still needs `content: none` beside `list-style: none`, since
`list-style` stops suppressing a marker the moment one has explicit content and the three
depth rules give it some. `styles-star.test.ts` pins that the `content: none` rule still
out-ranks those three; `styles-list-marker.test.ts` pins the construction.

**And `⭐` cannot be measured at 4x at all, which is the methodological catch.** The bullet
and the checkbox are outlines and measure the same at any size, so rendering them four times
up and dividing by four reads them honestly. `⭐` comes from a colour *bitmap* font, drawn
from whichever fixed strike is nearest and then scaled: read at 4x, `bottom` came out
0.089em too high, which is 1.4px of star sitting above its own line at real size. Its ink
also snaps to whole pixels, so a sweep at 16px finds a plateau rather than a value —
`-0.29em` through `-0.32em` all land within 0.02px of the bullet's line, while `-0.28em` and
`-0.33em` are each a whole pixel out. The shipped value is the middle of that plateau, as
far from both edges as it can be, so a platform whose emoji strike sits differently has a
pixel of room either way. **Anything touching that rule has to be checked in the running app
at 16px**, never in a magnified harness.

Verified in the running app under `Xvfb`, ink read off a live screenshot: all three markers
start at the same x to the pixel, at depths one, two and three, and sit within 0.42px of the
same 22.4px line grid — including on the lines holding a picture, where two of them used to
be 232px away.

**A bullet, a number or a checkbox follows its own line's formatting** (`list-marker-style.ts`,
17 August 2026). Bold a whole bulleted line and the `•` stayed upright, which reads as the
marker not belonging to the line it introduces. It is a `DecorationSet` putting a class on
the `listItem` and nothing else — no schema change, nothing reaching the serializer, nothing
on disk, so there is no B6 or B10 question to answer. Four things are decided rather than
incidental. **Only when the whole line carries it**: half a bold line is a formatted phrase,
and a marker that went bold for it would claim something about the item that is not true —
`isMarkActive` is no help there, being selection-based and *any* rather than all.
**Whitespace outside the run is ignored**, or a trailing space would make the marker flicker
while typing. **The CSS sets the properties on `::marker`, never on the `li`**: `font-weight`
on the item is inherited, so a plain sub-item nested inside a bold one would draw a bold
bullet of its own — the same family as B48's `display: none` and the `.overlay` dimming, and
the reason `test/styles-list-marker.test.ts` asserts the bare-`li` form is *absent*. A task
item has no marker at all, so the same pair of rules lands on `.task-check`'s SVG instead,
where CSS outranks the presentation attributes `checkbox.ts` writes. Bold and italic only:
strikethrough was asked about and refused, since a `::marker` cannot draw a line through
itself and it would mean giving up the native marker for a `::before`.

**A mode you can enter needs a way out, and Escape is only half of it.** The Tasks view and
a live search were both states the library could be put into and only left by asking for
something else — clicking a folder, a tag, anything at all, which is a way of going
somewhere rather than a way of coming back. Each has both halves now: a labelled control
(`.task-exit` reading "Exit tasks", and a `×` in the search box that appears only while
there is a query) and Escape. The control is not decoration — `--click-button` matches a
button by its text, so a gesture with no labelled twin is a gesture the packaged self-test
cannot reach, which is why nothing in this app is keyboard-only.

**Both exits hand focus back through `focusNotesOnNextList`, never on the spot.** The list
they return to arrives over IPC, so at the moment either exit runs, the rows `focusPane`
would find still belong to the list being replaced: focusing one lands on an element that is
about to be unmounted and focus falls to `<body>`. A `requestAnimationFrame` is not a fix
either, being a guess about how long a round trip takes. The flag is set by the exit and
consumed by an effect keyed on `notes`, which is the moment the new rows exist. `focusPane`
and `paneOf` are at component and module scope for this — they lived inside the pane-cycle
effect until the exits needed them, and a second copy is how the two would come to disagree
about what counts as being in a pane.

**Leaving the Tasks view is claimed by the window listener, not by the task pane** — and
that is a correction, found by driving it rather than by reading it. The first version put
`onKeyDown` on `.task-list`, which is where the key seems to belong, and it did nothing at
all for the two commonest ways of standing in that view: arriving by the sidebar row leaves
focus in the *tree*, and clicking the empty space below the last task leaves it on `<body>`.
Neither is inside the pane, so neither reached a React handler on it. A keydown bubbles to
the window from anywhere, which is the only position that answers for all of them. The
branch order matters and is written down in the code: the editor is asked about first, so a
note open beside the Tasks list keeps Escape's older meaning (back to the note list).

**Leaving a search, by contrast, is asked of both.** The box carries its own handler because
`paneOf` answers `null` for it — it is not a `.note[role="option"]` — and the window branch
covers a press on a row while the query is live. A press with no query is deliberately left
alone: Escape in the notes pane has never meant anything and still should not, which is the
one case that keeps the new branch from swallowing the key. In the real app, clicking a
search hit and pressing Escape takes **two** presses, and that is correct rather than a
bug — the click puts focus in the editor, so the first press means "back to the list" and
the second means "leave the search".

**Whoever handles a key stops it; a window listener asks the event where it happened**
(18 August 2026). Two reported bugs with one cause, and the cause is that
`preventDefault()` does not end an event. An overlay handled its own Escape and, on the way
out, restored focus to whatever opened it — so by the time the still-bubbling key reached
`Library.tsx`'s window listener, `document.activeElement` read as the editor, and the same
press *also* ran "leave the editor for the note list". One press, two things. `Mod-/` a
second time never did it, because it is not Escape: that asymmetry is the report. The same
mechanism made `Ctrl+F` open the find bar and then immediately take the caret back out of it
and put it in the vault search box, because a ProseMirror keymap command returning `true`
likewise only calls `preventDefault()` (B64). Both halves of the rule are in place and each
is correct alone: `Help.tsx`, `ContextMenu.tsx`, `slash-menu.ts` and `find-in-note.ts` call
`stopPropagation()` on the key they handled — `ContextMenu` for **every** key, since an open
menu owns the keyboard, which is the rule `Capture.tsx`'s own guard already stated for the
overlays it knew about — and the Escape branch in `Library.tsx` reads `paneOf(event.target)`
rather than `paneOf(document.activeElement)`. The Tab branch beside it deliberately keeps
`document.activeElement`: Tab genuinely is a question about where focus *is*. `slash-menu.ts`
is worth remembering for on its own — its comment asserted the key "does not reach the
window", which is exactly what kept the bug there invisible. **jsdom only reproduces half of
this**: `ContextMenu` restores focus synchronously inside its own `close()` and so fails a
test without the fix, while `Help` restores it from an unmount cleanup that jsdom runs after
the event has finished bubbling — `test/keyboard-nav.test.ts` says so where it would
otherwise look like two guards.

**A modal gives focus back, and it does it on unmount.** `Help.tsx` and `Settings.tsx` record
`document.activeElement` on mount and refocus it when they go away, which is `ContextMenu.tsx`'s
recipe with one difference that matters: `ContextMenu` restores in its own `close()`, and the
help sheet has a way out that never calls `onClose` at all — `Mod-/` a second time is caught
by the window-level listener in `Capture.tsx`/`Library.tsx`, which just flips its flag. Before
this the focused panel was simply removed, focus collapsed to `document.body`, and the next
Tab started at the top of the document: the folder tree's `+ New` button, whatever pane the
sheet was opened from. `Capture.tsx` no longer focuses the editor in its `onClose` either —
with the opener restored that only takes focus away from the subject field. `Settings.tsx`
additionally never focused its panel, so its own `trapTab` trapped nothing and Escape only
worked once something inside had been clicked.

**An empty task item is written `- [ ]`, and reading it back takes its own code.** GFM
requires a checkbox to be followed by whitespace *and* content, so a box on its own is an
ordinary bullet whose text happens to be `[ ]` — and `mdast-util-gfm-task-list-item`
inserts the box by finding the space after the bullet, which an empty item does not have,
so it dropped the box without a word. A half-written checklist therefore came back from
disk as plain bullets. `pipeline.ts`'s own `listItem` handler writes it (no trailing space
— the dialect forbids that, and `roundtrip.test.ts` checks), `empty-tasks.ts` reads it, and
neither half means anything without the other. `to-mdast.ts`'s `isEmptyList` had to learn
the same thing: a list of empty items is editing residue and gets dropped, but a box is not
residue. The escaped form `- \[ ]` still means literal brackets, and that is told apart by
looking at the *source* at the node's offset — the two parse to identical text.

**A new note's clock reads on the way in, not on the way out** (19 August 2026). Everything
the capture window clears happens on hide — `hideCaptureWindow` sends `IPC.captureReset`,
and `Capture.tsx`'s handler is where `freshHeader()` runs — and that is right for every
value but one. `created` is about *when*, and the window is hidden for exactly as long as
it is not being used, so When showed app-launch time for the first note of the day (this
window is built at startup and never destroyed) and the previous note's dismissal time for
every one after it. Discarding is what made it obvious, being the quickest way to hide and
re-show; Escape, the X and Ctrl+Enter all left the same stale stamp, and
`hideCaptureWindow`'s `isVisible()` guard means some paths never reset at all. The `onShow`
handler re-stamps it now, for a brand-new note **that has not been typed into** — one handed
over from the library owns its own date, which `onLoad` sets from the file, and `reveal()`
sends `IPC.captureShow` on every hotkey press including one aimed at a window that is
already open, so without `dirtyRef` the hotkey would quietly move the date of the note being
written. `dirtyRef` over-reports by design and that bias is the right way round here. It
updates `headerRef` in step, as `onHeaderChange` does. **The filename follows the frontmatter**, which is the other half:
`writeSession` names the file from `frontmatter.created` rather than from
`session.createdAt` (stamped in `beginSession`, which runs inside `finish` and `discard` —
the main-process copy of the same bug), and assigns the decided value back onto the session
so `renameSessionFile` reaches the same prefix on a later subject change. One source of
truth: what the When field says is what the frontmatter says is what the filename says.
Those three could already disagree before this, by editing the date before the first write.

**The Unlinked attachments row is absent when there is nothing to clean up** (19 August
2026). A cleanup screen for a vault with nothing to clean up is a place you open once to be
told there is nothing there. `Library.tsx` fetches the count through the **existing**
`IPC.libraryUnlinkedAttachments` at startup and on each `library:refresh` — not a
count-only channel beside it, which would be two answers to one question — and keeps the
whole reply in `unlinkedFiles`, so opening the pane afterwards draws its rows without a
second wait. Not run while that pane *is* the selection, where `loadNotes` already fetches
it and sets the count from the same reply; `library:refresh` arrives twice per debounced
autosave and scanning twice for it would be the flicker bug's own cost, paid again. Three
states rather than two: **absent is not zero** (B67's and B69's rule), so the row is drawn
while `unlinkedCount` is `null` and a failed refresh keeps the last count rather than
reading as an empty vault; and the row **stays while its own pane is showing** whatever the
count says, or cleaning up the last file would leave the library on a screen with no row to
click to get back out of — `FilterSection` answers the same objection by keeping a selected
facet on its list.

**A new note is filed where the library is standing; the hotkey keeps the Inbox** (B29).
`CaptureWriter.newNoteIn` sets the folder for a session that has not picked a file yet, and
`newNoteFolder` vets what arrives over IPC — absolute paths, `..` and the trash all fall
back to the Inbox rather than being refused, because a typed note has to land somewhere.
`""` is the vault root, which was browsable but unwritable before this. Moving a note
deliberately does *not* move the tree selection with it: filing an Inbox means moving one
note after another out of the same folder.

**A note file is `.md` or `.markdown`, and it keeps the extension it arrived with** (B37). `note-files.ts` is the one place that decides what counts as a note file — `isNoteFile`, `noteStem`, `noteExtension` — and every scan, watcher, folder listing, conflict check and orphan check goes through it rather than testing `endsWith(".md")` for itself. The app still writes `.md` for everything it creates (`noteFileName` is deliberately untouched), but rename, duplicate and `uniquePath`'s disambiguation all preserve the file's own extension: quietly turning someone's `.markdown` into a `.md` is not the app's call. `conflicts.ts` pairs within one extension too — a `.md` and a `.markdown` of the same name are two files, and claiming they are one note would offer a button that throws one of them away.

**An imported note gets its title from its filename, in both windows or in neither.** `titleOf` in `vault-io.ts` is shared by `summarise` and `openNote` because the two used to disagree: the list fell back to the filename stem, `openNote` returned `frontmatter.title` raw, so a note written outside this app showed a title in the list and an empty field in the editor. `created` falls back to the file's mtime for the same reason, and `HeaderBlock` draws a "Set a date…" placeholder rather than an empty button whatever it is handed — a control with no label reads as a broken layout. All of it is display-only: B10 still holds, and `test/note-files.test.ts` pins that opening such a note touches nothing.

**A `[[…]]` link's target is a path, its alias is what you read, and moving the note rewrites both** (B35). `link-resolve.ts` (Electron-free, tested directly) resolves a target in three stages — path, then title, then filename stem — and **a stage that matches does not fall through to the next one even when it matched several notes**: that is the difference between "ambiguous" (the picker) and "not found", and collapsing them would let a third note be chosen when two genuinely share a title. `note_links` in the index feeds `linkingNotes`, which resolves the whole table against one prepared index; `rewriteWikiLinks` in `vault-io.ts` does the writing through `parseNote` → mutate → `serializeNote` → `writeAtomic`, never a text substitution (B6), skipping any note `writer.activePath()` has claimed. Two things about it are load-bearing and easy to "fix" by mistake: **the confirmation is raised before the move, and dismissing it still carries the move out** — a target resolves against where the note is *now*, so after `moveNote` there is nothing left to find, and a question about a side effect must not silently undo the thing it is a side effect of — and **a link with no alias gains one spelled with its old target**, or a note nobody is looking at silently starts displaying a path where a word used to be. `IPC.openWikiLink` replaced `IPC.openAttachment` rather than sitting beside it: one click, one answer, attachment tried first because a filename is exact where the three note rules are progressively looser.

**A PDF is read in the app, in a window of its own** (B40, extending B36 rather than
replacing it). Clicking a `.pdf` opens emqnote's own viewer — `src/renderer/pdfview.ts`, a
fourth renderer entry running pdf.js against the same `pdfjs-dist` devDependency the
thumbnail uses — instead of handing the file to `shell.openPath`. `attachment-route.ts` is
the whole of the rule and draws the split from `isPreviewable`, so a `.docx` still goes to
the OS; **Open in system viewer** inside the viewer is the way back out for printing and
annotating. **The ⧉ above an *embedded* page no longer comes here** (B56): it goes straight
to the OS through `IPC.openInSystemViewer`, because B43 and B46 gave the inline page its
first page, its other pages, a Fit choice and a page box — leaving zoom, text selection and
printing as the difference, which is what the system viewer is better at anyway. This window
stays, reached from a plain `[[file.pdf]]` chip and from the file list's Open. Changing only
the *label* was refused: the button called `openWikiLink`, which sends a `.pdf` here by
definition, so it would have said one thing and done another. Three things are load-bearing. **`emqnote-attachment` needed `corsEnabled: true`
adding to its privileges**: the viewer reads the bytes with `fetch()`, and a `fetch`
enforces CORS even for a scheme this app owns end to end — the exact trap B36 already fell
into once, where every test passed and every thumbnail was silently broken in the real app.
**`openExternally` takes no argument**, because main tracks which attachment it told the
window to show and resolves it through `resolveAttachment` itself; a viewer that could name
a path would hand a malicious PDF the one capability worth having. And **nothing in the
thumbnail pipeline changed** — `pdf-thumb.ts`'s single-slot queue, `thumbnailKey` and the
404/422 handler are untouched, which is precisely why a separate window was cheaper than a
paged widget inside the note (that would have needed a per-page render and cache through
that one-deep queue, and a tall atom fighting the editor for the wheel and the caret).

**A PDF embedded with `![[…]]` draws a page in the note, and turns them** (B43, B46). The
two spellings mean two different things: `![[offerte.pdf]]` is the page at the width of the
column, `[[offerte.pdf]]` is B36's small chip that opens B40's window. The file format needed no
change at all — `from-mdast.ts` never looked at the extension behind a `![[…]]` — only a
NodeView and a bigger render. **pdf.js does not enter the editor bundle**: the capture window
draws this same NodeView and is the one that must appear inside 80 ms, so the embed asks the
existing hidden-window pipeline for a second size (`emqnote-thumb://vault/<name>?size=page`,
`PAGE_SIZE`) instead. One scheme with a size on it, not a second scheme — `resolveAttachment`'s
traversal guard, `isPreviewable` and the 404/422 split are the same decisions for both, and
the size lives in the *query* because the name is one opaque path segment (B38). Two things
are easy to get wrong. **Only a 422 is remembered, never a missing file**: a render failure is
a property of the bytes, but absence is a property of this moment (B39) — a OneDrive file
finishing its download makes it false, and the first version of this did keep a returned PDF
as a chip until the app was restarted, which is a bug that only running it can find. And
**inserting a PDF now writes `![[…]]`**, because otherwise the feature is reachable only by
typing `![[…]]` by hand, which a WYSIWYG editor does not allow; a `.docx` is still a link,
and a hand-written `[[offerte.pdf]]` is still valid and still untouched on open (B10).

B46 adds page turning to that bar — previous/next, "Page 2 of 7", a Fit toggle — and adds
**a number, not a pipeline**: `?size=page&page=3` is the same request through the same
handler, the same traversal guard, the same 404/422 split and the same one-slot hidden
window. Still no pdf.js in the capture window's bundle, which is what made it allowable at
all. Three things are load-bearing. **Page 1 is spelled without the parameter**, in the URL
and so in the cache key, or every first page already rendered into `userData` is orphaned —
one pdf.js render each to make again. **The page count comes over `IPC.pdfPageCount`, never
as a response header**: it is free at render time but has to outlive the render (after a
restart page 1 is a cache hit with nothing to ask), so it is kept as `<page-1 key>.pages`
beside the PNG — same staleness rule, same eviction — and *carried* over IPC because a
custom response header on a custom scheme is the next rung of the ladder B36 and B40 each
fell off once, invisible to every test and fatal in the real window. And **`ensureThumbnail`
now collapses concurrent identical renders**, since the embed asks for its page and its
count at once and three NodeViews of one PDF already asked three times. Fit is a second size
*on screen* — the PNG stays `PAGE_SIZE` — and zoom, text selection and the way out to the
system viewer stay in B40's window, which is what the ⧉ is still for.

That bar sits **above** the page since 14 August 2026 and is shaped like the viewer window's
own toolbar (`pdfview.css`'s `.pdfview-toolbar`), which is the bar the person using both asked
for by name: `◀ ▶`, a typed page box with its total beside it, a Fit width/Fit page select
where the window puts zoom, the filename, and a ⧉ that carries its words as well as its glyph.
It was below the page on the argument that a bar over a picture is a caption arguing with it —
true for a caption, wrong for a control strip: at `data-fit="width"` an A4 page is two or three
screens tall, so the way to reach page 2 was to scroll past page 1 first. **There is
deliberately no percentage zoom**: the page is one already-rendered `PAGE_SIZE` PNG, so a zoom
could only magnify a fixed number of pixels — real zoom stays behind the ⧉, which is what B46
already says it is for. The page box means the bar now holds an `<input>` inside a
`contenteditable`, so it needs `contentEditable = "false"` and a **`stopEvent` scoped to the
bar** — `checkbox.ts` and `table-toolbar.ts` both answer `true` unconditionally because their
DOM *is* the widget, while here the page beside it must keep reaching ProseMirror, since
clicking it is how the embed gets selected and deleted.

**An embed's pipe field means three things, and none of them is thrown away** (B74).
`![[foto.png|…]]` has one slot, and Obsidian decides what it means by pattern-matching the
string in it — a bare number is a width, `250x180` is a box, anything else is alt text. This
app follows that exactly rather than inventing a spelling (B7), on the remote form too:
`![Het logo|320](url)`. Four corner handles do the resizing, drawn only while the node is
selected; `image-resize.ts` is that half, and `embed-field.ts` is the one place the slot is
spelled, in both directions and for both node types — two spellings of one syntax is how a
paste and a reopen come to disagree about the same characters (B58).

**Nothing in that slot is discarded, and that is the point.** From the first markdown commit
(`18d1122`) the parser read the pipe half of an embed and had nowhere to put it, so every
non-numeric suffix vanished on the first save — an Obsidian note lost its alt text the moment
one character in it was edited here, silently. Understanding something and keeping it are two
different jobs, and only the first is optional. So what does not read as a size is kept
verbatim: a number outside the bounds, an empty slot that is genuinely there, and a capital
`X`. That last one is **checked in Obsidian rather than reasoned about** — `250X180` does not
resize there either, so both apps show the same thing and this is agreement, not divergence;
keeping the string instead of canonicalising it to `250x180` is then free. The comment here
first claimed the opposite, that Obsidian was looser and this was a deliberate departure from
it, with nobody having looked. B71's lesson: a claim about somebody else's software is a
measurement, not a deduction. **Alt text is stored and deliberately shown nowhere** — not on the `<img>`,
not in the excerpt, not in the index. It survives the round trip; what it should eventually
*do* is a separate question nobody is asking yet.

**This app never writes a height of its own.** The handles lock the proportions, so what a
drag produces is `|400`; a height it invented would be a second source of truth that stops
being true the moment the file behind it is replaced. A height *somebody else* wrote is a
different matter — a deliberate act — so it is drawn and kept, and a drag on such a picture
scales both numbers by the same factor and writes `|WxH` back. Undistorting somebody's picture
because they grabbed a corner would be deciding something this app cannot know.

Four more things are load-bearing. **The size is an attribute beside the target and not inside
it**, since `target` is what `resolveAttachment` resolves and what a folder rename rewrites
(B45); `rewriteTargetPrefix` rebuilds from `{ ...attrs, target }`, so it survives a rename for
free and `folder-rename-links.test.ts` says so. **The transaction lands once, on release** — the
size goes onto `img.style` during the drag and nowhere else, so a drag is one undo step and a
picture somebody thinks better of costs the file nothing. **Both NodeViews get an `update`**, or
ProseMirror destroys and rebuilds on every attribute change and the picture flashes away and
back on each release (a second probe `Image`, in the remote case). And **`stopEvent` is scoped
to the handles**, unlike `checkbox.ts` and `table-toolbar.ts` whose DOM *is* the widget: the
picture beside them must go on reaching ProseMirror or clicking it no longer selects the node
and there is no way to delete it.

**Pictures only.** The embedded PDF page keeps B46's Fit control, which is a decision taken
deliberately *against* a zoom (the page is one already-rendered PNG), so handles there would
fight it. `.wiki-embed-image-box` became `inline-block` + `position: relative` to be the
containing block — measured against a mid-sentence embed before and after, the line height and
the picture's own rect are unchanged, as long as exactly one of the box and the `<img>` carries
`vertical-align: text-bottom`.

**One slot means one thing at a time**, so a picture cannot carry both a size and alt text.
That is the format's limit, not a choice made here, and it has a consequence: resizing a
picture that has alt text replaces it. It happens in one place and on purpose —
`image-resize.ts` clears `alt` when it writes a width — rather than being left to the
serializer. The other way round, `![Grafiek|2024](…)` reads as a width, there being no escaped
form to tell the two apart; same shape as B72's star. `test/limitations.test.ts` pins both.

**A plain `[[…]]` link standing next to its own `![[…]]` embed is not drawn** (B48).
Obsidian writes both when it inserts a PDF, so an imported note reads as a full page with a
chip underneath pointing back at the page above it. `duplicate-embed.ts` is a `DecorationSet`
and nothing else: **the file keeps both spellings**, which is what makes this legal without a
B10 or B6 argument at all, and the hidden node is still a real atom so Backspace removes it
for good if that was the intent. **Adjacent only** — same textblock, nothing between them but
whitespace or a `hardBreak`, either order — because a link and an embed at opposite ends of a
long note are two deliberate mentions and swallowing the second would be this rule deciding
something it cannot know. One trap, found by running it and not by reading it: `display: none`
on `.wiki-link-duplicated` alone ties `.wiki-link-preview`'s `display: inline-flex` on
specificity and loses on source order, so the one kind of chip this pair is ever written for —
a `.pdf`, which has a thumbnail — went on being drawn. Both class names on one selector.

**An overlay that means not to dim says so with two class names, not one** (15 August 2026).
The same trap as B48, sprung a second time and shipped for months. `.overlay` carries the
`rgba(0, 0, 0, 0.35)` veil every modal wants; `ContextMenu.tsx` and `TableGrid.tsx` render
`class="overlay context-menu-overlay"` / `class="overlay overlay-bare"` to opt out of it, and
at one class each those tie `.overlay` on specificity and lose on source order — `.overlay`
sits several hundred lines below both in `styles.css`, having moved there from `library.css`
for B41 while the comments beside them went on naming the old file. Every right-click menu,
every Actions and Insert dropdown and the table size grid therefore dimmed the whole window,
in both windows, exactly contrary to the sentence written above the rule. They are
`.overlay.context-menu-overlay` and `.overlay.overlay-bare` now, which wins whatever the
order; `test/styles-overlay.test.ts` pins both the doubled form and the absence of the bare
one. Nothing under `test/` could have caught it before that: jsdom has no cascade to lose in,
which is what this and B48 and B36's trailing slash all have in common.

**A dividing line can be inserted** (14 August 2026). `horizontalRule` has been in the schema,
the parser, the serializer and `.editor-content hr` since the dialect was written; nothing
could *make* one, which imported notes made visible by arriving full of them. It is the fifth
entry in `insertMenuItems`, so the toolbar's Insert button in both windows and the note
panel's right-click menu all get it from one list. **No shortcut and no `---` input rule**:
the Insert menu opens from a plain button so `--click-button` reaches it, and a `---`
autoformat would be a markdown spelling, which `state.ts`'s `autoformat` refuses on principle.

**Typing `/` at the start of a line opens the insert menu, and typing on filters it** (B51).
`slash-menu.ts` is a plugin drawing **plain DOM**, not a React overlay, and that is the
decision: the caret has to stay in the note while the list narrows, which is exactly what a
modal picker with its own input takes away (`NotePicker` is right for searching a vault and
wrong for reading what is already being typed). It also means the plugin goes into
`createEditorState` once and appears in both windows, since everything it needs is already on
`CommandContext`. Four things are easy to break. **It opens only on a `/` that is the whole of
an empty textblock**, and never inside a table cell, where a heading, a list and a rule are
all impossible — noticed in `apply` rather than by an input rule, so nothing has to reach out
of ProseMirror's own dispatch. **The `/` stays in the document** while the menu is up, as
`[[` does (B41), so Escape leaves precisely what was typed. **The prefix is deleted before the
item runs**, because four items open a picker of their own and insert later. And the rows
carry `.context-menu-label` with visible text, which is what keeps `--click-button` able to
reach them. `slashMenuItems` is built on `insertMenuItems` verbatim, so the toolbar's Insert
button, the right-click menu and this cannot drift; the mark toggles are deliberately absent,
since a mark on an empty line only arms the next thing typed. **`insertHorizontalRule` puts
the caret on the line below the rule** — `replaceSelectionWith` leaves a `NodeSelection` on a
selectable leaf, so before this the next character typed replaced the divider that had just
been made; only running it found that.

**Renaming a folder repairs the links into it, without asking** (B44). `renameFolder`'s own
comment used to say nothing inside needed rewriting because wikilinks carried bare names —
true when written, false since B35, and the sentence is what kept the breakage invisible. The
handler asks `linkingNotesUnder` **before** the rename (a target resolves against where a note
is now) and rewrites after, exactly `IPC.libraryMoveNote`'s ordering. It does **not** confirm,
unlike the single-note case: a folder rename is not a gesture about one note, and a dialog
counting notes the user never thought about stands in front of a repair nobody can reasonably
decline. `folder-rename-links.ts` is Electron-free and holds the two things easy to get wrong
— **a referring note may itself be inside the folder** and must be rewritten at its *new*
path, and **the new target is composed rather than re-resolved**, since re-resolving would
need a scan and the answer is one prefix swapped for another. The handler also gained the
`writer.activePath()` guard `IPC.libraryTrashFolder` already had. Deleting a folder still
breaks its links on purpose: those notes are in the trash.

**That repair has a second half, and shipping without it was a bug** (B45). It repaired only
what resolved to a *note*, and an attachment never does — so renaming a folder of images left
every `![[99 - Attachments/foto.png]]` in the vault pointing at the old name, which is what
was reported. Two gaps at once: `note_links` held `[[…]]` only (`wiki-targets.ts` said why —
"an attachment never moves as a consequence of a note moving", true until a *folder* could be
renamed), and `rewriteWikiLinks` only ever touched `wikiLink` nodes. The index now stores
embeds too behind a `kind` column (`SCHEMA_VERSION` 3, so one rebuild — B26 allows it), and
`linkingNotes`/`linkingNotesUnder` filter to `kind='link'` so B35's question means exactly
what it meant. The attachment half is deliberately **not** resolution: `targetsUnder` matches
the *path in the target* as a string, because that is what `resolveAttachment` resolves and
what a rename changes, and `rewriteTargetPrefix` swaps the one prefix in both node types. No
alias is invented (a path-form target was never what the reader saw, and an embed has no
alias) and a bare `![[foto.png]]` is left alone, carrying no folder to rewrite. The prefix
matched is `Bijlagen/`, never `Bijlagen`, or a sibling folder called `Bijlagen extra` would
move with it.

**A folder's files that are not notes are listed and previewed** (B47). A vault started in
Obsidian keeps its pictures and PDFs in an ordinary folder beside the notes — `99 - Attachments`,
usually — and that folder was browsable and completely empty: a `0` badge in the tree,
"No notes" on clicking it. **Nothing had to be built to *show* them**: `resolveAttachment`
resolves an arbitrary vault-relative path (B38), `emqnote-attachment://` serves it (B28),
`emqnote-thumb://…?size=page` draws a PDF page (B36/B43) and `openWikiLink` already routes a
`.docx` to the OS and a `.pdf` to B40's window. `readFilesIn` is the only new piece.
**A separate call and a separate type, never a widened `NoteSummary`**: sort, drag, move,
duplicate, tasks and the conflict check all take one, and none of those questions means
anything for a `.png` — a file row answering half that menu would read worse than one that
plainly is not a note. `_attachments` stays hidden and unbrowsable; it is the app's own
folder and has §6.5's screen — which is now a place rather than a screen, see B55 below. The
reader pane's PDF preview asks the hidden window for its page like the inline embed does —
**no pdf.js in the library bundle**, the same line B43 draws.

A file row has a right-click menu of its own since 16 August 2026, and what is *not* on it is
the decision: **Copy link** (`![[path]]` when `isEmbeddableAttachment` says the app can draw
it, `[[path]]` otherwise — the same function `insert-attachment.ts` spells an insertion with,
so a copied link and an inserted one cannot disagree), **Reveal**, and **Delete only in the
unlinked pane**. Delete is absent elsewhere rather than present and disabled: a file a note
still names is not a thing to offer to remove, and a permanently greyed row on every picture
is noise. Copying goes through `IPC.copyText` in main rather than `navigator.clipboard`,
which is not dependable in a sandboxed `file://` renderer.

**Unlinked attachments are a place in the sidebar, not a modal** (B55). `{ kind: "unlinked" }`
is a `Selection` like `{ kind: "tasks" }`; the note pane is B47's file list, the reader is
B47's preview, and `IPC.libraryUnlinkedAttachments` answers `FileSummary[]` through the same
`summariseFile` `readFilesIn` uses. That deleted a whole screen rather than moving one. It has
been in three places now — tree footer, then a row inside Settings (6 August), now the footer
again — and the third is not a revert: what came back is a destination, where what left was a
button opening a grid with its own previews and its own delete. **Its loading and failure
states are load-bearing**, because this is the one file list that is a search over the whole
index rather than one `readdir`, and the screen it replaces hung on "Looking…" for four
separate reasons at once. It was called *Orphaned* until 16 August 2026, in the strings and
in the code alike (`unlinked-attachments.ts`, `unlinked.*` in `i18n.ts`): the old word named
the file's predicament in a metaphor, the new one names what is actually missing.

**That loading state is for the first answer, not for every refresh.** `library:refresh`
arrives twice for every debounced autosave — once from the `CaptureWriter` callback, once
from the watcher observing that same write ~300 ms later — and each one re-runs this scan,
which is right: a note that just started naming an attachment changes the answer. Clearing
the rows and re-drawing "Looking…" each time was not, and is what "the list flickers while
typing in the new-note window" meant. `Library.tsx` keeps the last answer in `unlinkedFiles`
and swaps the rows when the next one lands; `unlinkedScan` is a generation counter, since two
scans can be in the air at once. A refresh that *fails* over rows that are already right
keeps them — only a first answer with nothing to fall back on shows the failure line.

**A reference counts in either spelling.** `findUnlinkedAttachments` compared the bare
filename alone, so a picture linked as `![[_attachments/2026/07/foto.png]]` — which is exactly
what a file row's own **Copy link** writes, and what a vault written in Obsidian is full of
(B38) — went on being listed here as unlinked, an offer to delete a file a note is drawing.
It matches the vault-relative path *and* the bare name now.

**The unlinked-attachment scan is answered from the index, and it has an error state.** It
stalled at "Looking…" for four separate reasons, and all four are worth not reintroducing:
there was no `.catch` at all, so a rejected `invoke` left the one loading state set forever;
it walked the whole vault and `readFileSync` + `parseNote`d every note synchronously inside
`ipcMain.handle`, which on a Files On-Demand vault blocks on one network hydration per note;
that walk honoured neither `isHidden` nor `_trash`, so a `_templates` note naming a picture
counted as a reference to it; and each preview came back as the whole file base64'd through
IPC with `Promise.all` over all of them, so nothing appeared until the last one landed.
`note_links` has held exactly the reference set since B45, so `referencedTargets` hands it
over — **the trash is still read separately**, because `index-scan.ts` leaves it out on
purpose (a deleted note must not resurface under its tags) and this question counts a trashed
note as a reference on purpose (it can be restored). Both are right; they just are not the
same question.

**A weblink's mark is resolved from both sides of the click position.** The `link` mark is
`inclusive: false` (`schema.ts`), which is what stops typing past a link from extending it —
and it also means `$pos.marks()` is empty at the *trailing* boundary of a run, where the text
after carries no link. That boundary is the right-hand half of a link's last character, which
is exactly where a pointer aimed at a short link lands, so Mod+click there resolved nothing,
ProseMirror fell through to selecting the node (Mod is also its `selectNodeModifier`), and the
link opened only on the second or third try further left. `linkRangeAt` asks `nodeBefore` as
well as `nodeAfter` now, which fixes Ctrl+K at the end of a link along with it. A bare URL
ending a paragraph — the common Obsidian shape — was unopenable outright.

**A `#tag` in the body opens the library on Mod+click, and the answer comes out of the
decoration set** (B52). The gesture is B33's for B33's reason: a tag is ordinary editable text
(B19) and stays that way, so a plain click has to go on placing the caret or a typo inside a
tag becomes unfixable by the one gesture everybody reaches for — which is also why the tag
still gets no pill and no background, and why `.link-mod-hover` covering `.tag` is the whole
affordance. `tag-decoration.ts` carries the name in each `Decoration`'s **spec** and exports
`tagAt`, so the click is answered from the very set that draws the colour: a `#` in code is
excluded once, not twice, and the two can never disagree about where a tag begins. `handleClick`
in `Editor.tsx` asks the link first and the tag second. Three things on the other side are
load-bearing. **`IPC.openTag` goes through main even for a click in the library's own reader**,
copying `openWikiLink` including its `isLoading()` / `did-finish-load` deferral — the first
Mod+click from the capture window is very often the call that creates the library window, and
letting that window shortcut its own clicks is how one gesture grows two behaviours. **Main
resolves nothing**: a tag is a name, and `foldTag` already decides what matches where the list
is built. And **`FilterSection` unfolds itself** when a selection of its own kind arrives,
matches a tag through `foldTag` (or `#KlantX` filters correctly while lighting no row) and
keeps the selected facet on the list even when `SHOWN` or the filter box would cut it — a note
list filtered by something the side panel does not show has no row to click to get back out of.

**The chip drawn for `![](https://…)` opens its address on a plain click.** Not every
`![…](…)` in a vault points at a picture: `![](https://www.youtube.com/watch?v=…)` is a video
written with the image spelling, and `externalImageView` had no listener at all, so it was the
one thing in a note that could be seen and not reached. A *plain* click, unlike a weblink in
prose (B33): that rule exists because a link's own text has to stay editable, and a chip is an
atom with no text to put a caret in — `chipView` and `wikiLinkNodeView` have always opened on a
plain click for the same reason. Main's `isOpenableUrl` still decides the scheme.

**The vault can be switched from the tray, through the same function Settings uses** (B21,
extended). `switchVaultTo` is that function; a second sequence written out beside it is how
one of B21's four pieces of state gets forgotten on the path nobody tested. The tray's flat
`Vault: <path>` row is a submenu — reveal, the vaults `listVaults` knows, the picker — and
what it *contains* lives in an Electron-free `vault-menu.ts`, because a `Menu` template cannot
be built under `vitest` and `--click-button` cannot reach a native menu at all. Two things this
route needed that Settings did not: a confirmation naming the restart (one click two rows into
a menu of harmless neighbours is easier to make by accident than a two-step dialog), and
**`IPC.libraryFlushSaves`**, a bounded round trip that makes the library write its debounced
save before `app.relaunch()`. Settings flushed in its own renderer because the click was there;
the tray has no window in the loop, and that is B21's third hazard exactly.

**A `[[…]]` link is written by picking a note, always as `[[path|Title]]`** (B41).
`NotePicker.tsx` opens on `[[`, on `Mod+Shift+K`, from a toolbar button and from the editor
menu, in **both** windows. Never a bare `[[Title]]`: a path matches in `link-resolve.ts`'s
first stage and cannot be ambiguous, a title matches in the second and two notes may share
one — which would raise B35's picker on every future click over a question already answered
at insertion. Two halves are easy to "fix" into a bug. **The input rule returns `null`**, so
the two brackets are typed normally and simply stay there if the picker is cancelled;
`insertNoteLinkOverPrefix` removes them on the way in and *checks they are still there*
rather than assuming, because eating two characters of someone's sentence is worse than
leaving two behind. **It opens from a `queueMicrotask`**, never inline — the rule runs inside
`handleTextInput`, and mounting a React overlay mid-dispatch is the hazard `paste-images.ts`
documents for `appendTransaction`. Candidates come from `IPC.linkCandidates`, which runs the
same `searchNotes` the search bar does and adds `target` (`linkTargetFor`, main-side because
B37 decides what a note extension is).

**Tables are hand-rolled on the existing schema; `prosemirror-tables` is refused** (B42,
closing the loose end B17 left). That library needs `tableRole`, a separate `table_header`
and `colspan`/`rowspan`/`colwidth` on every cell — and *this schema is the file format*, while
GFM cannot express a merged cell at all, so the editor could build what the serializer must
refuse. `table-commands.ts` **rebuilds the table node and replaces it whole** on every
operation rather than splicing at computed positions: a column insert touches every row, and
the splicing version is correct right up until a ragged row makes it not. **Ragged rows are
real** — `from-mdast.ts` does not pad to a common width — so every column operation squares
the table up first, and the per-column `align` array is spliced in step or every column past
the edit inherits its neighbour's. **`goToCell` must be chained in front of `tabIndent`** in
`keymap.ts`: that one returns true unconditionally, so ordering is the entire mechanism and
swapping the two lines silently removes cell navigation. Enter in a cell inserts a
`hardBreak` (`tableCell` is `inline*`, so there is nothing to split, and `<br>` is what §3.5
prescribes). `trailing-paragraph.ts` keeps an empty paragraph after a trailing table, code
block, HTML block or rule so there is always somewhere to type; it never reaches a file
because `withoutTrailingBlanks` already strips one on write, which is what makes the
invariant free.

**A rectangle of cells is selectable, and one function answers what an operation is about**
(B49). `table-selection.ts` is a hand-rolled `Selection` subclass — refused from
`prosemirror-tables` for exactly B42's reason, since its `CellSelection` arrives with the
`TableMap`, the `tableRole`s and the `colspan`/`rowspan` this schema cannot hold. Three
things carry it. **`selectedRect(state)` is the single question every command reads**: a
caret makes a one-cell rectangle and a selection makes a bigger one, so B42's dozen commands
gained the whole feature without a second code path — and "Row ↓" adds as many rows as are
selected, which is the only reading where a rectangle does not mean less than a caret.
**`visible = false`**, so the browser paints nothing over it and `table-align.ts`'s
decoration is the entire affordance — which is also why that fill has to out-rank the
header-row background on specificity (`test/styles-table.test.ts` guards it; same family as
B48's bug). And **`createSelectionBetween` is what makes the drag work at all**: the button
is still down, so Chromium goes on extending its own text selection and `prosemirror-view`
reads it back over the `CellSelection` on every `selectionchange` — measured in the running
app, where a slow drag ended with nothing selected. Backspace/Delete clear the cells one
replace at a time (a single step across an `isolating` boundary is refused, which is the
original bug), and typing over a rectangle clears it first in `handleTextInput` — the
insertion is done there rather than handed back, because the `from`/`to` ProseMirror passed
belong to the document before the cells were emptied. Merged cells stay impossible (B6), and
pasting a rectangle *into* a rectangle is deliberately not built. `table-geometry.ts` holds
the matrix arithmetic both files need, so neither has to import the other.

**PDF previews are drawn by pdf.js in a hidden window, not by the OS** (B36, superseding B30's mechanism). A hidden `BrowserWindow` renders in its own renderer process, so the main thread's 80 ms hotkey budget is untouched without a worker thread, and `pdfjs-dist` stays a `devDependency` that electron-vite bundles — a native canvas binding would have meant a `dependencies` entry, a `check:bundle` exception and packaging risk on two platforms. The sandbox and `contextIsolation` stay on for that page: a PDF is untrusted input. Only `.pdf` gets an inline preview now; Office formats stay attachable and draw as a plain chip. The protocol handler answers **422 for "resolved, but could not be rendered" against 404 for "nothing to preview here"**, and the chip shows a marker with the reason — before that, a corrupt PDF looked exactly like a `.txt`. The bug that had hidden the whole feature was neither: `emqnote-thumb` is a `standard: true` scheme, so Chromium appends a trailing slash, `isPreviewable` saw `.pdf/` and 404'd. `attachmentNameFromUrl` (`src/shared/attachment-url.ts` since B38) is what both protocol handlers use to read a name back out of a URL.

**A folder's badge counts its notes and the open tasks in them** (B67). `[# notes] / [# open
tasks]`, only for a folder that holds notes — a folder with none has no badge, which is what
it has always had — and **neither half is rolled up**: both count the notes filed in that
folder itself, exactly as `noteCount` always has, so the two halves cannot end up counting
different notes.

The task half comes out of `note_tasks`, never out of a walk over the folder: re-parsing a
folder's notes on demand is B26's 470–535 ms main-thread stall, and the table is already
filled by every scan and every watcher reindex. It joins `notes`, so a row whose note has left
the index cannot make the badge promise tasks the Tasks view does not list. The fold from note
path to folder path happens in JS rather than in SQL — SQLite has no `dirname`, and spelling
that rule a second time with `instr`/`substr` is how two answers to one question come to
differ.

**Since B69 the fold reads the per-note answer rather than asking its own question.**
`openTaskCountsByPath` is the query; `openTaskCountsByFolder` is the fold over it. That is not
tidiness — a folder saying two are open with rows beneath it that disagree is the failure
worth designing out rather than testing for, and one query is how.

**It is a second IPC call, not a field on `IPC.libraryTree`**, and that is the whole shape of
it: the tree is one `readdir` and must answer at once (`vault-scan.ts`'s own rule that
browsing a folder never waits on a scan), while this sits behind `ensureScanned`. One call for
both would put a folder listing behind the index. So the tree arrives first and
`folder-tasks.ts` merges the counts in when they land — which is why `openTasks` is *absent*
rather than zero until then. Once counted, a clear folder shows a real `0`: the badge is a
pair or it is nothing, so a folder that is genuinely done cannot be read as one still being
counted. A tick is a save and a save raises `library:refresh`, so the badge follows a checkbox
without knowing anything about one; a failed refresh keeps the last counts, the rule the
unlinked pane already learned.

**The note list says `Tasks: 2` under the date** (B69, revised 20 August 2026). B67's answer a
level down, out of the same `openTaskCountsByPath`, so the folder badge and the rows inside
that folder cannot disagree about the notes they are both counting. Always the accent, because
the badge is now only ever drawn for a note that has work left.

**Only what is open, and silence when nothing is.** It read `2 of 5`, and said `0 of 5` in
muted grey for a note whose boxes were all ticked, on the argument that only `total` tells
"done" apart from "never had any". Daily use answered that the other way: the badge is a call
to action, a finished note has none, and a column of numbers mostly saying nothing is owed is
a column that stops being read. The total is not lost — the `title` still spells `2 / 5` out,
which is also what keeps `tree.openTasks` the one place those words are written.

**Absent is still not zero**, for the reason it always was: a note missing from the map covers
both "no task items" and "the index has not answered yet", and a row must never claim a note
is clear while the answer is still on its way — the rows come off a `readdir` and the counts
come from behind `ensureScanned`. That the two now draw the same thing is a consequence of the
rule above, not a merging of the two states. It is a second IPC call for B67's reason exactly.

**The badge moves up a row when there is nobody to sit beside.** `.note-bottom` exists to put
People on the left and the count on the right; with no attendees it was a row holding one
number, on every note in the vault. So the count sits right-aligned on the *excerpt* row
(`.note-middle`) instead and that row is simply absent. One rule, and it is about People —
tags have never shared a row with the count. One DOM shape and not two: the excerpt is always
wrapped, so a note without tasks is geometrically what it was. The muted variant and the
`.note-tasks-open` class went with it, there being one state left to draw.

**It cannot come off `NoteSummary`.** `summarise` reads the frontmatter and the first lines of
a file without ever building a document — deliberately, 0.09 ms against 1.51 ms per note — so
it cannot see a task item at all.

**People keep their line**, which was the alternative and was refused: a meeting note that
quietly stopped naming who was at it is a worse trade than one more row. The count sits
right-aligned on that same row, carrying `margin-left: auto` rather than the row carrying
`justify-content: space-between` — either works when both halves are there, and only that one
keeps the count on the right for a note with tasks and nobody attending. `.note-tasks-open` is
written as a doubled selector for B48's reason; `test/styles-note-tasks.test.ts` pins it.

**A new note can be thrown away, and it goes to the trash** (B68). Every other way out of the
capture window commits — the X, Ctrl+Enter, Escape, blur, quit — and the draft is on disk 800 ms
after the first keystroke, so a note begun by mistake was a note that existed. **Discard** is a
button in the status bar, for a brand-new note only.

**No confirmation, and that is B54's argument rather than an oversight**: the file is renamed
into `_trash` and comes back through Restore, which is also why dragging a note onto the trash
asks nothing. B24 is untouched — this is not a third place that permanently deletes.

**The ordering is the whole of it.** `CaptureWriter.discard` swaps a fresh session in *before*
it answers, `finish()`'s reason exactly, so the `writer.finish()` that every close runs
(`hideCaptureWindow` → `onHide`) works on an empty session and `writeSession` returns `NOTHING`
for a `null` payload instead of putting the note back where it was just taken from. Only
running it finds that one, which is why `test/capture-writer.test.ts` spells the following
`finish()` out rather than assuming it. What discard does **not** skip is a write already in
flight: `writeSession` decides the file name on the first write and stores it on the session,
so an answer taken before that settles is `null` for a file that appears a tick later — an
orphan nobody can find. It waits the queue out.

**Two independent locks on the loaded-note case**: the button is not drawn when `existing` is
true, and `discard()` answers `null` for a session with an `existingTitle`. A note that lives
in the library is not this window's to throw away, and Delete is already there. `capture-store.ts`
returns the path rather than trashing it — that module writes a session, and where a note goes
when it is deleted is `vault-io.ts`'s rule, of which there is exactly one.

**The chord is `Mod-Shift-Backspace`, and it is emphatically not Escape** (B80,
`shortcuts.ts`'s `discard` entry, the branch in `Capture.tsx`'s window listener). Escape is
deliberately bound to nothing at window level in the capture window — `close`'s own `why`
already says why, and it says it about *saving*: it is the key hit by reflex, and a
half-typed note is too easy to lose that way. Discard is the one command in that window
that throws work away, so it is the last one that key should reach. Backspace already means
"erase what I just did"; the shift is what keeps it off the platform's own `Mod-Backspace`,
which deletes to the start of the line inside a text field — and this window is mostly text
field. The branch carries the `existing` guard itself (through `existingRef`, so the effect
stays off the dependency list), making it the outer of the two locks above rather than a
replacement for either: a chord that silently declines is better than one that reaches a
handler to be refused there.

**⌫ on macOS, "Backspace" on Windows** (`MAC_KEYS` in `shortcuts.ts`). The modifiers are
already symbols on a Mac, so "⇧⌘Backspace" is three glyphs and then a word — a sheet that
gave up halfway. Only keys whose Mac glyph *is* the usual spelling belong in that map; Enter
and Tab stay words on both platforms, which is why `NAMED_KEYS` is still consulted for
everything else.

**The caret survives a note switch, for as long as the library window is open** (B70). `setDoc`
replaces the whole `EditorState` — it must, or one note's undo history leaks into the next —
and took the caret with it, so leaving a long note and coming back started at the top.
`Library.tsx` keeps a `Map` from note path to selection; `EditorHandle` gained `getSelection`
and `setSelection`.

**In memory and nowhere else.** Not the note file (B10, and a caret is not something to carry
to the other machine over OneDrive), not `index.sqlite` (a derived cache that `migrate()` drops
on a schema bump), and deliberately not `settings.json` either — surviving a relaunch is a
second question nobody asked.

**`setSelection` does not focus.** Opening a note leaves focus on the list row that was clicked
and goes on doing so; what changes is where the caret is waiting once you Tab or click in.
**A task ordinal wins**: clicking a row in the Tasks view names a destination, and the two
branches in the `docToken` effect are in that order for exactly that reason — there is nowhere
else the rule is written. `rememberCaret` runs at the two points a note stops being the one on
screen (opening another, selecting a file) and pointedly not on the paths that trash or delete
it, where there is nothing to come back to. An offset past the end of a note that has since got
shorter is clamped and handed to `TextSelection.between`, which falls back to `Selection.near`
itself — the restore sits in an effect, and an exception there takes the whole reader down.

**Tags come from two places, and since B65 the body's write into the frontmatter.** The
frontmatter `tags:` field holds what was typed in the header's tag field; `#tag` stays in the
body — and on **save** the body's tags are hoisted into `tags:` beside the typed ones. This
paragraph used to say the two never wrote to each other, on the argument that editing one
sentence would then rewrite the header. That cost is real, was weighed and was accepted: the
header field was showing *nothing* for a note whose tags are all in the body, which is the
shape an imported vault has. It costs one write per note, not one per save — once hoisted,
the byte comparison in `saveNote` makes the next save a no-op again.

**B10 is unchanged and is the boundary**: opening a note still writes nothing, and
`test/note-files.test.ts` guards it. The hoist happens in the two frontmatter builders
(`vault-io.ts`'s `saveNote`, `capture-store.ts`'s `buildFrontmatter`) through one shared
`mergeTags`, never in the serializer — so the corpus round trip is untouched.

**`bodyTagsOf` reads the *serialized* body, not the ProseMirror document** (`src/markdown/note-tags.ts`).
`summarise()` reads tags off the bytes on disk, and a second reading of the same syntax is how
two answers to one question come to differ. It costs a stringify, which is why both windows
recompute the chips on their existing save debounce and **never per keystroke** — the capture
window has a 16 ms budget.

**Provenance is what makes a hoisted tag removable.** After one save `tags:` holds the manual
and the hoisted tags indistinguishably, so `openNote` hands back `tags` (what `tags:` declares
*minus* the body's) and `bodyTags` separately — `manualTags` is the rule. A tag in both places
belongs to the body; delete it there and the next save drops it. `HeaderBlock` draws `bodyTags`
as read-only chips beside the field for the same reason: the note is where they come out.

**The tag field completes from the vault's own list** (B66), through `IPC.tagSuggestions` — the
`tags` half of the same `facets()` the library's Tags filter reads. Top-level IPC like
`linkCandidates`, because both windows ask. Asked on the field's **first focus**, never at
startup: this component is rendered into the capture window long before the hotkey shows it.
The matching is a pure module (`src/renderer/tag-typeahead.ts`) and works on the token the
caret is in, never the whole field, which holds a list. What the note already carries — the
field's tags *and* the body's — is not offered: the body half looks like an omission and is
not, since B65 hoists those anyway, so completing to one would write nothing. Escape closes the
list with `stopPropagation()`, the 18 Aug 2026 rule.

**The field's half of that is read off the live text, and reading it off `values.tags` was a
bug that survived two months.** `commitTags` runs on blur or Enter and not before, so the
committed array disagrees with what is on screen for as long as the field has focus — and a
tag deleted from the field went on being filtered out of the vault's own list until the field
was left and re-entered. Delete `#klantx`, type `#kl`, and the tag twenty other notes carry is
not offered. `applied` is `parseTags(tagValue)` now, which is why `parseTags` sits at module
scope beside `parseAttendees` rather than inside the component. `rankTags` already excludes the
token being typed from the check, so a half-typed tag does not vanish from its own list. The
Where field never had this, having no buffer to disagree with; the Who field was built this way
from the start. `test/header-tags.test.ts` pinned the *old* behaviour and had to be rewritten —
a test can encode a bug as faithfully as it encodes a rule.

**A completion row is not a Tab stop** (`tabIndex={-1}` on all three lists' buttons). The panel
sits between its own input and the next field in DOM order and is open from the moment the
field is focused, so a tabbable row meant Tab moved into the list instead of on to Where; the
input's blur then closed the list and unmounted the button holding focus, dropping it to
`<body>`, and the press after that started again from the top of the document. That is the
whole of the reported "tabbing from Tags to Where needs an extra press", and it applied to
Where → Who identically. Every other row-list in this codebase already does it —
`ContextMenu.tsx`, `TaskList.tsx`, `FolderTree.tsx` — `HeaderBlock` was the one that did not.
It is asserted as a property of the rows rather than by pressing Tab: **jsdom implements no
sequential focus navigation at all**, so a test that dispatched a Tab keydown would have passed
whatever the markup said.

**The Who field completes too** (B81), from `facets().people` over `IPC.peopleSuggestions` —
the `people` half of the same answer the library's People filter reads, exactly as
`tagSuggestions` takes the `tags` half. B66's sentence saying it deliberately would not has
been revised, not deleted: the argument was that a name is not drawn from a closed set the way
a tag is, and the answer is B73's — the set is as closed as the vault's own history of it, and
the same handful of colleagues get typed again and again with a slightly different spelling
each time. `people-typeahead.ts` is `tag-typeahead.ts`'s token maths with **whitespace removed
from the separator set**: "Jan de Vries" is one name, and `,`/`;` is exactly what
`parseAttendees` splits on, because completion must not find something different from commit.
The leading space after a comma is *taken from what is there* rather than always inserted, so a
name completed at the start of the field does not begin with one.

**The Tags field has a floor of ten characters, and it needs two rules to hold it.**
`.header-cell input` is `flex: 1; min-width: 0` — a zero basis with the browser's own input
minimum switched off — while every `.tag-chip` beside it is `0 0 auto` at content width, so the
chips took the line and the field was left with nothing: a note with enough body tags had a
Tags box you could not see and could not type in. `.header-cell.header-tags .tags` gives it
`flex: 1 1 10ch; min-width: 10ch` (a *zero* basis never triggers a wrap by itself, which is why
the basis moves too), and `MAX_TAG_CHIPS` bounds the other side of the row, collapsing
everything past the third into one `+N` chip whose tooltip names what it stands for. Both are
needed — the cap alone still loses to three long tags, the floor alone to twelve short ones.
The cap is a **count and not a measured fit** on purpose: nothing under `test/` puts the
stylesheet through a layout engine, so a measured version would be the one piece of this header
no test could reach.

**The Where field does, and it completes on the whole value** (B73). That same argument
read the other way: there are a handful of places work happens, and they are typed again
and again with a slightly different spelling each time. `location` has been a column on
`notes` since the table was created and `buildRecord` has always filled it, so this needed
**no migration and no `SCHEMA_VERSION` bump** — only the tally, which is `locationFacets`
in `vault-scan.ts`, read off `allNotes` because `toSummary` drops the field. Deliberately
not a fourth field on `facets()`: that answer feeds the library's filter panel, which has
no Where filter, and `IPC.tagSuggestions` was carved out of `facets().tags` for exactly
that reason — `IPC.locationSuggestions` sits beside it. **`location-typeahead.ts` matches
the whole field, never a token**, which is why it is a sibling module rather than another
export in `tag-typeahead.ts`: a Tags field holds a list, so `tokenAt`/`applySuggestion`
exist to reach the one entry the caret is in, while a location is one value that
legitimately contains spaces ("Kantoor Amsterdam") and tokenising it would complete the
field to a fragment of its own contents. Accepting is therefore a plain replacement with no
caret arithmetic. **The two lists have separate state** — their own `suggesting`, `active`
and `hoverGuard` — because Tab moves from Tags to Where without either field losing focus,
so both panels can be up at once and one shared `active` would move the highlight in a
panel nobody is looking at. Everything else is B66's, including the first-focus fetch and
Escape's `stopPropagation()`.

**Timestamps are ISO 8601 with offset, never UTC `Z`** — otherwise a summer note reads back wrong in winter.

**Where the vault goes is asked, never assumed.** `settings.ts`'s `defaults()` seeded `vaultPath` with `defaultVaultPath()` — which answers `<OneDrive>/emqnote` whenever the machine has exactly one business OneDrive, the common case — and `prepareVault` only asks when it finds `null`. So on a fresh install the folder was chosen, created and populated in silence, and the chooser existed without anybody ever being shown it. That is what "the vault location seems to be hardcoded" meant. The default is `null` now and the guess moved into `askForVault`, which offers it as a confirmable suggestion with the full path spelled out; `defaultVaultPath` keeps its name but is nobody's default any more. `prepareVault` returns early when a `--selftest` run finds no vault, or an unattended CI job would block on a dialog instead of failing.

**Index, settings and window state live outside the vault**, in the local app data folder (B9). On Windows that is `%LOCALAPPDATA%`, forced in `src/main/index.ts` before `ready`, because Roaming AppData can be synced by a corporate profile. A half-synced SQLite database is a broken SQLite database.

**Trash is the vault's own `_trash` folder**, not the system recycle bin: a OneDrive file in the Windows recycle bin is not synced, so it would be gone from the other machine with no way back. Deleting a note is still only a rename into it. Emptying it is a separate, explicit action — the trash folder's note list carries a **Clear trash** button where every other folder has *New note*, behind a confirmation that names the count and says it cannot be undone (B24). `emptyTrash` in `vault-io.ts` and `deleteFromTrash` beside it (B54) are the only code in the app that permanently deletes anything, and both check with `realpathSync` that the target really is inside `<vault>/_trash` before removing a byte — `resolve()` alone would happily follow a `_trash` that turned out to be a symlink. There is deliberately no age-based prune. Since B54 the trash is also a place things come *out* of: a note or a folder restores through the Move to… picker with the Inbox offered first, since the trash is flat and nothing records where anything came from.

**The app's own writes are told apart from a real external change by content hash, never by a timer** (B31). `own-writes.ts` remembers `sha256(contents)` per resolved path (lowercased on `win32`, the usual reason) after every `writeAtomic`, so the watcher can suppress the notification for its own debounced autosave without suppressing the *indexing* — those are two different things, and only the notification is ever skipped. A TTL ("ignore writes for N ms after our own save") was rejected because it turns a correctness property into a timing property, and OneDrive's own re-materialisation schedule is the one clock this app cannot trust. The library gets every `vault:file-changed` event unconditionally and filters against its own `open` state, because main has no reliable view of what the reader currently shows; the capture window is filtered in main instead, against `writer.activePath()`, because that path genuinely is main's own state. A clean note reloads silently; a dirty one gets a **Reload** / **Keep mine** bar; a deletion gets **Close** / **Keep mine** and — deliberately, asymmetrically — never auto-closes even when clean, because closing yanks away a window someone may be looking at and a transient OneDrive hiccup must not be able to do that unasked. The capture window cannot know from main alone whether it has unsaved edits (main only sees what has already crossed the 300 ms debounce), so it keeps its own `dirtyRef` that deliberately over-reports rather than risk discarding a half-typed sentence. `unlinkDir` is handled too, via `deleteNotesUnder` (a `substr`-based prefix match, not `LIKE` or `GLOB`, both of whose metacharacters real folder names can legitimately contain) — before this, a folder deleted outside the app left every note under it still indexed.

**That map is keyed by path, so every rename has to carry the entry over.** `renameOwnWrite`
is what does it, and leaving it out of a rename is a silent bug with a loud symptom: the
watcher sees an `add` at a path nothing was ever written to, answers `own: false`, and main
tells the capture window that the note it has open changed outside the app. It sticks, too —
the bytes are unchanged, so the next debounced write is a no-op and no hash is ever
registered for the new path. That is exactly what "a message pops up even though the note was
not edited outside emqnote" was: `renameSessionFile` renames the file on *commit*, and blur
commits, so alt-tabbing away from a note whose subject had changed produced it every time.
Called from `capture-store.ts`'s `renameSessionFile` and from `vault-io.ts`'s `renameNote`
and `moveNote`. Confirmed in the running app both ways round — with the call disabled the
reported sentence appears, with it there it does not.

**On Windows the vault is watched by polling** (B57). chokidar's native handler opens an
`fs.watch` handle on every *directory* it watches and none on a file, which on Windows is a
kernel handle held for as long as the app is resident — and this app is resident all day by
design. Two reports came out of that, both matching the asymmetry exactly: OneDrive could not
replace a folder renamed on the other machine, and permanently deleting a folder out of the
trash failed while deleting a file worked. A handle follows the file object rather than the
path, so `trashFolder`'s rename carried the watcher's handles into `_trash` along with the
folder, `_trash` being on the ignore list notwithstanding. `pollingOptions()` in
`index-watch.ts` is the whole change and it is `win32`-only; macOS keeps native watching,
where a watch descriptor blocks nothing. The cost is real and accepted — a stat sweep of the
vault every two seconds, forever — because the alternative is an app that blocks the sync
tool its own vault lives on. `awaitWriteFinish` still applies in polling mode, so the reason
it is set (OneDrive writing a synced file over several passes) is unaffected.

**Nothing this app deletes gets one attempt, and a refusal names itself.**
`trash-delete.ts` is the whole of permanent deletion now, and it exists because the *first*
fix for "deleting a folder from the trash does not work" (B57, above) shipped and the report
came back word for word unchanged. That is how a diagnosis is shown to have been incomplete
rather than wrong — chokidar really did hold a handle per directory, and removing it really
did not fix this. So the code stopped asserting a cause and started reporting one. Four
parts, and the last two are the ones that matter:

- `REMOVE_OPTIONS` gives `rmSync` `maxRetries: 10, retryDelay: 100`. Node's default is zero
  and its Windows backoff for EBUSY/EPERM/ENOTEMPTY only engages above zero; `force: true`
  suppresses `ENOENT` and nothing else.
- `clearReadOnly` clears the read-only attribute first, because **retrying is no use against
  an attribute** — it is still read-only a second later, and `EPERM` from one reads exactly
  like a lock held by another process. Files everywhere; *directories only on `win32`*,
  where `RemoveDirectory` refuses one carrying `FILE_ATTRIBUTE_READONLY`. On POSIX a
  directory's mode is a real permission this app has no business rewriting on its way past.
- **`findRemovalCulprit` names the entry that refused, not the folder that was asked for.**
  It runs only after `rmSync` has already failed, walking bottom-up and removing as it goes,
  so it costs nothing on the path that works. "`_trash/Alpha/offerte.pdf` — EBUSY" points at
  whatever has that file open; "this folder could not be removed" points at nothing.
- Both handlers **answer** (`{ deleted: false, failed: true, reason }`,
  `{ removed, failed, firstFailure }`) rather than rejecting, because the renderer calls
  them as `void …` — a rejection became an unhandled promise rejection, the dialog closed,
  and the folder was still there, which is what "does not work" looked like from outside.
  The dialog carries the code and the path verbatim. An error code in a dialog is not how
  this app talks, and it earns the exception: the next report has to arrive with the
  operating system's own word for what happened.

`emptyTrash` counts what would not go instead of stopping at it — one locked folder must not
keep the rest of the trash — and `IPC.libraryEmptyTrash` gained the `writer.activePath()`
guard its sibling already had. **The message no longer claims a holder**: it says the
operating system refused and leaves the code to say why, because the version that asserted
"something else has it open" was wrong for every `EACCES`.

**`--trash-probe=<path>` is how the next round gets settled** (`trash-probe.ts`), and it is
`--thumbnail-probe`'s reasoning applied to this: walk what the delete would walk, and report
per entry rather than guess. **It deletes nothing** — the evidence is the point on the one
operation with no way back (B24). Two blind spots belong in its output rather than in a
footnote, and are printed there: a handle on a *directory* is invisible to it (a directory
cannot be opened for writing, and that is exactly what B57 was about), and on POSIX the
held check means almost nothing because locking there is advisory. It never asks whether a
read-only file is held, either — that fails with `EACCES` for a reason that has nothing to
do with holders, and the first version of the probe duly reported a read-only file as
"held", which is the same confident wrong answer it exists to replace.

**Letting go before deleting, not after.** `deletePermanently` clears the reader and the
file preview *before* calling main, since the trash is browsable and B47 puts a preview in
the reader — on Windows an open handle inside a folder is what stops the folder going. A
finished `<img>` load holds nothing, so this is not claimed as the cause of anything. The
first version of it waited for `requestAnimationFrame` before continuing, which **hung the
delete outright** on an occluded or minimised window, where frames are throttled: the button
did nothing at all, which is the very bug it sits inside. Only running it found that.

**Every panel has a right-click menu, and every action behind one has a non-menu route too.** The folder tree, the note list and the note panel (both windows) each get a `ContextMenu.tsx` — a React component, not `Menu.popup`, for the same reason `Ask.tsx` is a component and not `window.prompt`: nothing under `test/` can drive a native menu, it costs an IPC round trip per open, and `--click-button` (`library-window.ts`) has no way to reach into one. `--click-button` matching on `.branch`/`.branch-name` text is why nothing may move exclusively behind a menu. A roving `tabIndex` (`roving.ts`) keeps exactly one row per pane a Tab stop; Mod-Shift-M and the `ContextMenu` key open the menu at the focused row's own position, so the keyboard route and the mouse route land on the same component. `onRenameFolder`/`onDeleteFolder` take a `path` now, not the toolbar's `lastFolder` — a per-row menu has to act on the row that was actually right-clicked, and the toolbar keeps its old behaviour by passing `lastFolder` explicitly.

The reader toolbar's Rename/Move/Duplicate/Reveal/Delete collapsed into one **"Actions"** `ContextMenu` for the same crowding reason the folder tree's rows did — and the four insert glyphs (🖼 🔗 ▦ 📎) beside them collapsed into an **"Insert"** one, built from `editor-menu.ts`'s `insertMenuItems` so the toolbar and the note panel's right-click menu cannot drift; the capture window's status bar carries the same Insert button, since leaving its four glyphs there would give one app two vocabularies for one action. Both were labelled with a glyph until a second glyph-labelled menu appeared next to the first and neither said anything. A menu *opened by a plain button* is a reachable route for `--click-button` (`"Actions>Rename"` works, matched two levels deep by `library-window.ts`'s selector, which now also reads `.context-menu-label`), so this does not violate the rule above. That only holds because a step taken while a menu is open searches **inside** the menu rather than the whole page: the folder toolbar's buttons carry the same `library.rename`/`library.delete` strings and sit earlier in document order, so an unscoped match would turn `"Actions>Delete"` into *Delete folder*. Any future panel that reuses a label a menu also uses depends on that scoping. The rule is unchanged for a menu that only opens on right-click or `Mod-Shift-M`/`ContextMenu`: `--click-button` still cannot reach one of those, which is why every one of *those* actions keeps a non-menu route too.

B42's row, column and alignment commands were the exception that proved it: they existed from the start and lived *only* in the note panel's right-click menu, and were duly reported as missing features. `table-toolbar.ts` is the second route — a widget decoration above whichever table the caret is in, built on `checkbox.ts`'s recipe (`contentEditable="false"`, `stopEvent`, `ignoreSelection`, and a `preventDefault`ed `mousedown` so the command acts on the cell you clicked from). Its labels are short *visible* text (`table.rowAbove` → "Row ↑") with the menu's full sentence as the `title`, because `--click-button` matches a button on its own `textContent` — a glyph beside the word would put these straight back out of reach. Delete-table stays menu-only, being the destructive one. `t` reaches the plugin through `CommandContext` as its one optional field, falling back to English, so the half-dozen tests that build a context by hand need not carry a translator.


**The capture window has a renderer harness now, and it answers half the questions — say
which half.** `test/helpers/capture.ts` mounts the real `Capture` against a stubbed
`window.emqnote`, exactly as `library-disk-change.test.ts` has mounted `Library` all along;
`scripts/drive-capture.ts` drives the real window under its own `Xvfb` over CDP. The
sentence every batch since the disk-change work ended on — "the capture window has no test
harness" — was two claims wearing one coat, and only the narrower one was ever true: the
window has been *reachable* since 15 August 2026 (`HISTORY.md`), and what it lacked was a
unit-test harness. Nothing about the window had ever prevented one. It was simply never
pointed at, and the broad version of the sentence kept getting repeated because nobody
re-checked it.

**The dividing line is layout, and it is not negotiable.** jsdom loads no images and
computes no boxes, so `getBoundingClientRect` is all zeros and `naturalWidth` is always 0.
Anything that turns on where something sits or whether a picture decoded — the `/` menu
flipping above the caret, the table toolbar over a rectangle, `image-resize.ts`'s geometry,
whether an attachment actually draws — belongs in the driver or with a person, never in a
jsdom assertion dressed up to look like one. The driver's own headline step asserts
`naturalWidth !== 0` rather than the presence of an `<img>` for exactly this reason: an
element in the DOM proves the node view ran and proves nothing about whether the picture
arrived. Four separate features spent months unverified on that one difference.

**Layout is the line; input is not, and this file said otherwise for a week.** The harness
used to state that character input was unreachable in jsdom, "through `beforeinput` and the
DOM observer, neither of which jsdom drives for a `contenteditable`". Half of that is wrong,
and it is the load-bearing half: jsdom implements `MutationObserver`, ProseMirror's
`DOMObserver` is built on it, and its callback calls `flush()` synchronously — so writing a
character into the contenteditable and moving the DOM selection is read back exactly as a
browser's own typing is. `readDOMChange` runs, `handleTextInput` fires, input rules apply,
and `helpers/capture.ts`'s `typeInBody` is nothing more than that. It was never tried; it
was inferred from the name of one event and written down as settled — the same failure as
the "no test harness" sentence three paragraphs up, in the same file, in the same week. **A
capability inferred from a mechanism is a guess.**

**The line has been walked, and here is where it actually falls.** Nine suites in, four
things in this window turn out to be unreachable in jsdom, and each was *measured* rather
than reasoned about — which matters, because three of them look like ordinary behaviour
rather than layout. **An inline PDF's page arrives over `fetch()` on `emqnote-thumb://`**,
so the embed never gets past its chip and the bar the page controls live on is never drawn
(`TEST-PROTOCOL.md` §15k, §17h, §18k, §22q's ⧉) — the driver takes that one now, with a
three-page PDF it builds itself. **A click on a markdown link goes
through ProseMirror's `handleClick`, which asks `posAtCoords` first**, so it never fires —
and those rows are about *aiming* at the last character, which makes them layout wearing a
behaviour's clothes (§18g–§18i). A `[[…]]` chip is the opposite and does work: its node view
listens for a plain DOM click and never asks where the pointer was. **Shift+arrow within a
cell's text is a selection the browser moves and ProseMirror reads back**, so the step
`extendCellSelection`'s guard is about never happens (§20h–§20k). And **a panel scrolling is
not a thing jsdom does at all** (§20a). Everything else asked of this window so far is
reachable, typing and pasting included.

What jsdom genuinely lacks here is narrower, and is a *hole* rather than an absence:
`Element.getClientRects` exists and answers zeros, and `Range.getClientRects` is not
implemented at all. ProseMirror's `singleRect` therefore throws a `TypeError` instead of
reading a zero, and it reaches that line from `scrollToSelection` — which every text-editing
transaction sets. So the first character typed into a document that already holds text
throws out of `updateState`, inside a MutationObserver callback, as an unhandled error
attributed to whichever test was running by then. `helpers/capture.ts` gives `Range` the
zeros `Element` already gives, which is consistency rather than a fake measurement, and says
so where it does it.

**Anything still arriving moves the boxes, not just a toolbar — so order the steps by what
settles.** Adding the PDF to `scripts/drive-capture.ts`'s fixture note broke the table drag
two steps later, which had been green twice: the page arrives asynchronously and relaid the
document out from under coordinates that had already been re-measured once. Reordering so
the PDF steps run first — each of which waits for its own picture — fixed it, and that is
the general shape: **a driver step that measures anything owes the steps before it a
finished layout.** The narrower lesson below came first and is the same one.

**Waiting for `complete && naturalWidth` on an `<img>` that is already drawn waits for
nothing.** The page-turn step counts ink before and after ▶, and its first version waited
for the picture to be "loaded" — which the page already on screen satisfies immediately, so
it counted the old page and passed for the wrong reason. It then failed for the right one
the moment the wait was tightened. The fix is to remember the `src` first and wait for a
*different* blob: the identity of what arrived, never its readiness. A check that can be
satisfied by the state it is meant to detect a change from is not a check.

**Coordinates taken before a click are stale after it, and a drag aimed with them lands in
the wrong row.** `scripts/drive-capture.ts` measures a table's cells, drags from one to
another and expects a two-by-two rectangle; it got a one-by-two, and the app was not at
fault. `table-toolbar.ts` draws its bar as a widget decoration *above* the table, and the
bar appears the moment the caret enters a cell — so the mousedown that starts the drag
pushes every row below it down by the height of a toolbar that did not exist when the
coordinates were read, and the point aimed at the second row is now over the first. The
failure reads as a rectangle that will not grow downwards: a plausible, specific, entirely
wrong diagnosis. The driver clicks once, re-measures, and only then drags. Any future step
that aims a pointer at something a click can move owes the same, and its failure message
carries the coordinates and the viewport for the reason `--trash-probe` reports evidence
rather than asserting a cause.

**The harness stub covers the window *and its children*, which is what broke first.**
`Capture.tsx` never mentions `tagSuggestions`, `peopleSuggestions`, `locationSuggestions`,
`pdfPageCount` or `openExternal` — but `HeaderBlock` calls three of them the moment anything
is typed into Tags, Where or Who, `attachment-view.ts` calls the fourth the moment a `.pdf`
embed gets a node view, and the fifth the moment anyone clicks the chip a web picture starts
life as — that last one added a batch later than the others, by the suite that needed it,
which is the rule restating itself: the list is not finished, it is only as long as what has
been pointed at so far. An absent one throws out of a `void` promise chain, which arrives as an
unhandled rejection attributed to whichever test was running by then: the reported test and
the broken one are two different tests, the same shape as `capture-writer.test.ts`'s
rename race. Grepping the subject component for `window.emqnote.` is not enough; the stub
has to cover what it renders.

**Driving the real window: own the X server, and own the process group.** `xvfb-run` writes
a fresh `Xauthority` into a temp directory and exports `XAUTHORITY` to its own child only,
so the app draws perfectly while every `xdotool` and `xwininfo` beside it is refused with
"Authorization required" — a harness failure that reads exactly like a failure of the window
under test. `scripts/drive-capture.ts` therefore starts a bare `Xvfb` on a display number it
picks itself. And it spawns `detached: true` and signals the *negative* pid: killing the pid
alone leaves the Electron tree and the X server behind, and the survivor still holds
`--remote-debugging-port`, so the next run dies on a port bind that reads like a bug in the
app. Both of these cost a run each before they were understood. The rest of the sandbox's X
rules still apply and are in the project memory: no window manager, so `windowfocus` and
never `windowactivate`; `xwininfo`'s Map State rather than `xdotool getwindowgeometry`,
which answers for a hidden window too — and this window is hidden by design, so a check that
cannot tell the two apart passes before the hotkey is ever pressed.

**A shared rule has to be more specific than the rule it is replacing, and it is not enough
to write that it is** (B82's title field, 23 August 2026). `.title-field` is one class. The
capture window's title sits inside `.header`, where `.header input` is one class *and one
element* — so it out-ranked the shared rule and went on setting the 13px, the padding and the
tinted background it was meant to replace. The field did not change, the whole suite stayed
green, and the comment above the rule claimed in so many words that it was "two classes deep".
It is B48's bug and the `.overlay` bug for the third time: **correct-looking CSS defeated by
the cascade, invisible to every test that does not read the rule itself**, and here invisible
to the author too. The selector names the container now (`.header .title-field,
.reader-header .title-field`), which settles it outright rather than on source order — a tie
would be decided by which file loads last, and a later edit would flip it without touching
either rule. `:focus` needs the same treatment one pseudo-class along, **and has to restate
`background`**: `.header input:focus` fills a focused header field with `--background`, so
without it the capture window's title took a fill on focus that the library's never did — the
difference between the two windows that this work exists to remove, reappearing one state
along. `styles-title-field.test.ts` pins the pair.

**What actually caught it is worth more than the fix: the driver runs `out/`, and does not
build.** `npm run drive:capture` starts `out/main/index.js`. It does not run `npm run build`
first, so a renderer change made after the last build is simply not in the window being
driven — which reads as a change that does nothing, which is exactly what the specificity bug
also reads as. Two different causes, one symptom, and they were stacked. **Build before
driving, every time**, and when the app appears not to have changed, rule the stale bundle out
before believing anything about the code. The probe that settled it read `getComputedStyle`
off the real field rather than judging a screenshot.

**`:focus` does not match under `Xvfb` unless focus is emulated.** The same probe reported
`document.activeElement === field` and `field.matches(":focus") === false`, because Chromium
only matches `:focus` while the *document* has focus and there is no window manager here to
give it any. `Emulation.setFocusEmulationEnabled` over CDP is what makes a focus style
measurable at all; without it a perfectly good `:focus` rule reads as a rule that does not
apply. This is the same family as the memory's `windowfocus`/`windowactivate` note: the
sandbox's window focus is not the app's.

**The bullet levels are one family of glyphs, and the sizes are the glyphs rather than a
`font-size`** (23 August 2026). Reported as "levels one and two are smaller than the square at
level three, on macOS". Neither half of that survived measurement. It was never only macOS:
`\2022` and `\25E6` carry 0.293em of ink against `\25AA`'s 0.504em *in one face*, because
U+25AA is small next to U+25A0 rather than next to a bullet — so no font choice was going to
make the old three agree. What macOS added is that `\2022` is General Punctuation and SF
carries it while the other two are Geometric Shapes and SF does not, so a Mac drew level one
from the system face and the rest from whatever fell back. All three levels are Geometric
Shapes now (`\25CF`, `\25CB`, `\25AA`), which is what makes them fall back *together* — and is
why there is no `font-family` in those rules to keep right.

**`font-size` on a `::marker` was tried first and is the wrong lever.** `--marker-gap` is an em
space *in the marker's own font*, so it scales with the glyph and the marker box grows with
both — and rendered, the enlarged marker grew the line boxes too: every list line taller, the
spacing ragged. Two faults for one fix. A wider glyph at the same font-size changes one number
instead, `--marker-slot`, which is per-depth now (1.88em for the circles, 1.66em for the
square, 1.5em reset for `ol > li` — **that reset is load-bearing**, since custom properties
inherit and a numbered list nested in a bullet would otherwise take the circles' slot). The
square's 1.66em is a fix rather than a consequence: the single 1.5em it replaces was tuned to
the old bullet, so level three's checkbox had always sat 2.5px left of its own marker. And the
two vertical constants moved down 0.115em together, because `\25CF` and `\25AA` share an ink
centre at 0.766em above the first baseline where `\2022` sat at 0.648em — one number each and
no per-depth override, which is only possible because the three glyphs now agree with each
other. Every figure here was read off a screenshot at four times size in a real Chromium, the
way that section's existing numbers were; all three levels land within a quarter of a pixel on
both axes, which the version they replace did not.

**A completion panel's `max-width: 100%` does not contain it, because `min-width` wins**
(23 August 2026). `.tag-suggest` is `min-width: 220px; max-width: 100%`, and CSS resolves
`min-width` last — so in a cell narrower than 220px the panel is 220px wide and the
`max-width` is decorative. The header grid is `auto minmax(0, 1fr) auto minmax(0, 1fr)` and
`HeaderBlock` emits When, **Tags**, Where, **Who**, so those two sit in the right-hand track:
their panels start halfway across the window and run 220px from there, out through the frame
at anything near the 460px minimum. The fix is which edge they hang from, not a width —
right-anchored they grow leftwards into the header, where there is always the other column to
grow into. Where and When must keep `left: 0` for the mirror image of that reason, so this is
a pair of rules and not one applied to all four. Deliberately **not** a JS clamp like
`ContextMenu`'s or `slash-menu`'s: those are `position: fixed` on `<body>` with no containing
block, and have to measure at open time; these have a cell to hang off, and which edge is a
property of the layout. `styles-typeahead-edge.test.ts` pins both halves.

**The shortcut sheet's columns are balanced in the component, because a grid cannot do it**
(23 August 2026). `.help-groups` is a two-track grid filling row-major and `SHORTCUT_GROUPS`
is 10, 7, 11, 4 and 8 entries in a fixed order, so it laid out as `[text | lists] /
[structure | note] / [window | nothing]` — and a grid row is as tall as its taller member, so
the sheet stood 32 rows high in the library and 28 in the capture window beside a column that
was mostly empty, scrolling past its own whitespace. No track sizing reaches that: it is
which group goes where. `Help.tsx`'s `balanceColumns` cuts the list in two and the grid lays
the result out (19/22 in capture, 19/24 in the library). **The cut is contiguous on purpose**
— columns are read down and then across, so a contiguous cut preserves the declared order,
where picking the two best-fitting groups saves one row and shuffles the sheet. The weight
counts the heading *and* the two hotkey rows the sheet renders that no registry entry
accounts for; measured on `SHORTCUTS` alone it is wrong by exactly those two. `columns: 2` is
still the wrong tool for the reason already recorded in the stylesheet: it lays overflow out
sideways, past an edge `overflow-y` cannot reach.

**The Tasks scope chooser rolls up, and asks whichever count the tick is asking**
(23 August 2026, `foldersWithTasks`). It listed every folder in the vault, which in a vault of
any size is a chooser whose commonest outcome is an empty pane. Two things decide whether
narrowing it is right. `tasksIn` scopes by path *prefix*, so a folder qualifies on what is
**beneath** it — which `IPC.libraryFolderTaskCounts` cannot answer, since
`openTaskCountsByFolder` counts notes directly in a folder and deliberately does not roll up
(the sidebar badge is about the folder itself). The per-note counts are the ones that fold, and
they are already in the window. The vault root and the current scope are always kept — a
`<select>` whose value is not among its options renders blank — and a `null` count offers
everything rather than nothing, the call `withOpenTasks` already makes for the badge.

**And the second half of that rule was written the wrong way round first, which is the part
worth remembering.** It asked `total` unconditionally, so that keying off the "open only"
checkbox could not rebuild the list under the user's hands. What that overlooked is that the
view *opens* with the box ticked: a folder whose tasks are all finished was therefore offered
by a chooser whose pane, once chosen, was empty — reported twice, the second time after the
first had been closed as not reproducible. The tick is now part of the question (`open` while
it is on, `total` while it is off), and the rebuild the old rule feared is answered by the rule
above it rather than avoided: `scope` is never dropped, so the folder being stood in survives
its own last task going out of scope. **A filter and the list it feeds must ask the same
question**, or the filter offers things the list cannot show.

**Every delete question counts the open tasks going with it, through one walk**
(23 August 2026, `openTasksAt`). B86 gave the count to the two permanent deletes; the two
ordinary ones — Delete on a note, Delete folder in the tree — did not have it, on the unstated
reasoning that a trip to `_trash` is reversible. It is the same fact either way: a trashed note
leaves the Tasks view and every folder badge the moment it goes, and what is still to be *done*
in it is what a title says least about. Restore is the difference, and it is a difference in the
buttons rather than in the count. The walk is `openTasksAt` in `vault-io.ts`, which was called
`trashItemTasks` while `_trash` was its only caller — **it never had anything to do with the
trash**, and the old name is exactly the kind that makes the second caller write a second copy
rather than reuse the first. Both numbers are fetched before the dialog opens
(`Promise.all` for the folder, which needs `folderContents` as well): a question that appears on
one answer and grows a clause on the other is a question that changes while it is being read.
And the `delete` dialog carries the **path** it asked about, so confirming trashes the note the
sentence named rather than whatever `openRef` happens to hold.

**The Empty-trash confirmation counts the trash, not the rows on screen** (`trashContents`,
23 August 2026). It named `notes.length`, which is the note list's own rows for `_trash` — one
non-recursive `readdir` of `.md` files. So a folder dragged to the trash with forty notes in
it counted as nothing, every folder counted as nothing, and every attachment counted as
nothing, in the sentence in front of the only irreversible operation in this app. It is
**deliberately not `folderContents(vault, "_trash")`**: that function counts only note files
and skips `_attachments`, `_templates` and dotted names, which is right for a folder chooser
walking the vault tree and wrong here. The trash is not the tree — everything in it is going,
so everything in it is counted, or the dialog understates the button in exactly the way the
count it replaces did. It shares that function's depth cap and per-directory `try`/`catch`,
and it is taken when the dialog opens rather than cached: the number has to be what is about
to be deleted.

**A component that arms a timer owns cancelling it, even in a window that is never
unmounted** (23 August 2026). Both windows debounced a change onto a `setTimeout` and
neither cleared it when its tree went away. In the app that is genuinely unreachable: the
capture window is created once and only hidden, and the library's tree is not unmounted
while it runs — which is exactly the reasoning that left it out, and exactly the shape of
reasoning this file keeps having to correct. **In jsdom the tree is unmounted between every
test**, so a timer armed by the last keystroke of one test fires 300 ms later into an
environment that has been torn down: `window` is gone, `send` throws `ReferenceError:
window is not defined`, and it is **charged to whichever test happens to be running by
then**. The reported test and the broken one are two different tests — `capture-writer`'s
rename race, one file over, for the same reason.

**It failed the `v0.11.0` release on the Windows runner and a `main` build the day before,
and it has never once failed locally**: a loaded runner is what widens the gap between the
last keystroke and teardown enough for the timer to land inside it. Sixteen local runs of
the capture suites did not reproduce it. What identified it was the stack in the CI
annotation naming the debounce, not a repro — which is the honest order for a failure of
this shape, and the reason to read a red release rather than re-run it.

**Fake timers cannot test this, and the first attempt silently could not fail.**
`vi.useFakeTimers()` replaces `setTimeout` from the moment it is called; the debounce is
armed with the real one before that, so advancing fake time never reaches it and the test
passes just as happily with the cleanup ripped out. The tests arm the timer, unmount, and
then wait out a real margin — a *duration*, which this file's own rule warns against, and
the exception is stated rather than smuggled: the rule is "wait for a result, never for a
duration", and what is being waited for here is the **absence** of one. A non-event has no
result to wait on. Both tests were confirmed red against a disabled cleanup, which is the
only thing that makes either worth having.

**The library's copy was fixed at the same time and had not been reported**, which is not
the same as being safe: identical construction, in a component `library-*.test.ts` mounts
and unmounts a dozen times a run, with *both* its timers reaching `window.emqnote` when
they fire. A defect class found in one window is a grep, not a fix.

**A control both windows draw is one rule in `styles.css`, and it names its colour rather
than inheriting it** (23 August 2026). `[Insert] [Actions] [Help]` sits at the foot of the
capture window and at the foot of the library's note editor, and for a while each window drew
its own: 11px against 12px, a 4px radius against 5px, `--muted` text against the body colour,
and a Help button with no border at rest beside two that had one. B82 had already put the two
*balls* in the same place; what it did not do was stop them being two copies. `.reader-actions
button` now lives in `styles.css` and names `.capture-actions` beside it, for the reason
`.title-field`, `.palette` and `.ask` are all there: **both windows load `styles.css` and only
one loads `library.css`**, so a shared control's rule cannot live in the library's file. The
second half is the trap. The library's own version said `color: inherit`, which is right there
— `.reader-footer` sets no colour — and wrong in the capture window, where `.statusbar` sets
`--muted` for the status text in it, so the very same declaration draws the three buttons grey.
The fix that suggests itself, `.statusbar .capture-actions button { color: var(--text) }`, is
three classes and an element and would out-rank the plain `:hover` rule below it, so hovering
would stop colouring them: correct-looking CSS defeated by the cascade, the same family as B48
and `.overlay`. **Name the colour in the shared rule.** `test/styles-window-chrome.test.ts`
pins both halves, including that `library.css` has no `.reader-actions` rule left in it.

**`space-between` distributes however many children it is given, so a bar with two ends
needs exactly two of them** (23 August 2026, `.statusbar`). That rule put the capture window's
`[Insert] [Actions] [Help]` somewhere in the middle of its footer while the library's stood in
the corner — with both windows wearing the same rule for the buttons themselves, which is why
this read as a mystery rather than as drift. The bar had **four** children: three pieces of
status text and the button group. The library's footer has always had two, `.reader-status` and
`.reader-actions`, and the fix is to give the capture window the same shape — `.reader-status`
moved into `styles.css` and named `.capture-status` beside it, the way the buttons' own rule
already was. **An empty element still takes a slot and a gap**: the latency readout renders as
an empty `<span>` until the first measurement arrives, and it was that invisible fourth child
holding the right-hand end of the bar. It now sits inside the status group, where it belongs
anyway — it is ambient status like the two beside it. `styles-window-chrome.test.ts` pins the
shared rule *and* that `Capture.tsx` actually carries the class, which is the failure one step
earlier than the cascade: a rule naming a class nothing wears passes every text check and
changes nothing on screen.

**The two strips that were left out of the shading, and were the ones you type into**
(23 August 2026). B82 put `.reader-header`, `.reader-footer` and `.notes-header` on `--surface`;
`.notes-search` and `.header-reader` kept no background of their own, so in the light theme they
sat on `--background` — `#fbfbfc` against `#ffffff`, which is invisible in a screenshot from a
sandbox and reads as a seam on a real display. (Those two values are the wrong way round, and
B87 has since swapped them; the seam and the fix for it are the same either way.) `.header-reader` is the worse of the two: it is
the *same component* the capture window draws inside `.header`, which has always been
`--surface`, so one shared block was drawing itself two different colours depending on the
window. Measured rather than judged: `--library --screenshot` under `Xvfb`, pixels read out of
the PNG, `(251, 251, 252)` before and `(255, 255, 255)` after. The note list itself stays on
`--background` deliberately — a list is not a surface.

**Discard asks first, and "is there anything to lose" is a question about the document's
structure** (B85). Two shortcuts are available here and both are wrong. `dirtyRef` is the
obvious signal and **over-reports by design** — its own comment says so — so it stays true
after a character is typed and deleted again, and a visibly empty window would ask a question
about nothing, which is how people learn to click through questions. `doc.textContent` is the
other, and it under-reports in the one case that matters: a note holding nothing but a pasted
picture, an attachment or an empty table has no text at all, and it is precisely the note whose
contents could not be retyped. The test is the one a fresh editor satisfies — a single empty
textblock — and the header is compared field by field against a fresh `HeaderValues`, so a
field added later is covered without anyone remembering this function exists. The chord and the
menu item go through one function for the reason the `existing` check they also share does, and
the dialog joins `overlayOpenRef` so Escape cancels it instead of reaching `fires("close")` and
hiding the window with the question still on it.

**The trash's confirmation counts two things that are not in the trash, and one of them is
exact only because it subtracts** (B86). `trashContents` walks `_trash` and now parses every
note in it for open tasks — through `taskItemsIn`, never a regular expression over the raw
text, because that function is the one place that decides what a task item is and the index and
the checkboxes both already ask it. The other number is `attachmentsOrphanedByTrash`, and it
counts files **outside** the trash that emptying it would leave unreferenced: a trashed note
goes on counting as a reference for as long as it can be restored, which is deliberate in
`findUnlinkedAttachments` and is why a picture only that note embeds is not unlinked today. To
be exact rather than a guess it takes the live notes' targets out of the set, and it takes them
**from the index** (`note_links`) rather than by reading the vault — reading it instead is what
once left the unlinked pane sitting on "Looking…" on a Files On-Demand vault, and this runs in
front of a dialog. Only the trash is read directly, because the index deliberately leaves it
out. A note that will not parse counts as zero rather than taking the whole count down: these
numbers are a warning in a sentence, not a manifest, and `emptyTrash` is what reports what
actually went.

**Chrome is `--surface`, the page is `--background`, a field is `--field`, and there are exactly
two state tints** (B87, 26 August 2026). Six roles, declared once per theme at the top of
`styles.css`, and a rule that wants a colour picks the role rather than a value. What broke
without it was measured rather than argued: in the light theme the two surface tokens were the
wrong way round — `--surface: #ffffff` framing a `--background: #fbfbfc` page — so the chrome was
*lighter* than what it framed. `DESIGN-CRITIQUE.md`'s Finding 2 photographed the result: the note
list and the reader the same colour, divided by one pixel at **1.28 : 1**, the tree a further
1.6 % away, and a code block, a wiki-link chip and a tag chip all drawn white on off-white.
**The dark theme had none of it, from the same two tokens**, which is the tell — a pair chosen
where it works and never checked where it doesn't, and the same shape as the two strips one
entry above that had to be patched by hand for the same underlying reason.

Three things about it are load-bearing. **The dark theme's five surfaces keep their exact
values**; it gains the three new names only, and `--field` is `#1e1f22` there — the old
`--background` — because every field in the app sits inside a `--surface` container, so that one
choice leaves every dark field where it was. **The note list stays `--background`**: "a list is
not a surface" still holds, and `styles-window-chrome.test.ts` still pins that `.notes` is not
`--surface`. **`--hover` and `--selected` stay translucent grey and are not overridden per
theme** — a state tint lands on two different grounds, a white list row and a grey chrome
button, and an overlay steps relative to whatever is under it where a solid grey can only be
right on one of them.

They are also **two** tints where there were seven: `rgba(127, 127, 127, α)` with
α ∈ {0.08, 0.09, 0.10, 0.12, 0.14, 0.18, 0.20} across fifteen rules, which put a hovered branch
four hundredths from a selected note and made a selected branch pixel-identical to a hovered
title-bar button. `styles-surfaces.test.ts` counts the literals that are left — exactly one per
sheet — so they cannot grow back: the note's own table header row (document content, not a UI
state) and the scan bar's fill (a progress bar is not a selection). Both carry a comment saying
so above them.

Two smaller things the same test now guards. **Every `var()` names a token that exists**:
`var(--bg)` and `var(--fg)` sat in `styles.css` for a long time, declared nowhere, resolving to
nothing, in rules that therefore did nothing and looked fine in every review. And
**`backgroundColor` is not a hardcoded `#1e1f22` in the two window files** — it is
`windowBackground()`, which asks `nativeTheme` once at construction. A light-mode machine used to
open every window with a dark flash before the CSS landed; that was mildly wrong against a
`#fbfbfc` page and is the whole distance between the themes against a white one. No
`nativeTheme.on("updated")` listener: the colour exists only in the moment before the first
paint, and the capture window is the one waiting on a hotkey with an 80 ms budget.

**And the accent is not a seventh role: no note row wears a focus ring, and no selected
folder wears accent text** (B87's addendum, 26 August 2026). Two reports, one variable doing
two unrelated jobs. `.branch-on .branch-name` carried `color: var(--accent)` *and*
`font-weight: 600` on top of the `--selected` fill while `.note-on` carried the fill alone —
Finding 3's "the folder shouts and the note whispers", so the eye reads the tree as the live
pane whichever pane the keyboard is in. The colour is gone and the weight stays; "selected"
now means the fill in both panes, which is what Finding 3 actually asked for. Separately,
`.note:focus-visible` drew `outline: 2px solid var(--accent)` with `outline-offset: -2px`,
and Windows at 125 % scaling paints those two pixels as three — a saturated `#1a63d8` box
around a full-width row, reported as jarring. **The tree and the task list keep their ring
and the note list does not**, deliberately asymmetric: removing it everywhere would leave
`roveArrowKey` walking three panes with nothing on screen following it, and the note list is
where it did least, the row the arrows are on being nearly always the row that is open.
**What it costs is stated rather than discovered**: focus moves without selecting, so while
arrowing through the list the focused row is invisible until Enter opens it. Finding 3 stays
open, and its answer is a pane-level treatment on the focused pane's active row — not this
ring back. `styles-selection-accent.test.ts` pins both halves, including that the shared
rule still names the other two.

**Everything inside `.editor-content` is relative to `--editor-font-size`** (B88). The note's
own text is settable from the Settings panel, and the only thing that makes "larger text"
mean *the whole note* is that no rule inside the editor states a size in pixels — the
headings are `em`, so are `pre`, `code`, the wiki chips and the list gutter. That was already
true before the setting existed, by taste rather than by rule, which is exactly the kind of
property that quietly stops being true; `styles-editor-font-size.test.ts` holds every
`font-size` under `.editor-content` to `em` or the token itself. One rule is exempt and is
named there rather than pattern-matched away: `.table-tool`, the table toolbar's buttons,
which are chrome that happens to be drawn inside the document. The token is declared in
`:root` (a `var()` naming nothing is what `styles-surfaces.test.ts` exists to catch) and
overwritten on `document.documentElement` from `useBootstrap`. Measured under `Xvfb`: the H1
"Kwartaalplan" is 142 / 174 / 219 px wide at 13 / 16 / 20, against 141.4 and 217.5 predicted.

**A settings change is its own message, and `libraryRefresh` is not it** (B88). `IPC.settingsChanged`
is sent to both windows and answered in exactly one place — `useBootstrap`, which is what
"what the bootstrap says" already means and which both windows already call. It is not
`libraryRefresh`: that one means "ask the vault again", every save raises it, and the
library answers it by reloading the tree, the notes, the facets and the conflicts, none of
which is where a language or a font size lives. `setLocale` had been sending `libraryRefresh`
to both windows for precisely this purpose since B60 and **neither window ever acted on it** —
the capture window subscribed to nothing at all, and the library appeared to work only
because the Settings panel refreshes its own bootstrap on the way out. Found by driving it
over CDP with the panel bypassed: the note size landed in the capture window and not in the
library's own reader, which is the same hole seen from the other side — the library had only
ever looked right because the button that changes the setting also refreshes the window it
is in.
