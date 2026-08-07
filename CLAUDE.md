# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A resident Electron note-taking app that replaces a "email a note to myself" routine. Notes are plain markdown files in folders on a business OneDrive. One user, two machines (macOS and Windows), no server, no accounts.

**Language convention:** code, comments, tests and UI strings are English (commit `c24d82b` switched them over deliberately). The five design documents and the note corpus in `test/corpus/` stay Dutch — the corpus fixtures stand in for real notes, so translating them would make them worse at that job.

## Commands

```bash
npm run dev            # electron-vite dev
npm test               # vitest run — 599 tests
npm run test:watch     # keep it running while working
npm run typecheck      # tsc --noEmit
npm run build          # electron-vite build + check:bundle
npm run pack:mac       # packaged .app (zipped) in release/
npm run pack:win       # per-user NSIS installer (.exe) in release/ — see B22
```

Single test file or single test:

```bash
npx vitest run test/roundtrip.test.ts
npx vitest run -t "stays byte-identical"
```

Four diagnostic helpers:

```bash
npm run canonical -- test/corpus/24-vergadernotitie.md
```

Shows how the serializer *would* write a file, with a line diff. It exists to let you **judge** a difference, not paper over it: if the corpus differs from the serializer output, one of the two is wrong, and telling those apart is a decision.

```bash
emqnote --dump-clipboard=/tmp/paste-sample
```

Copy something from Outlook or Word first, then run this. Writes `<prefix>.html`/`.txt`/`.png` for whatever formats are on the clipboard and exits. It exists for the same reason the corpus is hand-verified real output rather than an invented approximation: nobody had captured real `mso-list` markup before phase 4 started, and `03-markdown-dialect.md`'s whole approach is not to guess at a format when the real thing is one paste away. Runs alongside the resident instance (bypasses the single-instance lock, like `--selftest`), so no need to quit the everyday app first.

```bash
emqnote.exe --selftest=50 --vault=%TEMP%\emqnote-proef
```

