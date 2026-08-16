# TEST-PROTOCOL.md

A manual pass over the packaged app, for a human, on both machines.

English like `TODO.md` and `CLAUDE.md`, not Dutch like the five design documents — this is
a working checklist, not part of the design.

## What this is for

The suite covers 799 cases and CI runs it on Linux, Windows and macOS. What it cannot do is
press a key, drag a file from Explorer, watch OneDrive sync a folder between two machines,
or look at a screen and see that an image is actually there. Everything below is in that
gap. Nothing here duplicates a test that already exists — if `npm test` covers it, it is
not in this document.

Five items in particular have **never been seen working** and are the reason this file
exists: §4.2 (does the capture window really draw an attachment), §4.5 (does a PDF/Office
attachment really get an OS-drawn thumbnail), §6.3 (does clicking a checkbox in the Tasks
view actually reach the file), §9.2 (does the caret actually step across an inline image in
the capture window, rather than landing in an invisible node selection), and §10 (does the
capture window's disk-change notice actually appear when the open note changes outside the
app). All five have proven code underneath and an unproven interaction on top. Start there
if you only have ten minutes.

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

| # | Step | Expected | Feedback |
|---|---|---|---|
| 1.1 | Launch, open the library (tray → *Library*) | A thin progress bar at the top, running once to completion. On a small vault it may be too fast to see — that is fine | OK |
| 1.2 | Open Tags and People in the tree footer | Both populated. If either says the vault is on Files On-Demand, **stop and report it** — that is the `v0.3.3` bug, and it should be gone | OK |
| 1.3 | Type something in the search box | Results appear. Search reads the same index the rebuild just filled | OK |
| 1.4 | Quit from the tray, launch again | **No** progress bar this time, or a very brief one. A rebuild on every launch means the version bump is not sticking | OK |

**Windows only, and the point of this whole section:** 1.2 on a **brand-new empty vault**.
Point `--vault` at a folder that does not exist yet, let the app create it, and open the
library before adding any notes. Tags and People must be empty and *available* — not
"the vault is on Files On-Demand". That message on an empty vault was the `v0.3.3` bug. -> OPEN

---

## 2. Resizable panes

| # | Step | Expected | Feedback |
|---|---|---|---|
| 2.1 | Drag the divider between the folder tree and the note list | Both resize live, no jitter, no flicker in the reader | Live resize:yes, no jitter:ok, no flicker:ok, but: in the folder tree, the indent is slightly dependent on the length of the folder name; if the folder name in longer than the panel width, the indent for that folder changes; should be fixed indent |
| 2.2 | Drag either divider as far as it will go, both directions | It stops. The reader never disappears, and neither side pane collapses to nothing | OK |
| 2.3 | Quit from the tray and relaunch | The widths you left are still there | OK |
| 2.4 | Tab to a divider and press ← / → | It moves 16px per press | Cannot tab to a divider |
| 2.5 | Resize the *window* itself very small, then large again | Layout survives; nothing overlaps or escapes the window | OK |

**macOS:** do 2.1 on a trackpad as well as a mouse — the drag uses pointer capture and a
trackpad reports movement differently. -> OPEN

---

## 3. Delete folder (B27)

Destructive by design. Scratch vault only.

| # | Step | Expected | Feedback |
|---|---|---|---|
| 3.1 | Select an **empty** folder, click *Delete* | Confirmation appears, without a count | Without count:OK, but it still says 'with everything in it' even though the folder is empty |
| 3.2 | Confirm | Folder gone from the tree; selection moves to its parent | OK |
| 3.3 | Select a folder holding notes **and** a subfolder, click *Delete* | Confirmation **names both counts** — e.g. "2 notes, 1 folder" | OK |
| 3.4 | Cancel | Nothing happens. Check on disk: the folder is still there, untouched | OK |
| 3.5 | Repeat 3.3 and confirm | Folder gone from the tree. Open Trash — the whole folder is inside it, with its notes and its subfolder intact | OK on Macos, on Windows a folder with a subfolder inside cannot be deleted: "The folder could not be deleted" (a folder with a file in it can be deleted) |
| 3.6 | Open a note from inside the trashed folder | It still opens and reads correctly | OK |
| 3.7 | Select Trash, click *Clear trash*, confirm | Now it is really gone. Check on disk | OK |
| 3.8 | Select the vault root, and separately the Trash folder | *Delete* is disabled for both | OK |
| 3.9 | Open a note in the **capture window** (from the library, *Open for editing*), then try to delete the folder that note is in | Refused, with a message. Not silently done, and not done anyway | OK |

**Both platforms**, and 3.5 matters more on Windows: a folder rename across a OneDrive
boundary behaves differently there than on macOS. -> See note at 3.5

---

## 4. Attachments — images and PDFs (B28)

### 4.1 Getting a file in, three ways

| # | Step | Expected | Feedback |
|---|---|---|---|
| 4.1a | In the library reader, paste a screenshot (Cmd/Ctrl+V after a screen capture) | Image appears in the note at the caret | OK |
| 4.1b | Drag a `.png` from Finder/Explorer onto the editor | Same | OK |
| 4.1c | Use the image toolbar button (🖼, `Mod-Shift-I`), pick a `.png` | Same | OK. One note: I have a very high image. When I add it, it does not fill the full width even though the image width is there. Is there a maximum on the image height? |
| 4.1d | After each, look in `<vault>/_attachments/` | One new file per insert, named `YYYY-MM-DD-HHmm-<something>.png` | OK |
| 4.1e | Open the note's `.md` in a text editor | The line reads `![[2026-…-….png]]`. The frontmatter has **no** `attachments:` array — that is deliberate (B28) | OK |
| 4.1f | Paste **plain text** into the editor | Pastes as text, as it always did. Nothing about the image path interferes | OK |

**Screen capture per platform:** macOS `Cmd+Ctrl+Shift+4` copies to the clipboard rather
than saving a file; Windows use `Win+Shift+S`. -> Both work

### 4.2 Does the capture window draw it? — NEVER VERIFIED

This is the one that has never been seen working. The library window is confirmed; the
capture window has the same node view and a CSP that was changed to allow it, and that is
all anyone knows.

| # | Step | Expected | Feedback |
|---|---|---|---|
| 4.2a | Press the global hotkey to open the capture window | Window appears, caret in the subject field | OK |
| 4.2b | Type a line, then paste a screenshot into the body | **The image itself appears, inline.** Not a filename, not a broken-image icon, not an empty box | OK |
| 4.2c | If it does *not* appear: open the devtools console for that window and look for a `Content-Security-Policy` error mentioning `emqnote-attachment:` | If that error is there, the capture window's CSP is the cause — report it with the exact message | n/a |
| 4.2d | Ctrl/Cmd+Enter to close and save, then open the note in the library | Same image, same place | OK |

### 4.3 PDFs

| # | Step | Expected | Feedback |
|---|---|---|---|
| 4.3a | Drag a `.pdf` onto the editor | A labelled chip with the filename, **not** an inline render | N/A; embedded / inline PDF is preferred and implemented; that works |
| 4.3b | Click the chip | The PDF opens in the system viewer (Preview / Edge or Acrobat) |  |
| 4.3c | Check the `.md` | The line reads `[[2026-…-….pdf]]` — square brackets, no leading `!` |  |
| 4.3d | Click a `[[Some Note]]` wiki link that names a note rather than an attachment | Nothing happens. That is correct for now — note-to-note navigation does not exist yet |  |

-> Section 4.3 is no longer relevant, given adjusted functionality

### 4.4 Cleanup still works

| # | Step | Expected | Feedback |
|---|---|---|---|
| 4.4a | Delete the `![[…]]` line from a note, save, then open *Orphaned attachments* in the tree footer | That attachment is listed, with a thumbnail | OK |
| 4.4b | Trash it from that screen | Gone from `_attachments/`, present in `_trash/` | OK |

