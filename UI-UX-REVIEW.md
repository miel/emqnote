# UI and UX review

Review of emqnote `v0.12.11`, conducted on 2 September 2026.

## Scope and method

This review covers the Electron capture window, three-pane library, integrated task
functionality, accessibility, failure states, and the principal note-management
workflows.

The review was based on:

- the functional and technical design documents;
- the current renderer, main-process, and shared source code;
- a successful production build and TypeScript check;
- 2,133 passing automated tests across 171 test files;
- the real-Electron capture and library drivers running under Xvfb.

The live drivers verified real Chromium focus traversal, task filtering, task-to-note
navigation, note rendering, rich capture, and several pointer interactions. This is an
expert review rather than a study of observed end users. Conclusions about user intent
or frequency should therefore be validated in daily use.

## Executive summary

emqnote already has a strong product foundation. It is unusually focused for a desktop
note app: capture is immediate, editing happens without a mode switch, tasks live inside
notes rather than in a disconnected subsystem, keyboard navigation is comprehensive,
and save and sync failures receive serious treatment.

The three most important weaknesses are:

1. The reader can still be crushed at narrow window widths because pane constraints are
   enforced only while dragging a splitter.
2. The Tasks view is a good “find every checkbox” view, but not yet a strong task-triage
   view: it has no meaningful ordering, loading or error state, or easy recovery after
   completing an item.
3. Accessibility semantics lag behind the otherwise excellent keyboard implementation:
   fields lack programmatic labels, overlays lack dialog semantics, autocomplete widgets
   lack combobox semantics, and some keyboard-capable controls are removed from the Tab
   order.

No critical data-loss defect emerged.

## What works especially well

- The three-pane “where → which → what” model fits the product and keeps a note's context
  visible while it is read or edited.
- The capture workflow is exceptionally direct: global shortcut, immediate focus,
  optional metadata, autosave, and `Ctrl/Cmd+Enter` to finish.
- The reader is an editor rather than a preview, avoiding an unnecessary mode switch.
- Outlook-style shortcuts, rich paste, outlines, tables, attachments, PDFs, wiki links,
  and task lists support the documented work-note workflow rather than generic note-app
  feature breadth.
- The Tasks view correctly occupies the note-list pane while leaving the source note
  visible. Selecting a task opens the note, scrolls to the task, and highlights the exact
  line.
- Search, tag and person filters, folder scoping, pinned notes, and full keyboard
  navigation form a capable retrieval system.
- Writes are debounced and atomic. Save failures expose a recovery path, externally
  changed files are detected, notes claimed by the capture window are locked elsewhere,
  and OneDrive conflict copies have a dedicated resolution flow.
- Deletion is normally recoverable through the vault's trash, while permanent deletion
  is explicit and confirmed.
- Recent pane-consistency work has materially improved the light theme, shared header
  alignment, selection treatment, and consistency between capture and library.

## Prioritized findings

