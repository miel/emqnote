# Design critique — the library window's three panes

A UI critique of the library window as it stands at `v0.11.2`, written on 24 August 2026.
Finding 2 became B87 and Finding 3 B91; **Finding 7 became B92 on 30 August 2026**, which
also mitigated Finding 6. Findings 1, 4, 5 and 8 are open, and each carries its own note.
English rather than Dutch, following the same rule `CONSTRAINTS.md` and `HISTORY.md`
follow: this is a working document aimed at whoever is next in the code, not one of the
design documents `00`–`07`.

**Scope.** The three-pane layout of the library window only: folder tree, note list,
reader. Not the capture window, not the PDF window, not the dialogs, not the editor's own
typography beyond how wide its column gets. Not accessibility beyond what the layout
itself decides.

**Method.** Every claim below is from the real app, not from reading the CSS. The window
was run under `Xvfb` against a scaffolded vault built from `test/corpus/`, photographed at
three widths and in both themes, and pixel colours were sampled from the resulting PNGs.
Nothing here is inferred from a stylesheet alone, because this repository already knows
what guessing at layout costs.

To reproduce:

```bash
npm run build
Xvfb :95 -screen 0 1600x1000x24 &
DISPLAY=:95 ./node_modules/.bin/electron out/main/index.js \
  --library --vault=/tmp/vault --screenshot=/tmp/library.png --open-note="Stuurgroep"

# dark theme: same command with GTK_THEME=Adwaita:dark
# other widths: launch without --screenshot, then
#   xdotool windowsize $(xdotool search --name '^emqnote$' | tail -1) 760 620
#   import -window <id> /tmp/narrow.png
```

---

## What holds up

Worth saying first, because most of what follows is a complaint and the complaints are
not the whole picture.

- **The three panes are the right three panes.** Where → which → what. A note is found by
  narrowing twice, and both narrowings stay on screen while the note is read. Nothing in
  this critique argues for a different arrangement.
- **The reader is a real editor, not a preview.** Clicking a note and typing into it with
  no mode change, no "edit" button, is the single best decision in this window.
- **The note row carries genuinely useful density** — excerpt, tags, attendees, open-task
  count — and each of those was added for a reason that shows in `05-besluitenlog.md`.
  Finding 4 is about the arrangement, not about the content.
- **The sidebar footer is pinned rather than scrolling.** Tags, People, Tasks, Settings
  and Trash staying put while a long tree scrolls under them is correct, and the comment
  in `library.css` gives the right reason.
- **The reader footer now matches the capture window's** (B82). Two windows that edit the
  same note through the same editor agreeing about where a note's controls live is worth
  more than any local improvement either window could have made alone.

---

## Finding 1 — The layout's priority is inverted: the note pays for the window

**The most serious thing in this document.**

Two of the three panes have fixed pixel widths. The third — the one holding the note, the
reason the window exists — is `1fr` and absorbs every change in window size on its own.

At the window's own minimum (`minWidth: 760`, `library-window.ts:39`) the arithmetic is
`760 − 236 − 300 = 224`. The reader gets **224 px**, which is below the app's own declared
`READER_MIN` of 280 (`panes.ts:18`) and *narrower than the note list beside it*.

What that actually looks like, photographed:

- the note's text wraps at roughly **20 characters** per line;
- the header block clips mid-word — `Sat,…`, `#stuurgr`, `Jan de` — with no ellipsis;
- a **horizontal scrollbar** appears under the note;
- `Saved` and `Insert` overlap in the footer;
- and at the same moment the folder tree keeps its full 236 px with **450 px of empty
  space** in it, and the note list keeps its full 300 px with five rows in it.

The two panes that have nothing to show keep every pixel. The one with something to show
gives up all of it.

The cause is narrow and fixable: `clampPaneWidths` is only ever called from `onPaneDrag`
(`Library.tsx:565`). There is no resize handler and no `ResizeObserver`, so `READER_MIN`
is enforced against the splitter and against nothing else. The window can be dragged
anywhere and the constraint the code went to the trouble of writing simply does not run.

Then the same inversion runs the other way. At 1600 px the reader is ~1060 px wide and the
note's measure is about **125 characters per line** — roughly twice the comfortable range.
The tree still has 575 px of empty space; the note list is still five rows in a column of
900. Widening the window makes the note *harder* to read, and improves nothing else.

**What would fix it.** Two separate changes, and they are independent:

