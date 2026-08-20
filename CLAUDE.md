# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A resident Electron note-taking app that replaces a "email a note to myself" routine. Notes are plain markdown files in folders on a business OneDrive. One user, two machines (macOS and Windows), no server, no accounts.

**Language convention:** code, comments, tests and UI strings are English (commit `c24d82b` switched them over deliberately). The five design documents and the note corpus in `test/corpus/` stay Dutch — the corpus fixtures stand in for real notes, so translating them would make them worse at that job.

## Commands

```bash
npm run dev            # electron-vite dev
npm test               # vitest run — 1578 tests
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
emqnote --trash-probe="_trash/Alpha"
```

Says why something in `_trash` will not delete, per entry: what it is, whether it is
read-only, and whether another process has it open. **It deletes nothing** — the evidence is
the point on the one operation with no way back. It exists because "permanently deleting a
folder does not work" survived its first fix (B57): at that point guessing has had its turn.
Two things it cannot see are printed alongside the findings rather than left implicit — a
handle on a *directory* (which is what B57 was about) and, off Windows, anything at all
about holders, locking there being advisory. Runs alongside the resident instance like the
probes below, and that is the experiment rather than a convenience: if the delete works with
emqnote quit, the app is the holder.

```bash
emqnote --key-probe
```

Logs every key a window is handed, to `<userData>/key-probe.log` and to stdout, one line per
press: the window, the key, its code, every modifier, and **which registry entry `matches()`
says it is** — or `—`. It exists because `Ctrl+Shift+T` was reported dead on Windows, claimed
in `before-input-event` (the earliest point in a window there is), and reported dead again;
that is the point at which this project stops asserting a cause and reports one. Unlike the
three probes below it does **not** exit and does **not** bypass the single-instance lock: the
question is what the everyday resident instance receives, so quit the app first and start it
with the flag. Three answers, and the third is the one the app cannot see and so is printed in
the log's own header: a line with `claim=task:editor` means the key arrives and the claim fires
(so the fault is downstream); a line with `claim=—` means it arrives and the modifiers are not
what the chord spells; **no line at all means the key never reached the window**, which rules
out everything in this source tree. It is installed ahead of the claim handlers, so a claimed
key is logged as well as an unclaimed one. Only real keys reach it — `Input.dispatchKeyEvent`
over CDP is injected past `before-input-event`, so driving it takes XTEST.

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

**`IPC.libraryMoveNote` refuses a note the capture window has claimed.** `CaptureWriter`'s session holds the path it will write to, decided when the note was loaded; moving the file does not update it, so the next debounced write recreates the note where it used to be — one note in two folders, the second written by a window that thinks it is still editing the first. The move dialog could only ever reach a note the reader had open; dragging can reach any row in the list, which is what turned this from a note into a guard.

**Task state lives in the index, and the index knows its own schema version** (B26). `checked` is an attribute on `listItem`, not text, so `plainText()` drops it and FTS5 can say nothing about it — the Tasks view is answered from a `note_tasks` table filled by `buildRecord`, which the full scan and the watcher already share, and never by re-parsing a folder subtree on demand. That walk is the 470–535 ms main-thread stall that pushed the scan into a worker; reaching for it again through the back door undoes that. Because `needsRefresh` short-circuits on unchanged `mtime`+`size`, an existing index can never gain new columns on its own, so `migrate()` carries a `PRAGMA user_version` and drops its tables on a bump. That is allowed *because* of B9: the index is a derived cache outside the vault, so a rebuild costs one scan and destroys nothing. Any future column added to `NoteRecord` must bump that version.

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

**Bullet, star and checkbox sit on one line and in one column** (20 August 2026). Three things
can stand in the marker slot and they were drawn three ways: the bullet is a native `::marker`,
B72's star *was* a `::marker` with a colour emoji in it, and the task checkbox is a positioned
widget. Measured in a real Chromium at 4× device scale, ink centroid to ink centroid: the star
was 16.75px tall against the bullet's 4.5px and sat 5px out of column, the checkbox 6.6px right
of the bullet and 1.05px above its line.

**The bullet is the reference and does not move.** The other two are tuned onto it — the
checkbox with two offsets on `.task-check`'s `left` and `top`, the star by being **drawn into
the slot by hand** rather than as a `::marker` glyph. That last part is the change to B72's
mechanism, and it was forced: `::marker` accepts font properties and nothing else, no
`vertical-align`, so shrinking the star with `font-size` measured it *lower* and further right
still — the em space in `--marker-gap` shrinks with the glyph. A positioned `::before` with
`align-items`/`justify-content: center` centres it on both axes, which is also what makes this
survive an emoji font with different metrics: the size varies, the centre does not.

`transform: scale()` and never `font-size` for that size, or every `em` in the rule — `left`,
`width`, `height` — would resolve against the new size and move the box along with the glyph.
The `::marker` still needs `content: none` beside `list-style: none`, since `list-style` stops
suppressing a marker the moment one has explicit content and the three depth rules give it
some. `styles-star.test.ts` pins that the `content: none` rule still out-ranks those three;
`styles-list-marker.test.ts` pins the construction. Verified in the running app at every depth:
the `◦` and `▪` of levels two and three sit on the same line and column as `•`, so one set of
numbers is right everywhere.

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
list with `stopPropagation()`, the 18 Aug 2026 rule. People deliberately get no completion: a
name is not drawn from a closed set the way a tag is.

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

