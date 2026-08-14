# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A resident Electron note-taking app that replaces a "email a note to myself" routine. Notes are plain markdown files in folders on a business OneDrive. One user, two machines (macOS and Windows), no server, no accounts.

**Language convention:** code, comments, tests and UI strings are English (commit `c24d82b` switched them over deliberately). The five design documents and the note corpus in `test/corpus/` stay Dutch — the corpus fixtures stand in for real notes, so translating them would make them worse at that job.

## Commands

```bash
npm run dev            # electron-vite dev
npm test               # vitest run — 1216 tests
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

Diagnoses B30's "PDF preview is not showing" the way `--dump-clipboard` diagnoses a paste: instead of guessing, it prints exactly which of four things went wrong for one named attachment and exits with a status code — not previewable (wrong extension), `resolveAttachment` returned null (missing, or a name that does not resolve inside the vault — `_attachments/` first, then the vault itself since B38), `nativeImage` returned an empty image (no OS thumbnail provider could draw it — compare against Quick Look/Explorer on the same file), or a success that names the PNG's path. It deliberately bypasses `failedThisSession` (`thumbnails.ts`), the in-memory negative cache that would otherwise make a retried probe report the same stale failure for the rest of the session. Runs alongside the resident instance for the same reason `--dump-clipboard` does — no need to quit the everyday app first — and `--vault=` behaves exactly as it does for `--selftest`.

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

**Attachments are served over `emqnote-attachment://`, not as `data:` URLs** (B28). A note with three screenshots would otherwise push each one through IPC a third larger, on every render; the orphaned-attachments thumbnail keeps its `data:` URL because it is one file, once. `resolveAttachment` refuses anything that lands outside the vault after `realpathSync` — following the symlinks *is* the guard, the same reasoning as `emptyTrash`, which is also why its tests compare against the real path and not the one `mkdtemp` returned. Both windows carry `emqnote-attachment:` in `img-src`; the capture window had no `img-src` at all before.

**An attachment is found anywhere in the vault, and the protocol URL carries its name in the path** (B38). `resolveAttachment` tries `_attachments/` first and then the vault itself, so `![[99 - Attachments/foo.png]]` — the shape an Obsidian-written vault is full of — draws. **It never resolves a note file**, which is what keeps `IPC.openWikiLink`'s two halves apart: it asks this first and falls through to the index only on `null`, so without the exclusion `[[01 Projecten/Rules.md]]` would go to the OS viewer instead of the library. The URL shape is the other half and is not cosmetic: Chromium canonicalises the host of a `standard: true` scheme, which was **measured against a real Electron build, not reasoned about** — it lowercases the host (so every name this app did not itself write came back wrong, invisibly on macOS/Windows and fatally on Linux), and it refuses a `%2F` in one outright, `fetch` throwing "Failed to parse URL" before anything is sent. A path-form target therefore could not be *expressed*, whatever resolution was willing to find. `src/shared/attachment-url.ts` is the one place such a URL is composed and read back; the old host form is still parsed because clipboard HTML copied inside the app carries it, and `paste-images.ts` reads exactly that.

**A note says when the file it names is gone** (B39). A missing picture drew the browser's broken-image glyph and a missing file drew an ordinary chip that did nothing when clicked — both read as the app being broken. The question is asked **at draw time, but only for a target that names a file** (an extension, and not a note's): looking a file up is one `statSync`, while looking a note up needs the whole index, and a link to a note not yet written is a normal thing to have — so a note link keeps B35's click-time answer, and `styles.css`'s note on `[data-link="missing"]` still describes that case correctly. Three things hold it up: one IPC per note rather than one per chip (`missing-attachments.ts` batches on a microtask, since `setDoc` builds every NodeView in one synchronous pass); **nothing is remembered between two openings**, because an attachment can appear — a OneDrive file finishing its download, a picture just pasted — where B36's thumbnail cache remembers for the opposite reason, a render failure being a property of the bytes; and an unanswerable question marks nothing, since the marker is an accusation. The marker is B36's own ⚠, deliberately not a second one. `imageView`'s `<img>` gained a plain inline wrapper so the chip can take the picture's place — a NodeView cannot swap the element ProseMirror mounted — which is why `.wiki-embed-image-box` is in the `.ProseMirror-selectednode` list.

