# TODO

Working list. The phase plan lives in `04-bouwplan.md` and the decisions in
`05-besluitenlog.md`; this file is only what is open right now.

Last updated 1 August 2026, at `v0.2.1`.

## Where the project stands

| Phase | State |
|---|---|
| 0 — markdown round trip | Done. 27 corpus files, byte-identical both ways. |
| 1 — resident shell | Done. Hotkey → caret measured inside budget. |
| 2 — the editor | Done. |
| 3 — the library window | Done. Shipped before phase 4; the two were swapped in practice. |
| 4 — **pasting and images** | **Started. Still the largest unknown in the project** — the `mso-list` reconstruction described in `02-technisch-ontwerp.md` §6.3. A `--dump-clipboard=<prefix>` flag exists now (see `CLAUDE.md`) so the next step is real Outlook/Word samples, not code — see below. |
| 5 — index and search | Started. `index-db.ts` (SQLite/FTS5), `index-scan.ts` (the full-scan builder), `index-watch.ts` (the `chokidar` watcher), `vault-scan.ts` (a query layer over the index, Map gone), `search-query.ts` (the search-bar query language) and `vault-scan.ts`'s `searchNotes` all exist and are tested for real. Not wired into IPC or a real search bar yet — see "Settled" below. Still missing after that: conflict-copy recognition, orphaned-attachment cleanup. |
| 6 — email import | Not started. Power Automate availability is still an open point. |

