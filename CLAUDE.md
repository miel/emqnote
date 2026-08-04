# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A resident Electron note-taking app that replaces a "email a note to myself" routine. Notes are plain markdown files in folders on a business OneDrive. One user, two machines (macOS and Windows), no server, no accounts.

**Language convention:** code, comments, tests and UI strings are English (commit `c24d82b` switched them over deliberately). The five design documents and the note corpus in `test/corpus/` stay Dutch — the corpus fixtures stand in for real notes, so translating them would make them worse at that job.

## Commands

```bash
npm run dev            # electron-vite dev
npm test               # vitest run — 460 tests, a couple of seconds
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

Three diagnostic helpers:

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

**The index scan starts at launch, not at the first question.** `main()` calls `vault-scan.ts`'s `startScan` right after `prepareVault()` — beside the watcher, skipped during `--selftest` for the same reason, and deliberately not awaited, so it never sits in front of the tray, the hotkey or the capture window's first paint. It shares `ensureScanned`'s collapse, so a library opened mid-walk joins the scan already running rather than starting a rival one over the same files on the thread the hotkey also uses. Progress goes to a thin bar at the top of the library (`IPC.libraryScanProgress`, throttled; `IPC.libraryScanState` for a window that opened partway through and missed the events). The scan still runs on the main thread — `fullScan` yields every hundred files and is Electron-free so it can move into the worker §7.2 asks for, but that move has not happened and has not been measured.

**Dragging a note onto a folder and "Move to…" are one operation, not two.** `Library.tsx`'s `moveNoteTo` is what both call; the dialog reaches a folder four levels deep without hunting for it, the drag reaches one already in front of you. The rules live in `src/renderer/library/drag.ts` — `canDropNote` answers for the drop *and* for the highlight that precedes it, so a folder can never light up and then refuse. The trash accepts nothing, matching the reason `MoveDialog` already excludes it: Delete is what puts a note there, and it asks first, so the one gesture with no confirmation must not be the one that destroys something. Nothing drags out of the trash either. The drag type is private (`application/x-emqnote-path`), never `text/plain`, which would make every row draggable into any text field on the machine. `onDrop` re-checks `canDropNote` against the path in the drop rather than trusting the highlight's state, so the consequential half never depends on a render having landed.

**`IPC.libraryMoveNote` refuses a note the capture window has claimed.** `CaptureWriter`'s session holds the path it will write to, decided when the note was loaded; moving the file does not update it, so the next debounced write recreates the note where it used to be — one note in two folders, the second written by a window that thinks it is still editing the first. The move dialog could only ever reach a note the reader had open; dragging can reach any row in the list, which is what turned this from a note into a guard.

**Tags come from two places that never write to each other.** The frontmatter `tags:` field holds what was typed in the capture window's tag field; `#tag` in the body stays in the body. `summarise()` in `vault-io.ts` merges them for display and filtering. Copying body tags into the frontmatter would mean editing one sentence rewrites the header, which is a B10 hazard.

**Timestamps are ISO 8601 with offset, never UTC `Z`** — otherwise a summer note reads back wrong in winter.

**Index, settings and window state live outside the vault**, in the local app data folder (B9). On Windows that is `%LOCALAPPDATA%`, forced in `src/main/index.ts` before `ready`, because Roaming AppData can be synced by a corporate profile. A half-synced SQLite database is a broken SQLite database.

**Trash is the vault's own `_trash` folder**, not the system recycle bin: a OneDrive file in the Windows recycle bin is not synced, so it would be gone from the other machine with no way back. Deleting a note is still only a rename into it. Emptying it is a separate, explicit action — the trash folder's note list carries a **Clear trash** button where every other folder has *New note*, behind a confirmation that names the count and says it cannot be undone (B24). `emptyTrash` in `vault-io.ts` is the only code in the app that permanently deletes anything, and it checks with `realpathSync` that its target really is `<vault>/_trash` and inside the vault before it removes a byte — `resolve()` alone would happily follow a `_trash` that turned out to be a symlink. There is deliberately no age-based prune.

## Tests

`test/corpus/` is **the specification**, not a set of examples. Each of the 27 files is written exactly as the serializer is meant to write it. `test/roundtrip.test.ts` asserts byte-identity in both directions plus formal file shape (LF only, exactly one trailing newline, frontmatter first, no trailing whitespace). If output differs from the corpus, one of the two is wrong — decide which, deliberately. Do not relax the assertion.

`test/limitations.test.ts` pins what the dialect deliberately *cannot* express, so the boundary is visible rather than discovered later.

The suite must stay under about two seconds so it can run on every change. `test/index-watch.test.ts` is the one deliberate exception: it runs `chokidar` against a real temp directory rather than mocking the filesystem, so real events need real wall-clock waiting. It uses a much smaller `stabilityThreshold` than the 300 ms production default (see `index-watch.ts`) and the smallest settle margin found to be reliable across repeated runs, not an arbitrary one — still worth noticing if the suite's total time starts to matter.