Runs on the *packaged* app. Measures hotkey → painted caret 50 times, then really types a note and checks a correct file lands in the Inbox. Exits with a status code, so it works in CI. Results go to `%LOCALAPPDATA%\emqnote\` / `~/Library/Application Support/emqnote/` as `selftest-result.json` plus `latency.log`. Flags are preferred over env vars because `set EMQNOTE_SELFTEST=50` only works in `cmd` — PowerShell silently ignores it. Other flags: `--library`, `--screenshot=<path>`, `--open-note=<title fragment>`, `--click-button=<label>`. `--screenshot` on its own photographs the *capture* window; with `--library` it photographs the library. `--click-button` takes a `>`-separated sequence, so `--click-button="Tags>#klantx"` unfolds the tag list and then picks one, and it matches folder and filter rows as well as buttons.

```bash
emqnote --thumbnail-probe="2026-08-04-1030-offerte.pdf" --vault=/path/to/vault
```

Diagnoses B30's "PDF preview is not showing" the way `--dump-clipboard` diagnoses a paste: instead of guessing, it prints exactly which of four things went wrong for one named `_attachments/` file and exits with a status code — not previewable (wrong extension), `resolveAttachment` returned null (missing, or a name that does not resolve inside `_attachments/`), `nativeImage` returned an empty image (no OS thumbnail provider could draw it — compare against Quick Look/Explorer on the same file), or a success that names the PNG's path. It deliberately bypasses `failedThisSession` (`thumbnails.ts`), the in-memory negative cache that would otherwise make a retried probe report the same stale failure for the rest of the session. Runs alongside the resident instance for the same reason `--dump-clipboard` does — no need to quit the everyday app first — and `--vault=` behaves exactly as it does for `--selftest`.

## Architecture

### The one rule everything else follows

> **Markdown is written in exactly one place.**

Typing, pasting from Outlook, and email import all produce the same ProseMirror document first. Only the serializer in `src/markdown/` writes `.md`. Two paths to markdown drift apart, and the drift shows up as a pasted list indenting differently from a typed one — breaking the round trip at exactly the constructions used most. This is decision B6 in `05-besluitenlog.md`; treat it as binding.

A direct consequence: **the renderer never writes files and never serializes markdown.** Documents cross IPC as ProseMirror JSON (`CapturePayload.doc`); the main process serializes.

### One schema, not two

`src/markdown/schema.ts` is *both* the file-format schema and the editor schema — which is why it carries `toDOM`/`parseDOM` specs. This is why the editor is ProseMirror directly rather than TipTap (B17): TipTap builds its schema from extensions, which would be a second definition.

Two things set the schema apart from a stock one, and both are why the project exists:
- `listItem` accepts block content (`paragraph block*`), not just inline — that is what lets a paragraph, table or nested mixed list hang under a bullet. Obsidian failing at this is a founding motivation.
- `underline` (→ `<u>`) and `highlight` (→ `==text==`) exist as marks, because markdown lacks them and everyday Outlook use does not.

`MARK_NESTING_ORDER` fixes the nesting order of marks so serialization is deterministic.

### Layers

| Path | Role |
|---|---|
| `src/markdown/` | Parser and serializer. No Electron, no DOM — testable standalone. `pipeline.ts` holds remark config, `note.ts` the public entry (`parseNote`/`serializeNote`). |
| `src/main/` | Node side. All file I/O, window management, tray, hotkey, latency measurement. `vault-io.ts` and `vault-scan.ts` are deliberately Electron-free so the rules can be tested directly. |
| `src/preload/` | CJS bridge exposing `window.emqnote`. Stays CJS: a sandboxed preload cannot load ESM, and the sandbox stays on. |
| `src/renderer/` | React shell + ProseMirror. Two entries: `index.html` (capture) and `library.html` (library window). |
| `src/shared/` | Imported by both sides. `ipc.ts` is the main/renderer contract. |

### Resident architecture

The main process runs continuously. The capture window is created and rendered at startup but kept hidden, with `backgroundThrottling: false` so Chromium does not put it to sleep. The hotkey does nothing but `show()` + focus. Cold start then costs once per day, at login — which is what makes the Electron choice viable (B2/B3).

Latency budgets are hard, measured, and failing them is a bug not a wish: hotkey → caret **< 80 ms**, keystroke → glyph **< 16 ms**, search **< 30 ms**, opening a note **< 50 ms**. Windows is tighter.

**A hotkey → caret figure without its display attached means nothing.** The measurement ends after two `requestAnimationFrame` callbacks, so it is quantized to the refresh interval and roughly halves at 120 Hz. Measured packaged figures:

| Machine | Display | p50 | p95 | When |
|---|---|---|---|---|
| unrecorded — not the Mac mini, which has no internal panel | unrecorded; the numbers fit a 120 Hz panel | 26 ms | 43 ms | phase 2 |
| Mac mini M4 | external 2490W1, 1920×1080 @ 60 Hz | 60 ms | 62–68 ms | phase 3 |
| Mac mini M4 | external 2490W1, 1920×1080 @ 60 Hz | 27–31 ms | 36–45 ms | 28 Jul 2026 |

Record the machine and refresh rate with any future figure. The first row cannot be reproduced because neither was written down.

**The second and third rows disagree, on identical hardware, and that is not yet explained.** The third is three consecutive packaged runs of fifty rounds (27.4/27.3/30.9 p50, zero missed), taken on a quiet machine after the ten items above; the second is the phase-3 figure. Nothing in those ten items touches this path — the hotkey does `show()` and focus on a window that is already rendered — and a change that halved it would be a surprise, not a win to claim. Treat the third row as "measured, reproducible, unexplained" until someone re-measures the phase-3 build on the same display and settles which condition differed.

What the second row supported: the phase-1 commit (`5051ca7`, a `<textarea>`, no ProseMirror) measured 60.7 ms on the Mac mini against 60.5 ms for the phase-3 build, and removing the two-frame wait dropped it to 37.9 ms — so ~23 ms of that 60 was the deliberate wait and the rest `show()` + focus + the IPC round trip. The conclusion that survives either row is the one that matters: **the editor and the library cost nothing on this path**, as designed.

The floor claim that went with the second row — "on a 60 Hz display the floor is ~44 ms" — does not hold against the third, which sits below it consistently. Do not rely on it without re-measuring.

The capture window's bundle is kept deliberately small — it is the one that must appear instantly — so the library window is a separate rollup entry and its tree, list and dialogs are not loaded into it.

## Constraints that bite if forgotten

**Opening a note must not touch the file** (B10). No reformatting, no `modified` bump, no normalisation. Writes happen 800 ms after the last keystroke (or on blur/close), atomically via `.tmp` + `rename()`, and only when the serialized bytes actually differ. This is the cheapest and most effective OneDrive conflict prevention there is, and it costs only discipline — the great majority of conflict copies come from apps touching files the user did not change. `test/vault-io.test.ts` guards it.

**`package.json` `dependencies` is kept minimal on purpose.** electron-vite externalises everything listed there, so a listed package produces a bare `import` in the bundle without the folder being shipped — `ERR_MODULE_NOT_FOUND` on startup, and invisible when tested from the project directory where `node_modules` happens to exist. Build packages live in `devDependencies`. `npm run check:bundle` is the static guard and runs as part of `npm run build`. A genuine runtime package that can't be bundled (`electron-updater`, since B22; a native module like `better-sqlite3` in phase 5) *does* belong in `dependencies`, and electron-builder ships it via its own dependency walk — `electron-builder.yml`'s `files` list no longer excludes `node_modules` wholesale for exactly this reason.

**Windows gets a real installer and auto-updater; macOS gets a version check and a link** (B22). `electron-builder.yml`'s `win.target` is a per-user NSIS installer (`perMachine: false` — no admin rights needed, same as unzipping a folder), and `src/main/updater.ts` drives `electron-updater` on that path with two explicit confirmations: one before downloading, one before restarting to install. macOS deliberately does not get that: no Developer ID, no notarization, so no Squirrel.Mac-based silent install. Instead it does a plain `fetch` against the GitHub releases API and opens the release page for a manual reinstall, the same upgrade step as before. Both paths read the same public GitHub repo; `src/main/update-check.ts` holds the Electron-free parsing/comparison logic, tested directly.

**Electron's default application menu is removed** (`installMinimalMenu`). It is invisible on a frameless window but its accelerators are not: it claimed Ctrl+M for Minimise, so indenting inside a list minimised the window. Only the Edit clipboard roles stay, because on macOS the menu is what makes Cmd+C/Cmd+V work at all. macOS additionally gets an application submenu, because without one Cmd+Q was dead — but its Quit item is a custom click, never `{ role: "quit" }`: **Cmd+Q closes a window, it does not quit the app** (B25). The library window closes; the capture window commits and hides; the resident process survives both, which is the whole premise of B2/B3. The item is still labelled "Quit emqnote" for muscle memory, and the tray item of that name remains the only real exit.

**The capture window is hidden, never destroyed.** `capture-window.ts` holds exactly one `BrowserWindow` reference, assigned once, so a destroyed window is unrecoverable: `reveal()` fails on `isDestroyed()` forever — hotkey and New note silently dead — and `hideCaptureWindow()` never runs, so `writer.finish()` never releases the loaded note and the library reports it "open for editing" in a window that no longer exists. On macOS the traffic lights are real (`titleBarStyle: "hidden"`), so the red button would do exactly that. The `close` handler therefore calls `preventDefault()` and routes to `hideCaptureWindow()`, the same commit-and-put-away path `IPC.captureClose` uses. A `quitting` flag, set from `before-quit`, lets a genuine quit through — without it the tray's Quit hangs on that `preventDefault()`. `reveal()` keeps its `isDestroyed()` guard but now recreates the window rather than returning.

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

**Dragging a note onto a folder and "Move to…" are one operation, not two.** `Library.tsx`'s `moveNoteTo` is what both call; the dialog reaches a folder four levels deep without hunting for it, the drag reaches one already in front of you. The rules live in `src/renderer/library/drag.ts` — `canDropNote` answers for the drop *and* for the highlight that precedes it, so a folder can never light up and then refuse. The trash accepts nothing, matching the reason `MoveDialog` already excludes it: Delete is what puts a note there, and it asks first, so the one gesture with no confirmation must not be the one that destroys something. Nothing drags out of the trash either. The drag type is private (`application/x-emqnote-path`), never `text/plain`, which would make every row draggable into any text field on the machine. `onDrop` re-checks `canDropNote` against the path in the drop rather than trusting the highlight's state, so the consequential half never depends on a render having landed.

**`IPC.libraryMoveNote` refuses a note the capture window has claimed.** `CaptureWriter`'s session holds the path it will write to, decided when the note was loaded; moving the file does not update it, so the next debounced write recreates the note where it used to be — one note in two folders, the second written by a window that thinks it is still editing the first. The move dialog could only ever reach a note the reader had open; dragging can reach any row in the list, which is what turned this from a note into a guard.

**Task state lives in the index, and the index knows its own schema version** (B26). `checked` is an attribute on `listItem`, not text, so `plainText()` drops it and FTS5 can say nothing about it — the Tasks view is answered from a `note_tasks` table filled by `buildRecord`, which the full scan and the watcher already share, and never by re-parsing a folder subtree on demand. That walk is the 470–535 ms main-thread stall that pushed the scan into a worker; reaching for it again through the back door undoes that. Because `needsRefresh` short-circuits on unchanged `mtime`+`size`, an existing index can never gain new columns on its own, so `migrate()` carries a `PRAGMA user_version` and drops its tables on a bump. That is allowed *because* of B9: the index is a derived cache outside the vault, so a rebuild costs one scan and destroys nothing. Any future column added to `NoteRecord` must bump that version.

**Ticking a checkbox from the Tasks view re-reads and re-checks first.** `toggleTask` in `vault-io.ts` re-parses the file, walks to the n-th task item, and **verifies its text still matches what the caller was shown** before flipping anything. An index row can lag the disk, and flipping the wrong line in a file the user does not have open is the one failure mode worth designing against. Then `serializeNote` + `writeAtomic`, never a text edit — B6 applies here like everywhere else. The IPC handler refuses a note the capture window has claimed, same as `IPC.libraryMoveNote`.

**Deleting a folder is a rename into `_trash`** (B27), never `rmSync`. `emptyTrash` stays the only code in the app that permanently deletes anything (B24), and a second irreversible action next to it — one that takes a whole tree rather than one note — would erase that distinction. `trashFolder` reproduces `renameFolder`'s refusals code for code, so the renderer decodes both through one `folderErrorOf`, and the handler refuses a folder holding a note the capture window has claimed.

**Attachments are served over `emqnote-attachment://`, not as `data:` URLs** (B28). A note with three screenshots would otherwise push each one through IPC a third larger, on every render; the orphaned-attachments thumbnail keeps its `data:` URL because it is one file, once. `resolveAttachment` refuses anything that lands outside `_attachments/` after `realpathSync` — following the symlinks *is* the guard, the same reasoning as `emptyTrash`, which is also why its tests compare against the real path and not the one `mkdtemp` returned. Both windows carry `emqnote-attachment:` in `img-src`; the capture window had no `img-src` at all before.