### 4.5 PDF first-page thumbnail (B36, replacing B30's mechanism)

**Read this heading's history before running the steps.** Until 7 August 2026 the
thumbnail came from the OS's own provider (Quick Look on macOS, `IThumbnailProvider` on
Windows), which had never once been seen producing anything on the user's hardware. B36
replaced that with pdf.js rendering in a hidden window — the same Chromium the packaged
app already ships, so **this has now been watched working under `Xvfb` on Linux**, which
was impossible before. What remains unproven on macOS and Windows is only whether that
same rendering behaves identically there; it is no longer a question about the OS having a
provider at all.

Two consequences to check for rather than report as bugs: **`.docx`, `.xlsx` and `.pptx` no
longer get an inline preview** (they stay attachable and open normally — see 4.5b), and a
PDF that genuinely cannot be rendered now shows a chip with a **⚠ marker and a reason in
its tooltip**, where before it was indistinguishable from a file with nothing to preview.

The report of "PDF preview is not showing" on a packaged macOS build against a business
OneDrive was chased twice. The first attempt, on 7 August 2026, removed a `darwin`-only
guard in `ensureThumbnail` that treated a file reporting `blocks === 0` as an
un-hydrated OneDrive placeholder and skipped it, permanently for the session, before the
provider was ever asked — a *suspected* cause, never actually observed, and it should stay
labelled that way. The real one turned up with B36 and had nothing to do with either the
provider or OneDrive: `emqnote-thumb` is a `standard:` scheme, so Chromium normalises its
URLs and appends a trailing slash, and the handler was asking whether `offerte.pdf/` was
previewable. Both fixes are in; the second is the one that made a thumbnail appear.

Step 4.5h still isolates the rendering from everything else in the UI, and is still the
right first move on real hardware — it now reports a pdf.js failure with its own error
rather than an OS provider's silence, and it deliberately bypasses `failedThisSession`, so
a retried probe gives a fresh answer instead of repeating this session's stale one.

| # | Step | Expected | Feedback |
|---|---|---|---|
| 4.5a | Insert a `.pdf` (drag, paste, or the file toolbar button — 📎, `Mod-Shift-A`) into a note in the library reader | A small thumbnail of the PDF's first page appears beside the filename chip, not just the label |  |
| 4.5b | Insert a `.docx`, `.xlsx` or `.pptx` the same way | A plain filename chip, **no thumbnail** — that is B36's deliberate narrowing, not a regression. Clicking it must still open the file in the system viewer |  |
| 4.5c | Insert a `.txt` or any other non-previewable file | Plain filename chip only, exactly as before B30 — no broken-image icon, no empty gap where a thumbnail would go |  |
| 4.5c2 | Insert a deliberately corrupt or password-protected PDF (truncate one with a text editor, or use one you cannot open) | A chip with a **⚠** in front of it, and a tooltip naming the reason on hover. It must look different from 4.5c's plain chip — telling those two apart is the whole point of B36's 422 |  |
| 4.5d | Reopen the note (close and open it again, or switch away and back) | The thumbnail is still there, without a visible reload flicker — it is being served from the on-disk cache (`<userData>/thumbnails`), not regenerated |  |
| 4.5e | Click directly on the thumbnail image, not just the filename text | Same as clicking the chip always did: the file opens in the system viewer |  |
| 4.5f | If no thumbnail ever appears: open devtools for that window and check the Network tab (or console) for the `emqnote-thumb://` request | A 404 there on a platform that should have a provider is the bug to report, with the OS version. On Windows specifically, check whether Explorer itself shows a thumbnail for that same PDF — if Explorer also cannot, no provider is registered on that machine and this is expected, not a bug |  |
| 4.5g | Do 4.5a in the **capture window** | Same as §4.2 — this depends on §4.2's own inline-attachment rendering working first |  |
| 4.5h | Leave the app running (the probe bypasses the single-instance lock) and run `emqnote --thumbnail-probe="<exact _attachments/ filename>"` (add `--vault=<path>` if it is not the configured one) against the actual PDF from the original report | Prints which outcome fired — not previewable / not resolved / the render failed, with pdf.js's own error / written to `<path>` — and exits with a status code. A `0` naming a path means the first page really was drawn on this machine; open that PNG and look at it. A render failure now comes with a reason worth quoting in a report, which is the thing the OS-provider version could never give |  |

---

## 5. Sync between the two machines

This is the part no CI can touch, and the reason the app exists in the form it does. Needs
both machines and your **real** OneDrive vault, or a shared test folder inside it.

| # | Step | Expected | Feedback |
|---|---|---|---|
| 5.1 | Insert an image on machine A. Wait for OneDrive to sync | On machine B, the note renders the image — the file came across in `_attachments/` | OK |
| 5.2 | Delete a folder on machine A | On machine B it appears under Trash, not as a missing folder | OK |
| 5.3 | Tick a task on machine A | On machine B the checkbox is ticked, in the note and in the Tasks view | OK |
| 5.4 | Edit the *same* note on both machines while one is offline, then reconnect | A conflict banner appears. The diff dialog shows both, and the choice you make is the one that survives | After reload, I have a copy of the note (with -iMac2020 appended); in the new note modal, there only a mention that the note has changed outside emqnote and any edits in that model are lost |
| 5.5 | After all of the above, look for OneDrive conflict copies in the vault | None from notes you did not edit. B10 is exactly this: opening a note must never touch it | only opening a note does not generate conflicted copy. But editing does. Not sure if this is Onedrive behavior or emqnote after conflict resolution. See previous point |

**Leave 5.5 running for a few days of normal use** before trusting it. Conflict copies show
up under sync pressure, not on a quiet afternoon. -> OPEN

---

## 6. Tasks view (B26)

### 6.1 What it shows

| # | Step | Expected | Feedback |
|---|---|---|---|
| 6.1a | Click *Tasks* at the bottom of the folder tree | A list of task items, each naming the note it came from |  |
| 6.1b | With *Open only* ticked | Only unchecked items. A `- [x]` item is absent |  |
| 6.1c | Untick *Open only* | Checked items appear too |  |
| 6.1d | Change the folder dropdown to a folder that has a subfolder | Tasks from the subfolder are included. Scope means the subtree, not one level |  |
| 6.1e | Click a task's text | The note opens in the reader beside it, still on the Tasks view |  |

### 6.2 Nested and awkward cases

| # | Step | Expected | Feedback |
|---|---|---|---|
| 6.2a | A note with a task nested two levels deep under bullets | It appears, once |  |
| 6.2b | A numbered list — `1. Something` | Does **not** appear. Numbered tasks are not in the dialect |  |
| 6.2c | A plain bullet with no checkbox | Does not appear |  |
| 6.2d | A note in `_trash` with open tasks | Does **not** appear. Deleted work is not open work |  |

### 6.3 Ticking from the view — NEVER VERIFIED

The write path was driven directly against real files and is correct. The click that calls
it is the unproven part.

| # | Step | Expected | Feedback |
|---|---|---|---|
| 6.3a | Click the checkbox next to a task in the Tasks list | It ticks |  |
| 6.3b | Open that note's `.md` in a text editor | That one line is now `- [x]`. **Every other line in the file is byte-for-byte unchanged** — this is the part worth actually checking, not skimming |  |
| 6.3c | Open the note in the reader | The checkbox is ticked there too |  |
| 6.3d | Untick it from the Tasks view, check the file again | Back to `- [ ]`, nothing else moved |  |
| 6.3e | Edit that task's text in the reader, then tick the *stale* row still on screen in the Tasks view | Refused, or it corrects itself. It must **not** flip a different line |  |
| 6.3f | Open a note in the capture window, then tick one of its tasks from the Tasks view | Refused. The capture window owns that file |  |

