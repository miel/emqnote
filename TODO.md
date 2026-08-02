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
| 4 — **pasting and images** | **Not started. Still the next work, and the largest unknown in the project** — the `mso-list` reconstruction described in `02-technisch-ontwerp.md` §6.3. |
| 5 — index and search | Not started. `vault-scan.ts` is an in-memory stand-in shaped like the `notes` table SQLite will build, so the Map is replaced and not the interface. |
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

## Verification still owed

None of these is reachable through the app's `--screenshot` / `--click-button`
flags, so they weren't covered before `v0.1.0` was tagged, and nothing since
has closed them — this environment still cannot launch Electron (Node 18 vs.
the `electron@43` requirement), so they carry forward unverified. `npm test`,
`npm run typecheck` and `npm run build` all still pass (325 tests now, up from
322, across two commits of new test coverage).

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
