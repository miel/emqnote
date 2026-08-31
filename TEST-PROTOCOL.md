# TEST-PROTOCOL.md

A manual pass over the packaged app, for a human, on both machines.

English like `TODO.md` and `CLAUDE.md`, not Dutch like the five design documents — this is
a working checklist, not part of the design.

## What this is for

The suite covers 1636 cases and CI runs it on Linux, Windows and macOS. What it cannot do is
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

This was the twin of §4.2's problem, one level further in: nobody had ever gotten an image
to draw in the capture window under Xvfb, so `moveOverAtom` (`commands.ts`) — which is
supposed to steer the arrow keys across a `wikiEmbed`/`wikiLink` atom instead of leaving an
invisible `NodeSelection` — had never been exercised there against a real render either.

**`npm run drive:capture` now does both** (22 August 2026): a real picture decodes in the
real capture window (`naturalWidth` non-zero, not merely an `<img>` in the DOM), and six
ArrowRights move the caret across it rather than leaving it stuck. `test/image-caret.test.ts`
still owns the *rule* against a synthetic document. What is left here is what a script cannot
judge: whether the caret's travel across the picture reads as one continuous motion on a real
display, or as a jump.

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

## 10. Disk-change notice in the capture window — LOGIC COVERED, EVENT NOT

The library window's own disk-change bar (a note that changed or disappeared on disk from
outside the app) is covered end to end by `test/library-disk-change.test.ts`, a real
`Library` mounted in jsdom. **Since 22 August 2026 the capture window's equivalent has the
same** — `test/capture-disk-change.test.ts`, against a real `Capture` mounted through
`test/helpers/capture.ts`. All three branches are pinned there: reread when clean, a
buttonless notice when dirty, and a buttonless notice for a deletion whatever `dirtyRef`
says, plus the two ways the notice clears. Two of those assertions are about something
*not* happening, which is the point of the feature.

What is left for a person is the half no harness reaches: whether a **real** chokidar event
from a **real** OneDrive write lands on a **real** open capture window, and whether the
300 ms `stabilityThreshold` is the right number against actual sync latency. The rows below
still stand — they simply now check the plumbing rather than the logic.

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
| 11f | Open a note in the **capture window** that carries a `[[…]]` note link, and click it — NEVER VERIFIED | The library window comes to the front with that note open. A capture-renderer harness exists now, but this route has no test against it yet, so it has only ever been reasoned about |  |
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
| 12j | Click a PDF from the **capture window** — NEVER VERIFIED | The viewer opens the same way. The capture renderer has a harness now, but no test covers this route, so it has only been reasoned about |  |
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
| 13h | Do 13a–13d in the **capture window** | Identical behaviour. **Written, 22 August 2026**: `test/capture-note-link.test.ts` drives 13a–13d there — the typed `[[`, Escape leaving the brackets, the pick writing the path rather than the title, and the chip's click reaching `openWikiLink`. 13e's *seeding from a selection* is not covered (jsdom moves no selection); the chord opening the picker is. Still the row most worth walking by hand, being the window notes are written in |  |
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
| 14n | Do 14a–14e in the **capture window** | Identical behaviour. **Written, 22 August 2026** in `test/capture-table.test.ts`: 14a the chord and its readout, 14b the grid walked and chosen entirely from the keyboard, 14d Tab selecting the next cell's contents, 14e Tab off the last cell adding a row. **14c is not covered** — a grid staying on screen near an edge is layout, and belongs with 19t |  |

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
| 15k | Do 15a and 15c in the **capture window** | **15a is driven, 22 August 2026** — `npm run drive:capture` embeds a real three-page PDF and asserts `naturalWidth` on the drawn page, so pdf.js genuinely rendered into this window rather than an `<img>` merely existing. Not reachable by the *harness*, and that is measured rather than assumed: the page arrives over `fetch()` on `emqnote-thumb://`, which jsdom cannot serve, so no jsdom test gets past the chip. **15c, the ⧉, is still owed** — it hands the file to the OS, and no script here has an OS viewer to watch |  |

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
| 16i | Click a `[[…]]` link in the **capture window** | The library opens the target *and* offers a way back to the note you were typing in. **The window's half is written, 22 August 2026** (`capture-note-link.test.ts`): the chip's click calls `openWikiLink` with the path it was handed rather than the title it draws. What raising the library and the way back look like is main's, and is still this row |  |
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
| 17h | Do 17a–17d in the **capture window** — mostly driven | **17a and 17b are driven, 22 August 2026** by `npm run drive:capture`: the bar with its counter reading "/ 3", ◀ dimmed on page 1 and the arrows *not* hidden (which is a one-page document's state and a different thing), and ▶ clicked with a real pointer turning to page 2 — checked by **counting dark pixels off a canvas**, because a changed `src` is not a changed page. The fixture's pages differ by the height of a filled bar precisely so that count can tell them apart. **17c (a one-page PDF hiding both arrows) and 17d (Fit) are still owed**, and 17d is a judgement anyway |  |
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
| 18x | Do 18a–18n in the **capture window** — partly written | **22 August 2026**, `test/capture-document.test.ts`: 18a and 18c (a line to type on below a table, a code block and a rule), 18d–18f (one of two adjacent spellings drawn, both kept, two far-apart mentions left alone) and 18n (the divider, with a paragraph under it). **18g, 18h and 18i are not reachable and are not faked** — Mod+click and plain click on a markdown link go through ProseMirror's `handleClick`, which asks `posAtCoords` first, and those rows are *about* aiming. **18k** is the PDF bar and is driven now (see 17h); 18l's page box and 18m's narrow width are not. 18b is main's (B10) and 18j is covered in `capture-remote-images.test.ts` |  |

---

## 19. The three cornerstone features (B49, B50, B51)

Everything below has been driven under `Xvfb` in the **library** window except where it says
otherwise. What a person is here for is the capture window, the feel of a drag, and a machine
with a real network on it.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 19a | Drag across a 2×2 block of cells in a table | Exactly those four cells are tinted, including the header row. Nothing outside the rectangle |  |
| 19b | Judge that drag on a real display — NEVER JUDGED BY EYE | Does the rectangle follow the pointer without lag or flicker? Does the browser's own blue text selection ever flash over it? That the drag *lands on the right four cells* is settled in the capture window — `npm run drive:capture` does it with a real pointer — so what is left here is the feel, and the reader window, which nothing drags in yet |  |
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
| 19t | Judge the panel at a short window height — NEVER JUDGED BY EYE | Sixteen rows is taller than some windows. It should flip above the caret and scroll rather than run off the screen. That it *fits* is settled — `npm run drive:capture` measures the panel against the window with the caret near the foot, and it flips (331px of panel, 600×720 window). Whether the flip reads as a decision rather than a jump is still yours |  |
| 19u | Do 19a–19s in the **capture window** | Identical behaviour. **Written against the harness, 22 August 2026** — `test/capture-table.test.ts` for the rectangle and the toolbar, `test/capture-remote-images.test.ts` for the setting reaching the node views, and: `test/capture-slash-menu.test.ts` for the menu opening, filtering, Escape, the keyboard walk and all four main-side items through this window's own closures. What is left here is the pointer, the pixels and the network, which §36 and 19i–19m cover |  |

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
| 20m | Do 20a, 20f, 20h–20k in the **capture window** — **mostly not reachable by the harness** | Identical behaviour. Measured 22 August 2026: **20j is covered** (`capture-table.test.ts` — Backspace on a rectangle empties exactly those cells). The rest are not, and for two different reasons. 20a is a panel *scrolling*, which jsdom does not do at all. 20h, 20i and 20k are Shift+arrow *within* a cell's text, which ProseMirror leaves to the browser and reads back — and jsdom moves no selection of its own, so the step that the guard is about never happens; `table-selection.test.ts` owns it at the state level. 20f is a CSS rule and is `styles-quote.test.ts`'s |  |

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
| 22s | All fourteen, in the **capture window** — NEVER TESTED THERE | The limitation this used to name is gone; what is left is which rows apply. Of the two that live in that window, **22q's link half is written** (`capture-document.test.ts`: a plain `[[x.pdf]]` chip goes to the app's own resolution and never straight to the OS) and its ⧉ half is still owed (see 15k). **22r, the date field ellipsing at a narrow width, is layout** and belongs with 19t and 36c |  |

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
| 23j | All six, in the **capture window** — the paste especially | **The paste is written, 22 August 2026** (`capture-document.test.ts`): a `[[path\|Title]]` on the clipboard becomes a real chip in this window, an `![[foto.png]]` becomes an embed, and a bare `[dit]` stays text. 23h was already driven live. The rest are Windows or a real OneDrive |  |

---

## 24. The trash delete, second attempt (16 August 2026)

**This section exists because §23a failed.** B57 removed this app's own directory handle
and the report came back word for word the same, so nothing here should be read as "the fix
is in, please confirm". What shipped this time is a *question that answers itself*: the
refusal now carries the operating system's own error code and names the file that refused,
and `--trash-probe` walks the folder without deleting anything.

If 24a fails again, **the failure message is now the report** — copy it verbatim, run 24c,
and paste both. That is enough to settle it without another round of guessing.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 24a | **Windows.** Put a folder in the trash, then **Delete permanently**, and confirm | It goes, and is gone in Explorer. If it does not, a dialog appears ending in a line like `EBUSY — _trash\Alpha\offerte.pdf`. **Copy that line exactly** — the code and the path are the whole of what is being asked for |  |
| 24b | If 24a failed: quit emqnote from the tray and delete the same folder in Explorer | If it goes now, this app is holding it after all and the next fix is in the app. If Explorer refuses too, it is not — that is a different fix, and just as useful to know |  |
| 24c | If 24a failed: with emqnote running again, `emqnote --trash-probe="_trash\<folder>"` from a terminal | A line per entry, then a summary. It deletes nothing, so it is safe to run repeatedly. Paste the whole output |  |
| 24d | **Windows.** Delete a *file* out of the trash | Still works, as it always did. If this ever starts failing too, say so — it would mean the cause has moved |  |
| 24e | **Clear trash** with something in it that will not go | The rest of the trash empties anyway, and one dialog names what stayed. Nothing should be silently left behind without a word |  |
| 24f | Anywhere. Open a note in the trash, then Delete permanently on the folder holding it | The reader lets go first, so the delete is not blocked by this window's own preview. No stale reader afterwards either |  |
| 24g | **Windows.** Delete permanently with the library window minimised behind something, then bring it back | It really deleted. The first version of the "let go first" change waited for a frame, which never comes to a throttled window — the button did nothing at all |  |

---

## 25. Reaching the app (17 August 2026)