**Paste claims image files only.** `handlePaste` returns false for everything else so the existing text/HTML path is untouched. The Outlook `mso-list` reconstruction (§6.3) is deferred, not abandoned, and this must not preempt or complicate it. Inserting an attachment also deliberately does **not** write the `attachments:` frontmatter array: `saveNote` does not manage that field, and writing it would rewrite the header of every note that gains an image — B10 from the other side, the same objection that keeps body tags out of the frontmatter. **If that deferred work ever claims the paste itself, it must call `transformPastedImages(slice)` and dispatch with `.setMeta("paste", true)`, or the image pipeline below stops running.**

**A pasted picture is downloaded into `_attachments/`, never left pointing at the web.** ProseMirror's stock HTML paste produces an `image` node holding the remote address, which serializes to `![alt](https://…)` — a note that is empty offline, empty on the other machine, and blocked by the CSP even online. `paste-images.ts` is the two halves this takes: `transformPastedImages` runs inside `transformPasted` and turns an `emqnote-attachment://` image into a `wikiEmbed` on the spot (an in-app copy, never re-downloaded), and the `remoteImages()` plugin asks main for the rest and swaps in the `wikiEmbed` when the file lands. In-flight images are tracked as a `DecorationSet`, not as positions: a download takes seconds, and `DecorationSet.map` moves the marker with the text while the user types — and collapses it away if the image is deleted or undone, so a late resolution finds nothing and does nothing. The side effect lives in the plugin's `view.update`, never in `appendTransaction`, which runs inside the dispatch cycle. **Everything the renderer might be talked into is decided again in main**, which is the point: `remote-image.ts` (Electron-free, tested directly) holds the scheme allowlist — `https:`, `http:`, `data:`, and `file:` conspicuously not — the content-type allowlist, the magic-byte sniff and the naming; `fetch-attachment.ts` does the I/O with `redirect: "manual"` and **re-checks the allowlist on every `Location` header**, which is the single check standing between a pasted URL and `file:///etc/passwd` or `http://169.254.169.254/…`. Also `credentials: "omit"`, a 10 s timeout, a 20 MB cap checked against `Content-Length` *and* while streaming, and three downloads at a time. Two asymmetries are deliberate and easy to "fix" by mistake: **SVG is refused on this path though the picker still allows one** (the user chose the picker's file; nobody chose what a pasted page's server returns, and `openAttachment` hands attachments to a viewer where script in an SVG runs), and the extension comes from the sniff, then the header, then `.png` — **never from the URL path**, so a `.png` address whose bytes are JPEG cannot produce a lying filename. A refusal answers `null`, the remote `image` node stays put, and `externalImageView` draws it as a label rather than a broken-image glyph — which also fixes the same glyph for notes written in Obsidian that already carried remote image markdown.

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