**Paste claims image files only.** `handlePaste` returns false for everything else so the existing text/HTML path is untouched. The Outlook `mso-list` reconstruction (§6.3) is deferred, not abandoned, and this must not preempt or complicate it. Inserting an attachment also deliberately does **not** write the `attachments:` frontmatter array: `saveNote` does not manage that field, and writing it would rewrite the header of every note that gains an image — B10 from the other side, the same objection that keeps body tags out of the frontmatter. **If that deferred work ever claims the paste itself, it must call `transformPastedImages(slice)` and dispatch with `.setMeta("paste", true)`, or the image pipeline below stops running.**

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

**A note file is `.md` or `.markdown`, and it keeps the extension it arrived with** (B37). `note-files.ts` is the one place that decides what counts as a note file — `isNoteFile`, `noteStem`, `noteExtension` — and every scan, watcher, folder listing, conflict check and orphan check goes through it rather than testing `endsWith(".md")` for itself. The app still writes `.md` for everything it creates (`noteFileName` is deliberately untouched), but rename, duplicate and `uniquePath`'s disambiguation all preserve the file's own extension: quietly turning someone's `.markdown` into a `.md` is not the app's call. `conflicts.ts` pairs within one extension too — a `.md` and a `.markdown` of the same name are two files, and claiming they are one note would offer a button that throws one of them away.

**An imported note gets its title from its filename, in both windows or in neither.** `titleOf` in `vault-io.ts` is shared by `summarise` and `openNote` because the two used to disagree: the list fell back to the filename stem, `openNote` returned `frontmatter.title` raw, so a note written outside this app showed a title in the list and an empty field in the editor. `created` falls back to the file's mtime for the same reason, and `HeaderBlock` draws a "Set a date…" placeholder rather than an empty button whatever it is handed — a control with no label reads as a broken layout. All of it is display-only: B10 still holds, and `test/note-files.test.ts` pins that opening such a note touches nothing.

**A `[[…]]` link's target is a path, its alias is what you read, and moving the note rewrites both** (B35). `link-resolve.ts` (Electron-free, tested directly) resolves a target in three stages — path, then title, then filename stem — and **a stage that matches does not fall through to the next one even when it matched several notes**: that is the difference between "ambiguous" (the picker) and "not found", and collapsing them would let a third note be chosen when two genuinely share a title. `note_links` in the index feeds `linkingNotes`, which resolves the whole table against one prepared index; `rewriteWikiLinks` in `vault-io.ts` does the writing through `parseNote` → mutate → `serializeNote` → `writeAtomic`, never a text substitution (B6), skipping any note `writer.activePath()` has claimed. Two things about it are load-bearing and easy to "fix" by mistake: **the confirmation is raised before the move, and dismissing it still carries the move out** — a target resolves against where the note is *now*, so after `moveNote` there is nothing left to find, and a question about a side effect must not silently undo the thing it is a side effect of — and **a link with no alias gains one spelled with its old target**, or a note nobody is looking at silently starts displaying a path where a word used to be. `IPC.openWikiLink` replaced `IPC.openAttachment` rather than sitting beside it: one click, one answer, attachment tried first because a filename is exact where the three note rules are progressively looser.