Since `v0.1.0`, one thing landed outside the phase plan: **B22, a Windows
installer and auto-updater** (`installer-auto-updater` branch, merged as PR #1).
It pulled the release pipeline along with it — three separate CI bugs surfaced
and were fixed, and one of them (mac builds shipping unsigned) meant every mac
build the project had ever produced, including the published `v0.2.0`, could
not launch on Apple Silicon. `v0.2.1` is the first release where that's fixed.
See "Settled" below and B22 in `05-besluitenlog.md`.

---

## Open items worth your attention

- **Did `v0.2.0` ever actually reach your Mac?** If you updated to `v0.2.0`
  between its release and the `v0.2.1` fix, the `.app` would have refused to
  launch at all ("is damaged and can't be opened") — worth confirming you're
  now on a working `v0.2.1` build, not stuck on the broken one or an older
  zip you kept around because `v0.2.0` didn't work.
- **The Windows auto-update path has no confirmed end-to-end run yet.** The
  logic is implemented and the release pipeline now publishes correctly, but
  nobody has watched a real install pick up an update through the two
  confirmation dialogs. Worth doing once, on the Windows machine.
- **Phase 4 needs real clipboard samples before the `mso-list` reconstruction
  can be written for real, not guessed at.** `emqnote --dump-clipboard=<prefix>`
  is built and tested (flag parsing only — nobody has run it against a live
  clipboard yet, same sandbox limitation as everything else Electron here).
  On the Mac, copy from real Outlook and run it once per case, at minimum: a
  plain paragraph, a nested mixed bullet/numbered list, bold/italic/underline/
  highlighted text, a table with at least one merged cell, and an inline
  image. Hand the resulting `.html` files back — they become the fixtures the
  paste pipeline is built and tested against, the same way `test/corpus/`
  already works for the serializer.

## Verification still owed

None of these is reachable through the app's `--screenshot` / `--click-button`
flags, so they weren't covered before `v0.1.0` was tagged, and nothing since
has closed them — this environment still has no display, so the app itself
can't be watched running, and these carry forward unverified. (The Node
version is no longer the reason: an `nvm` install of Node 24 on 2 August 2026
fixed both the jsdom-based tests and `better-sqlite3`, which segfaulted under
the sandbox's previous Node 18 — see `00-PLAN.md`. Whether `Xvfb`, which
happens to be installed here, makes a real headless launch possible is itself
untested; nobody's tried.) `npm test`, `npm run typecheck` and `npm run build`
all still pass — 387 tests now, the full suite, up from 325 across the
commits of phase 5 work plus the 12 jsdom tests Node 24 unlocked.

- [ ] Rename a folder while a note inside it is **open and dirty**. Confirm no
      duplicate old folder appears, the note keeps its caret and undo history,
      and the tree, the filters and the open note's path all follow. This is the
      one path where a debounced save landing after the rename would recreate
      the old folder — the ordering is in `renameFolderAt`, untested end to end.
- [ ] Switch vaults from Settings. Confirm the restart happens, the new vault is
      scaffolded, and **nothing was written into the old one**.
- [ ] Type `[] `, tick with the mouse, tick with `Mod+Shift+T`, press Enter
      after a ticked item and confirm the new one is empty and unticked. In the
      capture window confirm `Mod+Shift+Enter` ticks and does **not** close the
      note.
- [ ] `F1` in both windows, and confirm every shortcut listed actually fires.
- [ ] The header and note-list changes judged by eye in **dark mode**. Every
      colour used is a token or `currentColor`, so it should follow, but it has
      only been seen in light mode.
- [ ] The write-conflict fix, end to end: open a note in the library, double-click
      it to hand it to capture, confirm the reader locks itself (dimmed,
      unclickable, "open for editing in the capture window") immediately, and
      that closing capture again unlocks it. Then the other direction: with a
      note already loaded in capture, single-click the same note in the library
      and confirm it opens read-only from the start. The logic underneath is
      covered by `capture-store.test.ts` and `capture-writer.test.ts`, but
      nobody has watched the lock/unlock actually happen on screen.
- [ ] A brand-new note's disappearing act: hit the hotkey, type a few words,
      and confirm nothing appears in the library's Inbox list, folder count,
      or Tags/People facets until Ctrl+Enter or close. Then confirm it *does*
      appear immediately after. Logic is covered by new tests (see "Settled"),
      not watched on screen.
- [ ] The "+ New note" button in the note-list header, and double-click on a row,
      against the real window layout — both were built and typechecked but never
      rendered.
- [ ] Whatever the "+ New note" button's placement looks like next to the sort
      buttons; `justify-content: space-between` was inherited from a two-child
      header and may put more air between them than intended.
- [ ] The watcher's real acceptance criterion: edit a note on one machine,
      confirm it shows up in the library on the other **within 5 seconds** of
      OneDrive finishing the sync (`04-bouwplan.md`, phase 5). `index-watch.test.ts`
      proves the mechanism against a local temp directory with a 20 ms
      threshold; nothing here proves the 300 ms production default is the
      right number against real OneDrive sync latency, which was never
      measured either.

## Housekeeping

- [ ] Delete the merged branches (all three are fully merged into `main`):
      ```
      git branch -d ten-improvements-from-use installer-auto-updater
      git push origin --delete ten-improvements-from-use tags-and-people installer-auto-updater
      ```
      (`tags-and-people` has no local branch left to delete, only the remote.)

## Settled

**Windows gets a real installer and auto-updater (B22).** Per-user NSIS
install (`perMachine: false`, no admin rights needed), driven by
`electron-updater` in `src/main/updater.ts` with two explicit confirmations —
before download, before restart-to-install. macOS deliberately stays on the
plain zip with a version-check-and-link path instead: no Developer ID, no
notarization, so no silent Squirrel.Mac install. Full reasoning in B22,
`05-besluitenlog.md`. This also made `electron-updater` the first real
runtime dependency electron-vite can't bundle, so `electron-builder.yml` no
longer excludes `node_modules` wholesale — see the `dependencies` note in
`CLAUDE.md`.

**The release pipeline needed four follow-up fixes before it actually worked,
and they're worth knowing about even though they're "just CI":**
- The matrix's mac and Windows jobs racing each other (and even a single job's
  own two sequential uploads racing themselves) against electron-builder's
  non-atomic "find-or-create" release logic — fixed by pre-creating the
  release as a draft in its own job, which every other job then just reuses.
- `draft: false` isn't a real electron-builder config key in the installed
  version; `releaseType: release` is.
- **Mac builds were never signed, not even ad-hoc** — `identity: "-"` was
  missing, so AMFI refused to run the unsigned arm64 binary on Apple Silicon.
  Every mac build the project had produced up to `v0.2.0` was affected.