**A new note is filed where the library is standing; the hotkey keeps the Inbox** (B29).
`CaptureWriter.newNoteIn` sets the folder for a session that has not picked a file yet, and
`newNoteFolder` vets what arrives over IPC — absolute paths, `..` and the trash all fall
back to the Inbox rather than being refused, because a typed note has to land somewhere.
`""` is the vault root, which was browsable but unwritable before this. Moving a note
deliberately does *not* move the tree selection with it: filing an Inbox means moving one
note after another out of the same folder.

**Tags come from two places that never write to each other.** The frontmatter `tags:` field holds what was typed in the capture window's tag field; `#tag` in the body stays in the body. `summarise()` in `vault-io.ts` merges them for display and filtering. Copying body tags into the frontmatter would mean editing one sentence rewrites the header, which is a B10 hazard.

**Timestamps are ISO 8601 with offset, never UTC `Z`** — otherwise a summer note reads back wrong in winter.

**Index, settings and window state live outside the vault**, in the local app data folder (B9). On Windows that is `%LOCALAPPDATA%`, forced in `src/main/index.ts` before `ready`, because Roaming AppData can be synced by a corporate profile. A half-synced SQLite database is a broken SQLite database.

**Trash is the vault's own `_trash` folder**, not the system recycle bin: a OneDrive file in the Windows recycle bin is not synced, so it would be gone from the other machine with no way back. Deleting a note is still only a rename into it. Emptying it is a separate, explicit action — the trash folder's note list carries a **Clear trash** button where every other folder has *New note*, behind a confirmation that names the count and says it cannot be undone (B24). `emptyTrash` in `vault-io.ts` is the only code in the app that permanently deletes anything, and it checks with `realpathSync` that its target really is `<vault>/_trash` and inside the vault before it removes a byte — `resolve()` alone would happily follow a `_trash` that turned out to be a symlink. There is deliberately no age-based prune.

