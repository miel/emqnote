# Handoff: Pane consistency (tree / notes / reader)

## Overview
A visual-consistency pass over the three main panes of the Electron notetaking app: the folder tree, the note list, and the note reader. No functionality is added or removed — controls are relocated and de-duplicated, and one shared geometry, button language, shade scale and weight scale is applied across all three panes. Design principles held throughout: low latency (no animation on layout, no reflow-heavy chrome), fast entry/edit (every control stays one click or one shortcut away), and high density (28px header buttons max, 22–26px rows, no decorative whitespace).

## About the Design Files
The file in this bundle (`Pane Consistency.dc.html`) is a **design reference created in HTML** — a prototype showing the intended look and behavior. It is not production code to copy. Recreate the layout in the app's existing environment (React/Electron renderer, with whatever styling approach the codebase already uses: CSS modules, styled-components, plain CSS, Tailwind). The prototype's inline styles exist only so it renders standalone; translate them into the codebase's own conventions and tokens.

The prototype contains **two variants side by side**:
- `#1a` — **the approved design.** Implement this one.
- `#1b` — an earlier, denser alternative, kept for reference only. Do not implement.

## Fidelity
**High-fidelity.** Colors, type sizes, weights, row heights and control sizes below are final and should be matched. The prototype's note content is Dutch sample data from the original screenshots and is placeholder only.

## Screens / Views

### Single window, three resizable panes
Horizontal flex row, full window height. Left: tree pane (default 240px, min 170px). 4px vertical drag divider (`#dcdfe3`, `#b9c0c7` on hover, `cursor: col-resize`). Middle: note list (default 320px, min 210px). Second identical divider. Right: reader pane (`flex: 1`, min 320px). Divider drag clamps at min and 620px max. Pane widths persist per window.

**The invariant to preserve:** every pane's header band is exactly the same height and the notes + reader footer bands are exactly the same height, at any pane width. Headers and footers are `flex: none`; only the middle scroll region flexes.

### Header band (all three panes)
- Height **40px**, `flex: none`, background `#eef0f2`, `border-bottom: 1px solid #dcdfe3`.
- Padding: `0 6px 0 10px` (tree, notes), `0 6px 0 12px` (reader). Gap 6–8px.
- **Title**: 15px / weight 600 / color `#1e2226`, `flex: 1; min-width: 0`, single line with ellipsis. Tree = vault name ("Vault"). Notes = active folder name only, no path ("Alpha"). Reader = note title.
- **Actions**: right-aligned, 26×26px icon buttons.

### Footer band (notes + reader only — tree keeps its bottom menu instead)
- Height **28px**, `flex: none`, background `#eef0f2`, `border-top: 1px solid #dcdfe3`, padding `0 8px 0 10px` / `0 8px 0 12px`, font-size 12px, color `#6b7280`.
- Controls inside footers are the same button language at 20px height, 12px label.
- The tree pane's footer is intentionally **not** aligned with these two — its bottom menu (Tags / People / Tasks / Settings / Keyboard shortcuts / Unlinked attachments) is unchanged and keeps its own height.