- `latest-mac.yml` and the mac blockmap were being published even though
  nothing reads them (`updater.ts` never uses Squirrel.Mac) — dropped from the
  build and removed by hand from the already-published `v0.2.0`/`v0.2.1`
  releases.

Two smaller correctness fixes surfaced by that same CI work, independent of
release packaging:
- **A `modified`-timestamp race that could violate B10.** `buildFrontmatter`
  decided whether content had changed by comparing a freshly-generated
  timestamp against `created`, so two writes with identical content but a
  clock second between them would serialize to different bytes and trigger an
  unprompted rewrite. Now the content comparison happens first, before
  `modified` is touched at all.
- **Windows CI running the test suite for the first time exposed two
  pre-existing bugs**: `windows-latest`'s checkout was converting the LF-only
  corpus fixtures to CRLF (no `.gitattributes` existed), and `isInside`/
  `listVaults`'s case-folding was gated on `process.platform` in a way that
  happened to also disable it under Linux test runners, silently breaking
  `vaults.test.ts` assertions on `ubuntu-latest` specifically.

**The capture/library write conflict is fixed, and the five outstanding
note-browser items from `v0.1.0`'s TODO are built** — double-click-to-capture,
the "+ New note" button, Tags/People outdenting, and "New folder" disabled on
Trash. `OpenedNote` carries an `editable` flag; the library reader goes
read-only whenever capture has the same note claimed, and refuses to save
regardless as a second line of defence; a new `capture:load` channel lets
capture take over an existing note without going through the Inbox-only
frontmatter path. None of this has been watched running in a real window yet
— see "Verification still owed" above, which is exactly where this was left
in the previous TODO and remains.

**No completion on the tag and people fields**, and the whole
`attendees:list`/`tags:list` IPC chain that only existed to feed it, are gone
— see the previous TODO entry for the reasoning; nothing new here, just
carried forward as done.

**A brand-new capture note no longer leaks into the library before it's
committed.** The write-conflict fix above locks a note once capture has it
open, but a note being typed for the first time has no path to lock yet —
`activePath()` returned `null` until the debounced write picked one, and once
it did, the raw `session.path` it returned was absolute while every library
comparison (`NoteSummary.path`, `OpenedNote.path`) is vault-relative, so it
silently never matched anyway. In between, the half-typed note showed up in
the Inbox list, its folder's badge count, and the Tags/People facets — a
title with three words in it, sitting in the note browser next to the vault's
real notes. `CaptureWriter.uncommittedNewPath()` now returns the vault-relative
path only while the session is new (`existingTitle === null`) and unfinished; a
loaded, pre-existing note stays visible (locked, not hidden — that one's
already real). `index.ts` threads it through `readFolderTree`, `notesMatching`
and `facets` as an `excludePath`; `librarySaveNote` also checks `activePath()`
directly, since the renderer's own `editable` flag is only ever as fresh as
the last `library:refresh`, and pushes a `locked` refresh back to the library
when it catches a save that lands after the note above it. Covered by new
tests in `capture-writer.test.ts`, `vault-io.test.ts` and `vault-scan.test.ts`;
not yet seen on screen for the same reason as the item above.

