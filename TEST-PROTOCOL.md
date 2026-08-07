# TEST-PROTOCOL.md

A manual pass over the packaged app, for a human, on both machines.

English like `TODO.md` and `CLAUDE.md`, not Dutch like the five design documents — this is
a working checklist, not part of the design.

## What this is for

The suite covers 564 cases and CI runs it on Linux, Windows and macOS. What it cannot do is
press a key, drag a file from Explorer, watch OneDrive sync a folder between two machines,
or look at a screen and see that an image is actually there. Everything below is in that
gap. Nothing here duplicates a test that already exists — if `npm test` covers it, it is
not in this document.

Four items in particular have **never been seen working** and are the reason this file
exists: §4.2 (does the capture window really draw an attachment), §6.3 (does clicking a
checkbox in the Tasks view actually reach the file), §9.2 (does the caret actually step
across an inline image in the capture window, rather than landing in an invisible node
selection), and §10 (does the capture window's disk-change notice actually appear when the
open note changes outside the app). All four have proven code underneath and an unproven
interaction on top. Start there if you only have ten minutes.

## Before you start

Use a **scratch vault**, not your real notes. Every destructive step below is real.

```bash
# macOS
/Applications/emqnote.app/Contents/MacOS/emqnote --vault=/tmp/emqnote-test

# Windows (PowerShell)
& "$env:LOCALAPPDATA\Programs\emqnote\emqnote.exe" --vault=$env:TEMP\emqnote-test
```

The `--vault` flag points the app at another folder without touching your settings, so the
everyday vault is never at risk. Quit the resident instance from the tray first, or the
second launch just reveals the first one's window.

Put a few things in that folder before launching: two or three notes in `00 Inbox`, a
couple in a nested folder like `10 Projects/Klant X`, at least one note containing
`- [ ] something` and `- [x] something else`, and a real `.png` and `.pdf` somewhere handy
on the desktop for §4.

Record results as **pass / fail / not tested**. "Not tested" is a real answer and more
useful than a guess.

---

## 1. First launch after updating

The index gained a schema version (B26), so the first start after this version rebuilds it.

| # | Step | Expected |
|---|---|---|
| 1.1 | Launch, open the library (tray → *Library*) | A thin progress bar at the top, running once to completion. On a small vault it may be too fast to see — that is fine |
| 1.2 | Open Tags and People in the tree footer | Both populated. If either says the vault is on Files On-Demand, **stop and report it** — that is the `v0.3.3` bug, and it should be gone |
| 1.3 | Type something in the search box | Results appear. Search reads the same index the rebuild just filled |
| 1.4 | Quit from the tray, launch again | **No** progress bar this time, or a very brief one. A rebuild on every launch means the version bump is not sticking |

**Windows only, and the point of this whole section:** 1.2 on a **brand-new empty vault**.
Point `--vault` at a folder that does not exist yet, let the app create it, and open the
library before adding any notes. Tags and People must be empty and *available* — not
"the vault is on Files On-Demand". That message on an empty vault was the `v0.3.3` bug.

---

## 2. Resizable panes

| # | Step | Expected |
|---|---|---|
| 2.1 | Drag the divider between the folder tree and the note list | Both resize live, no jitter, no flicker in the reader |
| 2.2 | Drag either divider as far as it will go, both directions | It stops. The reader never disappears, and neither side pane collapses to nothing |
| 2.3 | Quit from the tray and relaunch | The widths you left are still there |
| 2.4 | Tab to a divider and press ← / → | It moves 16px per press |
| 2.5 | Resize the *window* itself very small, then large again | Layout survives; nothing overlaps or escapes the window |

**macOS:** do 2.1 on a trackpad as well as a mouse — the drag uses pointer capture and a
trackpad reports movement differently.

---

## 3. Delete folder (B27)

Destructive by design. Scratch vault only.

| # | Step | Expected |
|---|---|---|
| 3.1 | Select an **empty** folder, click *Delete folder* | Confirmation appears, without a count |
| 3.2 | Confirm | Folder gone from the tree; selection moves to its parent |
| 3.3 | Select a folder holding notes **and** a subfolder, click *Delete folder* | Confirmation **names both counts** — e.g. "2 notes, 1 folder" |
| 3.4 | Cancel | Nothing happens. Check on disk: the folder is still there, untouched |
| 3.5 | Repeat 3.3 and confirm | Folder gone from the tree. Open Trash — the whole folder is inside it, with its notes and its subfolder intact |
| 3.6 | Open a note from inside the trashed folder | It still opens and reads correctly |
| 3.7 | Select Trash, click *Clear trash*, confirm | Now it is really gone. Check on disk |
| 3.8 | Select the vault root, and separately the Trash folder | *Delete folder* is disabled for both |
| 3.9 | Open a note in the **capture window** (from the library, *Open for editing*), then try to delete the folder that note is in | Refused, with a message. Not silently done, and not done anyway |