---

## 6A. The fixes of 6 August 2026

The file-level halves of these are covered by tests, and new-note filing and the move
behaviour were driven in the real app over CDP. What is left here is what only a person
with a mouse and a second application can judge.

### 6A.1 An empty checkbox survives

The bug: a box you had not typed into yet came back from disk as a plain bullet.

| # | Step | Expected | Feedback |
|---|---|---|---|
| 6A.1a | In the capture window, make a task, type into it, press Enter, and type nothing into the new one. Ctrl+Enter to commit | The empty box is still a box, not a bullet |  |
| 6A.1b | Open that `.md` in a text editor | The line reads `- [ ]` exactly — **no trailing space** |  |
| 6A.1c | Open the note in the reader | Still an empty checkbox |  |
| 6A.1d | Open the same note in Obsidian | Still an empty checkbox there too |  |
| 6A.1e | Type a bullet whose entire text is `[ ]` — paste it in, rather than typing it, so no input rule fires | It stays text. The file says `- \[ ]`, and it is still text after a reload |  |

### 6A.2 One list stays one list

| # | Step | Expected | Feedback |
|---|---|---|---|
| 6A.2a | In a task list of three, put the caret at the end of the first, press Enter, then Backspace | Back to three items, one list. No gap, and the caret is at the end of the first item |  |
| 6A.2b | Save and look at the file | Every bullet is still `-`. A `*` anywhere means the list split |  |
| 6A.2c | Same at the end of the list rather than the middle: Enter, then Backspace | Also back to what you had |  |
| 6A.2d | Same again but press Enter twice to leave the list first, then Backspace | The list is whole again |  |

### 6A.3 A new note goes where you are standing (B29)

| # | Step | Expected | Feedback |
|---|---|---|---|
| 6A.3a | Click **Vault** at the top of the tree, then *+ New note*, type a subject and commit | The file is in the vault root, not the Inbox |  |
| 6A.3b | Select a folder several levels deep, *+ New note*, commit | The file is in that folder |  |
| 6A.3c | Press the global hotkey instead, commit | Inbox, as always. The hotkey does not know where you were standing and must not guess |  |
| 6A.3d | Select **Trash**, look at the note list | *Clear trash* where *+ New note* would be — there is no way to create a note there |  |

### 6A.4 Moving a note leaves the tree alone (B29)

| # | Step | Expected | Feedback |
|---|---|---|---|
| 6A.4a | From the Inbox, open a note, *Move* it to another folder | The tree still shows the Inbox selected; the note is gone from the list; the reader still shows it, with its new path underneath the title |  |
| 6A.4b | Move three notes out of the Inbox in a row | No clicking back to the Inbox between them. This is the whole point of the change |  |
| 6A.4c | Drag a note onto a folder instead | Same thing. The two gestures are one code path |  |

### 6A.5 Drag feedback

| # | Step | Expected | Feedback |
|---|---|---|---|
| 6A.5a | Start dragging a note out of the list | The row you picked up fades to about half. What follows the pointer stays solid |  |
| 6A.5b | Hold it over a folder | The folder is outlined *and* washed with the accent colour — visible without hunting for it |  |
| 6A.5c | Hold it over the folder that is already selected | Both still readable; the two highlights do not cancel each other out |  |
| 6A.5d | Hold it over Trash, and over the folder it is already in | Neither lights up. Drop anyway: nothing happens |  |
| 6A.5e | Drop it, or press Escape mid-drag | The row goes back to full opacity either way |  |

### 6A.6 Copying a list

Needs a second application, which is why it is here rather than in a test.

| # | Step | Expected | Feedback |
|---|---|---|---|
| 6A.6a | Select a bulleted list, copy, paste into a **plain-text** field (Slack, a terminal, Notepad, the search bar) | The bullets came along: `- One`, `- Two` |  |
| 6A.6b | Same with a numbered list | `1.`, `2.`, counting from the list's own start |  |
| 6A.6c | Same with a task list | `- [ ]` and `- [x]` |  |
| 6A.6d | Same with a list nested two or three deep | Indented by the width of the marker above it, so the levels line up |  |
| 6A.6e | Paste the same clipboard into **Outlook or Word** | A real list, formatted — the HTML flavour, unchanged by this fix |  |
| 6A.6f | Copy an ordinary paragraph containing `[1]` or `#tag` | No backslashes appear. This is plain text, not markdown |  |

---

## 7. The things that break quietly

Small, easily missed, each one a bug that actually happened.

| # | Step | Expected | Feedback |
|---|---|---|---|
| 7.1 | **macOS:** click the red traffic light on the capture window. Then press the hotkey | The window comes back. If the hotkey is dead, the window was destroyed instead of hidden — a regression of the 3 August fix |  |
| 7.2 | **macOS:** press Cmd+Q in the library | The window closes; the app keeps running; the hotkey still works (B25) |  |
| 7.3 | **Windows:** indent inside a list with Ctrl+M | It indents. It must not minimise the window |  |
| 7.4 | Open the keyboard-shortcut sheet | Says Cmd on macOS and Ctrl on Windows — **on the first paint**, not after a flicker |  |
| 7.5 | Open a note, change nothing, click away | The file's modified timestamp on disk is unchanged (B10) |  |
| 7.6 | Create a note titled `CON` or `PRN`, with `: * ?` in the title | Windows: a sane filename, no crash. Check both machines can open it |  |
| 7.7 | Type a `#tag` at the start of a line, save, reopen | Still `#tag`, not `\#tag` (B19) |  |

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

| # | Step | Expected | Feedback |
|---|---|---|---|
| 9.1a | Open or type a note long enough to fill the window and scroll | With the caret on the last line, there is comfortable room to scroll it up away from the bottom edge, rather than the last line sitting flush against it |  |
| 9.1b | Scroll all the way down, then click in the blank space below the last line | The caret does **not** land there — clicking below the content moves it to the end of the last line instead, the way clicking past the end of a text file always has. The blank space is not typeable |  |
| 9.1c | Do 9.1a in the **capture window** | Same feel |  |
| 9.1d | Do 9.1a in the **library reader** | Same feel |  |
| 9.1e | Resize the window shorter, then taller again, while scrolled to the bottom | The padding does not fight the resize — no jump, no runaway scroll position |  |

This is a "does this feel right" question, not a pass/fail one — there is no CDP selector
for "comfortable." Judge it the way you would judge any editor's bottom margin.

### 9.2 Caret beside an image in the capture window — NEVER VERIFIED

This is the twin of §4.2's problem, one level further in: nobody has ever gotten an image
to draw in the capture window under Xvfb, so `moveOverAtom` (`commands.ts`) — which is
supposed to steer the arrow keys across a `wikiEmbed`/`wikiLink` atom instead of leaving an
invisible `NodeSelection` — has never been exercised there against a real render either.
`test/image-caret.test.ts` covers it against a synthetic ProseMirror document, and that is
all anyone knows about whether it actually works on screen.

| # | Step | Expected | Feedback |
|---|---|---|---|
| 9.2a | In the capture window, get an image inline (paste a screenshot, or insert one with the image toolbar button) — this is §4.2's own check, and it has to pass first | The image itself appears inline, not a filename and not a broken-image icon |  |
| 9.2b | Put the caret in the text immediately before the image, press the arrow key that would step onto it | The blinking text caret lands on the far side of the image. **Not** a silent, invisible selection — nothing should look like the arrow key did nothing |  |
| 9.2c | Click directly on the image | It shows a visible outline (the `.ProseMirror-selectednode` styling this fix added). Before this fix a click here selected the node with nothing on screen saying so |  |
| 9.2d | With the image selected that way (from 9.2c), press an arrow key | The text caret appears beside the image, on the side the arrow pointed — the same destination as 9.2b, reached from a node selection instead of a text one |  |
| 9.2e | Shift+arrow across the image instead | A visible extended selection that includes the image, not a jump or a no-op |  |
| 9.2f | Repeat 9.2b–9.2e in the **library reader**, where an image is already known to draw (§4.1) | Same behaviour. This isolates whether a capture-window failure is about drawing the image at all (§4.2) or about the caret logic specifically — the reader gives a known-good baseline for the same `commands.ts` code |  |

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