1. Re-clamp on resize, not only on drag. Enforce `READER_MIN` by taking width back from
   the tree and the note list, in that order — they are the panes with slack.
2. Give the reader's prose a `max-width` (a `ch`-based measure around 70–80 characters,
   centred) so that extra width becomes margin rather than line length. The capture window
   controls its own width and never had this problem; the library inherited the editor
   without inheriting the constraint.

---

## Finding 2 — In the light theme the three panes are not visually separated at all

Sampled from the light screenshot at `y=600`:

| x | colour | pane |
|---|---|---|
| 200 | `#ffffff` | folder tree (`--surface`) |
| 235 | `#dfe1e5` | the divider |
| 240 | `#fbfbfc` | note list (`--background`) |
| 535 | `#dfe1e5` | the divider |
| 600 | `#fbfbfc` | reader body (`--background`) |

**The note list and the reader are the same colour.** The only thing dividing them is one
pixel of `#dfe1e5` on `#fbfbfc`, which is a contrast ratio of **1.28 : 1** — at or below
the threshold of reliable perception on an ordinary panel, at an ordinary brightness, at
arm's length. The tree/list step is `#ffffff` against `#fbfbfc`, about 1.6 % lighter,
which is not a step at all.

So the entire structure of a three-pane window rests on a hairline nobody can see, and in
practice the light theme reads as one flat white field with some text arranged in it.

The dark theme does not have this problem: `#26282c` against `#1e1f22` is a plainly
visible step, and the panes read as panes. **This is one design decision producing two
completely different results**, which is the tell — the surface/background pair was chosen
where it works and not checked where it doesn't.

**What would fix it.** Widen the light theme's `--surface`/`--background` separation, or
give the panes their separation from something other than a 1 px line — a shaded sidebar,
a real gutter. The dark theme is the one to match, not the one to average with.

---

## Finding 3 — Nothing shows which pane the keyboard is in

`Ctrl+Tab` / `F6` cycle tree → notes → editor (B32), and the cycle is claimed all the way
up in `library-window.ts` because a Windows bug made it worth defending. It works. It is
also **invisible**.

Photographed sequence, on the running app: open a note, press `Ctrl+Tab`, screenshot;
press `Ctrl+Tab` again, screenshot. **The three images are pixel-identical.** The focus
outline only appears once an arrow key is pressed — `:focus-visible` does not fire on the
programmatic `.focus()` that `focusPane` performs — so after moving between panes the user
has no way to know where they are until they press a key and watch what moves.

Underneath that is a second problem that persists even once the outline is up. Two rows
are shown as "current" at all times:

- the selected folder, drawn with a grey fill **plus** `--accent` text **plus**
  `font-weight: 600`;
- the open note, drawn with a grey fill **and nothing else**.

The folder shouts and the note whispers, so the eye reads the folder as the live one even
when the note list has focus. And in the note list, hover and selected differ only in the
alpha of the same grey — `rgba(127,127,127,0.09)` against `rgba(127,127,127,0.18)`. One
channel, one step apart. Move the mouse across the list and the selected row becomes hard
to pick out of its own hover trail.

**What would fix it.** A pane-level treatment — an accent left border on the focused
pane's active row, a slightly stronger fill in the focused pane and a desaturated one in
the others. And the two panes should agree about what "selected" means: pick one recipe
and use it in both.

---

## Finding 4 — The note row is a variable-height composite, and the list does not scan

Measured row heights in a five-note list: **48, 67, 49, 86, 92 px**. Nearly a factor of
two, decided by whether the note happens to have tags, attendees or open tasks.

Three specific defects follow from that:

- **Titles do not align.** The pin's 12 px slot is only rendered when a note is pinned
  (`NoteList.tsx:373`), so a pinned title starts 20 px right of its neighbours. The one
  row the eye is meant to find first is the one out of the column.
- **The timestamp column has three shapes.** `formatListTime` returns `18:43` for today,
  `Aug 20, 07:40` for this year, `Jan 3, 2025, 09:00` otherwise — right-aligned, so the
  left edge of the number moves by up to 60 px down the list. This is the column the sort
  is on, and it is the column the eye cannot follow.
- **Tags reflow the row.** Four tags wrap to a second line and add ~22 px. The wrapping is
  invisible as a cause; the row just looks arbitrarily taller than its neighbour.

Each individual piece has a good reason recorded in the CSS, and I believe every one of
them. The problem is that the reasons were all local. Nobody asked what five of them
stacked look like as a *list*, and the answer is: ragged, with no horizontal line the eye
can run down.