**The app's own writes are told apart from a real external change by content hash, never by a timer** (B31). `own-writes.ts` remembers `sha256(contents)` per resolved path (lowercased on `win32`, the usual reason) after every `writeAtomic`, so the watcher can suppress the notification for its own debounced autosave without suppressing the *indexing* — those are two different things, and only the notification is ever skipped. A TTL ("ignore writes for N ms after our own save") was rejected because it turns a correctness property into a timing property, and OneDrive's own re-materialisation schedule is the one clock this app cannot trust. The library gets every `vault:file-changed` event unconditionally and filters against its own `open` state, because main has no reliable view of what the reader currently shows; the capture window is filtered in main instead, against `writer.activePath()`, because that path genuinely is main's own state. A clean note reloads silently; a dirty one gets a **Reload** / **Keep mine** bar; a deletion gets **Close** / **Keep mine** and — deliberately, asymmetrically — never auto-closes even when clean, because closing yanks away a window someone may be looking at and a transient OneDrive hiccup must not be able to do that unasked. The capture window cannot know from main alone whether it has unsaved edits (main only sees what has already crossed the 300 ms debounce), so it keeps its own `dirtyRef` that deliberately over-reports rather than risk discarding a half-typed sentence. `unlinkDir` is handled too, via `deleteNotesUnder` (a `substr`-based prefix match, not `LIKE` or `GLOB`, both of whose metacharacters real folder names can legitimately contain) — before this, a folder deleted outside the app left every note under it still indexed.