| # | Step | Expected | Feedback |
|---|---|---|---|
| 10a | Open a note in the capture window (*Open for editing* from the library), leave it untouched, then edit that same file directly in a text editor and save | The capture window quietly reloads the new content — no dialog, no notice. Nothing here was at risk, so nothing needs asking |  |
| 10b | Repeat 10a, but first type something into the capture window and leave it un-flushed (well inside the 800ms debounce) | A one-line notice appears in the status bar, **with no buttons** — and what you just typed is not discarded or overwritten |  |
| 10c | With a note open in the capture window, delete that exact file — directly on disk, or in the library reader on the *other* machine | A one-line "deleted outside emqnote" notice appears, again with no buttons. The window does **not** close itself |  |
| 10d | After 10c, keep typing, then Ctrl/Cmd+Enter to commit | The file reappears at the same path with what you typed. The capture window keeps writing to the path it already had open — the deliberate choice for this window, unlike the library reader, which asks before recreating a deleted note |  |

---

## 11. Internal note links (B35)

Everything here was driven end to end under `Xvfb` on 8 August 2026 — the link opening its
note, the picker for an ambiguous one, both confirmations, and the rewrites landing on
disk — so this section is not a "never verified" one. What it covers is the part a person
has to judge: whether the *questions* read the way they should at the moment they appear,
and the one route no harness can reach (11f).

Set up a small vault first: a note `Spelregels` in one folder, a second note also titled
`Spelregels` in a different folder, and two notes elsewhere that link to the first one —
one written `[[<folder>/<filename without extension>|de spelregels]]`, the other written
as a bare `[[Spelregels]]`.

| # | Step | Expected | Feedback |
|---|---|---|---|
| 11a | Click the path-form link | The note it names opens in the reader. The folder tree does not jump, exactly as a search result opening does not |  |
| 11b | Click the bare `[[Spelregels]]` | A picker appears listing **both** notes, each with the folder it lives in beside it. Arrow keys move, Enter opens, Escape closes without opening anything |  |
| 11c | Type `[[Iets dat niet bestaat]]` into a note and click it | Nothing opens; the chip turns dashed and muted, and hovering says nothing in the vault is called that. This is deliberately not an error dialog — a link to a note you have not written yet is a normal thing to have |  |
| 11d | Move the linked-to note to another folder (drag it, or Actions → Move) | Before anything moves, a question: "2 notes link to this one — update them to follow?" with **Update** and **Leave them**. Choose Update: open both referencing notes and check the target now names the new folder, while the words on screen are unchanged |  |
| 11e | Repeat 11d and press Escape instead | **The note still moves** — only the links are left alone. This is the one dialog whose dismissal is not a cancel, and it is worth confirming it does not read as one |  |
| 11f | Open a note in the **capture window** that carries a `[[…]]` note link, and click it — NEVER VERIFIED | The library window comes to the front with that note open. There is no capture-renderer harness in the suite, so this route has only ever been reasoned about, never watched |  |
| 11g | Rename a note that others link to (click its title in the reader) | The same question as 11d, and the same two answers. Check a rewritten file's bytes: the alias must be untouched, and a link that had *no* alias must have gained one spelling out what it used to display |  |
| 11h | Rename a note to a title another note in the **same folder** already has | A warning first — "A note with this title already exists in …" — then, if you confirm, the link question if any links exist. Cancelling the warning must leave the note's title alone |  |
| 11i | Open an older vault whose index predates this feature | Everything above still works on the first run: the schema version bump forces a rebuild, and the only visible sign should be the scan progress bar at the top of the library |  |

---

## 12. The PDF viewer (B40)

Everything here except the two rows marked otherwise was driven end to end under `Xvfb` on
12 August 2026, against a real three-page PDF — including counting dark pixels on the
rendered canvas rather than trusting that a `<canvas>` existed. What is left is what only a
person on real hardware can judge.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 12a | Put a real, text-heavy PDF in the vault, link it in a note, and click the chip | emqnote's own viewer window opens — not Preview, not Acrobat — showing page 1. The note keeps its thumbnail chip; that is what you clicked |  |
| 12b | Read the text on the page | **This is the one that needs real hardware.** pdf.js is bundled without CMap and standard-font data, so a PDF using anything beyond the base 14 fonts may render with substituted glyphs. A document exported from Word or a scanner should look right; if it does not, that missing data is the first suspect |  |
| 12c | Scroll from top to bottom | Pages render as they come into view, and the counter in the toolbar keeps up. No blank pages left behind after a fast scroll |  |
| 12d | Type a page number in the box and press Enter | It jumps there. Typing nonsense (`0`, `999`, `abc`) clamps or does nothing — never an error |  |
| 12e | Switch between Fit width, Fit page and a percentage | The pages re-render at the new size and stay sharp. Fit page **may magnify** a small page — that is deliberate, unlike the thumbnail, which never does |  |
| 12f | Resize the window with Fit width selected | Pages follow the width. Nothing tears or leaves a half-drawn canvas |  |
| 12g | Press ⧉ **Open in system viewer** | Preview/Acrobat opens the same file. This is the escape hatch for printing and annotating |  |
| 12h | Click a *second* PDF in a note while the viewer is open | The same window retargets to the new file and comes forward — a second viewer window must not appear |  |
| 12i | Click a `.docx` or `.xlsx` attachment | Still goes straight to Word/Excel. The viewer is for what the app can actually draw |  |
| 12j | Click a PDF from the **capture window** — NEVER VERIFIED | The viewer opens the same way. The capture renderer has no harness in the suite, so this route has only been reasoned about |  |
| 12k | Open a corrupt or password-protected PDF | The viewer says it cannot read that file, in words, on the page. Not a blank window and not a crash |  |
| 12l | Quit the app with the viewer open | The viewer closes with everything else and leaves no stray process |  |

## 13. Inserting a note link (B41)

Driven under `Xvfb` on 12 August 2026 in the library reader: the picker opening from the
toolbar and from a typed `[[`, filtering, insertion as `[[path|Title]]`, and the resulting
link resolving back through B35. What is left is the capture window and the feel of it.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 13a | In the reader, type `[[` mid-sentence | The picker opens, listing notes. The two brackets you typed are still visible behind it |  |
| 13b | Press Escape | The picker closes and **the `[[` is still there**, exactly as typed. Nothing was silently eaten and nothing needs undoing |  |
| 13c | Type `[[` again and pick a note | The brackets are swallowed and a link chip appears reading the note's *title*. Save, then `cat` the file: it must say `[[<path>|<Title>]]`, never a bare `[[Title]]` |  |
| 13d | Click that new chip | The note it names opens. It must not raise the ambiguity picker, even if another note shares the title — that is the whole reason the path is written |  |
| 13e | Select a few words first, then press `Mod+Shift+K` | The picker opens with those words already in the filter, and picking a note replaces the selection |  |
| 13f | Type a filter that matches nothing | "No note matches", not an empty box |  |
| 13g | Try `tag:klantx` in the filter | It narrows the same way the library's search bar does — the picker runs the same query language, which is a consequence of using the index rather than a separate feature |  |
| 13h | Do 13a–13d in the **capture window** — NEVER VERIFIED | Identical behaviour. No capture-renderer harness exists, and this is the window notes are actually written in, so it is the row most worth walking |  |
| 13i | Open the picker in a vault of a few thousand notes | It appears without a stall, and typing stays responsive. The filtering happens in main against FTS5, so a slow picker here means something else is wrong |  |