### Tree pane
- Header: title "Vault" + three 26px icon buttons, right-aligned, in this order: `＋` (New folder), `✎` (Rename folder), `✕` (Delete folder). Each has a `title` tooltip; keep the existing right-click context menu as the second path to Rename/Delete. These replace the old full-width text-button toolbar row — the tree gains a heading without gaining a row.
- Body: scrollable, 4px vertical padding.
  - **Root row** ("All folders"): height 22px, padding `0 10px`, disclosure caret + label at 11px / weight 600 / `letter-spacing: .07em` / uppercase / `#8b9299`. It still collapses the whole tree; it no longer repeats the vault name, which now lives in the heading. (If the vault's root folder name should still be shown literally, show it here in this same muted small-caps style so the two never read as duplicates.)
  - **Folder rows**: height 26px, `display: flex; align-items: center; gap: 6px`, `padding-left: 8 + depth*16` px, `padding-right: 10px`. Caret column 10px, 9px glyph, `#8b9299`. Name flex-1 with ellipsis, weight 400 (600 when selected). Selected row background `#d9dcdf`; hover `#e7eaed`.
  - **Counts** (right-aligned, 12px, `font-variant-numeric: tabular-nums`): `total / unread`, total and separator `#8b9299`; unread `#3c4349` weight 600 when > 0, else `#8b9299` weight 400. Folders with no counts render **nothing** — no stray separator.

### Notes pane
- Header: folder name (15px/600) OR, when search is active, an inline 26px text input replacing the title in place (`border: 1px solid #b9c0c7`, radius 4px, white background, 13px, placeholder "Search in this folder…  (⌘F)"). Right side: 26px search icon button (magnifier, 1.6px stroke `#3c4349`) then `＋ New note` (26px, icon + label, 13px/500). ⌘F / Ctrl-F opens and focuses the input; Escape closes it and restores the title. The old separate search row and the old "This folder" scope button are gone — the field lives in the folder heading, so its scope is self-evident; keep a scope toggle inside the search field's own affordances if global search is needed.
- List: rows with `padding: 7px 10px 8px`, `border-bottom: 1px solid #e4e7ea`, hover `#eceff1`, selected `#d9dcdf`.
  - Line 1: optional pin glyph (`⚲`, 11px, `#6b7280`), title 13px/600 flex-1 ellipsis, timestamp 12px `#8b9299` right.
  - Line 2: snippet 13px/400 `#6b7280`, single line ellipsis.
  - Line 3 (if tags): tag pills, 12px, `#2563c9` on `#e6ecf7`, radius 3px, `padding: 1px 5px`, gap 4px.
  - Line 4 (if people): `◍` `#8b9299`, names 12px `#2563c9` ellipsis, "Tasks: n" right-aligned when the note has tasks.
- Footer: "4 notes" left; right: `⇅ Modified` (opens the sort menu) and `☑ Tasks` (task filter toggle). Both moved down from the old toolbar row. **There is exactly one sort control in the app** — the header's duplicate `⇅` was removed.

### Reader pane
- Header: note title (15px/600, flex-1, ellipsis) + `⋯` 26px button (overflow menu: reveal in folder, copy path, export, delete, etc.). Nothing else. The file path is no longer in the header.
- Metadata block (unchanged in function): `flex: none`, `border-bottom: 1px solid #dcdfe3`, padding `6px 12px`, CSS grid `52px 1fr 44px 1fr`, gap `5px 8px`. Labels 12px `#8b9299`; value fields 22px tall, background `#e9ecef`, radius 3px, padding `3px 8px`, 13px; Tags and Who values in `#2563c9`, Who ellipsised.
- Body: scrollable, padding `10px 14px 16px`, line-height 1.45, 13px. Rendered-markdown headings 17px/600 `#3c4349`. Tables: `border-collapse: collapse`, 1px `#dcdfe3` borders, cell padding `4px 8px`, header row background `#eef0f2` weight 600.
- Footer: left slot is **either** the read-only warning ("Read-only preview — open for editing in the capture window", link in `#2563c9`) **or**, when the note is editable, the file path (12px `#8b9299`, ellipsised — right-truncate from the left so the filename stays visible). Right side: `＋ Insert ▾` (only when editable — the editor command menu: Insert Image, Insert File Attachment, Insert Table, Insert Divider), `Actions ▾`, and `?` (keyboard shortcuts, icon-only). Insert used to sit in the header; it belongs with the editor controls in the footer.

## Interactions & Behavior
- Pane resize: `mousedown` on divider stores start x + start width, `mousemove` on window updates width (clamped), `mouseup` ends. No transition on width — instant tracking.
- Search: icon click or ⌘F/Ctrl-F reveals the inline input and focuses it; Escape or blur-with-empty-value restores the heading. Filtering is live per keystroke and scoped to the active folder.
- Selection: single click selects a folder / note (background `#d9dcdf`, folder name goes weight 600). No animation on selection — repaint only.
- Hover on any button: background `#dfe3e7` + `border-color: #c9ced4` (border is 1px transparent at rest, so nothing shifts). Active/pressed: background `#d4d9de`.
- All tooltips via native `title` so no JS tooltip layer is needed.
- Every relocated control keeps its keyboard shortcut and its context-menu entry; nothing became mouse-only.

## State Management
- `treeWidth`, `listWidth` (persisted per window), `dragging: {target, startX, startWidth} | null`
- `searchOpen: boolean`, `query: string` (per note-list instance)
- `selectedFolderId`, `selectedNoteId`
- `sortKey` / `sortDir` (driven by the footer control only), `taskFilterOn: boolean`
- `isEditable` / `readOnlyReason` — decides whether the reader footer shows the warning or the path, and whether `Insert` renders.
- Prototype-only toggles (`showFolderCounts`, `showTagsInList`, `showPeopleInList`, `readOnlyWarning`) exist to demo states; wire the first three to real preference settings if you want them, drop otherwise.

## Design Tokens
Colors
- pane background `#f5f6f7`
- header/footer band `#eef0f2`
- divider / border `#dcdfe3`; list row divider `#e4e7ea`; strong divider `#c9ced4`
- selected row `#d9dcdf`; hover row `#e7eaed` (tree) / `#eceff1` (list); button hover `#dfe3e7`, button hover border `#c9ced4`
- metadata field `#e9ecef`
- text primary `#1e2226`; heading/strong `#3c4349`; secondary `#6b7280`; muted `#8b9299`
- accent (links, tags, people) `#2563c9`; tag pill background `#e6ecf7`
- input border `#b9c0c7`, input background `#ffffff`

Type — system UI stack, exactly four sizes and three weights
- 15px / 600 — pane headings
- 13px / 600 — note titles, markdown `strong`, table headers
- 13px / 500 — labelled buttons
- 13px / 400 — body, folder names, snippets
- 12px / 400 — footers, counts, timestamps, metadata labels, tag pills
- 11px / 600 uppercase `.07em` — tree "All folders" row
- 17px / 600 — rendered markdown headings
No other size or weight anywhere.

Spacing / sizing
- header 40px, footer 28px, tree row 26px, tree root row 22px, bottom-menu row 26px
- header icon button 26×26, labelled header button 26px tall `padding: 0 9px`, footer button 20px tall `padding: 0 6px`
- radius: 4px buttons/inputs, 3px pills and metadata fields, 6px window
- divider 4px; gaps 4/6/8px

## Window chrome (Electron, per OS)
Go **frameless** and fold the OS chrome into the existing 40px header band. 40px covers both platforms (macOS traffic lights ~28px, Windows 11 controls 32px), so the chrome costs no extra vertical space and the three pane headers stay aligned. Do **not** add an app-level title bar row above the panes — it burns 28–32px on nothing and breaks the "three equal headers" reading — and do not draw custom close/minimise/maximise buttons (they never match the OS and you lose the Windows 11 snap-layouts flyout).

### macOS
- `new BrowserWindow({ titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 12 } })`
- Traffic lights overlay the **tree pane** header. Change that header's padding from `0 6px 0 10px` to `0 6px 0 78px` so the vault title clears them.
- On fullscreen the inset disappears: listen for `enter-full-screen` / `leave-full-screen` (or watch `window.matchMedia('(display-mode: fullscreen)')`) and drop the left padding back to 10px.
- The tree pane's 170px min width is well clear of the lights, so pane resizing can never collide with them.

### Windows 11
- `titleBarOverlay: { color: '#eef0f2', symbolColor: '#3c4349', height: 40 }` — matched to the band so the buttons read as native but sit inside your header.
- Controls land top-right, over the **reader pane** header. Pad that header's right edge so `⋯` never hides under Close: `padding-right: calc(100vw - env(titlebar-area-width, 100vw) + 6px)`, or simply `padding-right: 148px` if you prefer a fixed value.
- Keep the standard frame as fallback on Windows 10 and Linux (`titleBarOverlay` is a no-op there and hiding the frame loses the system menu).

### Both platforms
- `-webkit-app-region: drag` on all three header bands.
- `-webkit-app-region: no-drag` on **every** button, input, and — important — the pane dividers; otherwise dragging a divider drags the window.
- Double-click on the band should zoom/maximise; that comes free with `drag`.
- Footers stay non-draggable (they hold controls).

## Assets
None. All glyphs are Unicode text (`＋ ✎ ✕ ⋯ ⇅ ☑ ◍ ⚲ #  ⚙ ? ⎘`) except the search magnifier, which is a 2-element inline SVG (circle + line, 1.6px stroke). If the codebase already has an icon set, use it — matching sizes (13–14px glyph in a 26px button) matters more than matching shapes.

## Files
- `Pane Consistency.dc.html` — the prototype. Variant `#1a` is the approved design; `#1b` is reference only. Open it in a browser: panes drag, ⌘F opens search, rows select. `support.js` sits beside it and is only the prototype's runtime — nothing to port.
- `screenshots/1a-window.png` — the approved design, full window at 2x, in the read-only state (reader footer shows the warning, `Insert` hidden).
- `screenshots/1a-reader-footer.png` — the reader footer at 4x, for the exact footer geometry and button sizes.

## Implementation order (suggested)
1. **Shared chrome primitives first**: a `PaneHeader` (40px band, 15px/600 title slot, right-aligned action slot) and a `PaneFooter` (28px band, 20px button slot). Everything else follows from these two, and they are what guarantee requirements 2 and 3 stay true as the app changes.
2. **One button component** with the three sizes (26px header icon, 26px header labelled, 20px footer) and the single hover rule. Replace every ad-hoc button with it.
3. **Tree pane** — smallest change: header + icon buttons + the "All folders" root row.
4. **Notes pane** — move count/sort/tasks into the footer, then add the collapsing search field and delete the old search row and header sort.
5. **Reader pane** — header down to title + ⋯, path and `Insert` into the footer, gated on editability.
6. **Window chrome** last, once the header band is a single component.

## Acceptance checks
- All three pane headers report the same `offsetHeight` (40) at any pane width and any window size.
- Notes and reader footers report the same `offsetHeight` (28). The tree's bottom menu is deliberately different.
- Exactly one sort control exists in the note list.
- Folders without counts render no separator character.
- No control lost its keyboard shortcut or context-menu entry versus the old layout.
- Only the four type sizes and three weights listed above appear in the three panes.