**Every panel has a right-click menu, and every action behind one has a non-menu route too.** The folder tree, the note list and the note panel (both windows) each get a `ContextMenu.tsx` — a React component, not `Menu.popup`, for the same reason `Ask.tsx` is a component and not `window.prompt`: nothing under `test/` can drive a native menu, it costs an IPC round trip per open, and `--click-button` (`library-window.ts`) has no way to reach into one. `--click-button` matching on `.branch`/`.branch-name` text is why nothing may move exclusively behind a menu. A roving `tabIndex` (`roving.ts`) keeps exactly one row per pane a Tab stop; Shift+F10 and the `ContextMenu` key open the menu at the focused row's own position, so the keyboard route and the mouse route land on the same component. `onRenameFolder`/`onDeleteFolder` take a `path` now, not the toolbar's `lastFolder` — a per-row menu has to act on the row that was actually right-clicked, and the toolbar keeps its old behaviour by passing `lastFolder` explicitly.

## Tests

`test/corpus/` is **the specification**, not a set of examples. Each of the 27 files is written exactly as the serializer is meant to write it. `test/roundtrip.test.ts` asserts byte-identity in both directions plus formal file shape (LF only, exactly one trailing newline, frontmatter first, no trailing whitespace). If output differs from the corpus, one of the two is wrong — decide which, deliberately. Do not relax the assertion.

`test/limitations.test.ts` pins what the dialect deliberately *cannot* express, so the boundary is visible rather than discovered later.

**The suite runs on all three platforms in CI, not only on Linux.** `build.yml`'s `check` job runs it on ubuntu; the `package` matrix job runs it again on Windows and macOS before packaging. That line was missing until `v0.3.3` and it cost a release: `vault.ts` shells out to `attrib` on Windows, reads block counts on macOS, `filename.ts` exists for Windows' reserved names, and every path comparison meets a backslash for the first time there — so a Windows-only bug in `checkFilesOnDemand` sat in `main` until a tag was pushed and `release.yml` (which always did run the suite per platform) failed the release. It has since caught a second, macOS-only bug on the very next pull request. When a test asserts on a path, assume the three platforms disagree until CI says otherwise.

