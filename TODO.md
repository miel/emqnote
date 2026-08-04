# TODO

Working list. The phase plan lives in `04-bouwplan.md` and the decisions in
`05-besluitenlog.md`; this file is only what is open right now.

Last updated 4 August 2026, at `v0.3.2`.

## Where the project stands

| Phase | State |
|---|---|
| 0 — markdown round trip | Done. 27 corpus files, byte-identical both ways. |
| 1 — resident shell | Done. Hotkey → caret measured inside budget. |
| 2 — the editor | Done. |
| 3 — the library window | **Done, now including dragging in the tree** — the one work item that was still outstanding, built 4 August 2026. Shipped before phase 4; the two were swapped in practice. |
| 4 — **pasting and images** | **Deferred, deliberately.** Real samples finally arrived and reshaped what's actually unknown here — see below — but confirming the one remaining open question needs classic desktop Outlook, unavailable for about two weeks from 2 August 2026. Picking this back up then. |
| 5 — index and search | **Done.** Search bar, conflict banner (diff + keep/keep/merge) and the orphaned-attachments cleanup screen are all wired end to end — IPC, preload, real UI — and confirmed actually working via `Xvfb`: a real conflict pair resolved on disk, a real orphaned attachment trashed on disk, not just rendered. See "Settled" below. |
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
- **Real samples arrived (7 `.eml` files, 2 August 2026) and the finding
  reshapes phase 4 more than it resolves it.** Kept locally at
  `test-emails/`, gitignored — real correspondence, this repo is public. Only
  one of the seven is genuine Word/Outlook-authored content (`Generator:
  Microsoft Word 15` in its own HTML head); the other six are HTML-email-
  marketing output (Mailchimp/HubSpot-style, 25–119 layout `<table>`s each,
  zero `mso-list`) — real but useless for the list-reconstruction problem
  specifically. The one genuine sample, and a second one you composed
  yourself (`Test-email 1.eml`, sent from `mkb-fonds.nl`), **both use real
  `<ol>`/`<ul>`/`<li>` tags already, not the flat `<p class=MsoListParagraph>`
  fake-list pattern `02-technisch-ontwerp.md` §6.3 assumes is "the reason
  pasting from Outlook goes wrong everywhere."** `mso-list` shows up in the
  Word-authored one purely as decorative CSS layered on top of otherwise
  structurally valid HTML. The self-composed one is cleaner still — `Aptos`
  font, a `data-editing-info` attribute — markers of new Outlook / Outlook on
  the web, not classic desktop Outlook's Word rendering engine at all. You
  confirmed these are from **Outlook for Mac**, which you believe shares that
  same web-based technology, and you don't have access to classic desktop
  Outlook (Windows) for about two weeks from 2 August 2026 — the one client
  that might still exhibit the flat-paragraph pattern, unconfirmed either
  way. **Deferred rather than built against an assumption**: with a real
  vault-relative existing schema whose own `parseDOM` may already handle
  `<ol>/<ul>/<li>` correctly, the actual size of "the largest unknown in the
  project" might be much smaller than assumed — or the flat pattern might
  still be real and simply absent from every sample gathered so far. Pick
  this back up once classic Outlook is reachable, either to confirm the
  flat-paragraph problem is real and needs the full reconstruction the design
  doc describes, or to confirm it mostly isn't and scope the work down
  accordingly. `emqnote --dump-clipboard=<prefix>` (built earlier, still
  untested against a live clipboard) remains the tool for capturing that —
  a live clipboard paste from an open compose window may still differ from a
  saved/sent `.eml`'s HTML even on the same client, since those are
  genuinely different HTML generation paths. `postal-mime` was added as a
  devDependency while investigating (used interactively to parse the real
  samples, confirmed to bundle cleanly, correctly placed — unlike
  `better-sqlite3`, it's pure JS with no native binary); nothing in `src/`
  imports it yet.

## Verification still owed

**Update, 2 August 2026: `Xvfb` actually works here.**
`xvfb-run -a --server-args="-screen 0 1280x800x24" node_modules/.bin/electron
out/main/index.js --library --screenshot=<path> --vault=<path>` renders the
real library window and writes a real PNG — confirmed while wiring the
search bar (below), not assumed. The dbus/GPU warnings it prints are normal
headless-Linux Electron noise, not failures. That reopens every item below
that only needs `--screenshot`/`--click-button` and a look, in this sandbox,
without waiting for the real machine — two of them (the "+ New note" button
and its placement) already got closed this way, struck through below. The
rest are still open only because nobody has gone through them yet, not
because they are unreachable. (Also no longer blocked on Node: an `nvm`
install of Node 24 on 2 August 2026 fixed both the jsdom-based tests and
`better-sqlite3`, which segfaulted under the sandbox's previous Node 18 —
see `00-PLAN.md`.) `npm test`, `npm run typecheck` and `npm run build` all
pass — 438 tests, the full suite.

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
- [x] ~~The "+ New note" button in the note-list header... against the real
      window layout.~~ Seen via `Xvfb` while wiring the search bar, 2 August
      2026: renders correctly, reasonable spacing next to the sort buttons.
      Double-click-on-a-row still unverified — that needs `--click-button`
      against an actual note row, not just a look.
- [x] ~~Whatever the "+ New note" button's placement looks like next to the
      sort buttons.~~ Same screenshot: fine as built, `justify-content:
      space-between` did not put excessive air between them.
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

What was still open at that point: nothing called `fullScan` on its own — a
capture or an app launch reaching `facets`/`notesMatching` was still what
triggered it, same as the Map always was, so the first thing to ask the index
a question after a cold start paid for the whole walk.

**Closed on 4 August 2026.** `vault-scan.ts`'s `startScan` is called from
`main()` right after `prepareVault()`, beside the watcher and skipped during
`--selftest` for the same reason, and reports progress into a thin bar at the
top of the library window (`IPC.libraryScanProgress`, plus
`IPC.libraryScanState` for a window that opened partway through and missed the
events). It shares `ensureScanned`'s collapse, so a question arriving mid-walk
joins the scan already running instead of starting a rival one — asserted on
promise identity in `vault-scan.test.ts`, since a second walk would produce
the same answers at twice the cost and so could not be caught by its output.

Measured on a generated 4000-note vault under `Xvfb`: about 15 s from launch
to the bar disappearing, roughly 11 s of it scanning. That is the wait that
used to begin when the library was first opened. Worth being exact about what
it did *not* do even then: the tree and the folder note list read straight
from disk, so the window always drew immediately. What waited was everything
index-backed — Tags, People, search and the conflict check — and it waited
silently, which is the part that is fixed.

**And the scan now runs in a worker — §7.2's last outstanding piece, closed
the same day, with the measurement it owed.** `src/main/scan-worker.ts` is
the worker entry (a second input in `electron.vite.config.ts`'s main build,
emitted beside `index.js`); `src/main/scan-host.ts` starts it, forwards its
progress, and falls back to the main thread if it cannot start.
`vault-scan.ts` never learns a thread exists: it gained a `ScanRunner` seam
and kept the collapse, which still belongs on its side — two workers walking
the same vault into the same database would be worse than two in-process
walks, not better.

Measured on a generated 4000-note vault, on this Linux sandbox (not the Mac
mini — the absolute numbers will differ there, the shape should not), with an
event-loop lag monitor running on the main thread. Two runs of each:

| | total | worst main-thread stall | stalls > 80 ms |
|---|---|---|---|
| in-process (what shipped before) | 14.4 s / 14.0 s | 535 ms / 469 ms | 40 / 40 |
| in the worker | 14.0 s / 15.1 s | 6.9 ms / 29.4 ms | 0 / 0 |

The in-process row is the one worth remembering: forty stalls clean over the
hotkey's *entire* 80 ms budget, one per hundred files, because a hundred files
is about half a second of work — `fullScan` yielding every hundred bounded
nothing at that granularity. Total scan time is unchanged, so nothing was
traded away for it.

What the worker forced, all deliberate, all written down in `CLAUDE.md`: a
database connection of its own (a `better-sqlite3` handle cannot cross a
thread; WAL is what makes a second one safe, plus a `busy_timeout` so the
watcher and the worker do not drop a write when they collide); an
Electron-free import graph, which is a rollup-chunking property rather than a
source-tree one and is now checked by `check:bundle` rather than hoped for;
and a loud main-thread fallback, since a worker entry missing from the package
would otherwise show up as an index that silently never gets built.

Confirmed in the real app under `Xvfb`, not only in tests: a 3000-note vault
indexed end to end, the library drawing its tree and note list immediately
with the progress bar running above them, all 3000 rows and FTS entries
present afterwards, the Tags facet reading 20 tags × 150 notes through the
main thread's own connection, and no fallback message on stderr in any run.
That ESM workers load from inside a packed `app.asar` at all — shared chunks
and all — was checked before the design leaned on it, not after.

Not confirmed: the same on Windows and macOS. The asar check was done on
Linux with the same Electron version, and neither packaged app has been
rebuilt since.

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

**Conflict-copy recognition (`02-technisch-ontwerp.md` §5.2) now exists
too, narrower than the design doc's own aside about it.** `src/main/
conflicts.ts`'s `findConflictCopies(paths)` pairs a machine-suffixed
OneDrive conflict copy (`Kickoff project Alpha-LAPTOP-ABC123.md`) with its
original from a plain list of vault-relative paths — no file reads, no
hashing, filenames only. Deliberately does *not* treat a bare ` (N)`
suffix as conflict evidence on its own, even though the design doc
mentions that shape too: `filename.ts`'s `uniquePath` already produces
exactly `Title (2).md` for a completely ordinary reason — two notes
independently created with the same title in the same minute — and
flagging that as "edited on two machines" would be a false alarm over
routine use of the app's own disambiguation. The machine-name suffix has
no such ambiguity; nothing in this app ever appends one. Matching works by
trying progressively larger hyphen-segment removals from a path's stem and
stopping at the first known file that results — smallest removal first,
so `Kickoff project Alpha-LAPTOP-ABC123.md` pairs with `Kickoff project
Alpha.md` rather than over-stripping to something shorter that also
happens to exist. Still an acknowledged heuristic, not a certainty, and
says so in its own comment: a genuinely hyphenated title sitting next to
its own unhyphenated prefix (`Weekly Report-Draft.md` beside `Weekly
Report.md`) reads as a false positive by the same rule that finds a real
conflict — the design doc's own "*herkent* dat patroon" (recognises the
pattern) already concedes this, not a gap introduced here. 12 tests,
including that acknowledged false positive as its own test rather than
leaving it undocumented.

Not wired in: nothing calls this from a scan or the watcher yet, there is
no banner, no diff, no "keep this / keep that / merge" UI — `04-bouwplan.md`
describes all three as part of this same acceptance criterion, and none of
them is a small addition to what exists now.

**Orphaned-attachment cleanup (`02-technisch-ontwerp.md` §6.5) now exists
too — every backend piece phase 5 named is now built and tested.**
`src/markdown/wiki-targets.ts`'s `collectWikiTargets(doc)` is the new small
piece underneath it: every `![[…]]`/`[[…]]` target a document points at,
`wikiEmbed` and `wikiLink` collected together and deliberately
undistinguished, since §6.4 routes an image through `wikiEmbed` but a
non-image attachment through the very same `[[…]]` syntax a note-to-note
link uses — a target cannot be told apart as "attachment" or "note" from
the document alone, only by later checking it against what actually exists
in `_attachments/`. `src/main/orphaned-attachments.ts`'s
`findOrphanedAttachments(vault)` does that check: every file under
`_attachments/` whose name no note references, matched by filename alone
(the same rule wikilink resolution itself already follows, which is why
moving a note never breaks its embeds — an attachment nested under
`_attachments/2026/07/` is referenced the same way a flat one would be).
One deliberate difference from `index-scan.ts`'s own file walk: a note
already in `_trash/` still counts as a reference, since it can still be
restored and an attachment it needs would otherwise get reported as
orphaned and cleaned up out from under it — a reference is a different
question from a listing, and trash answers it differently for each. 8
(orphan-finding) + 7 (wiki-target-collecting) new tests, both green on the
first real run. 438 tests total.

Not wired in, same as the two items above: no IPC channel, no thumbnail
grid, no explicit per-file delete confirmation in the UI. §6.5 is explicit
that deletion is always a manual, one-at-a-time choice — this only ever
produces the list to choose from.

**That closes out every backend piece phase 5 named as work**: the SQLite
index, the full-scan builder, the watcher, the search-bar query language,
conflict-copy recognition, orphaned-attachment finding.

**The search bar is now wired end to end — IPC, preload, and a real input
in the library window** — the first piece of phase 5's UI. `IPC.librarySearch`
(`"library:search"`) takes the raw query string; the main-process handler
runs it through `parseSearchQuery` then `searchNotes`, threading
`uncommittedNewPath()` through as `excludePath` the same way `libraryNotes`
and `libraryFacets` already do, so a note still being typed in capture stays
invisible to search too. `NoteList.tsx` gained a `.notes-search` input above
its existing header row; `Library.tsx` owns the query as state, debounced
150 ms on change the same way `onDocChange`/`onHeaderChange` already debounce
a save — searching runs a real query against the index on every call, and
firing one per keystroke would turn typing "kickoff" into seven round trips.
A non-blank query wins over the tree selection entirely rather than
combining with it: `loadNotes` (the one function every existing call site
already uses — after a save, after a folder rename, on `library:refresh`)
now checks the query first and calls `search()` instead of `notes()` when
there is one, so every one of those call sites stays correct without being
touched individually. Clicking anything in the tree while a search is active
clears it, cancelling a pending debounce too — a stronger signal (you picked
a specific folder) should not lose to a stale query about to re-fire 150 ms
later. Results reuse the same "show which folder" treatment a tag or person
view already gets, since search draws from the whole vault the same way.

Confirmed rendering correctly via `Xvfb` — see the note under "Verification
still owed" above — both empty and with a real note in the list; not
confirmed is an actual keystroke-driven round trip, since no flag exists to
inject text into a field the way `--click-button` clicks one. Every piece
underneath the box (the parser, the query-runner, the IPC plumbing) already
has its own tests from when phase 5's backend was built, so this is UI
wiring on top of already-verified logic, not new untested logic.

**Phase 5 is done — the conflict banner and the orphaned-attachments cleanup
screen both landed, and both were verified actually working, on disk, not
just rendered.** New backend underneath them:

- `src/main/diff.ts` — a line-by-line diff, the classic O(n·m) longest-
  common-subsequence table rather than the O(ND) Myers algorithm a real diff
  tool uses. Deliberate at this scale: a note is at most a few hundred
  lines, and the simpler algorithm is also the simpler one to get right. 11
  tests.
- `vault-io.ts`'s `resolveConflict(vault, pair, choice)` — `keepOriginal`
  trashes the conflict copy; `keepConflict` trashes the *original* (through
  the same `trashNote` a manual delete uses, never a permanent unlink,
  since this is still overwriting a note's canonical path) and renames the
  conflict copy into its place. No third branch for "merge" — that choice
  touches no file at all, so the renderer never calls this for it; it just
  opens the original note the same as clicking it in the list would, and
  leaves the conflict copy exactly where it is for the user to reconcile by
  hand, in their own time.
- `vault-io.ts`'s `trashAttachment` — deliberately *not* `trashNote` reused
  for a different file type: `uniquePath`'s collision suffix is hardcoded
  to `.md`, so a colliding `photo.png` would come back `photo (2).md` — an
  image silently turned into a markdown file by its own trash operation.
  Caught before it shipped, not after.
- `orphaned-attachments.ts`'s `attachmentPreview` — a data URL for an
  image attachment, no thumbnail actually generated. Deliberate scope cut:
  real resizing (`sharp`) was only ever anticipated for phase 4's inline
  images, and this screen is opened by hand, occasionally, for however many
  files happen to be orphaned.
- `vault-scan.ts`'s `conflicts(vault, db)` — `findConflictCopies` run
  against the same index every other view reads, refreshed eagerly on
  mount and on every `library:refresh` rather than staying lazy behind a
  fold the way Tags/People do: a banner that only shows up after the user
  goes looking for it defeats the point of a banner.
- `ConflictPair`/`ConflictChoice`/`DiffLine` moved to `shared/vault-types.ts`
  — they cross the IPC boundary, so they cannot live in a `src/main/`-only
  module the way they started out.

UI: `ConflictBanner.tsx` (a slim banner plus its dialog, one conflict shown
at a time even when several exist — resolving one never auto-advances into
the next, since trashing a note either way is too consequential to happen
back to back without the user choosing to look again) and
`OrphanedAttachments.tsx` (a thumbnail grid, loaded once per visit rather
than kept live, since `findOrphanedAttachments` re-parses every note in the
vault). Both reuse the existing `.overlay`/`.settings-buttons` dialog
chrome rather than inventing new chrome. `FolderTree.tsx` gained a fourth
footer entry next to Trash/Settings/Help for the cleanup screen — nothing
about it is urgent the way a sync conflict is, so it stays down there
rather than anywhere more prominent. The banner itself needed its own
layout fix: `.library`'s three-column grid had no row to put a banner in
without breaking it, so `Library.tsx` now renders a `.library-shell` flex
wrapper (banner, then the grid) instead of the grid being the direct child
of the window — a real, if small, restructuring, not just an added
component.

**Xvfb verification found and fixed a real bug this pass**: the orphaned-
attachments preview's `data:` URL was silently blocked by `library.html`'s
CSP (`default-src 'self'` with no `img-src`), which only surfaced as a
console warning, not a thrown error — the preview would have rendered as a
quietly broken image with nothing pointing at why. Fixed by adding
`img-src 'self' data:` to that one window's CSP. Beyond that: a real
conflict pair was created, resolved via `--click-button` clicking "Keep
this one", and confirmed the conflict copy actually landed in `_trash/` and
the original was untouched, banner gone, tree refreshed; a real orphaned
attachment was created, deleted via the same mechanism, and confirmed
trashed on disk with the screen falling back to its empty state. Not
simulated — the actual file operations, through the actual IPC handlers,
on files a real Electron process wrote.

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
