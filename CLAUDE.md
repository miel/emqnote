# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A resident Electron note-taking app that replaces a "email a note to myself" routine. Notes are plain markdown files in folders on a business OneDrive. One user, two machines (macOS and Windows), no server, no accounts.

**Language convention:** code, comments, tests and UI strings are English (commit `c24d82b` switched them over deliberately). The five design documents and the note corpus in `test/corpus/` stay Dutch — the corpus fixtures stand in for real notes, so translating them would make them worse at that job.

## Commands

```bash
npm run dev            # electron-vite dev
npm test               # vitest run — 235 tests, under a second
npm run test:watch     # keep it running while working
npm run typecheck      # tsc --noEmit
npm run build          # electron-vite build + check:bundle
npm run pack:mac       # packaged .app in release/
npm run pack:win       # packaged .zip in release/
```

Single test file or single test:

```bash
npx vitest run test/roundtrip.test.ts
npx vitest run -t "stays byte-identical"
```

Two diagnostic helpers:

```bash
npm run canonical -- test/corpus/24-vergadernotitie.md
```

Shows how the serializer *would* write a file, with a line diff. It exists to let you **judge** a difference, not paper over it: if the corpus differs from the serializer output, one of the two is wrong, and telling those apart is a decision.

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

| Machine | Display | p50 | p95 |
|---|---|---|---|
| unrecorded — not the Mac mini, which has no internal panel | unrecorded; the numbers fit a 120 Hz panel | 26 ms | 43 ms |
| Mac mini M4 | external 2490W1, 1920×1080 @ 60 Hz | 60 ms | 62–68 ms |

Record the machine and refresh rate with any future figure. The first row cannot be reproduced because neither was written down.

Both are the same code: the phase-1 commit (`5051ca7`, a `<textarea>`, no ProseMirror) measures 60.7 ms on the Mac mini, against 60.5 ms for the current build. Removing the two-frame wait drops it to 37.9 ms, so ~23 ms of the 60 is that deliberate wait and the rest is `show()` + focus + the IPC round trip, itself partly frame-bound. Nothing in phases 2 and 3 cost anything on this path — as designed, since the window is already rendered.

The practical consequence: on a 60 Hz display the floor is ~44 ms and there is ~20 ms of headroom against the 80 ms budget, not 54.

The capture window's bundle is kept deliberately small — it is the one that must appear instantly — so the library window is a separate rollup entry and its tree, list and dialogs are not loaded into it.

## Constraints that bite if forgotten

**Opening a note must not touch the file** (B10). No reformatting, no `modified` bump, no normalisation. Writes happen 800 ms after the last keystroke (or on blur/close), atomically via `.tmp` + `rename()`, and only when the serialized bytes actually differ. This is the cheapest and most effective OneDrive conflict prevention there is, and it costs only discipline — the great majority of conflict copies come from apps touching files the user did not change. `test/vault-io.test.ts` guards it.

**`package.json` `dependencies` is empty on purpose.** electron-vite externalises everything listed there, so a listed package produces a bare `import` in the bundle without the folder being shipped — `ERR_MODULE_NOT_FOUND` on startup, and invisible when tested from the project directory where `node_modules` happens to exist. Build packages live in `devDependencies`. `npm run check:bundle` is the static guard and runs as part of `npm run build`. A genuine native module (`better-sqlite3` in phase 5) *does* belong in `dependencies`, and electron-builder must then ship it.

**Electron's default application menu is removed** (`installMinimalMenu`). It is invisible on a frameless window but its accelerators are not: it claimed Ctrl+M for Minimise, so indenting inside a list minimised the window. Only the Edit clipboard roles stay, because on macOS the menu is what makes Cmd+C/Cmd+V work at all.

**Windows path limits and reserved names.** Filenames follow `YYYY-MM-DD HHmm Subject.md`, truncated at 80 chars, forbidden characters `\ / : * ? " < > |` replaced by `-`, reserved names (`CON`, `PRN`, `COM1`…) suffixed with `_`, no trailing dot or space. `src/main/filename.ts`, tested in `test/filename.test.ts`.

**A `#` that opens a tag is not escaped at the start of a line** (B19). Everywhere else a line-initial `#` becomes `\#`, because it could begin a heading — but `\#klantx` is not a tag to Obsidian, and half the tags in the vault being silently inert is exactly what B7 forbids. The exception is narrow: `startsWithTag` in `src/markdown/tags.ts` requires a tag character immediately after the hash, so `\# Dit is geen kop` keeps its backslash. It is implemented as a custom `text` handler in `pipeline.ts` that cuts the value around the hash and runs the pieces through `state.safe` separately — never by unescaping the output afterwards, which would eat a literal backslash the user typed.

**`HeaderBlock` serves two windows, through a `variant` prop.** `capture` has the subject field and the meeting toggle; `reader` (the library) has neither. The title belongs to Rename, which renames the file with it, and a second way to change it would let the two drift. The kind toggle is left out because `saveNote` drops `location` and `attendees` when a note becomes `quick` — correct in capture, where you toggle before typing, and destructive on a note that already has them. One component so the attendee/tag parsing and the date editing exist once.

In the library the header values live in their own `header` state, deliberately not folded into `open`: an effect reloads the document into the editor whenever `open` changes, so header values there would rebuild the document on every keystroke and throw the caret away.

**Tags come from two places that never write to each other.** The frontmatter `tags:` field holds what was typed in the capture window's tag field; `#tag` in the body stays in the body. `summarise()` in `vault-io.ts` merges them for display and filtering. Copying body tags into the frontmatter would mean editing one sentence rewrites the header, which is a B10 hazard.

**Timestamps are ISO 8601 with offset, never UTC `Z`** — otherwise a summer note reads back wrong in winter.

**Index, settings and window state live outside the vault**, in the local app data folder (B9). On Windows that is `%LOCALAPPDATA%`, forced in `src/main/index.ts` before `ready`, because Roaming AppData can be synced by a corporate profile. A half-synced SQLite database is a broken SQLite database.

**Trash is the vault's own `_trash` folder**, not the system recycle bin: a OneDrive file in the Windows recycle bin is not synced, so it would be gone from the other machine with no way back.

## Tests

`test/corpus/` is **the specification**, not a set of examples. Each of the 26 files is written exactly as the serializer is meant to write it. `test/roundtrip.test.ts` asserts byte-identity in both directions plus formal file shape (LF only, exactly one trailing newline, frontmatter first, no trailing whitespace). If output differs from the corpus, one of the two is wrong — decide which, deliberately. Do not relax the assertion.

`test/limitations.test.ts` pins what the dialect deliberately *cannot* express, so the boundary is visible rather than discovered later.

The suite must stay under about two seconds so it can run on every change.

## Where the project stands

Phases 0–3 are done: byte-identical markdown round trip, resident shell, the editor, and the library window. Phase 3 and 4 of `04-bouwplan.md` were swapped in practice — the library window shipped first, so **pasting and images (the `mso-list` reconstruction) is the next work**, and it is the largest unknown in the project.

Tags and People filtering landed after phase 3 and pulled one piece of phase 5 forward. There is still no index: `src/main/vault-scan.ts` is an in-memory cache in front of the filesystem, shaped like the `notes` table phase 5 will build (same fields, same mtime-and-size refresh) so SQLite replaces the Map rather than the interface. It is never touched from the capture path, and it yields every hundred files — a cold scan of three thousand notes costs 279 ms, a warm one 15 ms.

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