## 14. Tables (B42)

Insertion, Tab, the trailing paragraph and alignment were all driven under `Xvfb` on
12 August 2026, and the saved file came back byte-identical from `npm run canonical`. The
grid is a hover gesture, which `--click-button` cannot drive, so its feel is untested.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 14a | Press `Mod+Alt+T`, or the ▦ button | An 8×8 grid appears at the caret with a "3 × 2 table" readout that follows the pointer |  |
| 14b | Move with the arrow keys instead of the mouse, then press Enter | The same thing. The grid must be fully keyboard-drivable — the shortcut that opens it would otherwise not finish what it starts |  |
| 14c | Open the grid near the right or bottom edge of the window | It stays on screen rather than hanging off the edge |  |
| 14d | Insert a 3×3 and type across it with Tab | Each Tab selects the next cell's contents so you can overtype. The header row is bold |  |
| 14e | Tab off the very last cell | A new empty row appears and the caret lands in its first cell |  |
| 14f | Press Enter inside a cell | The line breaks *within* the cell. Save and check the file: it must be `<br>`, which is the only thing GFM has for this |  |
| 14g | Click below the table | There is a paragraph there to land in. A table at the very bottom of a note must never be a dead end |  |
| 14h | Right-click inside the table | Insert/delete row and column, delete table, and the four column-alignment items. Right-click *outside* a table: none of those appear |  |
| 14i | Set a column to centre, save, `cat` the file | The delimiter row reads `:---:` for that column and `---` for the others. No cell padding anywhere, and always three dashes minimum |  |
| 14j | Delete the last row, or the last column | The whole table goes. A table with no rows is not a thing that can exist, and an empty husk would be worse than the deletion you asked for |  |
| 14k | Open a note with a table written in Obsidian, edit a cell, save | Run `npm run canonical` on it. Byte-identical, or one of the two is wrong and which is a decision |  |
| 14l | Add a column to a table whose rows are *not* all the same length | Every row squares up to the same width. Hand-written markdown really does produce ragged rows |  |
| 14m | Copy a table inside the editor and paste it | It comes back as a table, alignment included — not as loose text |  |
| 14n | Do 14a–14e in the **capture window** — NEVER VERIFIED | Identical behaviour, same missing harness as 13h |  |

---

## 15. A PDF embedded in the note (B43)

Driven end to end under `Xvfb` on 13 August 2026 against a real three-page PDF, with **dark
pixels counted on the drawn page** rather than an `<img>` merely being present. What is left
is what only a person on a real display can judge: how a full-width page feels to read past.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 15a | Insert a PDF with 📎 (or `Mod+Shift+A`, or drop one in) | Its first page appears inline at the width of the note column, with the filename and a ⧉ on a bar underneath. `cat` the file: the line reads `![[…]]`, not `[[…]]` |  |
| 15b | Scroll a long note past the embedded page | It reads as a picture in the text, not as a widget: the wheel scrolls the note and never gets caught by the page. This is the one thing a script cannot judge |  |
| 15c | Click the ⧉ | B40's viewer window opens on that PDF. The inline page turns pages of its own now (§17), but zoom, text selection and the way out to the system viewer are still that window's job |  |
| 15d | Click the page itself | It selects like a picture (blue outline) and Backspace deletes it. An atom you cannot select is one you cannot get rid of |  |
| 15e | Put the caret beside it and press ← / → | The caret steps past the embed rather than landing on an invisible selection |  |
| 15f | Type `[[offerte.pdf]]` by hand instead (or open an older note carrying one) | The small B36 chip with its thumbnail, unchanged. The two spellings mean two different things and neither is rewritten on open |  |
| 15g | Delete the PDF out of `_attachments/` and reopen the note | A marked chip with ⚠ where the page was, naming the file |  |
| 15h | Put the file back — **without restarting** — and reopen the note | The page draws again. This is the one that was broken in the first version: a missing file must not be remembered, only a PDF that genuinely cannot be rendered |  |
| 15i | Embed a corrupt or password-protected PDF | A chip in the warning colour, and hovering says why. It must not look identical to 15g, and it must not look like a plain attachment |  |
| 15j | Open a note with several embedded PDFs | They draw one after another, not all at once — one render window, one slot. Nothing about the window should stutter while they arrive |  |
| 15k | Do 15a and 15c in the **capture window** — NEVER VERIFIED | Identical behaviour. Same missing harness as 13h/14n |  |

---

## 16. The table toolbar, the back button and the folded Trash (13 August 2026)

All three were driven under `Xvfb`, including `--click-button="Row ↓"` reaching a toolbar
button and `npm run canonical` on the file afterwards. What a person still has to judge is
whether ten buttons in a row are legible at a real window width.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 16a | Put the caret in a table | A row of buttons appears just above it: Row ↑ / Row ↓ / Col ← / Col → / Del row / Del col / Left / Centre / Right / Auto. Move the caret out of the table and it goes |  |
| 16b | Look at the toolbar at a normal window width | Ten buttons that read as a toolbar rather than as clutter. Hovering each gives the full sentence ("Insert row below"). This is the judgement call automation cannot make |  |
| 16c | Use each of the four row/column buttons, then `cat` the file | Plain GFM, three dashes, no cell padding. Run `npm run canonical`: byte-identical |  |
| 16d | Put the caret in a column and click Centre | That column's delimiter becomes `:---:` and its neighbours stay `---`. The Centre button is the lit one; move to another column and the lit button follows |  |
| 16e | Click Auto | Back to a plain `---`. "Auto" is a real fourth state, not a synonym for Left |  |
| 16f | Right-click inside the table | The same operations are still in the menu, plus **Delete table**, which is deliberately not on the toolbar |  |
| 16g | Click a `[[…]]` link to another note | The note opens with a `← <the note you came from>` button above its title. Click it: you are back, and the button is gone |  |
| 16h | Follow three links in a row, then click back three times | One step per click, all the way out. Then open any note from the list: no back button at all |  |
| 16i | Click a `[[…]]` link in the **capture window** — NEVER VERIFIED | The library opens the target *and* offers a way back to the note you were typing in. Same missing harness as 13h/14n |  |
| 16j | Launch the app and look at the sidebar | Trash is folded. Unfold it: what is inside is dimmed and italic, and the Trash row itself is not |  |
| 16k | Rename a folder holding notes that other notes link to | No dialog at all — the rename happens and the links follow. Check the referring file's bytes and click the link: it opens the note |  |
| 16l | Rename a folder holding a note that is open in the capture window | Refused, with a message naming the reason. Nothing on disk moves |  |
| 16m | Rename a folder of **attachments** — the `99 - Attachments` shape an Obsidian vault has — with notes embedding pictures out of it | Every `![[…]]` and `[[…\|…]]` naming a file in it follows the rename, and the pictures still *draw*. This is the case the first version missed entirely (B45); checking the bytes is not enough on its own, the picture has to appear |  |
| 16n | Rename a folder whose name is the start of a sibling's (`Bijlagen` beside `Bijlagen extra`) | Only the renamed one's targets change |  |
| 16o | Do 16m against a vault whose index predates this | It works on the first run: the schema bump forces a rebuild, and the only sign should be the scan bar at the top of the library |  |

---

## 17. The changes of 13 August 2026 — inline page turning, Insert/Actions, the back strip