**A PDF is read in the app, in a window of its own** (B40, extending B36 rather than
replacing it). Clicking a `.pdf` opens emqnote's own viewer — `src/renderer/pdfview.ts`, a
fourth renderer entry running pdf.js against the same `pdfjs-dist` devDependency the
thumbnail uses — instead of handing the file to `shell.openPath`. `attachment-route.ts` is
the whole of the rule and draws the split from `isPreviewable`, so a `.docx` still goes to
the OS; **Open in system viewer** inside the viewer is the way back out for printing and
annotating. Three things are load-bearing. **`emqnote-attachment` needed `corsEnabled: true`
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
plainly is not a note. There is no delete on this path either (B24/B27). `_attachments` stays
hidden and unbrowsable; it is the app's own folder and has §6.5's screen. The reader pane's
PDF preview asks the hidden window for its page like the inline embed does — **no pdf.js in
the library bundle**, the same line B43 draws.

**The orphaned-attachment scan is answered from the index, and it has an error state.** It
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

**Tags come from two places that never write to each other.** The frontmatter `tags:` field holds what was typed in the capture window's tag field; `#tag` in the body stays in the body. `summarise()` in `vault-io.ts` merges them for display and filtering. Copying body tags into the frontmatter would mean editing one sentence rewrites the header, which is a B10 hazard.

**Timestamps are ISO 8601 with offset, never UTC `Z`** — otherwise a summer note reads back wrong in winter.

**Index, settings and window state live outside the vault**, in the local app data folder (B9). On Windows that is `%LOCALAPPDATA%`, forced in `src/main/index.ts` before `ready`, because Roaming AppData can be synced by a corporate profile. A half-synced SQLite database is a broken SQLite database.

**Trash is the vault's own `_trash` folder**, not the system recycle bin: a OneDrive file in the Windows recycle bin is not synced, so it would be gone from the other machine with no way back. Deleting a note is still only a rename into it. Emptying it is a separate, explicit action — the trash folder's note list carries a **Clear trash** button where every other folder has *New note*, behind a confirmation that names the count and says it cannot be undone (B24). `emptyTrash` in `vault-io.ts` is the only code in the app that permanently deletes anything, and it checks with `realpathSync` that its target really is `<vault>/_trash` and inside the vault before it removes a byte — `resolve()` alone would happily follow a `_trash` that turned out to be a symlink. There is deliberately no age-based prune.

**The app's own writes are told apart from a real external change by content hash, never by a timer** (B31). `own-writes.ts` remembers `sha256(contents)` per resolved path (lowercased on `win32`, the usual reason) after every `writeAtomic`, so the watcher can suppress the notification for its own debounced autosave without suppressing the *indexing* — those are two different things, and only the notification is ever skipped. A TTL ("ignore writes for N ms after our own save") was rejected because it turns a correctness property into a timing property, and OneDrive's own re-materialisation schedule is the one clock this app cannot trust. The library gets every `vault:file-changed` event unconditionally and filters against its own `open` state, because main has no reliable view of what the reader currently shows; the capture window is filtered in main instead, against `writer.activePath()`, because that path genuinely is main's own state. A clean note reloads silently; a dirty one gets a **Reload** / **Keep mine** bar; a deletion gets **Close** / **Keep mine** and — deliberately, asymmetrically — never auto-closes even when clean, because closing yanks away a window someone may be looking at and a transient OneDrive hiccup must not be able to do that unasked. The capture window cannot know from main alone whether it has unsaved edits (main only sees what has already crossed the 300 ms debounce), so it keeps its own `dirtyRef` that deliberately over-reports rather than risk discarding a half-typed sentence. `unlinkDir` is handled too, via `deleteNotesUnder` (a `substr`-based prefix match, not `LIKE` or `GLOB`, both of whose metacharacters real folder names can legitimately contain) — before this, a folder deleted outside the app left every note under it still indexed.