**Both platforms**, and 3.5 matters more on Windows: a folder rename across a OneDrive
boundary behaves differently there than on macOS.

---

## 4. Attachments — images and PDFs (B28)

### 4.1 Getting a file in, three ways

| # | Step | Expected |
|---|---|---|
| 4.1a | In the library reader, paste a screenshot (Cmd/Ctrl+V after a screen capture) | Image appears in the note at the caret |
| 4.1b | Drag a `.png` from Finder/Explorer onto the editor | Same |
| 4.1c | Use the attachment button in the toolbar, pick a `.png` | Same |
| 4.1d | After each, look in `<vault>/_attachments/` | One new file per insert, named `YYYY-MM-DD-HHmm-<something>.png` |
| 4.1e | Open the note's `.md` in a text editor | The line reads `![[2026-…-….png]]`. The frontmatter has **no** `attachments:` array — that is deliberate (B28) |
| 4.1f | Paste **plain text** into the editor | Pastes as text, as it always did. Nothing about the image path interferes |

**Screen capture per platform:** macOS `Cmd+Ctrl+Shift+4` copies to the clipboard rather
than saving a file; Windows use `Win+Shift+S`.

### 4.2 Does the capture window draw it? — NEVER VERIFIED

This is the one that has never been seen working. The library window is confirmed; the
capture window has the same node view and a CSP that was changed to allow it, and that is
all anyone knows.

| # | Step | Expected |
|---|---|---|
| 4.2a | Press the global hotkey to open the capture window | Window appears, caret in the subject field |
| 4.2b | Type a line, then paste a screenshot into the body | **The image itself appears, inline.** Not a filename, not a broken-image icon, not an empty box |
| 4.2c | If it does *not* appear: open the devtools console for that window and look for a `Content-Security-Policy` error mentioning `emqnote-attachment:` | If that error is there, the capture window's CSP is the cause — report it with the exact message |
| 4.2d | Ctrl/Cmd+Enter to close and save, then open the note in the library | Same image, same place |

### 4.3 PDFs

| # | Step | Expected |
|---|---|---|
| 4.3a | Drag a `.pdf` onto the editor | A labelled chip with the filename, **not** an inline render |
| 4.3b | Click the chip | The PDF opens in the system viewer (Preview / Edge or Acrobat) |
| 4.3c | Check the `.md` | The line reads `[[2026-…-….pdf]]` — square brackets, no leading `!` |
| 4.3d | Click a `[[Some Note]]` wiki link that names a note rather than an attachment | Nothing happens. That is correct for now — note-to-note navigation does not exist yet |

### 4.4 Cleanup still works

| # | Step | Expected |
|---|---|---|
| 4.4a | Delete the `![[…]]` line from a note, save, then open *Orphaned attachments* in the tree footer | That attachment is listed, with a thumbnail |
| 4.4b | Trash it from that screen | Gone from `_attachments/`, present in `_trash/` |

---

## 5. Sync between the two machines

This is the part no CI can touch, and the reason the app exists in the form it does. Needs
both machines and your **real** OneDrive vault, or a shared test folder inside it.

| # | Step | Expected |
|---|---|---|
| 5.1 | Insert an image on machine A. Wait for OneDrive to sync | On machine B, the note renders the image — the file came across in `_attachments/` |
| 5.2 | Delete a folder on machine A | On machine B it appears under Trash, not as a missing folder |
| 5.3 | Tick a task on machine A | On machine B the checkbox is ticked, in the note and in the Tasks view |
| 5.4 | Edit the *same* note on both machines while one is offline, then reconnect | A conflict banner appears. The diff dialog shows both, and the choice you make is the one that survives |
| 5.5 | After all of the above, look for OneDrive conflict copies in the vault | None from notes you did not edit. B10 is exactly this: opening a note must never touch it |

**Leave 5.5 running for a few days of normal use** before trusting it. Conflict copies show
up under sync pressure, not on a quiet afternoon.

---

