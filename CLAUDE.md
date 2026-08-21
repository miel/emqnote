# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A resident Electron note-taking app that replaces a "email a note to myself" routine. Notes are plain markdown files in folders on a business OneDrive. One user, two machines (macOS and Windows), no server, no accounts.

**Language convention:** code, comments, tests and UI strings are English (commit `c24d82b` switched them over deliberately). The design documents (`00`–`07`) and the note corpus in `test/corpus/` stay Dutch — the corpus fixtures stand in for real notes, so translating them would make them worse at that job. `CONSTRAINTS.md` and `HISTORY.md` (below) are English, being written for Claude Code rather than as design documents.

## Commands

```bash
npm run dev            # electron-vite dev
npm test               # vitest run — 1660 tests
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

Five diagnostic helpers exist for questions this project has learned not to guess at — a
reported bug that survives its own fix is a recurring theme here (B57 → B59, B62's Ctrl+Tab,
B71), and each helper below exists because guessing had already had its turn:

```bash
npm run canonical -- test/corpus/24-vergadernotitie.md
```

Shows how the serializer *would* write a file, with a line diff. It exists to let you **judge** a difference, not paper over it: if the corpus differs from the serializer output, one of the two is wrong, and telling those apart is a decision.

```bash
emqnote --dump-clipboard=/tmp/paste-sample
```

Copy something from Outlook or Word first, then run this. Writes `<prefix>.html`/`.txt`/`.png` for whatever formats are on the clipboard and exits. Runs alongside the resident instance (bypasses the single-instance lock, like `--selftest`), so no need to quit the everyday app first.

```bash
emqnote.exe --selftest=50 --vault=%TEMP%\emqnote-proef
```

Runs on the *packaged* app. Measures hotkey → painted caret 50 times, then really types a note and checks a correct file lands in the Inbox. Exits with a status code, so it works in CI. Results go to `%LOCALAPPDATA%\emqnote\` / `~/Library/Application Support/emqnote/` as `selftest-result.json` plus `latency.log`. Other flags: `--library`, `--screenshot=<path>`, `--open-note=<title fragment>`, `--click-button=<label>`. `--click-button` takes a `>`-separated sequence, so `--click-button="Tags>#klantx"` unfolds the tag list and then picks one, and it matches folder and filter rows as well as buttons.

```bash
emqnote --trash-probe="_trash/Alpha"
emqnote --key-probe
emqnote --thumbnail-probe="2026-08-04-1030-offerte.pdf" --vault=/path/to/vault
```

`--trash-probe` says why something in `_trash` will not delete, per entry — read-only, held open by another process — and **deletes nothing**; the evidence is the point on the one operation with no way back. `--key-probe` logs every key a window is handed to `<userData>/key-probe.log`, one line per press, including whether `matches()` claimed it — it does not exit and does not bypass the single-instance lock, so quit the resident app first. `--thumbnail-probe` prints exactly which of four things went wrong for one named attachment's PDF preview. `CONSTRAINTS.md` has the full story behind each.

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

Record the machine and refresh rate with any future figure. The first row cannot be reproduced because neither was written down. **The second and third rows disagree, on identical hardware, and that is not yet explained** — see `CONSTRAINTS.md` for the full measurement history before citing either. The conclusion that survives both: **the editor and the library cost nothing on this path**, as designed.

The capture window's bundle is kept deliberately small — it is the one that must appear instantly — so the library window is a separate rollup entry and its tree, list and dialogs are not loaded into it.

## Constraints that bite if forgotten

The full list — one entry per constraint, each a rule plus why it exists plus what broke when
it wasn't followed — lives in **`CONSTRAINTS.md`**, not here: it is long (roughly a thousand
lines), and inlining it would make this file cost its full weight on every single turn instead
of only when it's relevant. Before editing anything under `src/`, grep `CONSTRAINTS.md` for the
file, feature or module you're about to touch — nearly every shortcut that looks like a free
simplification in this codebase was already tried and is on record there as a regression.
A few constraints worth knowing before you've read anything else, because they are easy to
undo by accident and expensive to rediscover:

- **Opening a note must never touch the file** (B10) — no reformatting, no `modified` bump, no write, ever, just from reading it.
- **`package.json`'s `dependencies` is kept minimal.** electron-vite externalises everything listed there; a runtime package that can't be bundled belongs there, everything else in `devDependencies`. `npm run check:bundle` guards it.
- **The capture window is hidden, never destroyed.** Only one `BrowserWindow` reference exists; destroying it is unrecoverable.
- **Nothing this app deletes gets one attempt.** `trash-delete.ts` is the only code that permanently deletes anything, retries Windows' EBUSY/EPERM/ENOTEMPTY, and reports a specific refusal rather than asserting a cause.
- **A diagnosis that survives its own bug report is incomplete, not wrong.** Reach for one of the diagnostic helpers above before shipping a second fix for the same complaint.

## Tests

`test/corpus/` is **the specification**, not a set of examples. Each of the 31 files is written exactly as the serializer is meant to write it. `test/roundtrip.test.ts` asserts byte-identity in both directions plus formal file shape (LF only, exactly one trailing newline, frontmatter first, no trailing whitespace). If output differs from the corpus, one of the two is wrong — decide which, deliberately. Do not relax the assertion.

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

**And it was not the only file waiting on a number.** `capture-writer.test.ts` failed the
`v0.10.0` release on Windows while the same tests on the same commit had passed in `build`
twenty minutes earlier — the identical shape, one file over. `vi.advanceTimersByTimeAsync`
fakes the *timer* and nothing else, so the disk I/O the debounce callback starts is real,
and a flat `sleep(20)` after it was the whole margin. **The failure was a write racing
itself, not a slow assertion**: `writeAtomic` goes to `<path>.tmp` and then renames, so a
second `update` provoked while the first was still in flight renamed a temporary file the
first had already consumed — `ENOENT … rename '….md.tmp'`, arriving as an unhandled
rejection attributed to whichever test was running by then, which is why the reported test
and the broken one were two different tests. The rule is the one above: **wait for the
result of a write before provoking the next one**, never for a duration. Only that one test
needed it — every other test in the file already goes through `await writer.flush()`, which
awaits the write itself. `capture-store.test.ts`'s own `sleep(20)` is a different thing and
is fine: a deliberate gap between two *awaited* writes so an mtime change would be visible.

## Where the project stands

Phases 0–5 of `04-bouwplan.md` are done: the byte-identical markdown round trip, the resident
shell, the editor, the library window, and the SQLite/FTS5 search index. Phase 4's pasting and
images work landed except for one deliberately deferred piece — the Outlook `mso-list` list
reconstruction (§6.3), left open because real `.eml` samples showed the pattern it assumes
doesn't appear in genuine Word-authored or modern-Outlook content; see `TODO.md` before
resuming it. Phase 6 (email import) has not started.

Since phase 3 shipped, most work has come from daily use rather than the phase plan: dozens of
batches of fixes and small features, each traceable to a decision in `05-besluitenlog.md`
(B18 onward) where it changed how something is built. The detailed, dated, batch-by-batch
account of that — what shipped when, what was confirmed working under `Xvfb` versus never
seen live, and what each batch is worth remembering for — lives in **`HISTORY.md`**. Read it
when you need to know *why* a piece of code is shaped the way it is beyond what `CONSTRAINTS.md`
says, or when picking up a `TEST-PROTOCOL.md` item that's still unconfirmed on real hardware.

## The documents

Read these before making structural changes; they carry the reasoning that the code assumes.

| Document | Contents |
|---|---|
| `00-PLAN.md` | Overview, phase-level status, what happens next |
| `01-functioneel-ontwerp.md` | What the app does, from use |
| `02-technisch-ontwerp.md` | How it fits together; §6.3 is the paste pipeline |
| `03-markdown-dialect.md` | The vault format as a specification |
| `04-bouwplan.md` | Phases with acceptance criteria |
| `05-besluitenlog.md` | Decisions B1–B80, with what was rejected and why |
| `06-ipad.md` | Whether to build an iPad client. Answered **no** (B53); kept for the analysis, not as a plan |
| `07-iphone.md` | Plan for a capture-only iPhone companion app; not a reversal of B53, see its own §1 |
| `CONSTRAINTS.md` | The full "constraints that bite if forgotten" — one rule, its reason, and what broke, per entry |
| `HISTORY.md` | The batch-by-batch build log behind this codebase, in the detail `00-PLAN.md`'s own status table doesn't carry |
| `TEST-PROTOCOL.md` | Manual test pass for a human, per platform — what automation cannot reach |
| `TODO.md` | What is open right now |

Acceptance criteria in `04-bouwplan.md` are the definition of a phase being done — not "the code exists". When a decision in `05-besluitenlog.md` is revisited, that log is where the change belongs.