**Every panel has a right-click menu, and every action behind one has a non-menu route too.** The folder tree, the note list and the note panel (both windows) each get a `ContextMenu.tsx` — a React component, not `Menu.popup`, for the same reason `Ask.tsx` is a component and not `window.prompt`: nothing under `test/` can drive a native menu, it costs an IPC round trip per open, and `--click-button` (`library-window.ts`) has no way to reach into one. `--click-button` matching on `.branch`/`.branch-name` text is why nothing may move exclusively behind a menu. A roving `tabIndex` (`roving.ts`) keeps exactly one row per pane a Tab stop; Mod-Shift-M and the `ContextMenu` key open the menu at the focused row's own position, so the keyboard route and the mouse route land on the same component. `onRenameFolder`/`onDeleteFolder` take a `path` now, not the toolbar's `lastFolder` — a per-row menu has to act on the row that was actually right-clicked, and the toolbar keeps its old behaviour by passing `lastFolder` explicitly.

The reader toolbar's Rename/Move/Duplicate/Reveal/Delete collapsed into one **"Actions"** `ContextMenu` for the same crowding reason the folder tree's rows did — and the four insert glyphs (🖼 🔗 ▦ 📎) beside them collapsed into an **"Insert"** one, built from `editor-menu.ts`'s `insertMenuItems` so the toolbar and the note panel's right-click menu cannot drift; the capture window's status bar carries the same Insert button, since leaving its four glyphs there would give one app two vocabularies for one action. Both were labelled with a glyph until a second glyph-labelled menu appeared next to the first and neither said anything. A menu *opened by a plain button* is a reachable route for `--click-button` (`"Actions>Rename"` works, matched two levels deep by `library-window.ts`'s selector, which now also reads `.context-menu-label`), so this does not violate the rule above. That only holds because a step taken while a menu is open searches **inside** the menu rather than the whole page: the folder toolbar's buttons carry the same `library.rename`/`library.delete` strings and sit earlier in document order, so an unscoped match would turn `"Actions>Delete"` into *Delete folder*. Any future panel that reuses a label a menu also uses depends on that scoping. The rule is unchanged for a menu that only opens on right-click or `Mod-Shift-M`/`ContextMenu`: `--click-button` still cannot reach one of those, which is why every one of *those* actions keeps a non-menu route too.

B42's row, column and alignment commands were the exception that proved it: they existed from the start and lived *only* in the note panel's right-click menu, and were duly reported as missing features. `table-toolbar.ts` is the second route — a widget decoration above whichever table the caret is in, built on `checkbox.ts`'s recipe (`contentEditable="false"`, `stopEvent`, `ignoreSelection`, and a `preventDefault`ed `mousedown` so the command acts on the cell you clicked from). Its labels are short *visible* text (`table.rowAbove` → "Row ↑") with the menu's full sentence as the `title`, because `--click-button` matches a button on its own `textContent` — a glyph beside the word would put these straight back out of reach. Delete-table stays menu-only, being the destructive one. `t` reaches the plugin through `CommandContext` as its one optional field, falling back to English, so the half-dozen tests that build a context by hand need not carry a translator.

## Tests

`test/corpus/` is **the specification**, not a set of examples. Each of the 28 files is written exactly as the serializer is meant to write it. `test/roundtrip.test.ts` asserts byte-identity in both directions plus formal file shape (LF only, exactly one trailing newline, frontmatter first, no trailing whitespace). If output differs from the corpus, one of the two is wrong — decide which, deliberately. Do not relax the assertion.

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

## The documents

Read these before making structural changes; they carry the reasoning that the code assumes.

| Document | Contents |
|---|---|
| `00-PLAN.md` | Overview, current status, what happens next |
| `01-functioneel-ontwerp.md` | What the app does, from use |
| `02-technisch-ontwerp.md` | How it fits together; §6.3 is the paste pipeline |
| `03-markdown-dialect.md` | The vault format as a specification |
| `04-bouwplan.md` | Phases with acceptance criteria |
| `05-besluitenlog.md` | Decisions B1–B51, with what was rejected and why |
| `TEST-PROTOCOL.md` | Manual test pass for a human, per platform — what automation cannot reach |

Acceptance criteria in `04-bouwplan.md` are the definition of a phase being done — not "the code exists". When a decision in `05-besluitenlog.md` is revisited, that log is where the change belongs.
