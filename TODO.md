# TODO

Working list. The phase plan lives in `04-bouwplan.md` and the decisions in
`05-besluitenlog.md`; this file is only what is open right now.

Last updated 28 July 2026, at `v0.1.0`.

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

**No "New note" button.** The browser can open, rename, move, reveal and delete
a note but cannot make one; the only way in is the global hotkey. Add it to
`.tree-toolbar` beside "+ New folder" and "Rename folder", or to the note-list
header. It should open the capture window rather than grow a second way to
create a note — the capture path owns note creation and `CaptureWriter` decides
the filename.

**The two windows do not stay in sync on the same note.** Confirmed one way
only:

- capture → browser **works**: every capture write sends `IPC.libraryRefresh`
  (`index.ts`, in the `CaptureWriter` result handler).
- browser → capture **does not**: there is no reverse notification, and the
  capture window has no reload path at all — it listens for `onShow` and
  `onReset` and nothing else.

Two windows open on one note is a *feature* — looking something up while
editing — so this has to be fixed rather than designed away. It is also more
than a refresh annoyance: both windows can currently write the same file, and
the loser's bytes are gone with no conflict copy, which is the failure mode B10
exists to prevent. Options worth weighing: make the reader read-only while the
same note is open in capture; or give the capture window a reload channel and
have the library announce the path it is saving; or have main refuse the second
writer outright. Whichever way, the write conflict is the part that matters and
the refresh is the easy half.

**Double-clicking a note should open it in the capture window.**
`NoteList.tsx` has only an `onClick` that opens the note in the reader. Add a
double-click that opens the same note in the capture window for editing. Needs
the capture window to be able to *load* an existing note, which it currently
cannot — it only ever starts a new one — so this depends on the same
capture-side plumbing as the sync item above and should follow it.

**Tags and People list items are outdented under their own heading.** The
section heading sits at `padding-left: 8px` but its label is pushed right by the
twisty and the glyph before it, so the text starts near 44px. The items below
are at `padding-left: 22px` with no twisty and no glyph, so they start at 22px —
left of the heading they belong to. `FilterSection.tsx`, the two inline
`paddingLeft` styles. They should clear the heading's text column.

**"New folder" is offered while the Trash is selected.** Selecting Trash sets
`lastFolder` to `_trash` like any other folder (`Library.tsx`, `onSelect`), and
"+ New folder" acts on `lastFolder` — so it will happily create a folder inside
the trash. `canRenameFolder` already excludes the trash; the new-folder button
needs the same guard, and so does the right-click "new folder inside this one"
on the trash row.

---

## Verification still owed on v0.1.0

None of these is reachable through the app's `--screenshot` / `--click-button`
flags, so they were not covered before tagging. The release is tested and
typechecked, and was checked by screenshot; these are the gaps.

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

## Housekeeping

- [ ] Delete the merged branch:
      `git branch -d ten-improvements-from-use && git push origin --delete ten-improvements-from-use`
- [ ] The resident app is not running. `npm run pack:mac` replaced the bundle
      under the live process during this work. Relaunch it from
      `release/mac-arm64/emqnote.app` — and note that repacking while it runs
      will do the same again.

## Settled

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