| Priority | Area | Finding | User impact | Recommendation | Confidence |
|---|---|---|---|---|---|
| High | Responsive layout | At the 760 px minimum width, the default 236 px tree and 300 px note list leave only 224 px for the reader. `READER_MIN` is enforced only when a splitter moves, not when the window resizes. | The note—the primary content—becomes narrower than either navigation pane; headers truncate and controls can collide. | Re-clamp widths through a `ResizeObserver`. Take space from the tree and note list before the reader. Consider collapsing the tree at very narrow widths. | High |
| High | Tasks | Tasks are ordered only by note path and position within the note. | A large task list becomes filing-order rather than action-order; urgent and recently relevant work is not surfaced. | First add explicit grouping and sorting: note order, recently modified, folder, and possibly manual priority. Validate demand before adding due dates or a full planner model. | High |
| High | Tasks and feedback | Task loading begins from an empty array, so the UI initially says “No tasks found.” Rejected loading promises have no visible error or retry state. | Slow indexing produces a false empty state; a failure can leave the pane looking legitimately empty indefinitely. | Model `loading`, `ready`, and `failed` explicitly, as the unlinked-attachments pane already does. Add retry. | High |
| High | Accessibility | Metadata fields are visually labelled with adjacent `<span>` elements but have no `<label>`, `aria-label`, or `aria-labelledby`. The editor also has no accessible name. | A screen-reader user hears generic edit fields without knowing whether they are Tags, Where, Who, or the note body. | Associate every label programmatically and give the editor a localized accessible name. | High |
| High | Accessibility | Confirmation overlays have focus trapping but no `role="dialog"`, `aria-modal`, or association with their title. Autocomplete panels likewise lack combobox/listbox semantics. | Keyboard operation works, but assistive technology receives an incomplete description of the interface and its state. | Add dialog semantics and implement the ARIA combobox pattern for Tags, Where, and Who. | High |
| Medium | Task completion | With “Open only” enabled by default, a completed task disappears shortly after it is checked. | An accidental completion is recoverable only by changing the filter and finding the item again. | Keep the completed row visible briefly and offer Undo, or animate it into a temporary completed state before removal. | High |
| Medium | Task interaction | The aggregated task checkbox has an approximately 16×18 px hit target. | It is unnecessarily hard to click, especially at high scaling or with motor impairments. | Expand the invisible button target to at least 24×24 px without enlarging the drawn checkbox. | High |
| Medium | Note-list scanning | Row height changes with tags and attendees; tags wrap; the pin slot exists only on pinned rows. | Titles and metadata do not form stable columns, making a dense list slower to scan. | Reserve a pin slot for every row, cap metadata to a fixed line budget, and collapse overflow tags into `+N`. | High |
| Medium | Sidebar structure | The expandable Tags/People area has `max-height: 55%` and its own scrolling. It can push Tasks, Settings, shortcuts, and Trash out of view while unused space remains above. | Important destinations disappear based on tag count. | Separate application commands from vault destinations and use flex sizing that consumes unused tree space before scrolling the footer. | High |
| Medium | Resize discoverability | Splitters are invisible until hovered and use `tabIndex={-1}` despite having arrow-key handling. | Most users will not discover resizing; keyboard-only users cannot normally reach the control that supports keyboard resizing. | Add a subtle persistent grip and an accessible route to focus or reset pane widths. | High |
| Low | Visual semantics | Note-list tag chips look clickable but are inert; clickable tags in the editor are visually weaker. | The visual affordance teaches the opposite behavior. | Make note-list tags apply the existing tag filter, or remove their button-like border and background. | High |
| Low | Contrast | Light-theme muted text on `--surface` measures about 4.23:1, just below the 4.5:1 threshold for small text. Field and divider boundaries are also extremely subtle. | Small sidebar and header text is harder to read, and filled fields can be difficult to distinguish. | Darken `--muted` slightly on light surfaces and strengthen field boundaries without returning to visually heavy chrome. | High |

## Detailed findings

### 1. Protect the reader during window resizing

This is the most serious general UI problem. The library window has a 760 px minimum
width. Its default tree and note-list widths consume 536 px, leaving 224 px for the
reader. That is below the code's own 280 px `READER_MIN`.

`clampPaneWidths` correctly protects the reader while a splitter is dragged, but its only
caller is `onPaneDrag`. Resizing the window does not invoke it. The previously conducted
three-pane critique documented the practical result: extremely short lines, clipped
metadata, a horizontal scrollbar, and footer collisions while the less important panes
retain unused width.

Two independent changes are appropriate:

1. Observe the library width and re-clamp whenever it changes, taking space from the tree
   and note list before the reader.
2. Give prose a maximum measure of roughly 70–80 characters so a very wide window creates
   margins instead of excessively long lines.

Relevant code: `src/main/library-window.ts`, `src/renderer/library/panes.ts`, and the
`onPaneDrag` implementation in `src/renderer/library/Library.tsx`.

### 2. Make the Tasks view useful for triage, not only aggregation

The current query orders by `notes.path, note_tasks.ordinal`. This is stable and preserves
the tasks' order inside each note, but it is filing order rather than action order. At a
small scale that is adequate. At hundreds of tasks it makes the list an inventory.

The smallest useful improvement is explicit grouping and sorting without changing the
markdown model. Options could include:

- folder and note order, which preserves the current behavior;
- recently modified note;
- task text;
- completed versus open when “Open only” is disabled.

Whether priority and due dates belong in the file format should be treated as a product
decision, not added as incidental UI. They are valuable only if Tasks is intended to be a
daily planner rather than a way to find incomplete checklist items inside notes.

Relevant code: `tasksIn` in `src/main/index-db.ts` and
`src/renderer/library/TaskList.tsx`.

### 3. Give task loading and failure honest states

`TaskList` initializes `items` to an empty array and immediately renders “No tasks found.”
It then loads asynchronously. There is no loading state and no rejected-promise handler.

Consequently:

- a slow scan briefly claims that there are no tasks;
- an IPC failure can leave that claim on screen permanently;
- there is no retry affordance.

This repository already has the right model in the unlinked-attachments pane:
`loading`, `ready`, and `failed`. The Tasks view should use the same distinction. An empty
result is data; loading and failure are application states.

### 4. Make task completion safely reversible

The default Tasks view shows open items only. Checking a task causes it to disappear after
the task index refreshes. This gives the interaction a crisp feeling, but makes an
accidental click awkward to undo: the user must disable “Open only,” find the task again,
and clear its box.

A brief retained row with “Completed — Undo” would preserve the clean open-task view while
making the action safe. The row can leave automatically after a few seconds; no permanent
history system is necessary.

The checkbox itself should retain its small visual size but receive a larger invisible hit
target. The current aggregated-view target is roughly 16×18 px.

### 5. Complete the accessibility semantics

The app has invested heavily in keyboard behavior: roving focus, pane traversal, shortcut
help, focus traps, focus restoration, and visible keyboard rings. That work deserves
matching semantics.

The main gaps are:

- The visual When, Tags, Where, and Who labels are spans rather than labels associated
  with their controls.
- The ProseMirror editor has a class and spellcheck setting, but no role or accessible
  name describing it as the note body.
- Confirmation panels trap focus but are ordinary divs rather than modal dialogs with a
  labelled title.
- Tag, location, and people completions are visually lists, but do not expose combobox,
  expanded state, active descendant, listbox, or option semantics.
- Splitters support arrow-key resizing only after receiving focus, while being absent from
  the normal Tab order.
- Task-row semantics combine a listbox option, nested button, and nested checkbox. This
  should be checked in NVDA and VoiceOver rather than assumed to form a coherent
  announcement.

This should be handled as a focused semantic pass rather than isolated `aria-label`
additions. Test at least the capture workflow, pane traversal, task toggling, completions,
and destructive confirmations with NVDA on Windows and VoiceOver on macOS.

### 6. Improve note-list scanning

The note list contains useful information: title, timestamp, excerpt, tags, attendees,
folder context, and open-task count. The issue is arrangement rather than content.

Rows vary in height depending on which metadata happens to exist. Tags can wrap to
additional lines, and only pinned notes reserve space for the pin. The title column
therefore shifts on pinned rows and the vertical rhythm changes throughout the list.

Reserve the pin column on all rows, limit metadata to a stable line budget, and use the
existing `+N` overflow treatment for excess tags. This keeps the information while making
the list scannable.

### 7. Keep permanent destinations permanently reachable

Tags and People can unfold inside `.tree-footer`, which has a fixed 55% maximum height
and its own scrollbar. With many tags, lower rows—including Tasks, Settings, Keyboard
shortcuts, and Trash—can scroll out of view even if the folder tree above has spare room.

Use a flex arrangement in which filters consume unused tree space first. Application
commands such as Settings and Keyboard shortcuts should be visually separated from vault
destinations and remain fixed at the bottom.

### 8. Align visual affordances with behavior

Note-list tags are bordered, filled chips in the accent color, but cannot be clicked. Tags
inside the editor are clickable and look like plain accent text. The strongest affordance
therefore belongs to the inert instance.

The simplest resolution is to make a note-list tag activate the existing tag filter. If
that is undesirable because row clicks already open notes, remove the chip treatment and
draw the tag like other non-interactive metadata.

The splitters have a related discoverability problem: the hit area exists, but there is
no visual grip at rest. A subtle persistent handle would expose the capability without
adding heavy chrome.

### 9. Strengthen small-text and control-boundary contrast

In the light palette, `--muted: #6b7280` against `--surface: #eef0f2` measures about
4.23:1. That is close, but below the usual 4.5:1 target for normal text, and much of this
text is only 11–12 px.

The borders are still subtler: `#dcdfe3` against the surface is about 1.17:1 and against
white about 1.34:1. Not every decorative divider needs 3:1 contrast, but an input boundary
or meaningful interactive state should not rely on these differences alone.

A slightly darker light-theme muted color and clearer field boundary would improve
legibility while retaining the calm visual character.

## Workflow analysis

### Capturing a note

This is the product's strongest workflow. The global shortcut, immediate title focus,
optional metadata, autosave, and `Ctrl/Cmd+Enter` completion form a coherent,
low-decision capture loop. The status bar explains the close shortcut and exposes the
saved filename. Rich paste, images, PDFs, tables, tasks, internal links, and Outlook-style
formatting all work without turning capture into a setup form.