## Where the project stands

Phases 0–3 are done: byte-identical markdown round trip, resident shell, the editor, and the library window. Phase 3 and 4 of `04-bouwplan.md` were swapped in practice — the library window shipped first. **Pasting and images (the `mso-list` reconstruction) is deliberately deferred, not just unstarted.** Real `.eml` samples (2 August 2026) showed the flat `<p class=MsoListParagraph>` pattern §6.3 assumes doesn't appear in genuine Word-authored content (real `<ol>/<li>` already, `mso-list` just decorative on top) or in what's likely Outlook for Mac (new-Outlook/web-style HTML, no `mso-list` at all) — only classic desktop Outlook might still show it, and that's unavailable for about two weeks from 2 August 2026. See `TODO.md` for the full finding before resuming this.

Ten items from real use landed after that, before the paste work: checkbox affordances (the format always supported them, nothing could *make* one), folder rename (the phase-4 item that was never built), a shortcut registry with an in-app help sheet, a chooser for the vault location, and a group of header and list refinements. Two of them are recorded as decisions: **B20** — location and people belong to every note, `type: meeting` survives as a label — and **B21** — changing vault restarts the app.

Tags and People filtering landed after phase 3 and pulled one piece of phase 5 forward, and **phase 5 is now done**. Its index is real: `src/main/index-db.ts` holds the SQLite/FTS5 schema, `index-scan.ts` is the full-scan builder, and `index-watch.ts` wraps `chokidar` for incremental reindexing after that — `src/main/vault-scan.ts` used to be the in-memory cache in front of the filesystem and is now a thin query layer over that index instead, its `facets`/`notesMatching` interface unchanged by the swap. Folder browsing still bypasses the index entirely, straight from disk, so opening a folder never waits on a scan. `src/main/search-query.ts` parses the search bar's own filter language (`type:`, `tag:`, `attendee:"…"`, `after:`/`before:`) and `vault-scan.ts`'s `searchNotes` runs it against the index, wired through `IPC.librarySearch` into a real input in the library window's `NoteList`, debounced the same way a save is. `src/main/conflicts.ts` recognises a OneDrive conflict copy from filenames alone (a machine-name suffix, deliberately not a bare `(N)` suffix — see the module's own comment on why that would collide with `filename.ts`'s own `uniquePath`); `vault-io.ts`'s `resolveConflict` carries out one of the three choices on disk (never a fourth silent one — "merge" touches no file, it just opens the note); `ConflictBanner.tsx` is the banner and its diff dialog, one conflict at a time. `src/main/orphaned-attachments.ts` (with `src/markdown/wiki-targets.ts` underneath it) finds an `_attachments/` file nothing references, and `OrphanedAttachments.tsx` is its cleanup screen, opened from a new entry in `FolderTree.tsx`'s footer. All of it confirmed actually working via `Xvfb` — real file operations on disk, not just rendering — which is also how a CSP gap blocking the attachment preview's `data:` URL got caught before it shipped rather than after.

**A batch of nine fixes from using the packaged macOS build landed on 3 August 2026.** Three of them were one bug: the capture window had no `close` handler, so the red traffic light destroyed it and took the hotkey and the note lock with it (see the constraint above). The rest: Cmd+Q enabled as window-scoped dismissal (B25), the meeting button removed (B23), Clear trash (B24), the caret now starting in the subject field rather than the body, header field widths evened out, the two hardcoded `Ctrl+Enter` labels now formatted through the shortcut registry per platform — with `useBootstrap`'s fallback platform seeded synchronously from the preload, since the `IPC.bootstrap` round trip meant the first paint always said Ctrl — a search result now selecting its own folder, and a second Backspace after leaving a list joining into the previous item instead of resurrecting the bullet it just removed (`joinBackward`'s `deleteBarrier` was re-wrapping the paragraph, because `listItem` has no `group` and so `findWrapping` finds it).

## The documents

Read these before making structural changes; they carry the reasoning that the code assumes.

| Document | Contents |
|---|---|
| `00-PLAN.md` | Overview, current status, what happens next |
| `01-functioneel-ontwerp.md` | What the app does, from use |
| `02-technisch-ontwerp.md` | How it fits together; §6.3 is the paste pipeline |
| `03-markdown-dialect.md` | The vault format as a specification |
| `04-bouwplan.md` | Phases with acceptance criteria |
| `05-besluitenlog.md` | Decisions B1–B19, with what was rejected and why |

Acceptance criteria in `04-bouwplan.md` are the definition of a phase being done — not "the code exists". When a decision in `05-besluitenlog.md` is revisited, that log is where the change belongs.