## Tests

`test/corpus/` is **the specification**, not a set of examples. Each of the 30 files is written exactly as the serializer is meant to write it. `test/roundtrip.test.ts` asserts byte-identity in both directions plus formal file shape (LF only, exactly one trailing newline, frontmatter first, no trailing whitespace). If output differs from the corpus, one of the two is wrong — decide which, deliberately. Do not relax the assertion.

`test/limitations.test.ts` pins what the dialect deliberately *cannot* express, so the boundary is visible rather than discovered later.

**The suite runs on all three platforms in CI, not only on Linux.** `build.yml`'s `check` job runs it on ubuntu; the `package` matrix job runs it again on Windows and macOS before packaging. That line was missing until `v0.3.3` and it cost a release: `vault.ts` shells out to `attrib` on Windows, reads block counts on macOS, `filename.ts` exists for Windows' reserved names, and every path comparison meets a backslash for the first time there — so a Windows-only bug in `checkFilesOnDemand` sat in `main` until a tag was pushed and `release.yml` (which always did run the suite per platform) failed the release. It has since caught a second, macOS-only bug on the very next pull request. When a test asserts on a path, assume the three platforms disagree until CI says otherwise.

The suite must stay under about two seconds so it can run on every change. `test/index-watch.test.ts` is the one deliberate exception: it runs `chokidar` against a real temp directory rather than mocking the filesystem, so real events need real wall-clock waiting. It uses a much smaller `stabilityThreshold` than the 300 ms production default (see `index-watch.ts`) and the smallest settle margin found to be reliable across repeated runs, not an arbitrary one — still worth noticing if the suite's total time starts to matter.

**Everything in that file starts its watcher through `startWatching`, and the reason is a
backend property rather than a slow runner.** chokidar's `ready()` resolves when its initial
crawl has finished, which is not the moment the watcher is actually armed: a file written
into that gap produces **no event at all**, and an event that was never sent cannot be
waited out — which is why raising the timeouts, twice, never settled it, and why it went on
failing a release every few dozen runs. The helper pays one settle after `ready()` on every
platform but Linux, where inotify delivers from the moment the watch is added.

**That used to say "on darwin only", and the sentence that excused Windows is what cost a
third release** (v0.8.9). It reasoned that polling has no gap — only an interval — so
`watchInterval` answered it and no settle was owed. It does have a gap, and a worse one: a
poller finds a new file by re-reading a directory and diffing against the entries it already
knows, so a file that lands before that baseline is taken is *in* the baseline and is never
called new at all. Permanently missed, not noticed a poll later, which is why the failure
reads as total silence and why no ceiling could have helped. Measured by forcing
`pollingOptions` on off-Windows and running the failing sequence 40 times per delay: **23 of
40 missed with no wait, 0 of 40 at 25 ms and at every longer wait, 0 of 100 at the settle
now paid** — against native watching missing 0 of 40 with no wait at all. The general lesson
is the one this file keeps relearning: a platform excused from a wait because of how its
backend is *described* is a platform whose behaviour nobody measured. `index-watch.ts`'s
`ready()` carries what this means for the app, which is not nothing — on Windows the startup
full scan is the only thing that will see a file OneDrive lands in those first moments.

The poll interval is `WatchOptions.watchInterval`, turned down in the tests exactly as
`stabilityThreshold` already is: at the production two seconds every waiting assertion in
that file waits out a poll, which put it at 23 seconds on the Windows runner.

**And that file's `waitFor` ceiling is deliberately generous rather than tight.** It was
four seconds, picked to fit under vitest's five-second default, and that is the wrong way
round — this is real filesystem timing on a shared CI machine, and it failed two releases
in a row while *the same tests on the same commit* passed in the `build` workflow minutes
earlier. `waitFor` returns the moment its condition holds, so a high ceiling costs nothing
on the happy path and is only ever reached by a genuine breakage or a runner having a bad
minute; the per-test timeout is raised above it (`vi.setConfig`) so a timeout still reports
the assertion that failed rather than a bare "test timed out". A wrong red is worse than a
slow red — especially in the file whose whole job is watching a filesystem. The two tests there that
assert something is *not* indexed go through it too: a missed event makes those pass for the
wrong reason, which is worse than failing.

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

## The documents

Read these before making structural changes; they carry the reasoning that the code assumes.

| Document | Contents |
|---|---|
| `00-PLAN.md` | Overview, current status, what happens next |
| `01-functioneel-ontwerp.md` | What the app does, from use |
| `02-technisch-ontwerp.md` | How it fits together; §6.3 is the paste pipeline |
| `03-markdown-dialect.md` | The vault format as a specification |
| `04-bouwplan.md` | Phases with acceptance criteria |
| `05-besluitenlog.md` | Decisions B1–B74, with what was rejected and why |
| `06-ipad.md` | Whether to build an iPad client. Answered **no** (B53); kept for the analysis, not as a plan |
| `TEST-PROTOCOL.md` | Manual test pass for a human, per platform — what automation cannot reach |

Acceptance criteria in `04-bouwplan.md` are the definition of a phase being done — not "the code exists". When a decision in `05-besluitenlog.md` is revisited, that log is where the change belongs.