## 6. Tasks view (B26)

### 6.1 What it shows

| # | Step | Expected |
|---|---|---|
| 6.1a | Click *Tasks* at the bottom of the folder tree | A list of task items, each naming the note it came from |
| 6.1b | With *Open only* ticked | Only unchecked items. A `- [x]` item is absent |
| 6.1c | Untick *Open only* | Checked items appear too |
| 6.1d | Change the folder dropdown to a folder that has a subfolder | Tasks from the subfolder are included. Scope means the subtree, not one level |
| 6.1e | Click a task's text | The note opens in the reader beside it, still on the Tasks view |

### 6.2 Nested and awkward cases

| # | Step | Expected |
|---|---|---|
| 6.2a | A note with a task nested two levels deep under bullets | It appears, once |
| 6.2b | A numbered list — `1. Something` | Does **not** appear. Numbered tasks are not in the dialect |
| 6.2c | A plain bullet with no checkbox | Does not appear |
| 6.2d | A note in `_trash` with open tasks | Does **not** appear. Deleted work is not open work |

### 6.3 Ticking from the view — NEVER VERIFIED

The write path was driven directly against real files and is correct. The click that calls
it is the unproven part.

| # | Step | Expected |
|---|---|---|
| 6.3a | Click the checkbox next to a task in the Tasks list | It ticks |
| 6.3b | Open that note's `.md` in a text editor | That one line is now `- [x]`. **Every other line in the file is byte-for-byte unchanged** — this is the part worth actually checking, not skimming |
| 6.3c | Open the note in the reader | The checkbox is ticked there too |
| 6.3d | Untick it from the Tasks view, check the file again | Back to `- [ ]`, nothing else moved |
| 6.3e | Edit that task's text in the reader, then tick the *stale* row still on screen in the Tasks view | Refused, or it corrects itself. It must **not** flip a different line |
| 6.3f | Open a note in the capture window, then tick one of its tasks from the Tasks view | Refused. The capture window owns that file |

---

## 6A. The fixes of 6 August 2026

The file-level halves of these are covered by tests, and new-note filing and the move
behaviour were driven in the real app over CDP. What is left here is what only a person
with a mouse and a second application can judge.

### 6A.1 An empty checkbox survives

The bug: a box you had not typed into yet came back from disk as a plain bullet.

| # | Step | Expected |
|---|---|---|
| 6A.1a | In the capture window, make a task, type into it, press Enter, and type nothing into the new one. Ctrl+Enter to commit | The empty box is still a box, not a bullet |
| 6A.1b | Open that `.md` in a text editor | The line reads `- [ ]` exactly — **no trailing space** |
| 6A.1c | Open the note in the reader | Still an empty checkbox |
| 6A.1d | Open the same note in Obsidian | Still an empty checkbox there too |
| 6A.1e | Type a bullet whose entire text is `[ ]` — paste it in, rather than typing it, so no input rule fires | It stays text. The file says `- \[ ]`, and it is still text after a reload |

### 6A.2 One list stays one list

| # | Step | Expected |
|---|---|---|
| 6A.2a | In a task list of three, put the caret at the end of the first, press Enter, then Backspace | Back to three items, one list. No gap, and the caret is at the end of the first item |
| 6A.2b | Save and look at the file | Every bullet is still `-`. A `*` anywhere means the list split |
| 6A.2c | Same at the end of the list rather than the middle: Enter, then Backspace | Also back to what you had |
| 6A.2d | Same again but press Enter twice to leave the list first, then Backspace | The list is whole again |

### 6A.3 A new note goes where you are standing (B29)

| # | Step | Expected |
|---|---|---|
| 6A.3a | Click **Vault** at the top of the tree, then *+ New note*, type a subject and commit | The file is in the vault root, not the Inbox |
| 6A.3b | Select a folder several levels deep, *+ New note*, commit | The file is in that folder |
| 6A.3c | Press the global hotkey instead, commit | Inbox, as always. The hotkey does not know where you were standing and must not guess |
| 6A.3d | Select **Trash**, look at the note list | *Clear trash* where *+ New note* would be — there is no way to create a note there |

### 6A.4 Moving a note leaves the tree alone (B29)

| # | Step | Expected |
|---|---|---|
| 6A.4a | From the Inbox, open a note, *Move* it to another folder | The tree still shows the Inbox selected; the note is gone from the list; the reader still shows it, with its new path underneath the title |
| 6A.4b | Move three notes out of the Inbox in a row | No clicking back to the Inbox between them. This is the whole point of the change |
| 6A.4c | Drag a note onto a folder instead | Same thing. The two gestures are one code path |