The suite must stay under about two seconds so it can run on every change. `test/index-watch.test.ts` is the one deliberate exception: it runs `chokidar` against a real temp directory rather than mocking the filesystem, so real events need real wall-clock waiting. It uses a much smaller `stabilityThreshold` than the 300 ms production default (see `index-watch.ts`) and the smallest settle margin found to be reliable across repeated runs, not an arbitrary one — still worth noticing if the suite's total time starts to matter.

## Where the project stands

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

Confirmed in the real app under `Xvfb`, driven over CDP: pasting a real remote image into a note in the library reader, which downloaded, converted to a `wikiEmbed` and rendered inline; a `.pdf` wikiLink's thumbnail request falling back cleanly to the plain chip on this Linux sandbox (no OS provider here — the happy path itself needs real macOS/Windows hardware, B30's own open item); the library's whole disk-change path — silent reload when clean, the Reload/Keep-mine bar with the in-progress edit preserved when dirty, the Close/Keep-mine bar and no auto-close on a deletion, and a full minute of continuous typing producing zero false positives from the app's own autosave; the folder-tree, note-list and note-panel context menus, including a right-click correctly selecting a note-list row first; and keyboard-only navigation — arrow keys moving the roving `tabIndex`, Tab cycling tree → notes → editor, Escape returning from the editor to the note list, and Shift+F10 opening a menu at the focused row. **Not yet confirmed live**, for the same reasons the earlier batches left things open: a pasted image drawing inside the *capture* window specifically (paste was only driven in the library reader), and the capture window's own disk-change notice (no capture-renderer test harness exists to drive it, same limitation `dirtyRef`'s own comment names). Both are `TEST-PROTOCOL.md` items now.

**A report of "PDF preview is not showing" on a packaged macOS build (against a business OneDrive) was investigated on 7 August 2026, without being reproducible here** — Linux has no OS thumbnail provider at all, so this sandbox only ever exercises the fallback chip, which stayed correct throughout. `thumbnails.ts`'s `ensureThumbnail` had a `darwin`-only pre-check, `isPlaceholder`, borrowed from `vault.ts`'s `checkFilesOnDemand`: a file reporting a real size but zero disk blocks was treated as a not-yet-hydrated OneDrive placeholder and skipped before `nativeImage` was ever asked, then remembered as failed for the rest of the session. That check made sense for `checkFilesOnDemand`, which samples 40 files and takes a majority vote to answer one low-stakes question for the whole vault ("never blocks anything," its own comment says) — but gating one specific file, permanently, is a different risk profile, and a business OneDrive's File Provider has been observed reporting `blocks === 0` for files that are fully hydrated and readable. That mismatch matches the reported symptom exactly, so the check was removed rather than narrowed: a genuinely dataless file now costs one wasted read that `nativeImage.createThumbnailFromPath` already tolerates failing on, which is a strictly better trade-off than a heuristic that can silently and permanently disable the feature. `--thumbnail-probe=<name>` (see the diagnostic helpers above) was added alongside the fix so the remaining question — does `nativeImage` actually draw a first page on real macOS/Windows hardware — can be answered directly instead of guessed at; it is unverified on real hardware, same as the rest of B30's happy path, and is a `TEST-PROTOCOL.md` item (§4.5).

## The documents

Read these before making structural changes; they carry the reasoning that the code assumes.

| Document | Contents |
|---|---|
| `00-PLAN.md` | Overview, current status, what happens next |
| `01-functioneel-ontwerp.md` | What the app does, from use |
| `02-technisch-ontwerp.md` | How it fits together; §6.3 is the paste pipeline |
| `03-markdown-dialect.md` | The vault format as a specification |
| `04-bouwplan.md` | Phases with acceptance criteria |
| `05-besluitenlog.md` | Decisions B1–B31, with what was rejected and why |
| `TEST-PROTOCOL.md` | Manual test pass for a human, per platform — what automation cannot reach |

Acceptance criteria in `04-bouwplan.md` are the definition of a phase being done — not "the code exists". When a decision in `05-besluitenlog.md` is revisited, that log is where the change belongs.