The metadata block is visually compact, but four fields above every note still carry some
cognitive weight. For the documented single-user workflow this seems justified by actual
use, although usage should be checked: if Where and Who are blank in nearly every quick
note, progressive disclosure may eventually be preferable.

### Organizing and finding notes

The “where → which → what” three-pane model is correct. Search defaults, folder scoping,
tag and person filters, pinned notes, keyboard traversal, and contextual file paths create
a capable retrieval system without hiding the note.

The primary remaining friction is density. Rows contain valuable information, but
variable height and wrapping make the list harder to scan than necessary. Search syntax
help is thoughtfully placed, and searchable shortcut help is excellent.

### Creating and managing tasks

Task creation has several discoverable routes: Insert, slash menu, markdown-like `[] `
input, and shortcuts. Tasks remain ordinary note content, which preserves context and file
portability.

The aggregated Tasks view makes the right structural choice: it replaces the note list
while leaving the source note beside it. Selecting a task opens its note, scrolls to the
task, and highlights the exact line. The live driver verified the vault-wide list, folder
scope, “This note only,” checkbox toggling, and exit behavior.

The weakness begins when the list grows. Path ordering, no task search, and no notion of
priority make it an inventory rather than a daily work queue. Completion also removes the
item from the default view too quickly for safe recovery.

### Editing, saving, and sync

This area is exceptionally defensive:

- writes are debounced and atomic;
- save failures expose both a code and a recovery path;
- a note claimed by the capture window is locked in the library;
- external disk changes are detected;
- OneDrive conflict copies receive a dedicated resolution flow;
- destructive actions generally use recoverable trash, with explicit confirmation for
  permanent deletion.

These decisions inspire more trust than a generic “Saved” label would. The main remaining
improvement is clearer status announcement for assistive technology through appropriate
live regions.

## Quick wins

1. Re-clamp pane widths on resize and add a 70–80 `ch` maximum prose width.
2. Add loading, failure, and retry states to `TaskList`.
3. Keep a newly completed task visible briefly with Undo.
4. Increase task-checkbox hit targets to at least 24 px.
5. Add explicit labels to metadata fields and the editor.
6. Add `role="dialog"`, `aria-modal`, and labelled titles to overlays.
7. Reserve the note-row pin slot and collapse excess tags into `+N`.
8. Make note-list tag chips filter by tag.
9. Let the sidebar footer use spare tree space before it scrolls.
10. Make splitters visible at rest and provide a keyboard-accessible reset command.

## Larger product opportunities

### Decide what kind of task system this is

The largest product decision is whether tasks are:

- contextual checkboxes that occasionally need aggregation; or
- a genuine daily task manager embedded in notes.

If the first is the goal, avoid due dates, reminders, recurring tasks, and heavy task
metadata. Improve grouping, search, completion recovery, and context instead.

If the second is the goal, the model needs explicit task metadata—at minimum priority and
possibly a due date—plus Today, Upcoming, and overdue states. Adding those piecemeal only
to the UI would undermine the project's otherwise disciplined markdown-first
architecture.

### Design a real narrow-window mode

Protecting 280 px of reader width prevents breakage, but a deliberate responsive mode
would make smaller windows genuinely useful. At a chosen threshold, collapse the folder
tree or note list into a temporary overlay and keep the note as the stable primary pane.

### Conduct a semantic accessibility pass

Treat semantics as a product-wide layer covering both windows, overlays, the rich editor,
task rows, autocomplete, attachment controls, and status messages. Pair automated checks
with real NVDA and VoiceOver sessions.

## Questions and validation

The next design decisions should be informed by:

- How many open tasks exist in a typical real vault: 20, 200, or 2,000?
- Is Tasks used to plan work or only to find unfinished items in meeting notes?
- Is the library routinely resized near its minimum width?
- Do task-completion mistakes occur, and how are they currently recovered?
- Are Windows screen readers, VoiceOver, high zoom, or reduced motion in scope?
- How often are Where and Who filled in on non-meeting notes?

The highest-value usability test is small: ask users to capture a meeting note, create
three tasks, find all project tasks, complete one accidentally, undo it, and return to its
source note. Measure time, wrong turns, and whether users understand the folder and “This
note only” scopes.

For this project's current single-user focus, several observed work sessions with the
actual vault may be more useful than a broad generic usability panel. Record which
controls are discovered without prompting, where the user hesitates, and which task
ordering they expect before adding a larger planning model.