### 6A.5 Drag feedback

| # | Step | Expected |
|---|---|---|
| 6A.5a | Start dragging a note out of the list | The row you picked up fades to about half. What follows the pointer stays solid |
| 6A.5b | Hold it over a folder | The folder is outlined *and* washed with the accent colour — visible without hunting for it |
| 6A.5c | Hold it over the folder that is already selected | Both still readable; the two highlights do not cancel each other out |
| 6A.5d | Hold it over Trash, and over the folder it is already in | Neither lights up. Drop anyway: nothing happens |
| 6A.5e | Drop it, or press Escape mid-drag | The row goes back to full opacity either way |

### 6A.6 Copying a list

Needs a second application, which is why it is here rather than in a test.

| # | Step | Expected |
|---|---|---|
| 6A.6a | Select a bulleted list, copy, paste into a **plain-text** field (Slack, a terminal, Notepad, the search bar) | The bullets came along: `- One`, `- Two` |
| 6A.6b | Same with a numbered list | `1.`, `2.`, counting from the list's own start |
| 6A.6c | Same with a task list | `- [ ]` and `- [x]` |
| 6A.6d | Same with a list nested two or three deep | Indented by the width of the marker above it, so the levels line up |
| 6A.6e | Paste the same clipboard into **Outlook or Word** | A real list, formatted — the HTML flavour, unchanged by this fix |
| 6A.6f | Copy an ordinary paragraph containing `[1]` or `#tag` | No backslashes appear. This is plain text, not markdown |

---

## 7. The things that break quietly

Small, easily missed, each one a bug that actually happened.

| # | Step | Expected |
|---|---|---|
| 7.1 | **macOS:** click the red traffic light on the capture window. Then press the hotkey | The window comes back. If the hotkey is dead, the window was destroyed instead of hidden — a regression of the 3 August fix |
| 7.2 | **macOS:** press Cmd+Q in the library | The window closes; the app keeps running; the hotkey still works (B25) |
| 7.3 | **Windows:** indent inside a list with Ctrl+M | It indents. It must not minimise the window |
| 7.4 | Open the keyboard-shortcut sheet | Says Cmd on macOS and Ctrl on Windows — **on the first paint**, not after a flicker |
| 7.5 | Open a note, change nothing, click away | The file's modified timestamp on disk is unchanged (B10) |
| 7.6 | Create a note titled `CON` or `PRN`, with `: * ?` in the title | Windows: a sane filename, no crash. Check both machines can open it |
| 7.7 | Type a `#tag` at the start of a line, save, reopen | Still `#tag`, not `\#tag` (B19) |

---

## 8. Latency, if you are measuring

Only on the packaged app, and record the machine **and the refresh rate** — a number
without both means nothing, and one row of the table in `CLAUDE.md` is permanently
unreproducible because they were not written down.

```bash
# Windows
emqnote.exe --selftest=50 --vault=%TEMP%\emqnote-proef

# macOS
/Applications/emqnote.app/Contents/MacOS/emqnote --selftest=50 --vault=/tmp/emqnote-proef
```

Budget: hotkey → caret under 80 ms. Results land in `selftest-result.json` and
`latency.log` in the app-data folder. Add the figure to `CLAUDE.md` with machine, display
and refresh rate beside it.

Worth doing on **Windows** especially: the table there is still three loose measurements,
which is not enough, and it is the tighter platform.

---

## 9. Two editor fixes: scroll room and caret beside an image (6 August 2026)

Both came out of the same commit and the same complaint: the editor felt cramped at the
bottom of a long note, and arrowing past an inline image did something invisible instead of
moving the caret.

### 9.1 Scroll room past the last line

`.editor-content` now carries 25vh of blank padding below the last line, so a long note can
scroll its last line away from the bottom edge instead of sitting jammed against it.
ProseMirror's own contenteditable region still ends where the content ends — the padding is
not part of it — which is the part worth actually checking, not just the extra space.