Four of that batch's six items are about getting *to* emqnote, and two of them can only be
answered on Windows. §25a is the sharpest: like Ctrl+Tab before it, the failure does not
reproduce on this sandbox at all, so what shipped is a claim at the earliest point in the
window rather than a fix for a known cause. If it fails again, that is real information and
not a wasted round — the next step is a second chord beside the first, and knowing this one
did not work is what justifies it.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 25a | **Windows.** In a new note, type a line and press **Ctrl+Shift+T** | The line becomes a task with a checkbox. Try it in the library's reader too. If it still does nothing, say so plainly — that is the answer this exists to get |  |
| 25b | **Windows.** Same chord with the caret in the *subject* field, and again with a note row selected in the list | Nothing happens, in both places. It is an editor command and always was; this is only here so "it does nothing" can be told apart from "it does nothing *there*" |  |
| 25c | **Windows.** Sign out and back in, with *Start at login* ticked | emqnote is running — the tray icon is there — and **no window appeared**. That is the whole point of the silent path |  |
| 25d | **Windows.** Now start emqnote from its Start-menu or desktop shortcut | The library window opens. Do it again while it is still running: the library comes to the front, not the note window |  |
| 25e | **macOS.** Same pair: a login start shows nothing; opening emqnote from Spotlight or Finder opens the library | As above. macOS reads its own `wasOpenedAtLogin` as well as the flag, so both halves are worth checking |  |
| 25f | Untick *Start at login* in the tray, tick it again, then sign out and back in | Still silent. The tray checkbox rewrites the login entry, and the flag has to survive that — it is the one place it could quietly be lost |  |
| 25g | Press **Ctrl/Cmd+Shift+B** while in Outlook, Word, or anything else | The library opens. This is a new machine-wide claim (B60) |  |
| 25h | While emqnote runs, check whether anything you use has lost that chord — classic Outlook binds Ctrl+Shift+B to the Address Book | If it is in the way, change it in Settings → *Shortcut for the library*. Say which chord you moved to; the default is a guess and worth revisiting |  |
| 25i | Settings: record a new chord for each of the two shortcuts in turn, then use **both** | Changing one must not silently kill the other. That is the specific hazard of having two — one function registers both, and this is the check on it |  |
| 25j | Open the help sheet with **Ctrl+/** from inside a note, close it with **Escape**, then press Tab | Focus is back where you were, and Tab moves on from there — not from the folder tree's *+ New*. Close it the second way too (Ctrl+/ again) |  |
| 25k | The same in the capture window, and in the Settings panel | Same behaviour. Settings additionally now takes focus when it opens, so Escape closes it without clicking inside first |  |
| 25l | Make a bulleted line entirely bold, then a numbered one, then a task | The bullet, the number and the checkbox go bold with the text. Bold only *part* of a line and the marker stays as it was |  |
| 25m | The same with italic, and on a real display: does the slanted checkbox read as deliberate or as a rendering fault? | A judgement no script can make. If it looks wrong, say so — it is one CSS rule |  |

## 26. Reaching the note (18 August 2026)

Four new chords, one Escape that stopped doing two things, and the one item this whole batch
is actually waiting on: **`--key-probe`'s output from the Windows machine.** `Ctrl+Shift+T`
was claimed at the earliest point in the window on 17 August and reported dead again, so the
app has stopped asserting a cause and started reporting one. §26a is the deliverable.

Everything else here has been driven on Linux under `Xvfb`, in **both** windows including the
capture window, with real computed colours and real XTEST keys where nothing else reaches
`before-input-event`. What is left for a person is the Windows half, and how it all feels.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 26a | **Windows.** Quit emqnote from the tray. Start it as `emqnote.exe --key-probe`. Put the caret in a note and press, one at a time: **Ctrl+Shift+T**, **Ctrl+Shift+D**, **Ctrl+Shift+L**, **Ctrl+F**. Quit, then send `%LOCALAPPDATA%\emqnote\key-probe.log` | Four lines, each naming what the app thinks the chord is. **A missing line is the finding** — it means the key never reached the window, and nothing in this app can be responsible. Send the file whatever it says; that is the point |  |
| 26b | **Windows.** With the app running normally, type a line in a note and press **Ctrl+Shift+D** | The line becomes a task with a checkbox. This is the second chord for the item `Ctrl+Shift+T` was supposed to make. If **both** now work, say so — that matters as much as if neither does |  |
| 26c | **Windows.** And **Ctrl+Shift+T** once more, in the note window and in the library's reader | Whatever it does. Unchanged is a real answer here, not a failure of the round |  |
| 26d | In the library, with the caret in a note, press **Ctrl+F** and type a word that occurs several times | A bar appears over the note. Every occurrence is highlighted, the current one more strongly, and the counter reads "1 of n" |  |
| 26e | Press **Enter** repeatedly, then **Shift+Enter** | It walks forward through the matches and back again, wrapping, scrolling each one into view. The caret stays in the search box the whole time |  |
| 26f | Press **Escape** | The bar and the highlights go, and the caret is left **on the match you had reached**, ready to type. Check the note is not marked as changed |  |
| 26g | Now click a folder in the tree (or a note row) and press **Ctrl+F** | The caret goes to the vault search box at the top of the note list — *not* the find bar. One chord, two searches, decided by where you were |  |
| 26h | The same **Ctrl+F** in the new-note window | The find bar, always — that window has no vault search |  |
| 26i | On a real display: do the two highlight colours read as "all matches" and "this one"? And can either be confused with `==highlighted==` text or with the yellow the Tasks view uses? | A judgement no script can make. They are three deliberately different colours; if two of them fight, say which |  |
| 26j | With a long note open, does the bar sit somewhere sensible, and does it get in the way of the text it is searching? | Same kind of question. It is fixed at the top right of the note pane and does not scroll with the text |  |
| 26k | In the library, press **Ctrl+N** | A new note window opens, filed into the folder the tree is standing in — the same folder the "+ New note" button would use |  |
| 26l | Open the *Move to…* dialog, then press **Ctrl+N** while it is up | Nothing happens. A dialog owns the keyboard while it is open |  |
| 26m | With the caret in a note, press **Ctrl+Shift+R** | The note's title is selected and ready to retype: the subject field in the new-note window, the title above the reader in the library. Enter commits, Escape cancels |  |
| 26n | The same in the library on a note that is open in the new-note window | Nothing happens. That note is claimed, and renaming it from here is the "one note in two folders" hazard |  |
| 26o | **The Escape fix.** With the caret in a note, right-click for the menu, then press **Escape** | The menu closes and the caret is still **in the note**. Before this, that one press also threw focus out into the note list |  |
| 26p | The same with the help sheet (**Ctrl+/**, then **Escape**), and with the `/` menu (type `/` on an empty line, then **Escape**) | The same: focus stays in the note. The `/` you typed stays where it was. Compare against closing the help sheet with **Ctrl+/** a second time, which was always correct |  |
| 26q | And with nothing open, press **Escape** with the caret in a note | Focus *does* leave for the note list. That behaviour is deliberate and had to survive the fix |  |

## 27. Tags in the header and the tags in the note (19 August 2026)

Two changes and one bug that only running it found. **B65**: the `#tag`s in a note body are
now written into `tags:` when the note is saved, so the header stops showing an empty Tags
field for a note whose tags are all in the sentences. **B66**: that field completes from the
tags the vault already has. And the third thing is why this section exists at all — the field
keeps its own half-typed text, that text belonged to no particular note, and switching notes
without leaving the field first showed it for the *new* note and committed it there on the
next blur. Measured in the running app: a note whose `tags: [klantx, offerte, klachten]`
became `tags: [kla]`.

Everything below has been driven on Linux under `Xvfb`, in **both** windows, against a vault
with an imported note (tags only in the body) and a hand-written one (tags only in the
header). What is left for a person is what a script cannot judge, plus one thing worth
checking on a real OneDrive.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 27a | Open a note whose tags are written in the text as `#tag` and nowhere else | The Tags field is **empty**, and the tags appear beside it as chips you cannot type in. Hovering one says where it does come out |  |
| 27b | Without touching anything, close the note and check the file | Unchanged — same bytes, same timestamp. Looking at a note still writes nothing (B10) |  |
| 27c | Now type one character in the body, wait a second, and look at the file | `tags:` has appeared in the frontmatter holding those same tags, and the body is exactly what it was apart from your character. In particular a line-initial `#klantx` has **not** gained a backslash |  |
| 27d | Type in it again and check the file's timestamp | It writes once, not once per save: with the tags already hoisted, the next save compares equal and touches nothing |  |
| 27e | Delete one of the `#tag`s out of the sentence, type something, and look again | That tag is gone from `tags:` too, and the chip beside the field is gone. This is the case the whole design exists for — without it a hoisted tag could never be removed by any gesture at all |  |
| 27f | **The cost, on a real OneDrive.** Open a handful of imported notes carrying body tags and edit each one | Each gets one frontmatter rewrite, the first time it is touched. That is accepted (B65) — but if it produces conflict copies on a busy vault, that is the thing to report |  |
| 27g | Click into the Tags field of any note | A short list appears under it: the vault's own tags, most-used first, with a count beside each |  |
| 27h | Type a few letters | It narrows. Arrow keys move the highlight, **Enter** or **Tab** takes the highlighted one, and the caret is left after it ready for the next tag |  |
| 27i | With two tags in the field, put the caret back in the *first* one and type | It completes that word, not the whole field, and leaves the other tag alone |  |
| 27j | Press **Escape** with the list up | The list closes, the caret stays in the field, and what you had typed is still there. It must not jump out to the note list — that is one press doing two things (B64) |  |
| 27k | Look at what is **not** offered | Tags the note already has, whether typed in the field or written in the text. Offering a body tag would be an offer to write something that is already there |  |
| 27l | **The buffer.** Type a few letters into the Tags field of one note and then click straight onto a different note, without clicking away from the field first | The new note's own tags are in the field. Your half-typed letters are gone, and above all they are **not** written into the note you just opened. Check that note's file |  |
| 27m | The same in the new-note window: type into the Tags field, then press Ctrl+Enter to save and dismiss, then bring the window back up | The field is empty. Nothing is carried over from the note you just put away |  |
| 27n | On a real display, with a note that has three or four body tags: does the row still read as one field with some labels beside it, or does it look crowded? | A judgement no script can make. The field keeps its own width and the chips wrap |  |
| 27o | And does the completion list, opening under the field, cover anything you needed to see? | Same kind of question. It floats over the note rather than pushing the header taller, deliberately — the header is a fixed two-row grid so that nothing moves while you type |  |

## 28. The folder tree's task count (19 August 2026)

**B67**: a folder's badge reads `[# notes] / [# open tasks]`. Only for a folder that holds
notes, and neither number is rolled up out of the subfolders — both count the notes filed in
that folder itself. The count comes out of the index, not out of a walk over the folder, so
what a real vault can answer that this sandbox cannot is what it *costs* on a few thousand
notes.

| # | Step | Expected | ✓ |
|---|---|---|---|
| 28a | Open the library on your real vault and look down the folder tree | Every folder that holds notes carries two numbers with a slash between them. Folders holding only subfolders carry nothing, as before |  |
| 28b | Pick a folder you know has unfinished work in it | The second number is the count of unticked boxes in the notes **directly in that folder** — not in the folders under it. Count one by hand and check |  |
| 28c | Pick a folder where every box is ticked | It reads `n / 0`, in the same muted grey as the note count. A `0` is a fact, not an alarm |  |
| 28d | Hover the badge | A tooltip: "Notes here: 3 · Open tasks: 2" |  |
| 28e | Open a note and tick a box | Its folder's second number goes down within a second or so. Untick it and it comes back |  |
| 28f | On the **other machine**, tick a box in a note in a synced folder, then wait for OneDrive | The badge here follows without touching anything — that is the watcher's path, not the app's own save |  |
| 28g | **The cost, on a real vault.** Open the library on the biggest vault you have and watch the tree appear | The folder names and their note counts must appear **immediately**; the task numbers may arrive a moment later. If the whole tree waits, that is the bug this was built to avoid, and worth reporting with the vault's note count |  |
| 28h | Watch the badges in that first moment | A folder shows its note count alone until its task count arrives, never `n / 0` first and then `n / 5`. A flicker through zero is a defect |  |
| 28i | On a real display, with your longest folder name in a narrow sidebar: do the name and the two numbers still fit? | A judgement no script can make. The name truncates and the badge stays at the right-hand edge |  |

## 29. Discarding, counting and remembering (19 August 2026)

Three items from daily use — **B68** (a new note can be thrown away), **B69** (the note list
says `[open] of [total]`) and **B70** (the caret survives a note switch) — plus the one thing
this round deliberately did *not* fix.

All three were driven under `Xvfb` over CDP on Linux, with real computed colours, real files
on disk and real hash/mtime comparisons. What is left here is what a script cannot judge, and
the Windows machine.

### ~~The chord that is still dead~~ — answered and closed, 19 August 2026 (B71)

**Nothing to test here. It is kept for the method, not as work**, and no shortcut changed.

`Ctrl+Shift+T` was reported dead on Windows three times and repaired twice. On the third report
nothing was guessed and `--key-probe` was run instead:

```
capture key="T" code=KeyT ctrl=false shift=true  claim=—            ← Shift+T arrives
capture key="t" code=KeyT ctrl=true  shift=false claim=—            ← Ctrl+T arrives
                                                                     ← Ctrl+Shift+T: no KeyT line
capture key="c" code=KeyC ctrl=true  shift=false claim=—            ← a Ctrl+C instead
capture key="D" code=KeyD ctrl=true  shift=true  claim=task:editor  ← 5 of 5
```

The T key works and the Ctrl variant works; that one combination did not arrive, and it was not
swallowed but **substituted** — a `Ctrl+C` came back in its place, Shift stripped and lowercase.
That substitution was the clue: a passive `RegisterHotKey` grab produces silence, while an
injected keystroke means a macro tool. **It was an AutoHotkey script the machine's own owner had
written**, intercepting `Ctrl+Shift+T` and sending `Ctrl+C` to escape another command. Not
Windows, not Chromium, not this source tree — so nothing was changed, and `Ctrl+Shift+T` remains
the chord the help sheet prints first with `Ctrl+Shift+D` beside it.

The lesson is for the next report of this shape, and it is the third time this project has paid
for it (§23/§24 and §26 are the other two): **a diagnosis that survives its own report is
incomplete rather than wrong, and the way out is to measure rather than repair again.** Two fixes
shipped against a cause nobody had measured. The probe took one run. Reach for it earlier.

### Discard (B68)

| # | Step | Expected | ✓ |
|---|---|---|---|
| 29f | Open a new note, type a subject and a sentence, wait two seconds, then click **Discard** in the status bar | The window closes. The note is **not** in the folder it was being filed into, and **is** in the trash with everything that was typed still in it |  |
| 29g | Look in the folder again half a minute later | Still not there. Every close runs a commit, and this is the one that must not put it back |  |
| 29h | Discard it out of the trash's own **Restore**, into the Inbox | It comes back whole. This is the way back that is why Discard asks nothing first |  |
| 29i | Open a new note, type two letters, and click **Discard** within a second — before the 800 ms write | Nothing appears in the folder at all, then or later |  |
| 29j | Open an existing note from the library into the capture window (double-click a row) | There is **no** Discard button. A note that lives in the library is not this window's to throw away |  |
| 29k | **On a real vault on OneDrive**: discard a note and watch the sync icon | The file moves into `_trash` and syncs from there. It is a rename, so OneDrive should not produce a conflict copy |  |
| 29l | Does "Discard" beside "Insert" and "?" read as a button you could hit by accident, at the real window size? | A judgement no script can make. If it does, it wants moving or restyling — not a confirmation dialog, which B54's argument already answers |  |

### The note list's task count (B69)

| # | Step | Expected | ✓ |
|---|---|---|---|
| 29m | Open a folder with a mix of notes | A note with unfinished boxes reads `2 of 5` in the accent colour under the date, right-aligned. A note with every box ticked reads `0 of 5` in grey. A note with no boxes at all says nothing |  |
| 29n | Compare a note that has People with one that does not | The count sits at the same right-hand edge in both. People keep their own place on the left |  |
| 29o | Add the numbers of the notes in one folder and compare with the folder's own badge | They agree exactly — both come from one query. A disagreement is a real bug, and worth reporting with both numbers |  |
| 29p | Tick a box in a note and watch its row | It goes `2 of 5` → `1 of 5` within a second, and the folder badge follows |  |
| 29q | Open a tag, a person and a search | The counts are there too — those lists come from the index, so nothing should be missing |  |
| 29r | **The cost, on a real vault.** Open the library on the biggest vault you have | The note list must appear immediately; the counts may arrive a moment later. If the rows wait for them, that is the split this was built around failing, and worth reporting with the vault's note count |  |
| 29s | On a real display, in a narrow note pane, with a long list of attendees: do the names and the count still fit? | A judgement no script can make. The names truncate; the count stays at the right-hand edge |  |

### Caret memory (B70)

| # | Step | Expected | ✓ |
|---|---|---|---|
| 29t | Open a long note, click halfway down it, open another note, then come back | The caret is where you left it — Tab or click into the note and start typing to see where it lands |  |
| 29u | Open a note for the first time | It starts at the top, as it always has. Only a note you have already been in remembers |  |
| 29v | Click a task in the Tasks view for a note you had open before, with the caret somewhere else in it | It goes to the **task**, not to the remembered caret. The destination you named wins |  |
| 29w | Do all of that and then check the note's file | Nothing written: no `modified` bump, no changed bytes. Opening a note still touches nothing (B10) |  |
| 29x | Quit and relaunch, then open that same note | Back at the top. This is in memory for one sitting only, which is what was asked for — if you find yourself wanting it to survive a restart, that is a new decision, not a bug |  |
| 29y | Leave a note open, edit it on the **other machine**, let it reload, and look at the caret | It lands somewhere sensible rather than throwing or jumping to the end. A note that got shorter is the case this is guarding |  |

## 30. A stale clock, a row that should not be there, a star and a place (19 August 2026)

Two bugs and two additions — the When field's stale time, the Unlinked attachments row,
**B72** (a bullet can be flagged with a star) and **B73** (the Where field completes from the
vault's own locations).

**Everything in this section is unwatched.** Unlike every batch before it, none of this has
been driven under `Xvfb` over CDP: it is built, typechecked and covered by unit tests,
and nobody has seen it run. So this section is not "what a script cannot reach" — it is the
whole of the batch, and the first four rows are the ones to do first.

| # | Do this | Expect | ✓ |
|---|---|---|---|
| 30a | Press the hotkey, look at When, press Escape. Wait two minutes. Press the hotkey again | The time is **now**, not two minutes ago. This is the bug: the stamp used to be taken when the previous note was put away |  |
| 30b | Do the same but leave with **Discard** instead of Escape, which is the quickest way round the loop | Same answer. Discard is how this was noticed, being the fastest hide-and-show there is |  |
| 30bb | Start typing a note, then press the hotkey again while that window is still open and half-typed | The When field does **not** move. The message that re-stamps it is sent on every press, so this is the case the fix has to not break |  |
| 30c | Type a note, let it save, and look at the **filename** on disk | Its `YYYY-MM-DD HHmm` prefix matches the When field and the frontmatter's `created`. All three come from one value now; before this the filename had a clock of its own |  |
| 30d | Before typing anything, change the date in the When field to something else, then type a note | The file is named after the date you set, not after the moment the window opened. Check the frontmatter agrees |  |
| 30e | Type a note, let it save, then change the **subject** and close | It renames, and the timestamp in the new name is unchanged. The prefix is decided once, at the first write |  |
| 30f | Open the library on a vault with nothing unlinked | No **Unlinked attachments** row in the sidebar footer at all |  |
| 30g | Copy a picture into `_attachments/` from outside the app and wait for the watcher | The row appears |  |
| 30h | Open that pane, then delete the file from it | The row **stays** while you are standing in the pane — there would otherwise be no way back out of the screen you are looking at |  |
| 30i | Click away to a folder, then look at the footer | Now the row is gone |  |
| 30j | Launch the library on a big vault and watch the footer for the first second | The row does not appear *late*. It is drawn until the count is known, so nothing jumps |  |
| 30k | Type a bullet, put the caret in it, press **Ctrl+Shift+S** | The bullet is replaced by a ⭐. Not a star *beside* a bullet — the bullet is gone |  |
| 30l | Press it again | The bullet is back |  |
| 30m | Do it on a nested item, two and three levels deep | The star draws at every depth, and the item stays lined up with its siblings |  |
| 30n | Save, and look at the file | `- ⭐ Bel Jan`. Then run `npm run canonical` on it — byte-identical |  |
| 30o | Open that file in **Obsidian** | It reads as `• ⭐ Bel Jan`. That is the escape hatch working, not a defect |  |
| 30p | Put the caret on a starred item and press **Ctrl+Shift+T** | It becomes a task and the star goes. The box stands where the star did; the two cannot both be drawn |  |
| 30q | And the other way — Ctrl+Shift+S on a ticked task | It becomes a starred bullet and the box goes |  |
| 30r | Ctrl+Shift+S inside a **numbered** list | Nothing happens, deliberately: the number is the marker there. Same in ordinary prose outside a list |  |
| 30s | Right-click in a bulleted line, then in an ordinary paragraph | "Star for attention" is on the first menu and absent from the second, the way the table items are |  |
| 30t | Press Enter at the end of a starred item | The new item is a plain bullet. A star says *this one* |  |
| 30u | Select a starred list and copy it into a mail | The stars come with it: `- ⭐ Bel Jan` |  |
| 30v | Write a note in Obsidian containing `- [ ] ⭐ Iets` and `1. ⭐ Iets`, then open it here | Both keep their star as ordinary text and neither draws as flagged. Save and check the bytes are untouched |  |
| 30w | Do 30k–30n again in the **capture window** | Same throughout. It has no unit-test harness, so this is the half that only a person sees |  |
| 30x | Click into the Where field on a vault with a few locations in it | A list appears, most-used first, and not before you click |  |
| 30y | Type `kantoor a` | It narrows to "Kantoor Amsterdam" — matching across the space is the point, since a location is one value and not a list |  |
| 30z | Arrow down, press Enter | The whole location goes in the field and the caret stays there. Enter did not also jump into the note |  |
| 30aa | Type something, press **Escape** | The list closes, what you typed stays exactly as it was, and the caret is still in the field — the header did not jump |  |
| 30ab | Open the Tags list, Tab to Where, arrow down | Only the Where list moves. Both can be open at once and they do not share a highlight |  |
| 30ac | Do 30x–30ab in the **capture window** too | Same throughout |  |

Two judgements no script can make, and they are the reason this section ends here rather than
in a test file: **whether a ⭐ reads well against the bullets around it** at a real editor width
and on a real display — it is a colour emoji among monochrome markers, which is either exactly
the point or too loud — and **whether the Where dropdown sits comfortably over the Who field
beside it**, that cell being bottom-left in the header grid with a field immediately to its
right.

## 31. Task counts, marker alignment and resizable images (20 August 2026)

Two constraint changes and **B74** (a picture can be dragged smaller by a corner, and that
width is in the file). All three were driven under `Xvfb` over CDP, including in the capture
window, so this section is back to being what a script cannot reach — with one exception that
is the reason it exists at all.

**The exception is the emoji, and it is the first row.** The star and the checkbox are aligned
onto the bullet by a positioned box rather than by a tuned font size, precisely so a different
emoji font changes the star's *size* and not its *centre*. That reasoning has been measured on
Noto Color Emoji and nowhere else. Apple Color Emoji and Segoe UI Emoji are what §31a is for,
and a bad answer there is a real bug, not a taste question.

| # | Do this | Expect | ✓ |
|---|---|---|---|
| 31a | On **both** macOS and Windows, write a list with a plain bullet, a starred bullet (`- ⭐ `) and a task item, one under the other | All three markers on one horizontal line and in one vertical column. Hold a straightedge to the screen if it is close. This is the one thing Linux could not answer |  |
| 31b | Same list, but nest the starred item two and three levels deep | Still in that level's own column, against the `◦` and `▪` of its siblings |  |
| 31c | Bold a whole starred line | The star does not change — an emoji has no bold. Nothing is lost: it never did |  |
| 31d | Look at a note in the list that has open tasks | `Tasks: 2` in the accent colour. Hover it: the tooltip still says `Open tasks: 2 / 5` |  |
| 31e | Tick the last open box in that note | The badge disappears entirely. It used to read `0 of 5` |  |
| 31f | Compare a note with attendees against one without, both with open tasks | With: the count sits right of the People line. Without: right of the excerpt, and there is no third row at all |  |
| 31g | Insert a picture, click it once | Four small handles on its corners — on the picture's corners, not the paragraph's |  |
| 31h | Drag a corner inwards | It follows the pointer, keeps its proportions, and the rest of the note reflows around it |  |
| 31i | Let it save and `cat` the file | `![[…|400]]` or thereabouts. Reopen the note: the same size |  |
| 31j | Open that note in **Obsidian** | The picture is the size the file says. This is the whole reason for the spelling |  |
| 31k | Drag a corner outwards, past the width of the pane | It stops at the column and does not run off the edge |  |
| 31l | Double-click a handle | Back to the picture's own size, and the suffix is gone from the file |  |
| 31m | Resize, then press Ctrl+Z once | One undo step, not one per pixel |  |
| 31n | Do 31g–31i in the **capture window**, on a pasted screenshot | Same behaviour. This is where notes are actually written |  |
| 31o | Put a resized picture inside a folder of attachments and rename the folder | The link is repaired **and the width is still there** |  |
| 31p | Click an embedded PDF page | No handles. It has the Fit control instead, which is B46's deliberate answer |  |
| 31q | Open a note written in Obsidian holding `![[foto.png|250x180]]` | The picture draws at exactly that box, even if it distorts it — the file said so |  |
| 31r | Open one holding `![[foto.png|een foto van het kantoor]]`, type a character anywhere in it, let it save, and `cat` the file | **The suffix is still there.** Until B74 it vanished on that save, silently, and that is the bug this row exists for |  |
| 31s | Drag a corner of the `250x180` one | Both numbers scale together — it keeps the shape the file gave it and comes back `|WxH`, not a bare width |  |
| 31t | Drag a corner of the one carrying alt text | It becomes a width and **the alt text is gone**. One slot, one meaning: the accepted cost of B74, pinned in `test/limitations.test.ts` — check it does not surprise you on a real vault |  |
| 31u | Put `![[foto.png|250X180]]` in a note, open it here and in Obsidian | Full size in both. A capital `X` is not a size to either app — checked in Obsidian on 20 August 2026, which is what makes it agreement rather than a divergence. It also survives a save here, being kept as alt text |  |

Two judgements no script can make: **whether four 9px handles are comfortable to grab** with a
real mouse or trackpad at a real display density, and **whether a picture dragged very small
still reads as deliberate** rather than as something that failed to load. The floor is 40px,
which was chosen so there is always something left to grab; whether that is also the point
below which it stops looking intentional is a thing only using it can say.

## 32. Markers on a picture's line, big numbers, the sidebar walk and the pin (20 August 2026)

Seven items from daily use, four of them landing on §31's own work the same day. One carries
a decision: **B75**, a note can be pinned to the top of the list and the pin is in the file.

**Two things here have never been driven live**, and they are §32k–§32m and §32n: the
sidebar's widened arrow walk and the pin limit's refusal. Both have real-DOM tests that
dispatch real events and read `document.activeElement`, which is not the same as pressing the
key. Everything else in this section was measured off live screenshots under `Xvfb` — the
markers to the pixel — so a failure elsewhere here is a genuine surprise.

**And §32a is a whole platform, again and sharply.** §31a asked the same question and was
answered by *centring* the star, which is stable across emoji fonts. The alignment is by
**ink left edge** now, which is not: the width of `⭐` varies by platform font, and the value
that places it was swept on Noto Color Emoji, where it sits in the middle of a four-step
plateau. Apple Color Emoji and Segoe UI Emoji are what §32a and §32b are for.

| # | Do this | Expect | ✓ |
|---|---|---|---|
| 32a | On **both** macOS and Windows, write a plain bullet, a starred bullet and a task item, one under the other | All three markers starting in the same vertical column and sitting on the same line. The reference is where the *ink starts*, not where its middle is |  |
| 32b | Same three, nested two and three levels deep | Still one column at that level. The `▪` of level three is a wider glyph and legitimately starts further left; the star and the checkbox must not |  |
| 32c | Paste a picture into a bulleted line, so the line is much taller than one line | The bullet sits at the **bottom** of the picture, level with the text on that line |  |
| 32d | Do the same on a task line and on a starred line | The checkbox and the star sit at the bottom too, level with the bullet and the text. They used to sit at the top of the picture |  |
| 32e | Click the checkbox on that line | It still ticks. It moved into the paragraph as a widget; it is still a control |  |
| 32f | Write a numbered list running past 999 (`998.` as a first line is enough) | `1000.` draws in full, with its full stop in the same column as `998.`. Nothing is cut off at the left edge |  |
| 32g | Look at an ordinary short numbered list in the same note | Indented exactly as it always was — the gutter grows for the whole note, but only past three digits |  |
| 32h | Type a word on a bullet, then hold Backspace until it *looks* empty, stopping while one space is left. Press Enter | The bullet is discarded and the caret is on an empty line at its start. This is the reported bug, and the one space is the whole of it |  |
| 32i | Build an outline three deep with items still to come below the caret, then Enter on an empty item in the middle of it | Nothing below is flattened to the top level. It climbs one level per press instead |  |
| 32j | Press Enter after a starred item in a **checklist** | The next line is an unticked checkbox, not a plain bullet |  |
| 32k | From the vault root, hold ArrowDown all the way to the bottom of the sidebar | Focus passes through every folder, then Tags, People, Tasks, Settings, Keyboard shortcuts, and finally Trash. It used to jump from the last folder straight to Trash |  |
| 32l | Unfold Tags, then arrow down through it | Each tag is a stop of its own. Enter on one selects it |  |
| 32m | Land on Settings with the arrows, then press Tab | Focus goes to the note list, as it does from a folder row. A row the arrows reach but Tab does not understand is the bug this is for |  |
| 32n | Pin four notes **in one folder** | The fourth is refused with a message naming three. Then unpin one and pin it again: allowed. (B77 narrowed this from the vault to the folder; §33 covers the narrowing itself) |  |
| 32o | Pin three in one folder, then pin one in a **different** folder | Allowed — a fourth pin in the vault. The count is the folder's, not the vault's, and not the list's either |  |
| 32p | Pin a note and `cat` the file | `pinned: true`, unquoted, and **`modified` is exactly what it was**. This is the row most likely to fail after an innocent-looking change |  |
| 32q | Note the file's timestamp in Explorer/Finder before and after pinning | The note does not move to the top of a folder sorted by date modified |  |
| 32r | Unpin it and `cat` again | The `pinned` line is gone entirely — not `pinned: false` |  |
| 32s | Switch the list between Modified, Created and Title | The pinned note stays at the top under all three |  |
| 32t | Open the same note in **Obsidian** | `pinned: true` shows in its properties and the note is otherwise untouched |  |
| 32u | Let OneDrive sync, then look on the **other machine** | The note is pinned there too. This is the whole reason the flag is in the file rather than in settings |  |
| 32v | Open a pinned note in the capture window, then try to unpin it from the library | Refused, with the "open in the note window" message — the same lock every other write in the library carries |  |

## 33. A pin per folder, a sort chooser, a notepad and a key for Discard (21 August 2026)

Five items from daily use, two of them corrections to §32's own work of the day before. Four
carry decisions: **B77** (the pin limit is per folder, and a pin orders only a folder),
**B78** (the sort labels are a field chooser), **B79** (the capture window is a notepad) and
**B80** (Discard gets a chord, and it is not Escape).

**Most of this was driven live under `Xvfb`** — including the refusal message, which §32n
had left unconfirmed and which is now the *first* thing checked here. **Two things were
not**: §33p, because there is still no capture-renderer harness to hand it a note from the
library, and §33h, which needs a note list longer than the pane to have anything to scroll.

**And §33m is a whole platform, twice over.** The window's new height is clamped against
`screen.getPrimaryDisplay().workAreaSize`, which is net of the macOS menu bar and dock and of
the Windows taskbar — three chrome heights this sandbox has none of. A laptop panel is what
that row is for.

| # | Do this | Expect | ✓ |
|---|---|---|---|
| 33a | Pin three notes in one folder, then a fourth in the **same** folder | Refused, with a message reading "in one folder" and naming three |  |
| 33b | Now pin one in a **different** folder | Allowed. Four pinned notes in the vault, three of them in one place |  |
| 33c | Pin one inside a **subfolder** of a folder that already has three | Allowed. A subfolder has an allowance of its own |  |
| 33d | `cat` the note pinned in 33b | `pinned: true`, and `modified` exactly what it was. B75's rule is untouched by any of this |  |
| 33e | With four or more pinned across the vault, unpin any of them | Never refused. Only pinning is |  |
| 33f | Select a folder holding pinned notes | They are at the top, above the sort, exactly as before |  |
| 33g | Now open a **tag**, a **person**, or type in the search box | The pinned notes are wherever the sort puts them — no longer first. They still carry the pin mark |  |
| 33h | Turn on "Keep pinned notes in view", pick a folder with more notes than fit, and scroll | The pinned rows stay against the top edge, opaque, with the rest scrolling under them. Then open a tag: **no shelf at all** |  |
| 33i | Clear the search box while standing in a folder | The pins come back to the top immediately |  |
| 33j | Click the sort control above the note list | A menu of Modified / Created / Title, with a tick on the current one |  |
| 33k | Pick a different one | The list reorders, the menu closes on its own, and the control now reads the field you picked |  |
| 33l | Reopen the library | It is still on that field |  |
| 33m | On a **laptop** — a 13" MacBook or a 1366×768 Windows machine — press the capture hotkey | The whole window is on screen, status bar included. Discard, Insert and ? are all reachable |  |
| 33n | Look at the note window's proportions | Taller than wide, and the body takes roughly twice the height it used to. All four header cells (When, Tags, Where, Who) still read cleanly |  |
| 33o | Start a new note, type a sentence, and press ⇧⌘⌫ / Ctrl+Shift+Backspace | The note is in `_trash` and the window is gone. Restore brings it back |  |
| 33p | Open an **existing** note from the library into the note window and press the same chord | Nothing happens. That note is not this window's to throw away, and there is no Discard button either. **Both halves are covered** since the harness landed — `capture-keys.test.ts` declines the chord for a handed-over note and `capture-session.test.ts` takes the button away — so this row is now a confirmation rather than a first sighting |  |
| 33q | Press Escape in the note window with a half-typed note | Still nothing — it neither saves-and-closes nor discards. This row exists because Escape is the key this feature must never acquire |  |
| 33r | Open the keyboard shortcuts sheet in the note window | Discard has a row. On a Mac it reads ⇧⌘⌫, on Windows Ctrl+Shift+Backspace |  |
| 33s | Click **Tasks** in the note list's header, then click Tasks in the sidebar | The same view, scoped to the same folder, both times |  |

## 34. The header's three completions, and a field that had no room left (21 August 2026)

Four items from daily use, all in the header block that both windows share. One carries a
decision: **B81** — the Who field completes from the people the vault already names,
revising the sentence in B66 that said it deliberately would not.

**None of this has been driven live.** The capture window is still the one route with no
test harness, and every one of these four is a thing you find with your hands rather than
with an assertion: how many Tabs it takes to cross a header, whether a list offers a tag
back after you delete it, whether a field is wide enough to type in. There are DOM tests
under `test/` for all four — they dispatch real events and read real properties — but
**jsdom implements no sequential focus navigation at all**, so 34a below is the one row in
this file that no automated test could ever have stood in for.

The two remaining items from that day's list — an "Exit tasks" button and Escape out of a
search — are **not in this release**; they are the library window's half and are still open.

| # | Do this | Expect | ✓ |
|---|---|---|---|
| 34a | Click into Tags, then press Tab **once** | The caret is in Where. Not in the suggestion list, and not nowhere |  |
| 34b | From Where, press Tab once more | The caret is in Who, which now has a list of its own |  |
| 34c | With a suggestion **highlighted** by the arrow keys, press Tab | It is accepted, as it always was. Tab only moves on when nothing is chosen |  |
| 34d | In Tags, type two tags the vault knows, then delete the first one | It is offered again, immediately, without leaving the field. This is the bug |  |
| 34e | Type a tag fully, so it matches one in the list exactly | It is still shown while you are typing it — it only disappears once you separate it |  |
| 34f | Open a note whose **body** carries five or more `#tags` | Three chips beside the field, then `+2`. Hover it: the rest are named in the tooltip |  |
| 34g | Look at the Tags field on that note | It is still wide enough to type in — roughly ten characters — rather than squeezed to nothing |  |
| 34h | Click into Who on a fresh note | A list of the people your notes name, busiest first. Asked now, not at startup — the hotkey must stay clear of it |  |
| 34i | Type part of a surname | It narrows. `jan vr` finds "Jan de Vries" — the terms match in order, across the space |  |
| 34j | Pick one with the arrow keys and Enter | The full name lands, followed by `, `, with the caret after it |  |
| 34k | Now type a second name and accept it | The first is untouched. Only the name the caret is in is replaced |  |
| 34l | Accept a name in the **middle** of a list of three | No doubled comma, no empty name, and the caret sits after the separator that was already there |  |
| 34m | Type a name with a space in it by hand, then a comma, then start another | The space never separates. "Jan de Vries" stays one name |  |
| 34n | Press Escape with the Who list open | The list closes and **nothing else happens** — the header is not left, the window is not dismissed |  |
| 34o | Open a note in the library reader and repeat 34h | The same list, in the other window. One component serves both |  |
| 34p | Put the vault somewhere with no index yet, or break it, then focus Who | An ordinary text field. No dialog, no error — a completion nobody asked for is not worth one |  |

## 35. A way out of the Tasks view and out of a search (21 August 2026)

The two items §34 said were not in that release. **Most of this was driven live** under
`Xvfb` — the "Exit tasks" button over `--click-button`, the keys over `xdotool` — and doing
so found the bug reading the code had not: Escape out of the Tasks view was handled on the
task pane, and did nothing whenever focus was not inside it, which is the two commonest ways
of being in that view. The window listener owns the key now. What is left for a human is the
part a sandbox with no window manager cannot judge and the platform differences.

| # | Do this | Expect | ✓ |
|---|---|---|---|
| 35a | Open Tasks from the **sidebar row** and press Escape without clicking anything else | Back to the folder you were in, its notes listed, the selected note focused |  |
| 35b | Open Tasks again and press Escape with the **scope dropdown** focused | The same. Anywhere in that view means the same thing |  |
| 35c | Open Tasks and click the empty space below the last task, then Escape | The same again. This is the case the first version failed |  |
| 35d | Open Tasks with a **note open** in the reader, click into the note, then Escape | Focus moves from the editor to the note list and the Tasks view **stays**. A second Escape leaves it |  |
| 35e | Click "Exit tasks" | Same destination as Escape. The two are one function |  |
| 35f | Type in the search box, then press Escape **in the box** | Query gone, the folder's own list back, focus on the selected note |  |
| 35g | Type in the search box, Tab or click to a **note row**, then Escape | The same, from the row |  |
| 35h | Press Escape on a note row with **no** search running | Nothing at all. Escape has never meant anything there and still should not |  |
| 35i | Type a query, click a **hit**, then press Escape twice | First press: out of the editor into the list. Second: out of the search. Two presses is correct here |  |
| 35j | Type a query and click the **×** | Same as Escape in the box. It is only there while there is something to clear |  |
| 35k | Empty the box by hand, with Backspace | The × goes as the last character does |  |
| 35l | On **Windows**, repeat 35a and 35f | Focus lands the same way. This is the platform where focus after a re-render has surprised this project before |  |

## 36. The capture window's harness (22 August 2026)

The window notes are written in stopped being the window nothing tests. Two pieces landed,
and they answer different questions — see `CONSTRAINTS.md` for where the line falls and why
it must not be blurred.

**`test/helpers/capture.ts` plus nine suites** (85 tests): the disk-change notice's three
branches (§10), the window-level chords including the Ctrl+Shift+Enter regression, what a
session is — the subject field, Discard, the half-typed tag buffer, the stamp on the way in —
the Insert routes reaching the document, and, since 22 August, the three cornerstone features
in this window: B51's `/` menu opening, filtering and routing all four of its main-side items
through *this* window's closures, B49's rectangle built with Shift+arrow and cleared with
Backspace, and B50's setting reaching every image node view — and, added the same day, the
note picker and a followed link (§13h, §16i), the table grid and Tab (§14n), what a note
written elsewhere looks like on arrival (§18x's reachable rows) and a pasted `[[…]]` (§23j).
None of it needs a display; all of it runs in CI on all three platforms.

**What the harness cannot reach is now measured rather than assumed**, and the protocol rows
say which is which — and where the driver has since taken it, they say that too: the inline
PDF page and its bar arrive over `fetch()` on a custom protocol jsdom cannot serve (§15k,
§17h, §18k, §22q's ⧉ — the driver now covers all but the ⧉), a click aimed at a markdown
link goes through `posAtCoords` (§18g–§18i), a panel scrolling and a field ellipsing are
layout (§20a, §22r), and Shift+arrow *within* a cell is a selection the browser moves and
jsdom does not (§20h, §20i, §20k).

**`npm run drive:capture`**: the real window under its own `Xvfb`, over CDP. Nine steps, each
one a thing only a real renderer can answer, and each exits non-zero by name. Four of them
are the halves no suite can have: a rectangle of cells dragged out with a real pointer,
whether the sixteen-row `/` panel fits on screen with the caret near the foot of the window
(it flips above it: 331px of panel in a 600×720 window), **a real three-page PDF drawing a
real page** — `naturalWidth 1240`, so pdf.js rendered rather than an `<img>` existing — and
**▶ turning to a page that is genuinely a different picture**, counted as dark pixels off a
canvas rather than trusted from a changed `src`.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 36a | `npm run drive:capture` | Nine `ok` lines and exit 0. Run it twice: a step that passes only on residue in the temp vault is the failure mode worth catching |  |
| 36b | `npm run drive:capture -- --screenshot=/tmp/capture.png` and look at the picture — NEVER JUDGED BY EYE | The capture window with a handed-over note in it: heading, the embedded picture, the `#klantx` chip beside the Tags field, the filename in the status bar. This is the first photograph of this window with real content in it |  |
| 36c | Judge the header against a real display — NEVER JUDGED | The driver asserts Tags/Where/Who are each wider than 40px, which is a floor and not a judgement. §34's "a field with no room" is about whether they are *comfortable*, and only you can say |  |
| 36d | Break something on purpose and re-run — for whoever next doubts the driver | It goes red on the step, names it, keeps the vault, and exits 1. Deleting the fixture picture is the cheapest way in |  |

| 36e | Judge the `/` panel and a dragged rectangle by eye — NEVER JUDGED | The driver settles that the panel *fits* and that a drag *selects the right cells*. Neither is the question §19b and §19t actually ask, which is whether the rectangle keeps up with the pointer and whether the flip looks like a decision rather than a jump. Only you can say |  |

**What neither piece reaches, and must not be claimed:** the PDF/Office thumbnail happy path
(no OS provider here or in CI), every "does this feel right" row, and everything Windows.

---

## 37. Two windows made one, bullets, search scope and four fixes (23 August 2026)

Six defects from daily use and two feature groups; `05-besluitenlog.md` B82–B84 carry the
decisions. Most of it was driven under `Xvfb` and photographed — the capture window's new
title and Actions menu, the reader's new footer, the search panel and the Tasks header are
all first sightings in the running app rather than inferences — so what is left here is
narrower than usual: the macOS judgement the bullets need, the Windows row, and the handful
of things that are somebody's opinion rather than a measurement.

**The bullet row is the one to read first.** The glyphs at levels one and two changed
(`\25CF`, `\25CB`) and every number around them was re-measured off a screenshot at four
times size *on Linux*. The reasoning behind them — that all three levels are Geometric Shapes
and so fall back to one face — is a claim about macOS's font fallback that has been made from
here and never seen there.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 37a | On **macOS**, open a note with a six-level bullet outline — NEVER SEEN ON THIS PLATFORM | Levels one and two are round and at least as big as the square at level three, and all three sit on one column and one line. The report this fixes is that the first two were the *smallest* |  |
| 37b | On **macOS**, put a bullet, a task and a starred item on one level, at levels one, two and three — NEVER SEEN ON THIS PLATFORM | The marker, the checkbox and the star line up on both axes at every level. Measured within a quarter-pixel here; the constants are shared, so a face with different side bearings is what would break it |  |
| 37c | On **Windows**, the same two — NEVER SEEN ON THIS PLATFORM | Unchanged from before, or better. Segoe UI drew all three of the old glyphs, so Windows had the mildest version of this bug and has the most to lose from the fix |  |
| 37d | Type into Tags and into Who with the capture window dragged as narrow as it goes | Both completion panels stay inside the frame. They are the two cells in the grid's right-hand column, and they are the ones that used to paint out through it |  |
| 37e | Open the shortcut sheet in both windows — judge by eye, NEVER JUDGED | Two columns of roughly equal height, no scrolling in the library, and the groups still read in their declared order down one column and then the next. The balance is arithmetic; whether it *looks* balanced is yours |  |
| 37f | In the capture window: begin a note, open Actions, press Escape, then `Mod-Shift-Backspace` | The menu holds Discard and nothing else, with its chord beside it. Escape closes the menu and does not throw the note away — Escape is the key this window must never give to Discard (B80) |  |
| 37g | Hand a note over from the library to the capture window | No title field, no Actions button. Both belong to a note this window began |  |
| 37h | Click the title in the reader, then Tab away and back — judge by eye, NEVER JUDGED | The `<h1>` and the input trade places without the text moving, and the focus outline is the capture window's accent, not a system ring. The first version of this rule changed nothing at all and looked fine |  |
| 37i | Search inside a folder that has subfolders, then press the scope button | Hits are confined to the folder and everything under it, then widen to the vault. The button names the scope in force, not the one it switches to |  |
| 37j | Search, widen, leave with Escape, then search again. Then widen and click another folder | Both times the scope is back to the folder. Widening is asked for per search and must not follow you |  |
| 37k | Stand on a tag or a person and search | No scope button, and the search is vault-wide. Neither has a folder to mean |  |
| 37l | Press `Mod-F`, read the panel, press Escape, press Escape again | The panel opens with the caret still in the box, the first Escape closes only the panel, the second leaves the search. One press, one thing |  |
| 37m | Open the Tasks view in a vault where most folders have no tasks | The dropdown offers only folders that have some, itself, or below it — plus the vault root and whatever is currently chosen. Untick "open only" and the list must not change shape |  |
| 37n | Put a note, a folder of notes and an attachment in the trash, then press Clear trash | The confirmation names all three counts, and the note count includes the ones inside the folder. It used to name only the rows on screen, which counted the folder as nothing |  |
| 37o | `npm run build` **then** `npm run drive:capture` | Nine `ok` lines. The order matters and is the point: the driver runs `out/`, and a renderer change made after the last build is simply not in the window it drives |  |

**What is already confirmed and should not be re-checked as though it were not:** the title
field's computed size, weight, padding and focus colour were read off the running window with
`getComputedStyle` rather than judged from a picture; the reader's footer, the search hint
panel, the scope button's absence under a tag, and "Exit tasks" on the count row were all
photographed under `Xvfb`. The bullets were photographed too, but on Linux and in DejaVu Sans,
which is the one face this sandbox has.

**§37a and §37n are superseded by §38 below**, which came out of the same day's use: the
bullets at levels one and two are small again, and the trash confirmation says two more things.
Walk §38's rows instead of those two; the rest of §37 stands.

---

## 38. Twelve items from a day of using §37 (23 August 2026)

The batch above shipped and was used, and this is what came back. `05-besluitenlog.md` B85 and
B86 carry the two decisions; B82 is revisited in its own entry. **Nothing here has been seen in
the running app** — not one row was driven under `Xvfb`, unlike §37 — so every row below is a
first sighting rather than a confirmation, and the rows that are about colour or about the
weight of a glyph are judgements no screenshot from this sandbox could have settled anyway.

**The bullets are decided for the second time, in the other direction.** §37 made levels one and
two `\25CF`/`\25CB` so all three levels would agree in size. In use that read as far too heavy,
so `\2022` and `\25E6` are back — 0.293em of ink against the 0.668em they replaced. What
survives from §37's fix is the square's own slot and its own ink centre, now per depth. The
stated cost is that on a Mac level one is drawn from a different face than the two levels under
it, `\2022` being the one glyph of the three that SF carries: **that is exactly what §38a is
looking at**, and it is a deliberate trade, not a regression to report.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 38a | On **macOS**, open a note with a six-level bullet outline — judge by eye, NEVER SEEN ON THIS PLATFORM | Levels one and two are small dots, noticeably lighter than the square at level three, and none of them looks heavy. Level one may be drawn from a different face than the two under it; what matters is whether it reads as one outline |  |
| 38b | The same note on **macOS** and on **Windows**, with a task and a starred item at levels one, two and three — NEVER SEEN ON THIS PLATFORM | The marker, the checkbox and the star sit on one line and one column at every level. The vertical constants are per depth now, so a level that is out on its own is the thing to report |  |
| 38c | Open a note in the library and look at the strip above it and the strip below it — judge by eye, NEVER JUDGED | Both are on the panel colour, white in the light theme, with the writing surface between them reading as a page. The same shading the capture window has always had |  |
| 38d | Look at the note list beside it | Its header is shaded with the strips above; the list of notes itself is not. Deliberate — a list is not a surface, and the selected row has to stand out in it |  |
| 38e | Put the two windows side by side and compare `[Insert] [Actions] [Help]` — judge by eye, NEVER JUDGED | The same size, radius, border and colour in both. They are one CSS rule now; two that merely look alike is what this replaces |  |
| 38f | In the library's note editor, press the Help button in the footer | The shortcut sheet opens, listing the *library's* shortcuts. It was reachable only from the sidebar row and the chord before this |  |
| 38g | Raise the capture window and look at the empty title field — judge by eye, NEVER JUDGED | "Title (optional)", dimmer than the placeholders in the fields under it. The report is that at 17px bold an empty title read as one somebody had already typed |  |
| 38h | Begin a note, type a sentence, then `Mod-Shift-Backspace` | A confirmation appears. Escape or Cancel keeps the note and puts the caret back; Discard throws it away and the window goes |  |
| 38i | Raise the window and immediately `Mod-Shift-Backspace`, having typed nothing | No question at all — the note goes straight away. A confirmation over an empty note is what teaches people to click through confirmations |  |
| 38j | Begin a note, paste **only** a picture into it, then Discard | It asks. A picture is a note with no text in it, and it is the one thing that could not be retyped |  |
| 38k | Select a note in the middle of a folder's list, move it elsewhere, then press Tab once | Focus is still in the note list, on the note that was **above** the one that moved, and that note is open in the reader. One Tab reaches the next pane. The report is that it took several |  |
| 38l | Do the same with the **first** note in the list | Focus lands on the note that is now first. And with the only note in the list, the list is empty and the reader is put away |  |
| 38m | Drag a note out of the list while a *different* note is open and the caret is in the editor | The reader does not change and the caret stays where it was. Only a move of the note being read moves the selection |  |
| 38n | Put a note holding two unfinished tasks in the trash, add a folder and an attachment, then press **Empty trash** | The button says Empty trash, and the question counts notes, folders, files **and** open tasks. Cancel — nothing has gone |  |
| 38o | Embed a picture in a note, delete that note, then press Empty trash | A second sentence names the linked files that become unlinked attachments. Cancel, put a *second* live note referring to the same picture in place, and ask again: the sentence is gone, because the picture stays linked |  |
| 38p | Right-click a note in the trash that has open tasks, choose Delete permanently | The question names the note and, in brackets, its open tasks. On a folder in the trash it counts everything under it |  |
| 38q | In the Tasks view, open the scope dropdown in a vault with several levels of folders | Only folders with tasks in or under them, plus the vault root and whatever is currently chosen. **Answered: a folder whose tasks are all finished is no longer offered while "open only" is ticked** — this row asked directly and the answer came back as a defect report. §39a is the row that now covers it |  |
| 38r | `npm run build` **then** `npm run drive:capture` | Nine `ok` lines. Same order, same reason as §37o |  |

---

## 39. Five items from a day of using §38 (23 August 2026)

Five reports against the batch above, four of which are about a surface being the wrong
colour or a group of buttons standing in the wrong place — which is precisely the kind of
thing §38 could not settle, having never been on a real display. **Three of these five *were*
driven here**, under `Xvfb` on the real renderer, and the pixels were read out of the
screenshots rather than judged by eye: the search strip and the note's own field block both
measure `#ffffff` where they measured `#fbfbfc` before, and the capture window's three
buttons now end against the right margin. That leaves the rows below as a check on a real
display and a real theme rather than a first sighting — with two exceptions, §39a and §39d,
which are behaviour rather than colour.

**§38q asked a question and this is the answer.** The Tasks scope chooser asked `total` so
that ticking "open only" could not rebuild it; the view opens with that box ticked, so a
folder whose tasks were all finished was offered and led to an empty pane. It now asks
whichever of the two the tick is asking. The rebuild that argument was avoiding is real and
is held harmless by the rule beside it: the folder currently chosen is never dropped.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 39a | In a vault where one folder holds only *finished* tasks, open the Tasks view and drop the scope list open | That folder is not in it. Untick "open only" and open the list again: it is back. Now scope *to* that folder and tick the box — the chooser still says its name, and the pane below is empty |  |
| 39b | Look at the strip holding the search box in the note list — judge by eye, on a real display | One colour with the note-list header under it and the note editor's header beside it. **Since B87 that colour is the light grey of the chrome, not white** — the white is the list below it. The search field itself stays a shade darker again, being a field |  |
| 39c | Open a note in the library and look at the When / Where / Tags / Who block — judge by eye, on a real display | The block sits on the same grey as the header above it, with the writing surface below it white (B87 turned that pair the right way round; before it, both were white-on-off-white). It is the same component the capture window draws, and it should be the same colour in both |  |
| 39d | Look at the foot of the **capture** window, then at the foot of the library's note editor | `[Insert] [Actions] [Help]` ends against the right margin in both. In the capture window the timing readout has moved to the left, in beside "Ctrl+Enter closes", which is what was keeping the buttons out of the corner |  |
| 39e | Right-click a note with two unfinished tasks in it and choose Delete | The question names the note and, in brackets, "2 open tasks". Cancel, tick both tasks off, and ask again: no brackets |  |
| 39f | Right-click a folder holding a few notes and some open tasks, choose Delete folder | One bracket, three numbers: notes, subfolders, open tasks — the tasks counted through the whole subtree, not just the folder's own notes. An empty folder with no tasks gets no brackets at all |  |
| 39g | Do §39e from the reader's **Actions** menu instead of the note list | The same question, and confirming deletes **the note the question named** — not whatever else may have been open |  |

---

## 40. One surface system, six roles (26 August 2026)

B87, out of `DESIGN-CRITIQUE.md`'s Finding 2. Every row here is a colour, which makes this
the section automation is worst at: the light theme's panes were photographed under `Xvfb`
and the pixels read out of the PNGs — tree `#f4f5f7`, divider `#d7dbe1`, list and reader
`#ffffff`, and the dark theme byte-identical to before at the same five points — but a
screenshot in a sandbox cannot answer what a real panel at a real brightness looks like at
arm's length, which is the whole premise of the critique this answers. **Judge every row by
eye, on both machines, in both themes.**

The one number worth carrying into it: the divider between the note list and the reader is
the *only* thing separating those two panes, by decision, and it went from 1.28 : 1 to
1.39 : 1. If it still reads as nothing on a real display, that is a finding and the answer is
probably a shaded list rather than a darker line — say so in the feedback column.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 40a | Open the library in the **light** theme and look at the three panes | Three panes. The folder tree is plainly grey against a white note list; the list and the reader are both white, separated by a line and by the reader's own grey header band above it |  |
| 40b | The same window in the **dark** theme | Exactly what it looked like before this batch. Any difference here other than a hovered or selected row is a defect |  |
| 40c | Run the pointer down the note list, then look at the note that is open | The open note is still obvious after the mouse has crossed every row above it. Hover and selection are one grey at two strengths — if the selected row gets lost in its own hover trail, that is Finding 3 and it needs a second channel, not a darker grey |  |
| 40d | Open a note holding a code block, a wiki-link chip and a `#tag` (light theme) | All three are visibly tinted boxes on the white page. Before B87 they were white on off-white and effectively invisible |  |
| 40e | Open the command palette, a right-click menu, Help and Settings over a note (light theme) | Each is a grey panel with a border and a shadow, over a white page. None of them reads as a hole in the page |  |
| 40f | Look at the When / Where / Tags / Who fields, then click into one | The boxes are a shade darker than the strip they sit in; the one you are typing in turns the white of the page. In the dark theme there is no fill change at all — the accent border is the whole signal, and that is deliberate |  |
| 40g | On a **light-mode** machine, quit the app entirely and start it, then press the hotkey | No dark flash before the window paints. This is the row that only a cold start on a light-mode OS can answer, and it is per platform |  |
| 40h | Scroll a long note, and open the Language dropdown in Settings, in **both** themes | The scrollbar and the dropdown's own popup are in the same theme as the app. `color-scheme` is what makes that true, and it had never been declared |  |
| 40i | `npm run build` **then** `npm run drive:capture` | Nine `ok` lines. Same order, same reason as §37o |  |

---

## 41. Four defects and two features from a day of using §40 (26 August 2026)

More of this batch was driven than usual, and the rows below are deliberately only what a
sandbox could not answer. Under `Xvfb`, with real Chromium behind it, twelve checks came back
`ok`: the spring-loaded folder over a **real** HTML5 drag (CDP's `Input.setInterceptDrags` +
`Input.dispatchDragEvent`, not a synthetic `dispatchEvent`), the note really leaving the
folder it was dragged out of, the pin taking itself off without selecting its row, `Mod+1`
toggling a heading and `Mod+Shift+L` making a bullet of one, and B88's size landing in the
capture window with no restart. The pixels were read out of the PNGs: no `#1a63d8` on any
edge of the selected note row, the selected folder's label at `--text`, and the H1
"Kwartaalplan" 142 / 174 / 219 px wide at 13 / 16 / 20 px.

What is left for a person is **Windows at a real scaling factor**, **both themes on a real
panel**, and the two judgements no measurement makes: whether 600 ms is the right dwell, and
whether losing the note list's focus ring costs more in use than the harsh border did.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 41a | ~~**On Windows**, at 125 % *and* 150 % display scaling: click a note, then walk the list with ↑/↓~~ | **Superseded by B91 — do §42d instead.** The ring is back in the note list, because taking it away never took it away: the row is focusable regardless, so the UA drew its own in the platform's accent colour. The blue box is expected again |  |
| 41b | ~~Straight after 41a, keep walking with ↑/↓ without pressing Enter~~ | **Superseded by B91.** The question it asked came back answered from the other side: with our ring gone the row was not invisible at all, it was orange |  |
| 41c | Look at the selected folder in the tree, both themes | Bold, in the ordinary text colour, on a grey fill. No blue. It should read as no louder than the open note in the list beside it |  |
| 41d | Drag a note from the list and hold it over a **collapsed** folder | It unfolds after about half a second, and stays unfolded after you drop. Say whether the wait feels right — too short and every folder you cross opens behind you, too long and the drag reads as having stopped working |  |
| 41e | Drag a note over the folder it **already lives in**, on the way to a subfolder underneath it | That parent still unfolds, even though it will refuse the drop itself (no highlight on it). This is the case the whole feature turns on |  |
| 41f | Start a drag, hold it over a collapsed folder for a moment, then press Escape | Nothing unfolds afterwards, and no folder is left highlighted |  |
| 41g | Type a line, press `Ctrl+1` twice | Heading, then ordinary paragraph again |  |
| 41h | On a heading, press `Ctrl+Shift+L`, then `Ctrl+Z` **once** | A bullet whose text is the heading's; one undo puts the heading back. Two presses of Ctrl+Z would mean the transaction was split |  |
| 41i | Settings → text size, try 13 and 20, in **both** windows and on **both** machines | The note scales and the window around it does not. Headings keep their proportion to the body. Judge readability at your own display — this is the row the setting exists for |  |
| 41j | At 13 and at 20, look at a bulleted list, a numbered list and a task list | Markers still line up under their own text at every depth, and a checkbox still sits on its line. The marker rules were measured at 16px and nowhere else, so this is the row most likely to show something |  |
| 41k | With both windows open, change the text size in Settings and look at the capture window **without restarting** | It follows immediately. Then change the **language** and look again — that never reached this window before, and it should now |  |
| 41l | Click the pin on a pinned row | The pin comes off and the row drops to where the sort puts it. The note does not open and the selection does not move |  |
| 41m | `npm run build` **then** `npm run drive:capture` | Nine `ok` lines. Same order, same reason as §37o |  |

---

## 42. Four items from a day of using §41 (27 August 2026)

Three of the four were driven here under `Xvfb` before this was written, so the rows below
are what a sandbox genuinely cannot answer. What *was* settled: the theme setting flips both
windows live and with no reload — the library and the hidden capture window both report
`prefers-color-scheme: dark` after choosing dark on a light-mode machine, and `--surface`
reads `#26282c` against `#f4f5f7` — "system" comes back to the OS's own answer and persists
across the round trip, the Settings chord opens the panel from a focused note row, and the note row's
focus ring measures `rgb(26, 99, 216) solid 2px` at `-2px`, which is `--accent` to the byte.
The marker correction was measured as a delta rather than judged: the checkbox moved exactly
1.000 px and the star exactly 2.000 px at a 16 px note, which is what was asked for and what
`0.0625em` and `0.125em` are worth there.

Two things a sandbox cannot reach at all. **This Linux box has no dark mode**, so "system"
was only ever seen answering *light* here — the explicit override was proven in the direction
that could be proven (OS light, chosen dark). And **the alignment report is about a real
display**: the numbers this batch changes came from a person's own screen at their own size,
and no measurement here can say whether they are now right.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 42a | Look at a list holding a bullet, a task and a starred item, on **your own display**, at the text size you actually use | The three marks start in one column. This is the whole of the report — the checkbox came 1 px left and the star 2 px left — so if either is still out, say by how much and at what text size, since the correction is stated in `em` at 16 px |  |
| 42b | Repeat 42a at 13 px and at 20 px (Settings → text size) | Still one column. The correction scales with the note, deliberately — it is `em`, not `px` — so a miss that grows or shrinks with the size means the wrong unit rather than the wrong number |  |
| 42c | Repeat 42a **on the other machine** | Same answer. The star is a colour emoji and its ink extent differs by platform font, which is the one part of this that is pinned to a measurement rather than to geometry |  |
| 42d | **On Windows**, at 125 % *and* 150 % scaling: click a note, then walk the list with ↑/↓ | A blue 2px ring on the focused row — the same one the folder tree draws, which is the point. It was removed for exactly this reason on §41a and that made it *worse*, not better. If it is still too harsh at scaling, the answer is a softer ring in all three panes, not none in one |  |
| 42e | **On macOS**, set System Settings → Appearance → Accent colour to something loud (orange), then walk the note list with ↑/↓ | The ring stays blue. It is the app's `--accent` now, not the OS's, and orange is exactly what was reported |  |
| 42f | Settings → Theme → Light, then Dark, with both windows open | Both windows change immediately, with no restart and no reopening of the panel. Scrollbars and the popup a `<select>` opens change with them — those are drawn by the OS and are the half that a `data-theme` attribute would have missed |  |
| 42g | Choose the theme **opposite** to what the machine is set to, quit the app, start it again, and watch the first frame of each window | No flash of the other theme before the window paints. The colour Chromium paints first is chosen at window construction, which is why the setting is applied before any window is built |  |
| 42h | Set Theme back to System, then switch the machine itself between light and dark (macOS: Appearance → Auto, or flip it by hand) | The app follows, live. "System" means the question stays with the OS rather than being answered once and stored |  |
| 42i | Press `⌘,` (macOS) or `Ctrl+,` (Windows) from each of the three panes and from inside a note | Settings opens every time. It had no keyboard route at all before this |  |
| 42j | With Settings open, click the capture-hotkey button (it says "press a combination") and press `⌘,` / `Ctrl+,` | It is *recorded as a hotkey*, and the panel stays open. The chord deliberately does not act while a panel is open, or you could not record this one |  |
| 42k | On a Mac, in an application that has a Preferences menu item, check `⌘,` still reaches *that* app while emqnote is running | It does. This chord is claimed in emqnote's own window, not with the OS — only the two hotkeys in Settings are global — so it costs no other application anything |  |
| 42l | `⌘.` / `Ctrl+.` — the spelling v0.12.1 shipped by mistake | Nothing happens. It is gone rather than kept as an alias, so the key is free again |  |

---

## 43. Two defects found by looking at the app rather than at the tests (30 August 2026)

Both were driven here in the real app over CDP before this was written, so the rows below are
narrower than a batch's usually are. What was settled: the empty capture window really does
draw its hint now — computed `::before` content `"Just type."` in `rgb(107 112 121)`, a 75 px
float, and the paragraph still 22 px tall at x=19, so the text sits beside the caret rather
than pushing it anywhere — and the cell drag survived eight consecutive runs of
`scripts/drive-capture.ts` under three busy loops on a two-core box, having failed three runs
in six before the fix.

Two things this sandbox cannot reach. **A synthetic pointer is not a mouse**: the drag here is
three `Input.dispatchMouseEvent` calls, and a real drag is a stream of them with a human's
timing behind it, which is the shape the race was always about. And **the hint is a judgement
about weight** — it is drawn at `--muted`, at whatever size the note is set to, and whether it
reads as a prompt rather than as text somebody left behind is not a measurement.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 43a | Press the capture hotkey on an empty note | "Just type." under the caret, dimmer than the note's own text. It drew **nothing at all** before this — two independent faults, either enough on its own — so a blank editor here is the original bug rather than a near miss |  |
| 43b | Type one character | The hint goes on the first keystroke, and the character lands at the very start of the line. The hint is a float with no height precisely so it reserves no space to be pushed out of |  |
| 43c | Dismiss the window (Ctrl+Enter or Esc-to-hide), then bring it back with the hotkey | The hint is there again. The document is cleared on *hide*, so this is the ordinary path back to an empty note rather than a special case |  |
| 43d | Repeat 43a at 13 px and at 20 px (Settings → text size) | The hint moves with the note, like everything else inside it. This is where to say if it reads too heavy or too faint at the size you actually use |  |
| 43e | Switch the language (Settings), then open an empty capture window | "Typ maar." in Dutch, "Just type." in English. The text is read on every draw rather than captured when the window was built, which is the whole reason it can follow a language change at all |  |
| 43f | Open a note that **ends in a table** and look at the empty line below it | No hint there. That line exists so there is somewhere to type past a table, and a note that has one is not an empty note |  |
| 43g | In a table, drag a rectangle of cells and **let go** — ideally while the machine is busy (a build running, a big note open) | The rectangle is still there after you release. It used to vanish on release when the machine was loaded: the fill was correct all through the drag and gone a few milliseconds after `mouseup`. A rectangle that disappears on release is the original bug back |  |
| 43h | Repeat 43g with Shift+click to extend instead of a drag | Same answer. The extension takes the same claim on the selection that a drag does, which it did not before |  |
| 43i | With a rectangle selected, click a single cell | The caret lands in that cell and the rectangle goes. The claim is released by the *next* press rather than by the release of the last one, and this row is what says that release is not too late |  |

---

## 44. What v0.12.3 broke on its way past the thing it fixed (30 August 2026)

One row of §43 fixed a rectangle that vanished on release, and the fix took the caret with
it. The claim it puts on the selection was released by a mouse press and by nothing else —
and ProseMirror performs very little caret motion itself, so an arrow, Home, End and Ctrl+End
are all moved by the browser and read back out of the DOM afterwards, through the very guard
that claim arms. After a drag, the caret could not move until something was clicked. A key
now drops the claim exactly as a press does.

Driven here before this was written: `Ctrl+End` after a drag moved nothing at all, twenty-four
Enters after it landed inside a cell, and a typed `/` replaced the rectangle instead of
opening the menu — all of which now behave. Arrows were never affected and were checked
rather than assumed.

The rows below are about the seam between the two, which is where this went wrong the first
time: every one of them starts *from a rectangle*, because that is the state nothing had been
tried from.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 44a | Drag a rectangle of cells, let go, then press → | The caret lands in a cell and the rectangle goes. This one worked even while the rest did not, so a failure here is something new rather than the bug this row is about |  |
| 44b | Drag a rectangle, let go, then press `Ctrl+End` (`⌘↓` on macOS is *not* the same key — use `Ctrl+End` on Windows and `Fn+→`/`⌘→`'s document equivalent on a Mac, whichever your keyboard actually sends) | The caret goes to the end of the note. **This is what v0.12.3 broke**: it did nothing at all, and went on doing nothing until something was clicked |  |
| 44c | Drag a rectangle, let go, then press Home, then End | The caret moves to the start and end of a line. Same family as 44b — motion the browser performs and the editor reads back |  |
| 44d | Drag a rectangle, let go, then type an ordinary letter | The letter replaces the rectangle, which is what typing over a selection has always meant here. This is the one case where acting *on* the rectangle is right, and it must not have been broken by teaching keys to release it |  |
| 44e | Drag a rectangle, let go, wait a moment, then press → | Same as 44a. The claim is meant to be dropped by the next input rather than to time out, so waiting must change nothing either way |  |
| 44f | Drag a rectangle, let go, and click a single cell | The caret lands there and the rectangle goes — §43i again, checked from the other side of this fix |  |

---

## 45. Pane consistency, and both windows going frameless (30 August 2026)

B92. The three panes now share one 40px header band and the two that have a footer share one
28px band; every button in either window's chrome is one component; and both windows are
frameless with the operating system's own controls drawn *into* the header band.

**What has been seen here and what has not.** The layout was photographed in the running
library window under `Xvfb` (`npm run ui:kit`, 71 parts) and corrected twice from what those
photographs showed — the pencil glyph came out of a fallback font as a paperclip, and the
scope switch was ellipsising its own label at the pane's default width. So the *light* theme
at 1200 and 1440px is confirmed. Nothing below that involves a window frame has been seen at
all: this sandbox is Linux, which deliberately keeps its native frame, so **every macOS and
Windows row here is a first sighting**. §45f is the sharpest of them — it is the one thing in
this batch that could take functionality away rather than move it.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 45a | Open the library and look across the top of the window | One unbroken horizontal line: the tree's heading, the folder name and the note's title all sit in a band of the same height, with the dividers running through it. Three chrome heights with no shared line is the original complaint |  |
| 45b | Drag both pane dividers to their extremes and back | The bands stay the same height at every width, and the count/sort footer stays level with the note's own footer. Only the middle of each pane scrolls |  |
| 45c | Press ⌘F / Ctrl-F in the library | The folder's name is replaced *in place* by a search box, with a switch at its left naming the folder being searched. Escape puts the name back. The old separate search row is gone, so a second row appearing anywhere is wrong |  |
| 45d | With the search open, click the switch | It reads "All notes" in the accent colour and the search widens to the vault (B83 unchanged). Click again to narrow. The label must never be cut short to "All …" — that was a real defect, caught in a photograph |  |
| 45e | Narrow the note list pane to its minimum with the search open | The box stays wide enough to read a query in, "+ New note" folds down to its plus, and nothing overflows the band |  |
| 45f | **On Windows**, in the library: put the caret in a folder-rename field or the search box and press Ctrl+Z, Ctrl+X, Ctrl+C, Ctrl+V, Ctrl+A | All five still work. The window is frameless now, so the application menu can no longer be drawn in it, and its Edit accelerators used to be reachable through that bar. If any of these has stopped working, say so — the fallback is a Windows-only decision to bring the frame back, not something to guess at |  |
| 45g | **On Windows 11**, hover the maximise button in the top-right of the note pane's band | The snap-layouts flyout opens. These are the system's own caption buttons drawn inside our band, not buttons the app draws — that is why they get the flyout, and it is the reason `titleBarOverlay` was chosen over a frameless window with our own three |  |
| 45h | **On Windows 11**, switch the theme (Settings → system / light / dark) | The caption buttons change colour with the rest of the window. They are painted from colours handed over at construction, so this is the one part of the chrome `prefers-color-scheme` cannot reach on its own |  |
| 45i | **On macOS**, look at the traffic lights | They sit inside the tree's heading band, vertically centred, with "Vault" clear of them — see §46a, which asks how *much* clear. In the capture window they sit in the note's title band the same way |  |
| 45j | **On macOS**, take the library fullscreen and come back | The heading stays legible throughout. The inset the lights need disappears in fullscreen, so this is where a fixed 92px of padding would show as a gap |  |
| 45k | On either platform, drag the window by an empty part of a header band, then double-click it | It moves, and the double-click zooms. Then drag a pane divider starting near the *top* of the window: it must resize the pane and not move the window |  |
| 45l | Open the capture window on a brand-new note, then on an existing note from the library | New: the title field is in the band, and the caret starts there. Existing: the note's *title* is in the band, read-only, and the file name is at the foot ("Saved as …"). The window's own title bar with its three drawn buttons is gone; closing is still save-and-put-away |  |
| 45m | Compare the two windows' footers side by side | Same height, same buttons, same order — Insert, Actions, Help. The library adds the file path on the left when the note is editable, in the slot the read-only notice takes when it is not |  |
| 45n | Open a note with a long path in the library and narrow the reader pane | The path shortens from the *left*, so the file name stays readable. The full path is on its tooltip |  |
| 45o | In Settings, look at the note text size | The default is now the first entry and it is called "Normal" (13 px). A machine that had already chosen a size keeps it — the five values are unchanged, only their names moved — so if yours has jumped, that is worth reporting |  |
| 45p | Check the tree's three header icons at your display scaling | Plus, pencil, cross — drawn, all the same weight. Hover each: the tooltip names the folder it would act on. A glyph that looks like a paperclip is the defect this row exists for |  |

---

## 46. Six items from using the pane-consistency build (31 August 2026)

Four of the six are things a test could not see, and two of those are regressions of §45's
own batch: both windows became frameless, and a `-webkit-app-region: drag` band hands every
press to the window move — so the reader's title stopped opening its rename and the capture
window's title could not be clicked into. Neither showed anywhere in the suite, because jsdom
implements no app-region and `library-title-edit.test.ts` drives that very click.

**What has been seen here and what has not.** Everything except §46a was driven in the
running app under `Xvfb` over CDP before this was written, in both windows, with real XTEST
keys and real pointer coordinates: the capture title measured `15px`/`600` on a transparent
ground and took a real click; the reader's `<h1>` reported `no-drag` and opened its rename
from a real click; the ring walked editor → Who → note row → When → editor on real
`Ctrl+Tab`/`Ctrl+Shift+Tab`; Shift-Tab from Who reached Where; and `Ctrl+[` walked back from
a followed link. **§46a is the exception and cannot be answered here at all**: Linux keeps
its native frame and never insets the traffic lights, so the one number this batch changed is
the one thing nobody has looked at.

| # | Do this | Expect | Feedback |
|---|---|---|---|
| 46a | **On macOS**, look at the gap between the traffic lights and the heading, in *both* windows | Clear air — about 28px from the last light to "Vault", and the same to the note's title in the capture window. It was 14 and read as crowding. Too much space is as much a defect here as too little, so say which way it is wrong if it is |  |
| 46b | In the capture window, start a new note and look at the title field *without* clicking in it | It reads as a heading, not as a form field: the same size and weight as the note's title in the library, no box, no border, on the band's own colour. A visible input box is the defect this row exists for |  |
| 46c | Click into that title, then click away | The border lights in the accent colour on focus and goes again, with the text not moving by a pixel either way |  |
| 46d | In the capture window, click straight into the title field from cold | The caret lands in it. If the window moves instead, or nothing happens, that is the drag-region bug — the same one as §46e, one window over |  |
| 46e | In the library, open a note and click its title | It becomes an editable field with the text selected. Enter renames the file, Escape cancels. This is the regression the batch was reported for |  |
| 46f | With the caret in a note, press Ctrl+Shift+Tab | The caret goes to **Who**, the last of the four header fields — not to the note list |  |
| 46g | Press Ctrl+Shift+Tab again | *Now* the note list, on the row you came from |  |
| 46h | From a note row, press Ctrl+Tab twice | First **When**, the first header field; then the note's text. The two chords have to undo each other — walk four steps each way and end where you started |  |
| 46i | With the caret in Who, press Shift-Tab, then Shift-Tab again | Where, then Tags. Plain Tab and Shift-Tab walk the four fields; only the Ctrl form leaves the block |  |
| 46j | With no note open, press Ctrl+Tab from a note row | Nothing lands in a header block, because there is none, and the press is not swallowed either |  |
| 46k | Follow a `[[…]]` link, then press ⌘[ / Ctrl+[ | Back to the note the link was in — the same step the ← button in the footer takes. Press it again on a note you did not arrive at by a link: nothing happens, and the key stays free |  |
| 46l | Look at the ← button in the note's footer after following a link | It keeps a clear gap from the file path to its right, rather than running into it |  |
| 46m | Open the shortcut sheet in the library (⌘/ / Ctrl+/) | "Back to the previous note" is listed against ⌘[ / Ctrl+[, and the pane-cycle row names four things rather than three. Neither column should need scrolling |  |

---

## Reporting

For anything that fails, capture: the platform and OS version, the app version — the top
line of the tray menu, `emqnote x.y.z`, which is the only place it is shown — what you did,
what happened, and what you expected. For a rendering
problem, a screenshot. For anything involving files, the actual bytes — `cat` the `.md`,
do not describe it.

If something in §4.2, §6.3, §9.2, §10, §11f, §12b, §12j, §18o–§18q,
§20m, §22s, §24a, §25a, §26a–§26c, §27f, §28g, §29k, §29r or §29y fails,
that is expected-ish rather than alarming: those have never been watched working, and they are
why this document exists. §11f and §20m's remainder used to be one gap — "the
capture window has no unit-test harness" — and that sentence is retired: the harness landed
on 22 August, nine suites are written against it, and what those rows have in common now is
narrower and specific. **They are the things jsdom cannot do**, each measured rather than
assumed and named on its own row: a page fetched over a custom protocol, a click that has to
be aimed, a panel that has to scroll, a selection the browser moves. They belong to
`scripts/drive-capture.ts` and to a person, not to a suite nobody has got round to writing —
and §18o–§18q are a gap of their own: a tray menu is not
scriptable at all, which is why `vault-menu.ts` was split out to be testable apart from it — and §12b is the one thing in the PDF viewer that a Linux sandbox
genuinely cannot answer. §15b, §16b, §19b, §19t, §20b, §20g, §22f and §22k are a different kind of unwatched: they are
judgements about how something feels or reads, which no script can make — though §19b and
§19t are narrower than they were since 22 August, the driver having settled that a real drag
picks the right cells and that the `/` panel fits on screen, leaving only the judgement, and §25m, §26i,
§26j, §27n, §27o, §28i, §29l and §29s join them, as do §30 &mdash; **all of it**, which
is new: that batch shipped tested and built but never once driven in the running app, so
every row in it is a first sighting rather than a confirmation — with one narrow exception,
since 20 August: a starred bullet has now been seen drawing in the real reader, which says
nothing about §30's toggling, round trip or Where field. **§31a and §31b are a whole platform
again**, and sharply so: the star and the checkbox are aligned onto the bullet by a positioned
box precisely so a different emoji font changes the star's size and not its centre, and that
reasoning has been measured on Noto Color Emoji and nowhere else. §31j is a fifth kind — it
asks another *application* what it makes of a file this one wrote, which is the only check B7
can ever really get. §31t is a cost to confirm rather than a behaviour to check, like §23c; §31r is the opposite —
a loss that used to happen and must not any more, so a failure there is the original bug back.
§31 is otherwise confirmed: every other row in it was driven under `Xvfb` over CDP, in both
windows, so a failure there is a genuine surprise.
**§38 is a whole batch again, in §30's sense**: nothing in it has been driven in the running
app, so every row is a first sighting rather than a confirmation. Two of its rows are
narrower than that and worth reading before walking it — §38a is a *stated cost* rather than
a defect (level one falls back to a different face on a Mac, deliberately, against a marker
that was too heavy at two depths), and §38q names the one decision in the batch that could
reasonably go the other way. §38c–§38g are judgements about colour and weight that no
screenshot from this sandbox could have settled.

**§46a is the sharpest single instance of the fourth kind below**: everything else in that
batch was driven in the running app first, and it is the one row that could not be, because
Linux keeps its native frame and never insets the traffic lights at all. The rest of §46 is
confirmed — including both drag-region regressions, which *do* reproduce here: app-region is
honoured whether or not the frame is hidden, which is why the fixes could be watched working
on this machine and the clearance they sit beside could not.

**§22a, §22b, §22c, §23a–§23d, §24a–§24d, §25a–§25f and §26a–§26c
are a fourth kind: a whole platform.** They are the items that have never run on the machine
they are about — this sandbox is Linux, and all of them are Windows behaviours (§25e is the
macOS half of the same pair). §22b and §25a are the sharpest of them, because neither bug
reproduces here at all — both are claimed at the earliest point in the window rather than
fixed at a known cause, and §25a has now come back unchanged, which is why §26a exists at
all: it asks the operating system rather than guessing a third time; §23c is a different
shape again, being a *cost* to measure rather than a behaviour to check. §19m is a third kind: what a
remote host observes is not visible from inside the app at all. §4.5 is no longer one of them — since B36 the rendering itself has been seen
working, on the same Chromium the packaged app ships.
