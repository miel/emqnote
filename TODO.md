# TODO

Working list. The phase plan lives in `04-bouwplan.md` and the decisions in
`05-besluitenlog.md`; this file is only what is open right now.

Last updated 30 July 2026, at `v0.1.0`.

## Where the project stands

| Phase | State |
|---|---|
| 0 — markdown round trip | Done. 27 corpus files, byte-identical both ways. |
| 1 — resident shell | Done. Hotkey → caret measured inside budget. |
| 2 — the editor | Done. |
| 3 — the library window | Done. Shipped before phase 4; the two were swapped in practice. |
| 4 — **pasting and images** | **Not started. The next work, and the largest unknown in the project** — the `mso-list` reconstruction described in `02-technisch-ontwerp.md` §6.3. |
| 5 — index and search | Not started. `vault-scan.ts` is an in-memory stand-in shaped like the `notes` table SQLite will build, so the Map is replaced and not the interface. |
| 6 — email import | Not started. Power Automate availability is still an open point. |

Ten improvements from six weeks of use landed after phase 3, before the paste
work, and are in `v0.1.0`. Two of them are recorded decisions: **B20** (location
and people belong to every note; `type: meeting` survives as a label) and **B21**
(changing vault restarts the app).

---

## Must have

### Capture window

*Both dropdown items are done — the completion was removed rather than repaired.
See "Settled" at the foot of this file.*

### Note browser

*All five items below are done — see "Settled" at the foot of this file for
what changed and how. None of it has been seen running in a real window yet;
that gap is called out under "Verification still owed" below.*

---

## Verification still owed on v0.1.0

None of these is reachable through the app's `--screenshot` / `--click-button`
flags, so they were not covered before tagging. The release is tested and
typechecked, and was checked by screenshot; these are the gaps. Still open as
of 30 July 2026 — the machine this round of work was done on has no display
and, it turns out, cannot even launch Electron (the installed Node is older
than `electron@43` requires, and its own postinstall download script fails
before a window could ever open), so none of the items below could be looked
at, old or new. `npm test`, `npm run typecheck` and `npm run build` all pass.

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
- [ ] The "+ New note" button in the note-list header, and double-click on a row,
      against the real window layout — both were built and typechecked but never
      rendered.
- [ ] Whatever the "+ New note" button's placement looks like next to the sort
      buttons; `justify-content: space-between` was inherited from a two-child
      header and may put more air between them than intended.

## Housekeeping

- [ ] Delete the merged branch:
      `git branch -d ten-improvements-from-use && git push origin --delete ten-improvements-from-use`
- [ ] The resident app is not running. `npm run pack:mac` replaced the bundle
      under the live process during this work. Relaunch it from
      `release/mac-arm64/emqnote.app` — and note that repacking while it runs
      will do the same again.

## Settled

**The two windows now share one write claim per note.** `OpenedNote` gained an
`editable` field. `index.ts` computes it in the `library:open-note` handler by
asking `CaptureWriter.activePath()` — a new getter — whether capture currently
has that exact path loaded; the library reader renders read-only (a
`pointer-events: none` wrapper, `.reader-locked`) whenever it comes back false,
and `save()`/`onDocChange`/`onHeaderChange` all refuse to write regardless, as
a second line of defence. The reverse direction — capture loading a note the
library already has open — goes through a new `capture:load` / `capture:load-note`
IPC pair: `CaptureWriter.load()` flushes whatever capture was composing (same
ordering `finish()` uses, for the same reason) and starts a session pointed at
the existing file. Saving that session routes through `vault-io.ts`'s own
`saveNote` rather than the Inbox-only `buildFrontmatter` path, so unrelated
frontmatter (a `source:` other than `manual`, for instance) survives an edit
made from capture the same way it does from the reader, and the title stays
pinned to what was loaded — the header hides the subject field for a loaded
note (`variant="reader"`) for the same B20 reason the library reader has none.
Opening a note that turns out to be claimed still costs a file read but never a
write, so B10 holds in both directions. Covered by new tests in
`capture-store.test.ts` and `capture-writer.test.ts`; not yet seen on screen,
see "Verification still owed" above.

**Double-clicking a note opens it in the capture window.** `NoteList.tsx` adds
an `onDoubleClick` that calls into a new `Library.tsx` `openInCapture`, which —
if this same note happens to be the one already open in the reader — locks the
reader itself immediately, before the round trip to main, rather than waiting
for the `editable` recheck that `library:refresh` triggers elsewhere. Main's
`capture:load` handler does the rest: load the note into capture, focus the
window, tell the library to refresh.

**A "+ New note" button lives in the note-list header**, beside the sort
buttons. It calls a new `library.newNote()` → `capture:new` IPC that shows the
capture window exactly like the hotkey, deliberately not through
`showCaptureWindow()`: that function also starts a hotkey-to-caret latency
measurement, and folding a mouse click into the same rolling sample window
`stats()` reports would quietly contaminate the number `CLAUDE.md` treats as an
acceptance criterion. A new `focusCaptureWindow()` in `capture-window.ts` does
the same show-and-focus dance with a token that was never registered, so
`completeMeasurement` finds nothing pending and records nothing. The same
function backs the double-click handoff above.

**Tags and People list items outdent to 44px**, matching where the section
heading's own label starts once its twisty and glyph are accounted for — was
22px, left of the heading. `FilterSection.tsx`, one inline style.

**"New folder" is disabled while the Trash is selected.** A new
`canCreateFolder` prop on `FolderTree`, following the same
`!lastFolder.startsWith(TRASH_FOLDER)` guard `canRenameFolder` already used.
The right-click "new folder inside this one" gesture on the Trash row itself
turned out to be guarded already (an `onCreateFolder={() => {}}` override on
that one `Branch`) — nothing to do there.

**No completion on the tag and people fields.** Both dropdown items are closed by
removing the `<datalist>` from those two fields rather than fixing it. The reason
one of them existed at all was the reason to drop it: the list came from
`remembered.ts`, which knew only what had been typed on *this machine*, so it was
thin and personal where the vault holds the real list. Serving the vault's list
instead meant either a scan on the capture path — which `CLAUDE.md` forbids — or
writing a real combobox, which is new UI on the one window with a 16 ms keystroke
budget, to complete fields holding a word or two. And the second-click behaviour
was never ours to fix: a native datalist not closing is Chromium's.

Nothing was lost. Those lists were a cache of something derivable, never a
source; the vault-wide lists still exist where they are actually used, in the
library's Tags and People filters via `facets()`.

The whole chain went with them, since the datalists were its only readers: the
`attendees:list` and `tags:list` IPC channels, their preload methods and main
handlers, the `knownAttendees`/`knownTags` props threaded through both windows,
and the two accumulators in `remembered.ts` that were written on every save.
`remembered.ts` itself stays — its `store()` factory backs `vaults.json`.
`attendees.json` and `known-tags.json` are now orphaned in the app data folder;
harmless, and nothing reads them.

## Unexplained, worth settling

**The hotkey → caret figure halved and nobody knows why.** `CLAUDE.md` records
p50 60 ms for the Mac mini M4 on the 2490W1 at 1920×1080 @ 60 Hz at phase 3.
The same machine and the same display now measure p50 27–31 ms, p95 36–45 ms,
zero missed, over three consecutive packaged runs of fifty — below the ~44 ms
floor that document claims for a 60 Hz panel. Nothing in the ten improvements
touches that path: the hotkey does `show()` and focus on a window that is
already rendered. Re-measure the phase-3 build on the same display and settle
which condition differed, rather than letting the new number stand as a win it
probably is not.