Driven end to end under `Xvfb` against a real three-page PDF, with **three genuinely
different images counted in a canvas** rather than a changed `src` being taken as proof. What
is left is what only a person on a real display can judge — how the controls feel and whether
they crowd — plus everything in the capture window, which still has no harness.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 17a | Open a note embedding a multi-page PDF | The page draws as before, with a bar underneath reading ◀ ▶ · "Page 1 of 3" · Fit · the filename · ⧉. ◀ is dimmed on page 1 |  |
| 17b | Click ▶ twice, then ◀ once | Page 2, page 3, page 2 — the page *picture* changes each time, not only the counter. ▶ is dimmed on the last page |  |
| 17c | Embed a **one-page** PDF | Both arrows are gone, not merely dimmed, and the counter says "Page 1 of 1" |  |
| 17d | Click Fit | The whole page fits the window height, centred. Click again: back to the width of the column. This is a judgement call automation cannot make — does the page at 70vh actually read? |  |
| 17e | Look at the bar in a **narrow** note column | Six controls plus a filename that ellipses. If they crowd or wrap, say so — automation measured only a 1600px window |  |
| 17f | Turn several pages, then leave the note and come back | Back to page 1, and the pages you already looked at come back instantly (they are cached). Nothing should stutter |  |
| 17g | Turn a page in a note whose PDF you then delete from `_attachments/`, and reopen | The marked ⚠ chip, exactly as §15g. Put the file back and reopen: the page returns without a restart |  |
| 17h | Do 17a–17d in the **capture window** — NEVER VERIFIED | Identical behaviour. Same missing harness as 13h/14n/15k |  |
| 17i | Look at the reader toolbar | Two buttons where six things used to be: **Insert** and **Actions**. No 🖼 🔗 ▦ 📎 |  |
| 17j | Open Insert | Insert image / Insert file / Link to note… / Table…, each with its shortcut. Each one does what the same item in the right-click menu does |  |
| 17k | Open Actions | Rename / Move / Duplicate / Reveal / Delete, unchanged |  |
| 17l | Look at the **capture window's** status bar — NEVER VERIFIED | One **Insert** button in place of the four glyphs, opening the same four items. This is the one to check first: it is the window notes are actually written in |  |
| 17m | Follow a `[[…]]` link | The `← <note>` strip is now at the *foot* of the reader, not above the title. The header must not change height as you follow links and come back |  |
| 17n | Follow a link into a note the capture window has open | The note is dimmed and unclickable as before, and the back button at the foot still works — it is deliberately outside the locked area |  |
| 17o | Open the note picker (`[[`, or Insert → Link to note…) in a vault with dozens of notes | Hold ArrowDown: the list scrolls with the highlight all the way to the last row, and back up again |  |
| 17p | Do 17o with the **mouse pointer resting over the list** | The keyboard still wins: the rows scrolling under the pointer must not drag the highlight back. This is the bug the scrolling itself created |  |
| 17q | Look at the folder panel's toolbar | + New / Rename / Delete sit against the left edge, lined up with the folder rows below, each button its own width with its text centred |  |

---

## 18. The changes of 14 August 2026 — the imported vault, the PDF bar, the tray vault

Everything below was driven end to end under `Xvfb` over CDP except §18n and §18o, and the
image checks counted real pixels rather than trusting an `<img>` in the DOM. What is left is
the tray — which no script can reach at all — plus everything in the capture window, which
still has no harness, plus the handful of judgements about how something feels.