**Phase 5's SQLite index exists as its own module, tested against a real
database.** `src/main/index-db.ts` holds the schema
(`notes` + an FTS5 `notes_fts`), `upsertNote`/`deleteNote`/`getNote`/
`allNotes`/`needsRefresh`, and free-text `search()`. Two deliberate
departures from the sketch in `02-technisch-ontwerp.md` §7.1, both explained
in the module's own comments: `notes_fts` is a plain FTS5 table keyed on an
`UNINDEXED path` column rather than the `content=''` "contentless" form the
doc sketches, because a contentless table needs the *old* column values
handed back to it on every delete/update and syncing that by hand against a
second table's rowid space bought nothing at this scale; and `search()`
quotes and prefix-matches each word of the query separately
(`"word1"* "word2"*`, FTS5's implicit AND) rather than treating the whole
query as one phrase, verified against a real FTS5 table — a whole-query
phrase match requires the words to appear in that exact order, which is
wrong for a type-ahead box. `better-sqlite3` is now a real `dependencies`
entry (see the note in `CLAUDE.md`); it needed nothing beyond `npm install`
to work here — it ships prebuilt N-API binaries for every platform in the
package itself, no `node-gyp`/`electron-rebuild` step required, which is
also presumably why it was the anticipated choice over Tauri's Rust
equivalent in B2.

**The full-scan builder that fills the index also exists, also tested
against a real database and a real temp vault.** `src/main/index-scan.ts`'s
`fullScan(vault, db, onProgress?)` walks the vault and calls `upsertNote`
per file that is new or has a changed `mtime`/`size`, then deletes any
indexed row whose file is gone. One thing it does deliberately differently
from what the old Map did, explained in the module's own comment: a
dataless (evicted) file keeps its last-indexed row rather than being
dropped, because the Map was rebuilt from nothing every time so "not shown
until it hydrates" cost nothing there, while dropping a row from a
*persistent* index would mean a note someone could search for on Monday
silently stops matching on Tuesday because OneDrive evicted a file nobody
touched. `checkFilesOnDemand`'s `"ondemand"` short-circuit is wired through
but its actual trigger path (`process.platform === "darwin"`) cannot be
exercised on this Linux sandbox, same limitation that function already had
before phase 5.

**`vault-scan.ts`'s Map is gone — the swap the two items above were leading
up to.** `facets`/`notesMatching` now take a `db: IndexDb` parameter and
read from `index-db.ts` via `allNotes`, with `ensureScanned` calling
`fullScan` (still collapsing concurrent callers onto one running scan, same
as before) instead of rebuilding a Map. `collectFiles`/`isDataless` moved
into `index-scan.ts` — their only remaining caller — rather than staying
exported from a module that no longer walks the filesystem itself. Folder
browsing is unchanged: still straight from disk via `readNotesIn`, never
through the index, so opening a folder never waits on a scan. `NoteRecord`
gained `fileName` and `excerpt` columns so a tag/person query never has to
re-read a matched file to build the `NoteSummary` the library expects —
`index-scan.ts`'s `buildRecord` already had both from the `summarise()` call
it was making anyway. `index.ts` opens one `IndexDb` at
`app.getPath("userData")/index.sqlite` in `main`, after `app.whenReady`
(B9), and closes it in `will-quit`. `better-sqlite3` also needed adding to
`electron.vite.config.ts`'s `external` list and `check-bundle.ts`'s
allowlist, alongside `electron-updater` — the same reason: a dynamic
`require` for its native binary that cannot survive bundling, and the sole
existing test of that path (`npm run build`) had nothing to catch it until
`index.ts` actually imported `index-db.ts`, which happened only with this
swap. All 17 of `vault-scan.test.ts`'s existing tests pass unchanged in
behaviour against the new implementation, which is the real evidence the
swap preserved the interface.

What was still open at that point: no IPC channel or worker called
`fullScan` on its own — a capture or an app launch reaching
`facets`/`notesMatching` was still what triggered it, same as the Map
always was, so the *first* library open after a cold start paid for the
initial full scan inline rather than during a progress-bar startup step.
That part is still true today — nothing about the watcher below changes it,
since the watcher only takes over *after* that first scan has run.

**The `chokidar` watcher for incremental reindexing now exists too, wired
into `index.ts`, not just written.** `src/main/index-watch.ts`'s
`watchVault(vault, db, options?)` starts watching once a vault is known
(`main`, right after `prepareVault`) and keeps the index in step with
changes that land afterward — the other machine's OneDrive sync, chiefly —
without waiting for something else to trigger a rescan. The 300 ms debounce
`02-technisch-ontwerp.md` §7.2 calls for is chokidar's own
`awaitWriteFinish` (polls a file's size until it stops changing) rather than
a hand-rolled timer on a plain fs watch, deliberately: OneDrive can write a
synced file over several separate writes, and a naive "react to the first
change event" watch would index it mid-write. `ignoreInitial: true` keeps
it purely incremental — the full scan already covers what exists at
startup — and it shares the same hidden-folder/trash rule `collectFiles`
walks by, so a file inside `_attachments` or `_trash` is never watched in
the first place. Skipped like the watcher-adjacent parts of `--selftest`
already were: it does not start during a measurement run, since background
fs polling is exactly the kind of unaccounted-for noise the hotkey→caret
numbers in `CLAUDE.md` cannot afford to quietly pick up. Closed on
`will-quit`, before the index it writes into.

Real chokidar against a real temp directory, not a mock — 8 tests in
`test/index-watch.test.ts`, using a much smaller `stabilityThreshold` than
the 300 ms production default and the smallest settle margin found reliable
across repeated runs. One genuine race surfaced and got fixed rather than
papered over: writing a file immediately after starting the watcher could
be missed, because chokidar's initial crawl has to finish before it is
actually attached, and `ignoreInitial` only suppresses the `add` events
that crawl would otherwise fire — it does not make attachment itself
faster. `VaultWatcher` now exposes a `ready()` the tests await instead of
guessing at a delay. This is the one file in the suite that costs real
wall-clock time — flagged in `CLAUDE.md`'s Tests section, since that
document is explicit about the suite needing to stay fast.

**The search bar's own query language — `02-technisch-ontwerp.md` §7.3 — now
exists, still with no search bar to type it into.** `src/main/search-query.ts`'s
`parseSearchQuery(input)` pulls `type:`, `tag:`, `attendee:"…"`, `after:` and
`before:` out of the box text and leaves the rest as free text; an
unrecognised key or an invalid value (`type:archived`, `after:volgende-week`)
falls back to being treated as free text rather than erroring, since a search
box has no error state to show. One deliberate translation from the design
doc: it spells the date filters `na:`/`voor:`, Dutch, predating the
English-UI decision in commit `c24d82b` — this implements `after:`/`before:`
instead, the same kind of divergence B19 already models, not an oversight.
`vault-scan.ts`'s new `searchNotes(vault, db, query, { scope?, excludePath? })`
runs a parsed query against the index: free text goes through `search()`'s
FTS5 ranking and keeps that order, a filters-only query falls back to
`allNotes`' alphabetical order, and a completely blank query returns
everything rather than being special-cased to nothing — clearing the last
filter should feel like "back to everything", not a cliff down to zero.
`after`/`before` compare against `created`'s date portion only, not the full
timestamp-with-offset string, which is spelled out in the function's own
comment since the wrong version of that comparison silently does something
that looks right and is not. `scope` (the folder-vs-global switch) is
implemented and tested but nothing passes one yet. 30 new tests between the
two modules (16 for the parser's own edge cases, the rest for the combining
function), all passing on the first real run against the actual index.

Not done: no `IPC.librarySearch`-shaped channel, no renderer search box.
Building those is real UI work — a text input, debounced typing, swapping
the note list's contents — not a small addition to this pass.

Next: conflict-copy recognition and orphaned-attachment cleanup — see
§5.2/§6.5 in `02-technisch-ontwerp.md`. Wiring the search bar itself into
the library window is also still open, whenever that becomes the priority
over the rest of phase 5.

## Unexplained, worth settling

**The hotkey → caret figure halved and nobody knows why.** `CLAUDE.md` records
p50 60 ms for the Mac mini M4 on the 2490W1 at 1920×1080 @ 60 Hz at phase 3,
against p50 27–31 ms / p95 36–45 ms on the same machine and display, measured
28 July 2026 over three consecutive packaged runs of fifty, zero missed.
Nothing since has touched that path or re-measured it. Re-measure the phase-3
build on the same display and settle which condition differed, rather than
letting the new number stand as a win it probably is not.

## Other open points, carried from `05-besluitenlog.md`

- **Does Windows hit the latency budget with the real editor in it?** Only
  three informal measurements exist (112/77/52 ms) — not enough to trust. Run
  the packaged `--selftest` on the Windows machine.
- **How much memory does the resident process cost in practice?** Never
  measured. Bears on B2 (why residency is viable at all).
- **How hard is the `mso-list` reconstruction actually going to be?** Phase 4,
  unstarted, the largest unknown in the project.
- **Is Power Automate available for phase 6's email import?** Doesn't block
  anything before phase 6.