**What would fix it.** Reserve the pin slot on every row. One date format, or a fixed-width
relative one. Cap the row at a fixed number of lines and truncate the tag strip to a
`+3` overflow chip rather than wrapping — `.tag-chip-more` already exists in the capture
window's header and does exactly this.

---

## Finding 5 — Unfolding Tags can push every other destination off the screen

`.tree-footer` carries `max-height: 55%`. In a vault with 17 tags, photographed: unfolding
Tags fills the footer, and **People, Tasks, Settings, Keyboard shortcuts and Trash are all
scrolled out of sight** — with **170 px of empty space sitting directly above** in the
tree, unused.

The cap allocates by percentage of the pane while the tree above it takes as much as it
likes and gives nothing back. In a vault with a shallow folder structure — which is what
this app is for; the design documents describe folders as a filing convenience, not a
hierarchy — the tree is nearly always the half with room to spare.

Second, smaller point about the same strip: it holds four different kinds of thing in one
flat list of identically-styled rows.

| Row | What it actually is |
|---|---|
| Tags, People | filters over the vault |
| Tasks, Unlinked | alternate views of the vault |
| Settings, Keyboard shortcuts | application chrome |
| Trash | a destination in the vault |

Settings and Keyboard shortcuts are the odd pair — they are not places in the vault and
they are the two that should never be able to scroll away, which under the 55 % cap they
can.