To set this up you want a folder shaped like an Obsidian vault: a folder called
`99 - Attachments` (no underscore — `_attachments` is the app's own and stays hidden) with a
picture, a multi-page PDF and a `.docx` in it, and a note that ends in a table.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 18a | Open a note written elsewhere that **ends** in a table | There is an empty line below the table and you can click into it and type. Before this there was no caret position after the table at all |  |
| 18b | Do 18a, then close the note **without typing** | The file is untouched: same bytes, same modified time. Check with `stat` and a hash, not by eye — B10 |  |
| 18c | Same as 18a with a note ending in a code block, an HTML block or a `---` rule | Identical: a line to type on below each |  |
| 18d | Open a note Obsidian wrote a PDF into (both `![[x.pdf]]` and `[[x.pdf]]`) | One PDF page. The chip that used to sit beside it is gone |  |
| 18e | `cat` that same file | **Both** spellings are still in it. This is display-only; a vault shared with Obsidian must keep saying what Obsidian expects |  |
| 18f | Put a `[[x.pdf]]` at the *top* of such a note and its `![[x.pdf]]` at the bottom | Both are drawn. Only neighbours are collapsed — two far-apart mentions are two deliberate mentions |  |
| 18g | Mod+click the **last character** of a link, aiming at the right-hand half of it | It opens, first time. This is the "not the first time, sometimes not the second, third works" report |  |
| 18h | Mod+click a bare URL that ends a paragraph | Opens. This shape used to be unopenable outright |  |
| 18i | Plain-click the same spot as 18g | The caret is placed, nothing opens — B33 unchanged |  |
| 18j | Click a chip drawn for `![](https://www.youtube.com/watch?v=…)` | The browser opens the address. A plain click, like every other chip |  |
| 18k | Look at an embedded PDF | The bar is **above** the page: ◀ ▶, a page box with `/ 3` beside it, a Fit width/Fit page dropdown, the filename, then ⧉ with its words |  |
| 18l | Type a page number into that box and press Enter | It goes there. Type nonsense or a page past the end: the box goes back to the page you are on, with no error |  |
| 18m | Judge the bar at a **narrow** window width — NEVER JUDGED | Does the filename clip gracefully and the ⧉ stay reachable? The spacer is meant to make it so |  |
| 18n | Insert → Divider | A line across the note, with a paragraph below it. Save and `npm run canonical`: plain `---`, byte-identical |  |
| 18o | Open the tray menu → **Vault** — NEVER VERIFIED | A submenu: show in file manager, every vault this machine knows (the current one ticked and not clickable, an unavailable one greyed), and Choose another folder… |  |
| 18p | Pick another vault from that submenu — NEVER VERIFIED | A dialog naming the restart. Confirm: the app restarts into the other vault. This is the one to test with a **half-typed note open in the library** — it must be on disk afterwards, in the vault it was typed in |  |
| 18q | Cancel that dialog — NEVER VERIFIED | Nothing happens. No restart, no vault change |  |
| 18r | Click the `99 - Attachments` folder in the tree | A **Files** section under the notes listing the picture, the PDF and the `.docx` with their type and size. It used to say "No notes" and show nothing |  |
| 18s | Click the picture | It is drawn in the reader pane, fitted to it, with Open and Reveal above |  |
| 18t | Click the PDF | Its first page, with ◀ ▶ and `1 / n`. Turning pages changes the picture |  |
| 18u | Click the `.docx` | "No preview for this file type", and an Open button that hands it to the OS |  |
| 18v | Judge the split when a folder holds both notes and 200 files — NEVER JUDGED | The files section is capped at half the pane so the notes stay reachable. Does that feel right? |  |
| 18w | Settings → Orphaned attachments, on a **OneDrive** vault with files not yet downloaded | It finishes. It used to sit on "Looking…" indefinitely — and if it now fails it says so instead of looking busy for ever |  |
| 18x | Do 18a–18n in the **capture window** — NEVER VERIFIED | Identical behaviour. Same missing harness as 13h/14n/15k/17h |  |

---

## 19. The three cornerstone features (B49, B50, B51)

Everything below has been driven under `Xvfb` in the **library** window except where it says
otherwise. What a person is here for is the capture window, the feel of a drag, and a machine
with a real network on it.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 19a | Drag across a 2×2 block of cells in a table | Exactly those four cells are tinted, including the header row. Nothing outside the rectangle |  |
| 19b | Judge that drag on a real display — NEVER JUDGED | Does the rectangle follow the pointer without lag or flicker? Does the browser's own blue text selection ever flash over it? |  |
| 19c | Press Backspace with that rectangle up | Those four cells empty. The table keeps its shape, and nothing outside the rectangle changes |  |
| 19d | Type a letter with a rectangle up | The cells empty and the letter lands in the top-left one of them |  |
| 19e | Shift+click a cell three rows down | The rectangle extends to it. Shift+arrow does the same, one cell at a time |  |
| 19f | With a rectangle spanning two rows, press "Row ↓" | **Two** rows are added, not one — a rectangle means what it covers |  |
| 19g | With a rectangle spanning two columns, press "Centre" | Both columns are centred. Save and `npm run canonical`: `:---:` twice, byte-identical |  |
| 19h | Select a rectangle and copy it, then paste into Word or a mail | A real table of just those cells. Paste into a plain-text box: `\| a \| b \|` rows |  |
| 19i | Open a note holding `![Naam](https://…)` on a machine with a network | The picture is drawn, not a grey chip |  |
| 19j | Pull the network out and reopen that note | Still drawn — the bytes are in `<userData>/remote-images` |  |
| 19k | Settings → uncheck **Load images from the web**, reopen the note | A chip with the alt text. Check it again: the picture is back |  |
| 19l | Open a note holding `![x](file:///etc/passwd)` and one naming an internal address | Chips, both. `<userData>/remote-images` gains nothing — check the folder |  |
| 19m | Watch what a real host sees — NEVER VERIFIED | With the setting on, opening such a note is one request per picture, once. Nothing on a second open |  |
| 19n | Type `/` on an empty line | A menu under the caret: six headings, paragraph, the three list kinds, quote, then the five insert items |  |
| 19o | Keep typing `head` | It narrows to the headings. The caret is still in the note and `/head` is still visible in it |  |
| 19p | Press Enter on Heading 1 | The line becomes a heading and the `/head` is gone. Type on: the words land in the heading |  |
| 19q | Type `/` then Escape | The menu closes and the `/` stays exactly where you typed it |  |
| 19r | Type `/divid`, Enter, then type a word | The rule stays and the word goes below it. Before this the word replaced the rule |  |
| 19s | Type a date like `12/8` mid-sentence, and a `/` in a table cell | No menu, either time |  |
| 19t | Judge the panel at a short window height — NEVER JUDGED | Sixteen rows is taller than some windows. It should flip above the caret and scroll rather than run off the screen |  |
| 19u | Do 19a–19s in the **capture window** — NEVER VERIFIED | Identical behaviour. Same missing harness as 13h/14n/15k/17h/18x |  |

---

## 20. Four fixes from daily use (14 August 2026)

Everything below has been driven under `Xvfb` in the **library** window except where it says
otherwise. Note §19t is answered by 20a: the panel does scroll now.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 20a | Type `/` on an empty line in a **short** window and hold ArrowDown | The list scrolls with the highlight. No row is ever selected off the bottom edge, and the wrap back to the top scrolls back with it |  |
| 20b | Judge that against a real display — NEVER JUDGED | Does the list scroll one row at a time, or jump? A rebuilt panel starts at the top each time, which is invisible if it is right and obvious if it is not |  |
| 20c | Open a folder holding only files — an imported vault's `99 - Attachments` | The file list fills the whole pane. It used to stop at the halfway line with the bottom half blank |  |
| 20d | Open a folder holding both notes and files | No blank strip anywhere: the note list takes what it needs and the files sit under it, ending at the foot of the pane |  |
| 20e | Open a folder holding a few notes and *many* files | The file list still stops at half the pane — that cap protects the notes, and it is only lifted when there are none |  |
| 20f | Look at a note with a `>` quote in it | The quoted text leans. A `*word*` inside the quote stands upright, so emphasis inside a quote is still visible |  |
| 20g | Judge the italic against a real display — NEVER JUDGED | Does the quote read as quoted rather than as a mistake, at the font your machine uses? |  |
| 20h | Put the caret mid-word in a table cell and hold Shift+Right | The text selection grows inside the cell, as in any editor |  |
| 20i | Keep going past the end of that cell | It becomes the same tinted rectangle the mouse makes, both cells whole. Before this it silently spilled across the cell boundary and Backspace then did nothing |  |
| 20j | Press Backspace there | Exactly those cells empty. Save and `npm run canonical`: byte-identical |  |
| 20k | Select part of a cell and press Shift+Down | Whole cells, two rows of them — a cell has no line below to extend to |  |
| 20l | Ask a table's alignment buttons to align one cell | They cannot, by design: GFM writes alignment once per column. They act on the caret's column, or on the columns a rectangle covers. See B42 |  |
| 20m | Do 20a, 20f, 20h–20k in the **capture window** — NEVER VERIFIED | Identical behaviour. Same missing harness as 13h/14n/15k/17h/18x/19u |  |

---

## 21. Menus, tag clicks and folder folding (15 August 2026)

Everything below has been driven under `Xvfb` — **including the capture window**, which turns
out to be perfectly reachable over CDP; what it lacks is a unit-test harness, not a way in.
What is left for a person is the half a script cannot judge: how it looks and how it feels.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 21a | Right-click a folder, a note and the note body; open the reader's **Actions** and **Insert** menus | The page behind the menu keeps its own colours. It used to go grey behind every one of these |  |
| 21b | Insert a table from the toolbar and look at the size grid | Same: no veil behind the popover |  |
| 21c | Open **Move to…**, the note picker, Settings, Help and a conflict dialog | These *do* dim, unchanged. A modal is meant to take the window over; a menu is not |  |
| 21d | Judge 21a against a real display — NEVER JUDGED | Does an undimmed menu still read as being in front of the page, or does it get lost in it? The shadow and the border are now the whole of what separates them |  |
| 21e | Plain-click in the middle of a `#tag` in a note body | The caret lands inside the tag, and nothing opens. Type to fix a letter of it |  |
| 21f | Mod+click that tag (Cmd on macOS, Ctrl elsewhere) | The library comes up, the **Tags** list unfolds, that tag's row is lit, and the note list holds every note carrying it, across folders |  |
| 21g | Hold the modifier and hover a tag | The pointer turns, the same as over a weblink. That is the only sign the tag can be clicked |  |
| 21h | Mod+click a tag written with capitals — `#KlantX` where the list says `klantx` | The `klantx` row lights and every casing is listed. Two spellings are one tag |  |
| 21i | Mod+click a tag that is rare enough not to be in the Tags list | It appears at the top of the list anyway. The list must never filter by something it does not show |  |
| 21j | Type a note in the **capture window**, put a `#tag` in it and Mod+click that | Same as 21f, and the note you are typing is untouched. Verified over CDP; look at it once by hand |  |
| 21k | Quit the library window entirely, then do 21j | The library is created already filtered — not created blank and filtered a second later, and not created blank |  |
| 21l | Double-click a folder that has subfolders | It unfolds; double-click again and it folds. The single click that selects it still happens first |  |
| 21m | Double-click a folder with no subfolders | Nothing happens, and nothing appears |  |
| 21n | Judge 21l against a real display — NEVER JUDGED | Does the select-then-fold sequence read as one gesture, or does the selection flicker on the way? |  |

---

## 22. Fourteen items from daily use (16 August 2026)

Most of this has been driven under `Xvfb` and is listed here only for the half a script
cannot reach. **Three items are Windows-only and have never run on Windows at all** — 22a,
22b and 22c — and one of those, Ctrl+Tab, is a fix for a cause that was never found: the
chord was measured arriving and working normally on Linux, so what is being tested here is
whether claiming it earlier is enough. If 22b still fails, say so plainly; the next step is
then a different diagnosis, not a bigger hammer.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 22a | **Windows.** Open the library and look at the top of the window | No menu strip above the folder tree. Press Alt: the "Edit" bar appears, and disappears again. If it is gone for good instead, the roles were dropped rather than hidden — report that |  |
| 22b | **Windows.** Click into a note's body, then press Ctrl+Tab, twice more, then Ctrl+Shift+Tab | Focus walks editor → tree → notes → editor, and back the other way. **This is the item most likely still to fail**; if it does, note whether Tab alone still moves tree → notes |  |
| 22c | **Windows or macOS, a machine that has never run emqnote.** Install and launch it | A dialog naming a full path — `…\OneDrive - <tenant>\emqnote` — with **Use this folder** and **Choose another folder…**. Nothing is created until you answer. On a machine with two business OneDrives you get the tenant question first, unchanged |  |
| 22d | 22c, then pick **Choose another folder…** and cancel out of the picker | Nothing is created, and nothing is remembered. Relaunching asks again |  |
| 22e | Select a tag under **Tags**, then click the Tags heading | It collapses, and stays collapsed. Click a `#tag` in a note body with Mod held: it opens again, with that tag lit |  |
| 22f | Drag a note onto **Trash** — judge the feel — NEVER JUDGED | It goes, with no dialog. Does that read as right, or does it feel too easy for a delete? The undo is Restore, one right-click away; if it does not feel like enough, say so — that is a decision (B54) and it can be revisited |  |
| 22g | Right-click a note in the trash, choose **Restore**, press Enter without typing | It lands in `00 Inbox`. Check the file is really there |  |
| 22h | Right-click a *folder* in the trash → **Restore** → pick its old parent | The folder and everything in it moves back. Open a note that linked into it: the link still opens |  |
| 22i | Stand on a folder inside the trash and look at the folder toolbar | It reads **Restore** / **Delete permanently**, not the usual three |  |
| 22j | **Delete permanently** on a trashed note, then confirm | The dialog names the note and says it cannot be undone. Afterwards the file is gone from disk — check in Explorer/Finder, not just in the app |  |
| 22k | Right-click the Vault row and the Trash row | The entries that do not apply are visibly greyer than the ones that do. Judge it on a real display — NEVER JUDGED |  |
| 22l | Right-click a folder → **Reveal** | Explorer/Finder opens with that folder selected |  |
| 22m | Open the sidebar's **Unlinked attachments** row (called *Orphaned attachments* until 16 August 2026) | It sits between Keyboard shortcuts and Trash, and the files appear in the note-list panel with their type and size — no dialog. Click one: it previews in the reader |  |
| 22n | Right-click a file in that list → **Copy link**, then paste into a note | A picture pastes as an embed and draws; a `.docx` pastes as a chip that opens it |  |
| 22o | Right-click a file in an ordinary folder like `99 - Attachments` | Copy link and Reveal, and **no Delete** — that one is only offered where a file is known to be unreferenced |  |
| 22p | Put an `.avif` in the vault and embed it in a note | It draws. Also try inserting one through the image button: `.avif` is in the picker's filter now |  |
| 22q | Open a note with an embedded PDF and click **⧉ Open in system viewer** | Preview/Acrobat opens it — *not* emqnote's own PDF window. Then click a plain `[[file.pdf]]` chip: that one still opens emqnote's viewer |  |
| 22r | Drag the library window as narrow as it goes and look at the date field | The date is cut off with an ellipsis inside its own box, never painted over the field beside it. Hover it: the tooltip carries the full date and then the hint |  |
| 22s | All fourteen, in the **capture window** — NEVER TESTED THERE | The same limitation every batch names. The date field and the ⧉ are the two that live in that window too |  |

---

## 23. Six items from daily use (16 August 2026)

Four of the six were driven end to end under `Xvfb` and are listed here only for the half a
script cannot reach. **The other two are Windows-only and have never run on Windows at all**
— 23a and 23b. They are one cause: chokidar opened an `fs.watch` handle on every folder in
the vault and none on any file, which is a Windows kernel property this sandbox cannot
reproduce, so what was measured here is only that the *retry and the answer* work (a folder
the filesystem refuses now reports rather than silently doing nothing).

23c is the one to time rather than watch: polling has a price, and only a real vault on a
real business OneDrive can say what it is.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 23a | **Windows.** Put a folder in the trash, then **Delete permanently** on it, and confirm | The folder is gone from disk — check in Explorer, not just in the app. If a dialog says something else has it open, say which app you had running; that message is new and means the filesystem refused, not that the app did nothing |  |
| 23b | **Windows, two machines.** Rename a folder in the vault on the Mac, wait for OneDrive to sync, and watch the Windows machine with emqnote running | The folder is renamed there too, without quitting emqnote first. This is the whole of B57 — before it, the app held every folder open and OneDrive could not touch them |  |
| 23c | **Windows.** Leave the app resident for a working day on the real vault and watch Task Manager — NEVER MEASURED | A stat sweep every two seconds is real work. If it shows up as steady CPU or as a laptop fan, say so: the interval is one constant, and the alternative designs are written down in B57 |  |
| 23d | **Windows.** With the app running, make a change to a note on the other machine and wait | It appears within about five seconds, as before. Polling is slower to notice than a native watch; this is the criterion it has to keep meeting |  |
| 23e | Right-click a file in **Unlinked attachments** → **Copy link**, paste it into a note | The picture draws **immediately** — no switching notes and back. Then reopen the note: the same picture, from the file this time |  |
| 23f | With that pane open, type a paragraph in the New note window and watch the file list | The rows stay exactly where they are. No blink, no "Looking…". If it flickers even once, say so |  |
| 23g | After 23e, open the pane again | The picture you just linked is **no longer listed**. It was, before this batch, because the pane only matched bare filenames and Copy link writes a path |  |
| 23h | Open a note in the New note window, change the subject, click away to another app, then come back and keep typing | No "This note changed outside emqnote in the meantime." at any point. The file on disk has been renamed to the new subject — check the name |  |
| 23i | Then edit that same file in a text editor and save | The notice *does* appear now (or the window quietly reloads if you had typed nothing). Suppressing a real one would be the way this fix could go wrong |  |
| 23j | All six, in the **capture window** — the paste especially — NEVER TESTED THERE | The same limitation every batch names. 23h is about that window and was driven; the paste of a `[[…]]` link there was not |  |

---

## Reporting

For anything that fails, capture: the platform and OS version, the app version — the top
line of the tray menu, `emqnote x.y.z`, which is the only place it is shown — what you did,
what happened, and what you expected. For a rendering
problem, a screenshot. For anything involving files, the actual bytes — `cat` the `.md`,
do not describe it.

If something in §4.2, §6.3, §9.2, §10, §11f, §12b, §12j, §13h, §14n, §15k, §16i, §18o–§18q,
§18x, §19u, §20m, §22s or §23j fails,
that is expected-ish rather than alarming: those have never been watched working, and they are
why this document exists. §11f, §13h, §14n, §15k, §16i, §18x, §19u, §20m, §22s and §23j are all the same gap — the capture
window has no test harness — and §18o–§18q are a gap of their own: a tray menu is not
scriptable at all, which is why `vault-menu.ts` was split out to be testable apart from it — and §12b is the one thing in the PDF viewer that a Linux sandbox
genuinely cannot answer. §15b, §16b, §19b, §19t, §20b, §20g, §22f and §22k are a different kind of unwatched: they are
judgements about how something feels or reads, which no script can make. **§22a, §22b, §22c and now §23a–§23d
are a fourth kind: a whole platform.** They are the items that have never run on the machine
they are about — this sandbox is Linux, and all of them are Windows behaviours. §22b is the
sharpest of them, because the bug it fixes did not reproduce here at all; §23c is a different
shape again, being a *cost* to measure rather than a behaviour to check. §19m is a third kind: what a
remote host observes is not visible from inside the app at all. §4.5 is no longer one of them — since B36 the rendering itself has been seen
working, on the same Chromium the packaged app ships.
