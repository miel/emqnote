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

Two items in particular have **never been seen working** and are the reason this file
exists: §4.2 (does the capture window really draw an attachment) and §6.3 (does clicking a
checkbox in the Tasks view actually reach the file). Both have proven code underneath and
an unproven click on top. Start there if you only have ten minutes.

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

## Reporting

For anything that fails, capture: the platform and OS version, the app version — the top
line of the tray menu, `emqnote x.y.z`, which is the only place it is shown — what you did,
what happened, and what you expected. For a rendering
problem, a screenshot. For anything involving files, the actual bytes — `cat` the `.md`,
do not describe it.

If something in §4.2 or §6.3 fails, that is expected-ish rather than alarming: those two
are why this document exists.
