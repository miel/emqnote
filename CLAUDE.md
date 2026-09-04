# CLAUDE.md

## What this is

A resident Electron note-taking app that replaces a "email a note to myself" routine. Notes are plain markdown files in folders on a business OneDrive. One user, two machines (macOS and Windows), no server, no accounts.

**Language convention:** code, comments, tests and UI strings are English (commit `c24d82b` switched them over deliberately). The design documents (`00`–`07`) and the note corpus in `test/corpus/` stay Dutch — the corpus fixtures stand in for real notes, so translating them would make them worse at that job. `CONSTRAINTS.md` and `HISTORY.md` (below) are English, being written for Claude Code rather than as design documents.

## Commands

Build, test, typecheck and packaging scripts live in `package.json`.

Beyond those, eight diagnostic helpers exist for questions this project has learned not to
guess at — a reported bug that survives its own fix is a recurring theme here (B57 → B59,
B62's Ctrl+Tab, B71), and each helper exists because guessing had already had its turn.
Two of them drive the real app under a display (`drive:capture`, `drive:library`), which is
where anything about focus order, pointer aim, window position or `-webkit-app-region` has
to be settled: jsdom implements none of them.
They are documented in the `diagnostics` skill (`.claude/skills/diagnostics/SKILL.md`);
reach for one before shipping a second fix for the same complaint.

Two more scripts build the **UI kit** — `npm run ui:kit` photographs about seventy parts of
the running app into `design/ui-kit/`, and `npm run ui:deck` assembles them into a
PowerPoint parts bin at `design/emqnote-ui-kit.pptx` for drawing mockups by hand. `design/`
is generated and gitignored; the two scripts are not. The deck builder wants python-pptx in
a `.venv`, deliberately outside `package.json`: it builds a design asset, never the app.

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
| Snapdragon X (Adreno X1-85), Windows 11 | external HP 734pm, 3440×1440 @ 60 Hz (panel does 48–120) | 36 ms | 53 ms | 4 Sep 2026 |

Record the machine and refresh rate with any future figure. The first row cannot be reproduced because neither was written down. **The second and third rows disagree, on identical hardware, and that is not yet explained** — see `CONSTRAINTS.md` for the full measurement history before citing either. The conclusion that survives both: **the editor and the library cost nothing on this path**, as designed.

**The fourth row is the first Windows figure**, and it is inside the budget at both p50 and
p95 on the platform CLAUDE.md has been calling the tighter one. Two things about it are worth
carrying rather than the number alone. The samples are bimodal — they alternate between about
35 ms and about 52 ms, one refresh interval apart at 60 Hz, which is the quantization this
section warns about showing up plainly rather than as noise. And the *first* appearance after
the app has been sitting idle costs far more than any of the fifty: 169 ms in that run, and
`latency.log` shows the same shape across three weeks of daily use — the great majority of
entries between 30 and 60 ms, with a long tail (200–520 ms) that is always the first hotkey of
a session. That tail is not in the p95 because `--selftest` presses the hotkey fifty times in
nine seconds. **What is not yet known is what the first press is paying for** — Windows paging
the process back in, the GPU waking, or something this app does — and nothing should be claimed
about it until it is measured. It is the one number a person actually feels, since the everyday
gesture *is* a first press.

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
- **Nothing this app *writes* gets one attempt either, and a failed write never takes the
  text with it** (B93). `atomic-write.ts` is the one place a note is written: unique `.tmp`
  name, retry, `clearReadOnly` between attempts on Windows, and a recovery copy in
  `userData/recovered/` when it still will not go. `CaptureWriter.enqueue` **catches**, and
  its constructor **requires** a failure handler — `then` on a rejected promise
  short-circuits for ever, so before that one `EPERM` from OneDrive meant the app wrote
  nothing for the rest of the day and said nothing about it. A failed save now replaces
  "Saved as …" in both windows' footers rather than sitting beside it.
- **Colour comes from one of six roles, never from a value** (B87). The page is `--background`,
  chrome and panels are `--surface`, a field is `--field`, and a row is `--hover` or
  `--selected` — declared once per theme at the top of `styles.css`. The light theme had the
  first two the wrong way round for a long time and nobody could see the three panes because of
  it. `styles-surfaces.test.ts` counts the grey literals left outside `:root`; there are two,
  and both carry a comment saying why they are not UI state. **`--accent` is not a seventh
  role**: "selected" is the fill in both panes, so the selected folder wears no accent text.
  The keyboard ring is the other way round and is one rule for all three panes (B91) — the
  tree, the note list and the task list — because removing it from the note list handed the
  ring to the UA, which drew it in the platform's own accent colour. Both are pinned by
  `styles-selection-accent.test.ts`.
- **Which theme is drawn is `nativeTheme.themeSource`, and nothing else** (B90). Settings
  offers system / light / dark; main sets the source before the first window is built, and
  every stylesheet goes on asking `prefers-color-scheme` exactly as it did when the OS was the
  only voice in it. No `data-theme`, no second set of rules.
- **A pane keeps both bands even when it is empty, and the window's top band keeps clear of
  the OS's own controls** (B95). The reader with no note open draws an empty `PaneHeader` and
  `PaneFooter` rather than nothing, and the file preview is a real one of each rather than a
  band of its own. `--caption-inset` is declared once in `styles.css` and read by the reader's
  header *and* by the three bars `.library-shell` can stack above the pane grid — those bars
  are what Windows 11 draws its caption buttons over, not the header one row down. None of it
  is visible off Windows, where `env(titlebar-area-width)` does not exist and every such rule
  evaluates to zero, so `styles-pane-bands.test.ts` counts them by hand.
- **Every pane's header is 40px and every footer 28px, from one rule** (B92). `PaneHeader`
  and `PaneFooter` in `src/renderer/` draw all four bands across both windows, and every
  button in either window's chrome is one `ChromeButton` at one of three sizes. The heights
  are rules rather than numbers per pane precisely so a new control cannot break the line
  across the top of the window, which is what `DESIGN-CRITIQUE.md`'s Finding 7 measured;
  `styles-pane-bands.test.ts` counts that no third height exists. Both windows are frameless
  and the OS draws its own controls *into* the band — traffic lights on macOS,
  `titleBarOverlay` on Windows 11 — so anything clickable in a header needs `no-drag`, the
  pane splitters and **the note's own title in both of its states** included: a press inside
  a drag region goes to the window move, not to the element under it, and the two titles
  were missed exactly because neither looks like a control. jsdom has no app-region, so no
  test in this suite can see that class of bug; `styles-pane-bands.test.ts` counts the rules
  by hand instead. An icon-only button keeps its name on `aria-label`, and
  `--click-button` falls back to it; chrome glyphs are drawn as inline SVG, never typed.
- **The note's own text size is one token** (B88). `--editor-font-size`, declared in `:root`
  and written from `useBootstrap`; everything inside `.editor-content` is `em` against it, so
  a size change moves the whole note evenly and the window around it not at all.
  `styles-editor-font-size.test.ts` is what keeps that true.
- **The library's Tab order is the order the eye reads, and it is a trade** (B94). Folders →
  notes → the note's title → When → Tags → Where → Who → the note. Only two of those steps
  are this app's; the other six are the browser walking focusable controls in DOM order, and
  a table of eight stops would be a second definition of what the DOM already says. Four
  things left the order to make it true — both pane splitters and the note list's sort and
  Tasks buttons — and the two buttons gained `Mod+S` and `Mod+T` in the same change: **drop
  either chord and the `offTabOrder` on its button has to go with it**, or the control is
  unreachable without a mouse. `npm run drive:library` is the only place a real Tab can be
  pressed; jsdom implements no focus navigation at all.
- **Moving notes is one call carrying a set, and the app's own removals are not external
  changes** (B95). `IPC.libraryMoveNotes` takes `string[]` and raises one `notifyLibrary()`;
  `IPC.libraryLinkingNotes` takes a set too, so the link question is asked once. The renderer
  looped over a one-note channel before, and the loop did not serialise — `runRelinkable`
  `void`ed the promise — so filing six notes was around thirty full walks of the vault and
  left the reader standing on a path another move had just vacated. Beside `own-writes.ts`'s
  content hash there is now `rememberOwnMove`/`wasOwnRemoval`/`wasOwnArrival`: a hash cannot
  speak for a path that no longer exists, which is why every move this app made was reported
  as a deletion from outside it. **Only the notification is ever suppressed, never the
  indexing** — B31's rule, unchanged.
- **Anything in a header band that must *also* move the window cannot get there with CSS**
  (B94). A `-webkit-app-region: drag` region swallows the press; `no-drag` gives it back and
  takes the window move away. The note's title needs both, so `window-drag.ts` watches the
  press and main moves the window — and the click that Chromium fires *after* a drag has to
  be suppressed, or letting go of a dragged title opens the rename.
- **Settings is six groups beside one pane, and its rows are data** (B100). `Settings.tsx`
  declares a registry — group, label key, the key of the sentence underneath, what it draws
  — and the JSX maps over it, the same relationship `shortcuts.ts` has with `Help.tsx`: the
  head band's search can only find what it knows is there. A row is *absent* while its group
  is not showing, not hidden, so every test reaching for one stands the rail on its group
  first. The panel prints the platform's chord (`formatAccelerator`) and saves Electron's —
  format on the way out too and the global hotkey silently stops working on one platform.
  The cap is on `.settings` and the scrolling on `.settings-pane`, or the search field goes
  off the top of the screen on the way to the row it was opened for.
- **A diagnosis that survives its own bug report is incomplete, not wrong.** Reach for one of the diagnostic helpers above before shipping a second fix for the same complaint.

## Tests

`test/corpus/` is **the specification**, not a set of examples. Each of the 31 files is written exactly as the serializer is meant to write it. `test/roundtrip.test.ts` asserts byte-identity in both directions plus formal file shape (LF only, exactly one trailing newline, frontmatter first, no trailing whitespace). If output differs from the corpus, one of the two is wrong — decide which, deliberately. Do not relax the assertion.

`test/limitations.test.ts` pins what the dialect deliberately *cannot* express, so the boundary is visible rather than discovered later.

**The suite runs on all three platforms in CI, not only on Linux.** `build.yml`'s `check` job runs it on ubuntu; the `package` matrix job runs it again on Windows and macOS before packaging. That line was missing until `v0.3.3` and it cost a release: `vault.ts` shells out to `attrib` on Windows, reads block counts on macOS, `filename.ts` exists for Windows' reserved names, and every path comparison meets a backslash for the first time there — so a Windows-only bug in `checkFilesOnDemand` sat in `main` until a tag was pushed and `release.yml` (which always did run the suite per platform) failed the release. It has since caught a second, macOS-only bug on the very next pull request. When a test asserts on a path, assume the three platforms disagree until CI says otherwise.

The suite runs its 2121 tests in roughly thirty-nine seconds of test time (about a minute and a
half of wall clock, most of it transform and environment setup). That number is worth
watching rather than defending: this file said "under about two seconds" for a long while
after it had stopped being true, and a budget nobody re-measures is a budget that quietly
becomes a wish. What the budget is *for* still holds — the suite has to stay cheap enough to
run on every change — and the jsdom files that mount a real component are what most of the
time goes on.

`test/index-watch.test.ts` and `test/capture-writer.test.ts` are the two files that wait on
real filesystem timing, and both have cost a release by getting that wait wrong. What each
one learned — chokidar's `ready()` gap and why Windows polling is worse than it sounds, and
why a debounced write can race itself — lives in **`test/CLAUDE.md`**, which loads when you
work under `test/` rather than on every turn. Read it before changing a timeout, a settle,
or a `sleep` in either file.

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
| `05-besluitenlog.md` | Decisions B1–B99, with what was rejected and why |
| `06-ipad.md` | Whether to build an iPad client. Answered **no** (B53); kept for the analysis, not as a plan |
| `07-iphone.md` | Plan for a capture-only iPhone companion app; not a reversal of B53, see its own §1 |
| `CONSTRAINTS.md` | The full "constraints that bite if forgotten" — one rule, its reason, and what broke, per entry |
| `DESIGN-CRITIQUE.md` | A photographed reading of the library window, 26 August 2026. Finding 2 became B87, Finding 3 B91, Finding 7 B92 (which also mitigated Finding 6); Findings 1, 4, 5 and 8 are open. Finding 3 was briefly made worse on purpose — the note list's focus ring was removed — and B91 put that back |
| `HISTORY.md` | The batch-by-batch build log behind this codebase, in the detail `00-PLAN.md`'s own status table doesn't carry |
| `TEST-PROTOCOL.md` | Manual test pass for a human, per platform — what automation cannot reach |
| `TODO.md` | What is open right now |
| `TODO-BEFORE-RELEASE.md` | The release gate for a public 1.0 — only what must be true before `v1.0.0` is tagged |
| `PRIVATE-REPO-UPDATES.md` | How upgrades keep working if the repo goes private. A proposal, not yet a decision: B22 made the repo public *for* the updater, and this is the way back |

Acceptance criteria in `04-bouwplan.md` are the definition of a phase being done — not "the code exists". When a decision in `05-besluitenlog.md` is revisited, that log is where the change belongs.