**What would fix it.** Let the footer grow into the tree's unused space before it starts
scrolling itself (`max-height` on the tree's own list instead, or a flex arrangement where
the footer's natural height wins until the tree actually needs the room). And separate
Settings/Help from the destinations — a divider, or move them out of the list entirely.

---

## Finding 6 — The tree toolbar's verbs have no visible object

> **Mitigated, not closed, 30 August 2026 — B92.** The three buttons moved into the header
> band and became icons, and each names the folder it would act on in its `title`
> (`Rename "01 Projecten"`); Delete already confirmed with a dialog naming what goes (B54),
> and Rename — the one with no confirmation — is the one the tooltip earns its place on.
> Neither of the fixes this finding actually asked for was taken: the object is still not
> *on screen* beside the verb, and the verbs are still not on the row. Both remain open.

`+ New`, `Rename`, `Delete` sit at the very top of the sidebar, above the `Vault` root
row. They act on `lastFolder`, which may be several rows below them, and with a tag or the
Tasks view selected is not the row that *looks* selected at all.

So `Delete` is a destructive verb whose target is not stated anywhere on screen and is not
adjacent to the button. The disabled state is used well — the buttons dim on the root and
the trash rather than waiting to refuse — but a dimmed button says "not this one", not
"this one".

The three buttons also duplicate the folder right-click menu exactly. The window ships two
complete copies of the same menu, and the reader's own empty state points at the hidden
one: *"Right-click a folder for new folder, rename, delete or a new note."* The visible
copy is the one that is ambiguous about its object.

**What would fix it.** Either name the object (`Rename "Projecten"`, or a persistent
"acting on: …" line), or move the verbs to where the object is — a hover affordance on the
row, with the right-click menu as the full set. The toolbar as it stands is the weaker
half of a duplicated pair.

---

## Finding 7 — Three panes, three different chrome heights, no shared datum

> **Answered, 30 August 2026 — B92.** All three panes wear one 40px `PaneHeader`; the note
> list and the reader wear one 28px `PaneFooter`; the tree's bottom menu stays deliberately
> outside that alignment for the reason given at the end of this finding's own section. The
> note list's two chrome rows became one band and one footer, with the search field taking
> the folder name's seat while it is open. `styles-pane-bands.test.ts` pins the two heights
> and, more usefully, pins that no third one exists.

Measured from the top edge:

| Pane | Chrome | Height |
|---|---|---|
| Tree | three buttons floating on the pane colour, no band, no border | ~40 px |
| Notes | search row + count/sort row, two stacked bars | 78 px |
| Reader | title band + the When/Where/Tags/Who block | 127 px |

Nothing lines up across the columns. There is no horizontal rule running the width of the
window, so the eye gets no top edge to the content area — three unrelated stacks that
happen to be side by side. This is most visible in the dark theme, where the `--surface`
bands are actually distinguishable and you can see them stepping down from right to left.

The tree is the worst of the three because it has no band at all: its buttons sit directly
on the pane, so in the light theme they read as floating in white space above the tree
rather than belonging to it.

**What would fix it.** One shared header height across all three panes, or one continuous
`--surface` band with the divider lines running through it. The reader's header block can
keep its extra height by living *below* the shared line rather than inside it.

---

## Finding 8 — A tag has three appearances, and the most button-like one is inert

| Where | Drawn as | Clickable |
|---|---|---|
| Note list | accent text, bordered chip, 3 px radius, on `--surface` | **no** |
| Header block | muted text, bordered pill, 999 px radius | no (it's a field's content) |
| Inside the editor | plain accent text, no chip | **yes** |
| Sidebar filter list | `#name` row with a count | yes |

The strongest visual affordance belongs to the one that does nothing. `.note-tag` in the
list looks like a small button — border, background, accent colour — and is a `<span>`.
The one you can actually click, in the editor, is styled as bare coloured text.

The list chips also make the row taller and wrap (Finding 4), so the treatment with the
weakest justification is also the one costing the most layout.

**What would fix it.** Either make the note-list chips do what they look like they do —
click filters to that tag, which the sidebar already supports — or draw them the way the
editor draws a tag: accent text, no box. Pick one visual identity for "tag" and use it in
all four places.

---

## Smaller notes

- **The splitters are invisible at rest.** 7 px of transparent hit area over a 1.28 : 1
  hairline (Finding 2), with a hover fill and nothing else. There is no reason to suspect
  the panes resize. That would be a minor complaint on its own — but the splitter is the
  only escape hatch from Finding 1, so an invisible affordance is hiding the workaround
  for the layout's biggest problem.
- **The reader footer's three buttons are equal-weight but not equal-kind.** `Insert`
  composes into the note, `Actions` operates on the note, `Help` is about the app. Three
  identical bordered buttons in a row say they are three of the same thing. `Help` in
  particular belongs with Settings, not with Insert.
- **`Saved` is 600 px from the buttons.** `space-between` across a wide bar puts the
  status where nothing else is, so the one piece of feedback that matters while typing
  sits at the far end of the window from where the eye is. It is also the same 11 px muted
  grey as every count in the window, which is the treatment for incidental information.
- **The counts in the tree are `5 / 7` with no legend.** Two numbers, a slash, the second
  sometimes bold. The meaning (notes / open tasks) is learnable and there is a `title`
  attribute, but a column of unlabelled number pairs is a lot to ask of a sidebar. Some
  are `1 / 0`, which is a column of zeroes saying nothing — B69's own reasoning about the
  note row's task badge ("a column of numbers that mostly say there is nothing there") was
  right and was not applied here.
- **There is no theme control.** The app follows the OS and there is no setting
  (`Settings.tsx` has no `theme` anything). For an app that is resident all day and whose
  two themes differ as much as Finding 2 shows, that is worth having.
- **The empty reader teaches a hidden gesture.** *"Pick a note on the left. Right-click a
  folder for new folder, rename, delete or a new note."* The largest area on screen, at the
  moment the user has nothing else to look at, is spent explaining a context menu that is
  already duplicated as visible buttons 900 px to the left.

---

## What I would change first

Ranked by how much the window improves per unit of work, not by severity alone.

1. **Re-clamp pane widths on window resize** (Finding 1a). Small, contained, and it stops
   the reader being crushed below its own stated minimum. `panes.ts` already has the
   function; it just needs a second caller.
2. **Give the reader's prose a max-width** (Finding 1b). One rule. Fixes the 125-character
   measure and makes every future width change harmless.
3. **Widen the light theme's pane separation** (Finding 2). Token change. Turns a flat
   white field back into three panes.
4. **Reserve the pin slot and fix the date format** (Finding 4, first two bullets). Two
   small changes that give the note list a left edge and a right edge the eye can follow.
5. **Show which pane has focus** (Finding 3). More design work than the others, and worth
   it: this window has a keyboard pane ring that currently cannot be seen.

Findings 5–8 are real but each needs a decision rather than a fix, and they should
probably go through `05-besluitenlog.md` rather than straight into the CSS.

---

## What this critique does not cover

Stated so the gaps are visible rather than assumed: the capture window (which by its own
design constraints deserves a separate pass), the PDF window, every dialog and overlay,
the Tasks and Unlinked views as views rather than as pane occupants, drag-and-drop feedback
beyond the folder drop outline, native window chrome on macOS and Windows, and the
question of whether the note list should be a list at all rather than a column of a table.
The reader's own typography — heading scale, list indentation, table styling — is also
untouched here; it looked considered in every screenshot and would need its own reading.