| # | Step | Expected |
|---|---|---|
| 9.1a | Open or type a note long enough to fill the window and scroll | With the caret on the last line, there is comfortable room to scroll it up away from the bottom edge, rather than the last line sitting flush against it |
| 9.1b | Scroll all the way down, then click in the blank space below the last line | The caret does **not** land there — clicking below the content moves it to the end of the last line instead, the way clicking past the end of a text file always has. The blank space is not typeable |
| 9.1c | Do 9.1a in the **capture window** | Same feel |
| 9.1d | Do 9.1a in the **library reader** | Same feel |
| 9.1e | Resize the window shorter, then taller again, while scrolled to the bottom | The padding does not fight the resize — no jump, no runaway scroll position |

This is a "does this feel right" question, not a pass/fail one — there is no CDP selector
for "comfortable." Judge it the way you would judge any editor's bottom margin.

### 9.2 Caret beside an image in the capture window — NEVER VERIFIED

This is the twin of §4.2's problem, one level further in: nobody has ever gotten an image
to draw in the capture window under Xvfb, so `moveOverAtom` (`commands.ts`) — which is
supposed to steer the arrow keys across a `wikiEmbed`/`wikiLink` atom instead of leaving an
invisible `NodeSelection` — has never been exercised there against a real render either.
`test/image-caret.test.ts` covers it against a synthetic ProseMirror document, and that is
all anyone knows about whether it actually works on screen.

| # | Step | Expected |
|---|---|---|
| 9.2a | In the capture window, get an image inline (paste a screenshot, or insert one with the attachment button) — this is §4.2's own check, and it has to pass first | The image itself appears inline, not a filename and not a broken-image icon |
| 9.2b | Put the caret in the text immediately before the image, press the arrow key that would step onto it | The blinking text caret lands on the far side of the image. **Not** a silent, invisible selection — nothing should look like the arrow key did nothing |
| 9.2c | Click directly on the image | It shows a visible outline (the `.ProseMirror-selectednode` styling this fix added). Before this fix a click here selected the node with nothing on screen saying so |
| 9.2d | With the image selected that way (from 9.2c), press an arrow key | The text caret appears beside the image, on the side the arrow pointed — the same destination as 9.2b, reached from a node selection instead of a text one |
| 9.2e | Shift+arrow across the image instead | A visible extended selection that includes the image, not a jump or a no-op |
| 9.2f | Repeat 9.2b–9.2e in the **library reader**, where an image is already known to draw (§4.1) | Same behaviour. This isolates whether a capture-window failure is about drawing the image at all (§4.2) or about the caret logic specifically — the reader gives a known-good baseline for the same `commands.ts` code |

If 9.2a itself fails — no image ever appears — that is §4.2's bug, not this one, and it
blocks the rest of this section the same way it blocks §4.2's own remaining steps.

---

## 10. Disk-change notice in the capture window — NEVER VERIFIED

The library window's own disk-change bar (a note that changed or disappeared on disk from
outside the app) is covered end to end by `test/library-disk-change.test.ts`, a real
`Library` mounted in jsdom. The capture window's equivalent has no such harness — this
suite has never had one for the capture renderer — so `Capture.tsx`'s `onVaultFileChanged`
subscription, its `dirtyRef` and the reload round trip through `IPC.captureReload` are
proven only against the wiring, never against a real chokidar event landing on a real open
capture window.

| # | Step | Expected |
|---|---|---|
| 10a | Open a note in the capture window (*Open for editing* from the library), leave it untouched, then edit that same file directly in a text editor and save | The capture window quietly reloads the new content — no dialog, no notice. Nothing here was at risk, so nothing needs asking |
| 10b | Repeat 10a, but first type something into the capture window and leave it un-flushed (well inside the 800ms debounce) | A one-line notice appears in the status bar, **with no buttons** — and what you just typed is not discarded or overwritten |
| 10c | With a note open in the capture window, delete that exact file — directly on disk, or in the library reader on the *other* machine | A one-line "deleted outside emqnote" notice appears, again with no buttons. The window does **not** close itself |
| 10d | After 10c, keep typing, then Ctrl/Cmd+Enter to commit | The file reappears at the same path with what you typed. The capture window keeps writing to the path it already had open — the deliberate choice for this window, unlike the library reader, which asks before recreating a deleted note |

---

## Reporting

For anything that fails, capture: the platform and OS version, the app version — the top
line of the tray menu, `emqnote x.y.z`, which is the only place it is shown — what you did,
what happened, and what you expected. For a rendering
problem, a screenshot. For anything involving files, the actual bytes — `cat` the `.md`,
do not describe it.

If something in §4.2, §6.3, §9.2 or §10 fails, that is expected-ish rather than alarming:
those four are why this document exists.
