# TODO

Working list. The phase plan lives in `04-bouwplan.md` and the decisions in
`05-besluitenlog.md`; this file is only what is open right now.

Last updated 1 September 2026, **unreleased** — **five bug reports from daily use** (B95),
two of which turned out to be one.

Moving a marked set was slow *and* announced "This note was deleted outside emqnote", and
both came out of the same seam: `moveNotesTo` looped over a one-note IPC channel and did not
even serialise the loop — `runRelinkable` `void`ed the promise it was supposed to be awaited
through — so every note cost a full walk of the vault, three `library:refresh` broadcasts and
a seven-part reload, all interleaved. It is one `IPC.libraryMoveNotes` call for the set now,
with one broadcast, one link question and one reload; the row the reader steps onto afterwards
excludes every path in the set (it used to be the row above, which in a contiguous selection
is another note on its way out); and `library:refresh` is coalesced, leading edge first. A
third defect fell out of the same reading and had never been reported: with two linked notes
in a set, each `setDialog` overwrote the last and every note but the final one silently did
not move.

Beside that, `own-writes.ts` grew a path-keyed sibling to its content hash — a hash cannot
speak for a path that no longer exists, so every move the app made was reported as a deletion
from outside it. Three more: the three bars above the pane grid now reserve the Windows 11
caption-button inset (`--caption-inset`, declared once); the empty note pane keeps its header
and footer, and the file preview became a real `PaneHeader`/`PaneFooter` instead of a fourth
idea about how tall chrome is; and `Mod+T` toggles the Tasks view.

**What is open on it.** `TEST-PROTOCOL.md` §49 carries ten rows. Four are Windows 11, where
the caption-button overlay is the only place these CSS rules do anything at all. Three are
the latency report itself, which needs a real vault on real OneDrive — four notes under
`Xvfb` prove the shape of the fix and nothing about the size of it. And one thing is written
down rather than fixed: `ensureScanned` still has no memo for a clean index, so every call
that reaches it walks the whole vault. That is the largest single cost left, and it was left
deliberately — skipping the walk means trusting the watcher to have seen everything, and
Windows polling (B57) is where that trust has already failed once.

---

Last updated 31 August 2026, released as `v0.12.6` — **twelve items from daily use**
(B94): five bugs and seven features, and one trade running through all of
them.

The trade is in the note list's footer. The plain Tab order is now the order the eye reads —
folders, notes, **the note's title**, When, Tags, Where, Who, the note — and for that to be
true, four things had to leave the order: both pane splitters and the sort and Tasks buttons.
Those two gained `Mod+S` and `Mod+T` in the same change, which is what makes it a trade
rather than a removal; if either chord is ever dropped, the `offTabOrder` on its button has
to go with it. The pane ring went back to three stops at the same time, and the note's four
fields got `Mod+Shift+W` instead of being walked through on every Ctrl+Tab.

The rest: an empty `- [ ]` stops counting as a task everywhere (and `SCHEMA_VERSION` goes to
5 for it); a highlight applied to selected text is visible while it is still selected; the
settings panel scrolls; "Check for updates…" is in Settings too; the sort chooser is two
controls, arrows and a name; the note list can mark several notes for Move and Delete, by
menu and by drag; the shortcut sheet has a `/` search and columns that pack rather than cut;
and the note's title moves the window when a press travels and opens the rename when it does
not.

**Driven, not guessed — with a new harness.** `npm run drive:library` is
`drive-capture.ts`'s counterpart, and it exists because three of these claims cannot be
asked under `test/` at all: jsdom implements no sequential focus navigation (so every jsdom
test of a Tab order takes the browser's word for five of its eight steps), the window's own
position is where the title-drag's only observable result appears, and `-webkit-app-region`
does not exist there — the class of bug the entry below records twice. Fifteen steps, green
twice in a row.

**What is open on it.** `TEST-PROTOCOL.md` §48 carries thirty rows; four of them are the
ones this machine cannot answer. ⇧⌘W must not close the window on macOS (⌘W is close there),
⌘T is Show Fonts in a Mac text view, Ctrl+T is Chromium's own "new tab" on Windows — three
chords that have never run on the platform that might refuse them — and whether a dragged
title keeps up with the pointer is a judgement for a machine with a window manager, which
this sandbox does not have.

---

Last updated 31 August 2026, **unreleased**, on the `worktree-pane-consistency` branch —
**six items from using the pane-consistency build**, on top of B92 below.

Two are regressions of B92 and are the same mistake twice, from opposite sides. Both windows
went frameless, which made `.pane-header` a `-webkit-app-region: drag` band — and Chromium
hands a press inside one to the window move, never to the element under it. So the reader's
title stopped opening its rename and the capture window's title could not be clicked into at
all. And the shared `.title-field` rule was spelled `.header .title-field`, which is where
that input *used* to live: B92 moved it into the band, the selector matched nothing, and the
capture window's title fell back to a bare UA `<input>` at 13px in a box. **Both survived a
full green suite**, and `library-title-edit.test.ts` drives the very click that had stopped
working — jsdom implements no app-region, and a text check of a stylesheet reads the
declarations without asking whether anything matches them. `styles-title-field.test.ts` pins
the container against the markup now, and `styles-pane-bands.test.ts` counts the two title
controls' `no-drag` by hand.

The other four: the traffic-light clearance goes 78px → 92px (it read as crowding);
**the pane ring gains a fourth stop** — the note's own When / Tags / Where / Who block, in
both directions, because from the editor there was no way back up to those fields at all;
**`Mod-[` is Back** after following a `[[…]]` link, which had a button and no chord; and the
← button keeps a gap from the file path beside it.

**Driven, not guessed.** Five of the six were run in the real app under `Xvfb` over CDP
before this was written, with real XTEST keys and real pointer coordinates — the capture
title measured 15px/600 transparent and took a click, the reader's `<h1>` opened its rename
from a click, the ring walked editor → Who → row → When → editor, Shift-Tab from Who reached
Where, and `Ctrl+[` walked back. **The sixth cannot be**: this box keeps its native frame, so
the 92px is the one number nobody has looked at. `TEST-PROTOCOL.md` §46 carries all thirteen
rows; §46a is that one.

---

Last updated 30 August 2026, **unreleased** — the pane-consistency pass (B92), on the
`worktree-pane-consistency` branch. `DESIGN-CRITIQUE.md`'s Finding 7 is answered: all three
panes wear one 40px header band and the two with a footer wear one 28px band, both from a
single rule, and every button in either window's chrome is one component at one of three
sizes. Both windows are frameless now, with the platform's own controls drawn into the band.

**What is open on it.** Nothing involving a window frame has been seen — this sandbox is
Linux, the one platform deliberately left framed — so `TEST-PROTOCOL.md` §45 is a first
sighting from end to end. §45f is the row to walk first: on Windows the application menu can
no longer be drawn in a frameless window, and its Edit accelerators used to be reachable
through that bar. Chromium is expected to handle Ctrl+Z/X/C/V/A natively in a text field,
but that is a claim about Chromium rather than something anyone here has watched happen; if
it does not hold, the fallback is a Windows-only decision to keep the frame.

Finding 6 is *mitigated* rather than closed — the tree's icon buttons name their folder in a
tooltip, and Delete already confirmed with the name in it — and Findings 1, 4, 5 and 8 of
`DESIGN-CRITIQUE.md` are untouched.

---

Last updated 30 August 2026, released as `v0.12.4` — **what `v0.12.3` broke on its way past
the thing it fixed**, and the flake that had been hiding behind it. The claim that keeps a
dragged rectangle alive past `mouseup` was released by a mouse press and by nothing else, so
after a drag the caret could not move until something was clicked: an arrow, Home, End and
Ctrl+End are all performed by the browser and read back out of the DOM, through the very
guard that claim arms. A key drops it now, ahead of the keymaps.

The same day's other finding is about the harness rather than the app. The `/` menu step of
`scripts/drive-capture.ts` had been failing every so often for weeks and had been called
flaky twice, including by me in the release before this one; it was reading a rectangle the
step above it had left behind. **A step that types owes itself a known selection.** It
presses an arrow until the rectangle is gone and checks rather than assumes.

`TEST-PROTOCOL.md` §44 carries the six rows, and every one of them deliberately starts from a
rectangle — the state nothing had been tried from, which is exactly how `v0.12.3` got out.

---

Last updated 30 August 2026, released as `v0.12.3` — **two defects, found by looking at the
app rather than at the tests**. Both came out of the UI kit. The empty capture window had
never drawn its "Just type." hint, for two independent reasons at once; and a rectangle of
table cells was thrown away a few milliseconds after the button came up, whenever the machine
was busy enough for the browser's own selection to be read back late.

Neither is new, and that is the part worth keeping. The hint was never covered by a test of
the *rendered* result — three files mentioned "placeholder" and all three meant an `<input>` —
so a rule aimed at the wrong element sat there in plain sight. The drag had a test for
everything except the one decision that had no layout in it. **A Heisenbug that a probe
silences is still a bug**: every attempt to instrument the drag made it pass, and what found
it was raising the failure rate instead — three busy loops on a two-core box, where it failed
three runs in six. `TEST-PROTOCOL.md` §43 carries both, and §43g is the one to walk on a busy
machine.

The `/` menu step of `scripts/drive-capture.ts` (B51) flaked once under that same load and
was not chased. Different symptom, possibly the same class — the next person to see it should
reach for the load rather than for a probe.

---

Last updated 27 August 2026, released as `v0.12.2` — **the Settings chord is the comma**.
One line, one release. It went out in `v0.12.1` as `⌘.` / `Ctrl+.`, which was "⌘. on macOS"
taken literally; `⌘,` was meant, and it is the better binding for a reason worth keeping: the
comma is the convention on *both* platforms at once — Preferences on a Mac, Settings in VS
Code and its neighbours — and this registry has no per-platform `keys`, so a chord that is
conventional in both places is one entry rather than a compromise. `Mod-.` is not kept as an
alias: it was a mis-spelling of this chord, not a second way anyone reaches for it, and a
claim costs the key for as long as the app runs. `TEST-PROTOCOL.md` §42i–§42l carry it.

---

Last updated 27 August 2026, released as `v0.12.1` — **four items from a day of using
`v0.12.0`**, the batch immediately below this one. Two decisions, **B90** (the theme is a
choice of this machine) and **B91** (the note list's focus ring comes back). The other two
are a measurement and a missing chord. Released as a **patch**, which was the call made when
it went out: by the convention the tag before it followed, the theme would have made this a
minor — it is something the app could not do at all — and the other three items are defects.

**Driven, not guessed.** Three of the four were run in the real app under `Xvfb` with a real
Chromium behind it before this was written. The theme flips both windows live: on this
light-mode box, choosing dark put the library *and* the hidden capture window on
`prefers-color-scheme: dark` with `--surface` at `#26282c`, "system" came back to
`#ffffff` / `#f4f5f7`, and the choice survived the bootstrap round trip. The Settings chord
opened the panel from a focused note row. The note row's ring measures `rgb(26, 99, 216) solid 2px`
at `-2px`, which is `--accent` to the byte. And the marker correction was measured as a
delta rather than judged: the checkbox moved exactly 1.000 px and the star exactly 2.000 px
at a 16 px note.

**The theme is a setting** (B90): system / light / dark, per machine, in Settings beside the
text size. `nativeTheme.themeSource` in main and **no** `data-theme` and no second set of
rules — `prefers-color-scheme` is what all three stylesheets already ask, and it is also what
the scrollbars and the `<select>` popup obey. Applied before the first window is built, or a
machine whose choice differs from its OS opens every window with a flash of the wrong theme.

**The note list's focus ring is back** (B91), and the lesson is bigger than the colour.
Yesterday's batch removed `.note:focus-visible` on the Windows 125 %-scaling report — and
**that removal never removed a ring**: a note row carries a roving `tabIndex`, so it is
focusable regardless, and with no rule of ours the UA drew its own in the platform's accent
colour. On macOS that is orange, which is exactly how it was reported. The three panes share
one rule again. **§41a and §41b are superseded** — the ring is expected in the note list now,
and the cost §41b asked about was never paid: the focused row was not invisible, it was
orange.

**The checkbox and the star came 1 px and 2 px left**, off a report against a real display.
Two hand-placed marks each out by their own amount is each one's own ink extent, not a shared
mistake in `--marker-slot` — which the bullet is measured against and which does not move. In
`em` at 16 px, because B88's text size moves the whole note and a marker corrected in pixels
would come apart at every other size.

**Settings has a chord**: it shipped in `v0.12.1` as `⌘.` / `Ctrl+.` and is `⌘,` / `Ctrl+,`
since `v0.12.2` — see the entry above this batch. It fires below the overlay guard, unlike the
help sheet, because the panel is where global accelerators are recorded and an armed
`HotkeyRow` must be able to record this very chord.

The suite is 1955 tests over 158 files. One new file — the theme row in Settings — plus the
chord in `keyboard-nav.test.ts`, the two corrected marker offsets, and
`styles-selection-accent.test.ts` rewritten around the ring.

**Open, and deliberately not done here.** `DESIGN-CRITIQUE.md`'s Finding 3 is still open and
is now back where it was before yesterday: a ring that only appears once an arrow key is
pressed, and no pane-level treatment. Findings 1, 4, 5–8 untouched. `.disk-change-bar` and
`.conflict-banner` are still hardcoded amber in both themes — and the theme setting makes
that slightly more visible, not less. The text size still has no chord.

---

Last updated 27 August 2026, released as `v0.12.0` — **four defects and two features from a
day of using `v0.11.2`**, which is the batch immediately below this one. Two decisions, B88 and
B89, and **B87 gains an addendum** on its own two items. A **minor** release rather than the
three patches before it, and it carries the batch below with it: two of these six are things
the app could not do at all, and B87 had not shipped.

**Driven, not guessed.** Everything here was run in the real app under `Xvfb` with a real
Chromium behind it, and the two items a sandbox is worst at were driven with real input
rather than synthetic events: the spring-loaded folder over CDP's `Input.setInterceptDrags`
+ `Input.dispatchDragEvent`, which is a genuine HTML5 drag and not a `dispatchEvent` that
happens to be named one; and the heading chords through `Input.dispatchKeyEvent` into the
capture window's real keymap. Twelve checks, all `ok`. `npm run drive:capture`'s own nine
still pass after the editor CSS change.

**Two colours out of the library, and one of them was the same variable doing two jobs.**
The selected folder lost `color: var(--accent)` — it kept the weight — and the note list
lost its `:focus-visible` ring, which on Windows at 125 % scaling paints two pixels as
three. "Selected" now means the `--selected` fill in both panes, which is what
`DESIGN-CRITIQUE.md`'s Finding 3 asked for. **Finding 3 itself is not closed and is now
slightly worse**: with no ring on a note row, the row the arrow keys are on is invisible
until Enter opens it. The answer to that is the pane-level treatment Finding 3 describes, not
this ring back. Sampled out of the PNGs: no `#1a63d8` on any of the four edges of the
selected note row, and the selected folder's label is `--text`. The only accent left on that
row is the `Tasks: 1` badge, which is by design.

**A note held over a collapsed folder unfolds it after 600 ms.** The one thing about it that
is not obvious is written up in `CONSTRAINTS.md`: the countdown is armed *before*
`canDropNote` is consulted, because the folder a drag most needs to open is very often one
the drop itself would refuse — the note's own parent, on the way to a sibling underneath it.
A folder that springs stays open.

**A heading is reversible two ways** (B89), which is how it was reported. `Mod+1` on an H1
gives a paragraph; a list or task command with the caret in a heading lifts it to a paragraph
first and then does what it was asked, in one transaction, so one Ctrl+Z undoes the whole
press. The second half was not a bug in the sense of something broken — `wrapInList` finds no
wrapping for a heading and correctly returns false — which is exactly why it was invisible.

**The note has a text size** (B88), five steps in Settings, per machine. Everything inside
`.editor-content` was already `em` against one `px` literal, so one token moves the whole
note evenly: measured, the H1 "Kwartaalplan" is 142 / 174 / 219 px wide at 13 / 16 / 20
against 141.4 and 217.5 predicted. Chrome does not scale with it. **It is a global setting
and not a per-note one**, which was the question asked: a size per note would be a display
preference in the frontmatter, travelling to the other machine and to Obsidian as noise.

**And it turned up a hole that predates it.** Main has been broadcasting "a setting changed"
to both windows since B60 and **neither window listened** — it was sent as `libraryRefresh`,
which means "ask the vault again", so the library answered it by reloading the tree and the
notes, and the capture window subscribed to nothing at all. Changing the language only ever
took effect because the Settings panel refreshes its own window on the way out. There is a
real `IPC.settingsChanged` now, with `useBootstrap` as its single subscriber, so both windows
follow it — which also means the language finally reaches the capture window.

**The pin on a pinned row is a button.** It unpins, through the same `setPinned` the menu
item and the chord already use.

The suite is 1945 tests over 157 files. Four new files: the spring-loaded folder, the two
ways out of a heading, the two accent rules, and the note's own text size — plus `useBootstrap`'s
settings subscription, which nothing tested before.

**Open, and deliberately not done here.** `DESIGN-CRITIQUE.md`'s Findings 1, 4, 5–8 are
untouched, and Finding 3 is open with a note above about what this batch cost it.
`.disk-change-bar` and `.conflict-banner` are still hardcoded amber in both themes. And the
text size has no chord: if adjusting it while typing turns out to matter, `Mod+0` is already
"Ordinary paragraph", so a reset would have to be `Mod+Shift+0`.

---

Last updated 26 August 2026, released as `v0.12.0` alongside the batch above — **one surface
system, six roles** (B87), out of
`DESIGN-CRITIQUE.md`'s Finding 2. **Not seen on a real display**: every
row of `TEST-PROTOCOL.md` §40 is a colour, and colours are the thing a sandbox is worst at.
What *was* measured here, under `Xvfb` with the pixels read out of the PNGs: the light theme's
three panes now sample `#f4f5f7` / `#d7dbe1` / `#ffffff` / `#ffffff` where the critique
measured `#ffffff` / `#dfe1e5` / `#fbfbfc` / `#fbfbfc`, and the dark theme is byte-identical at
the same five points. `npm run drive:capture` gives its nine `ok` lines.

**The light theme's two surface tokens were the wrong way round**, which is the whole of it:
`--surface: #ffffff` framing a `--background: #fbfbfc` page, so the chrome was lighter than
what it framed and a code block, a wiki-link chip and a tag chip were all white on off-white.
The page is white now and everything framing it is grey. Three roles that had no name got one —
`--field`, `--hover`, `--selected` — and the last two replace **seven** different alphas of the
same grey across fifteen rules. The dark theme keeps its five surfaces to the value.

The suite is 1910 tests over 152 files. One new file: the surface system itself
(`styles-surfaces.test.ts`), which pins the polarity, the two state tints, the count of grey
literals left outside `:root`, and that every `var()` names a token that has been declared —
`var(--bg)` and `var(--fg)` had both been sitting in `styles.css`, declared nowhere.

**Open, and deliberately not done here.** `.disk-change-bar` and `.conflict-banner` are still
hardcoded amber (`#ffe6b3`, `#ffd875`, with `#7a4a00` text) in *both* themes — a real defect,
and a warning-colour decision rather than a surface one, so it wants its own thinking rather
than a value picked in passing. The rest of the critique is untouched: Findings 1, 3, 4 and 5–8
are still open, and Finding 3 in particular is the one this batch could only half-answer —
hover and selection are now a clean two steps of one grey, and if the selected row still gets
lost in its own hover trail the answer is a second channel (an accent edge on the focused
pane's active row), not a darker grey.

---

Last updated 23 August 2026, released as `v0.11.2` — **five items from a day of using
`v0.11.1`**, which is the batch immediately below this one. A **patch** release, like the one it
answers and for the same reason: every item in it arrived as a defect report against that
release, and four of the five are a colour or a position rather than anything the app could not
do. No new decision: **B86 is extended** to the two ordinary deletes, and the one question
`TEST-PROTOCOL.md` §38q put to a human came back answered. Those four are what §38 could not
settle from a sandbox, and **three of them were driven here this time**: under `Xvfb` on the
real renderer, with the pixels read out of the screenshots rather than judged by eye. §39 is
what a real display still has to say.

**The Tasks scope chooser asks whichever count the tick is asking.** It asked `total` so that
ticking "open only" could not rebuild the list under your hands — but the view *opens* with that
box ticked, so a folder whose tasks were all finished was offered and led to an empty pane. The
rebuild that argument was avoiding is answered by the rule beside it rather than by refusing to
ask: `scope` is never dropped, so the folder being stood in survives its last task going out of
scope. §38's own writeup named this as the likeliest cause of a report it could not reproduce
and as the one call in that batch that could go the other way; it went the other way.

**Delete and Delete folder count the open tasks going with them.** The two permanent deletes
have counted them since B86; the two that move something to `_trash` had not, on the unstated
reasoning that a reversible action needs less of a question. Same fact either way — a trashed
note is out of the Tasks view and out of every folder badge at once — and Restore is a
difference in the buttons, not in the count. On a folder it is the third number in the same
bracket as the notes and subfolders, walked through the whole subtree. Two things fell out of
it: the walk was called `trashItemTasks` and never had anything to do with the trash, so it is
`openTasksAt` now, and the delete question carries the **path** it asked about, so confirming
trashes the note the sentence named rather than whatever was open.

**Three layout fixes, all measured.** `.notes-search` and `.header-reader` — the search strip
and the note's own When/Where/Tags/Who block — had no background of their own and sat on
`#fbfbfc` between strips that are `#ffffff`; the second is the same component the capture window
draws on `--surface`, so one shared block was drawing itself two colours depending on the
window. And the capture window's `[Insert] [Actions] [Help]` stood in the middle of its footer
because `.statusbar` is `space-between` with **four** children where the library's footer has
two — the fourth being the latency readout, which renders as an empty `<span>` until the first
measurement and still takes a slot and a gap. `.reader-status` now names `.capture-status`
beside it in `styles.css`, the way the buttons' own rule already did, and the readout sits
inside that group.

The suite is 1898 tests over 151 files. One new file: the Delete folder question.

---

Last updated 23 August 2026, released as `v0.11.1` — **twelve items from a day of using
`v0.11.0`**, which is the batch immediately below this one. Two decisions, B85 and B86, and
B82 is revisited on two points in its own entry. A **patch** release: every item in it came in
as a defect report against the release it answers, and none of it is a feature that was not
there before — the two decisions are both about a question the app already asked badly.
Everything here is built, tested and typechecked; **none of it has been driven in the running
app**, unlike the batch it answers, so `TEST-PROTOCOL.md` §38 is a first sighting from top to
bottom.

**B85 — Discard asks first, unless the note is empty.** It asked nothing, on the argument that
the draft goes to `_trash` and Restore is the way back — B54's own argument for the drag onto
the trash, and it does not carry here: Discard is on a chord, one item into a menu at the foot
of a window someone is typing in, and it takes the window with it, so nothing is left on screen
to notice by. "Empty" is judged on the document's *structure*, never its text — a note holding
only a pasted picture has no text and is exactly what could not be retyped — and `dirtyRef` is
deliberately not the signal, over-reporting as it does by design.

**B86 — the Empty-trash question says what emptying it costs.** Two numbers beside the three it
already had, and neither counts something in the trash: the **open tasks** in the notes about to
go, and the **linked files** that become unlinked attachments because the last note naming them
is leaving. That second one subtracts the live notes' targets — taken from the index, not by
reading the vault — so it is exact rather than a guess. The same task count appears per item in
the "Delete permanently" question, walking a trashed folder for the reason the whole-trash count
is recursive. The button says **Empty trash**.

**The bullets are decided for the second time, the other way.** `v0.11.0` enlarged levels one
and two to `\25CF`/`\25CB` so all three would agree in size; in use that read as far too heavy,
at the two depths every note uses. `\2022` and `\25E6` are back — 0.293em of ink against
0.668em. What survives from the first fix is the half that was genuinely about the square: its
own 1.66em slot and its own ink centre, now per depth (`--check-bottom`/`--star-bottom`) instead
of the single constant that could only ever match one of the two. The remaining cost is stated
rather than discovered: on a Mac, level one falls back to a different face than the levels under
it.

**Focus after a move had its cause one layer below the report.** Nothing takes focus away — the
row holding it is unmounted, because the note it drew has left the folder, and focus falls to
`<body>`. The fix is the flag the Tasks and search exits already use, plus standing on the row
*above* the one that moved. Only when the note that moved is the one being read; a note dragged
out while something else is open leaves both the reader and the caret alone.

**Eight more, no decision needed:** the library's note editor gained the Help button its footer
did not have, third after Insert and Actions; `[Insert] [Actions] [Help]` is one CSS rule naming
both windows' groups instead of two copies that had drifted apart; `.reader-header`,
`.reader-footer` and `.notes-header` are shaded on `--surface` like the capture window's strips,
with the note list itself deliberately left alone; and the capture window's title placeholder is
"Title (optional)", dimmed further than every other placeholder because it is the only one drawn
at 17px bold — which reverses one line of B82 for a reason B82 did not have.

**One report was not reproducible, and is written down as such rather than fixed twice.** "In
the Tasks view, sub-folders at any level with no tasks should not be in the scope dropdown" —
`foldersWithTasks` already matches note paths by prefix, so it rolls up through any depth, and
two new tests at three and four levels deep pass unchanged. What can still put a taskless folder
in that list is deliberate and documented: the vault root, the folder currently chosen (a
`<select>` whose value is not among its options renders blank), the window before the index has
answered — and, most likely the thing seen, a folder whose tasks are all *finished*, since the
filter asks `total` rather than `open` so the list cannot rebuild itself under the "open only"
tick. That last one is the single decision in this batch that could reasonably go the other way;
`TEST-PROTOCOL.md` §38q asks about it directly.

The suite is 1882 tests over 150 files.

---

Last updated 23 August 2026, released as `v0.11.0` — **six defects and two feature groups from
daily use: the two windows made consistent, search given a scope and its syntax a panel, and
four layout fixes**. Three decisions, B82–B84. A **minor** release and not a patch, unlike the
three before it: this one changes what the app does and how it looks in both windows, where
`v0.10.6` deliberately changed nothing under `src/` at all.

**B82 — the two windows share one title field and one bar at the foot.** The capture window and
the library's note editor already share `HeaderBlock`, `Editor`, `ContextMenu`,
`insertMenuItems` and the shortcut sheet, and were at odds about almost everything visible:
"Subject" at 13px semibold in a tinted box against "Title" at 17px bold and borderless, menus
and status at the head in one window and the foot in the other, a help button labelled "?",
and two different focus colours on the same field because `.reader-title-input` had no
`:focus` rule at all. One `.title-field` in `styles.css` now, the reader's Insert/Actions and
save state moved into `.reader-footer`, and the capture window's Discard moved into an Actions
menu beside Insert. Discard is that menu's only item and the four the library offers are
deliberately absent — see the decision for why each one cannot mean anything here.

**B83 — search is scoped to the folder you are standing in**, and everything under it;
a switch beside the box widens it to the vault. `searchNotes` has carried the `scope` option
since it was written, with a comment saying nothing ever passed one. The widening is reset when
a search is left and whenever the tree moves, and the switch is not drawn for a tag, a person or
the unlinked pane, which have no folder to mean.

**B84 — the query syntax leaves the placeholder for a panel** under the box, opening on the
box's *focus* — which is one mechanism for both ways in, since clicking focuses it and `Mod-F`
already did. Escape is panel-first.

**Four fixes, no decision needed:** "Exit tasks" moved down beside the task count; the Tags and
Who completion panels stopped painting out through the right-hand window edge (`min-width` beats
`max-width`, and those two are the cells in the grid's right-hand column); the shortcut sheet's
two columns are balanced in `Help.tsx` rather than left to a row-major grid (32 rows tall beside
8 rows of content, before); the Tasks scope chooser offers only folders that have tasks; and the
Empty-trash confirmation counts folders and files as well as notes, recursively, instead of
naming the note rows that happened to be on screen.

**The bullets were the fifth, and the report was wrong in two useful ways.** "Levels one and two
are smaller than the square, on macOS" — measured at four times size, `\2022` and `\25E6` carry
0.293em of ink against `\25AA`'s 0.504em *in one face*, so it was never only macOS and no font
choice would have fixed it. Levels one and two are `\25CF` and `\25CB` now, which also puts all
three levels in Geometric Shapes so a Mac falls back for all of them together rather than
drawing one from SF. `font-size` on the `::marker` was tried first and grew every line box.

**One bug in this batch shipped past a green suite**, and is the hour worth remembering: B82's
shared rule was a bare `.title-field`, which `.header input` out-ranks, so the window it was
mostly for did not change — while the comment above it claimed it was two classes deep. It was
stacked with a second cause, `drive:capture` running `out/` without building, and settled by
reading `getComputedStyle` off the real field with focus emulation on. All three are in
`CONSTRAINTS.md`.

**What is still owed a human: `TEST-PROTOCOL.md` §37**, and it is narrow. The bullets on macOS
and on Windows — a claim about font fallback made from a sandbox whose only face is DejaVu Sans.
The shortcut sheet's balance, which is arithmetic here and a judgement there. And the title
field's `<h1>`/input swap, which is exactly the thing that looked fine while being broken. The
rest of the batch was driven under `Xvfb` and photographed.

**A pre-existing flake failed this release's first attempt, and is fixed with it.** Both
windows debounced a change onto a `setTimeout` and neither cancelled it on unmount. In the
app that cannot fire — neither tree is ever unmounted — but in jsdom it fires after teardown,
where `window` is gone, and the throw is charged to whichever test is running by then rather
than to the one that armed it. It took down the Windows job of the `v0.11.0` release and a
`main` build the day before, and it has never once failed locally. The library's copy had not
been reported and was fixed with it: same construction, both timers reaching `window.emqnote`.
`CONSTRAINTS.md` carries the full account, including why fake timers cannot test it.

The suite is 1845 tests over 145 files.

---

Last updated 22 August 2026, released as `v0.10.6` — **the workflow actions off Node 20, the
branch list cleared, the three cornerstone features written against the capture window's new
harness, then the rest of the capture-window backlog walked, and the driver taught to draw
and turn a real PDF page**. A patch release deliberately: nothing under `src/` changed in any
of it, so the app behaves exactly as `v0.10.5` did and only what can be checked has moved. The batch before it, released as `v0.10.5`, is the harness itself,
and its entry is below.

`TODO.md`'s own two housekeeping items are done (see Housekeeping), and the one that had
carried since 14 August is done with them: B49, B50 and B51 had never been exercised in the
capture window, on the grounds that it had no harness — and it has had one since yesterday.
Three suites, 25 tests: `capture-slash-menu` (the `/` menu opening, filtering, Escape, the
keyboard walk, and all four main-side items routed through *this* window's closures, which
are different objects from both the library's and its own Insert menu's),
`capture-table` (a rectangle built with Shift+arrow, cleared with Backspace, and the toolbar
acting on it) and `capture-remote-images` (B50's switch reaching every image node view —
including the `data:` case, which only this window's CSP forces through main).

**Two of those features have a half no jsdom test can have, and `scripts/drive-capture.ts`
now takes it**: a rectangle dragged out with a *real pointer*, and whether B51's sixteen-row
panel fits on screen with the caret near the foot of the window. It flips above it — 331px
of panel in a 600×720 window — which is the first time that has been observed rather than
reasoned about. Seven steps now, green twice in a row, each confirmed to go red when broken
on purpose. And the drag cost a run to a stale measurement that is now in `CONSTRAINTS.md`:
the toolbar appears when the caret enters a cell and pushes every row below it down, so
coordinates taken before the click aim one row high.

**Every `TEST-PROTOCOL.md` row that read "reachable by the harness now, not yet written
against it" has been dealt with**, and dealing with it meant deciding one of two things for
each: write it, or measure why it cannot be written and say so on the row. §13h (the note
picker and a followed link), §14n (the table grid and Tab), §16i, §18x's reachable half and
§23j's paste are written — `capture-note-link.test.ts` and `capture-document.test.ts`, plus
additions to `capture-table.test.ts`. §33p turned out to be covered already, by two suites
between them. The suite is 1784 tests over 136 files.

**The rest are not "not yet written" — they are things jsdom cannot do**, and that is now
measured rather than assumed, with the reason on each row and the summary in
`CONSTRAINTS.md`. An inline PDF's page comes over `fetch()` on a custom protocol, so no page
and no bar (§15k, §17h, §18k–§18m, §22q's ⧉). A click on a markdown link goes through
`posAtCoords`, and those rows are *about* aiming (§18g–§18i). Shift+arrow inside a cell is a
selection the browser moves (§20h–§20k), and a panel scrolling is not a thing jsdom does
(§20a).

**The driver took the PDF, and pdf.js does render under `Xvfb`.** `scripts/drive-capture.ts`
builds a three-page PDF of its own — xref offsets computed, pages differing by the *area* of
a filled bar so a pixel count can tell them apart — embeds it in the fixture note, and adds
two steps: the page drawn (`naturalWidth 1240`, with the bar reading "/ 3" and ◀ dimmed but
not hidden), and ▶ clicked with a real pointer turning to a page that is **genuinely a
different picture**, counted as dark pixels off a canvas. Nine steps now, green twice, both
new ones confirmed red when broken on purpose. §15a and §17a–§17b are driven; **§15c's ⧉ and
§17c–§17d are still owed** — the ⧉ hands the file to an OS viewer nothing here can watch,
§17c needs a second one-page fixture, and §17d is a judgement.

**One claim in the harness turned out to be wrong and is corrected**: character input is
*not* unreachable in jsdom. `MutationObserver` is implemented, ProseMirror's `DOMObserver`
is built on it, and typing into the contenteditable is read back exactly as a browser's own
typing is — which is what `handleTextInput`, and so the `/` menu, needs. It had been
inferred from the name of one event and written down as settled, in the same file and the
same week as the "no test harness" sentence that went the same way. The sentence every batch since the disk-change work has ended on is
retired, and the honest version of it is worth keeping: it was two claims in one, and only
the narrow one was ever true. The window has been *reachable* over CDP since 15 August
(`HISTORY.md` says so, and every batch since went on saying the broader thing anyway); what
it lacked was a unit-test harness, and nothing about the window had ever prevented one.

Two pieces, answering different questions. `test/helpers/capture.ts` mounts the real
`Capture` against a stubbed `window.emqnote`, exactly as `library-disk-change.test.ts` has
mounted `Library` all along — four suites, 41 tests, no display needed, running in CI on all
three platforms. `scripts/drive-capture.ts` (`npm run drive:capture`) drives the real window
under its own `Xvfb` over CDP, and its headline step is the one four separate features have
been unverified on for months: **a picture in the capture window with `naturalWidth` non-zero**
— decoded, not merely an `<img>` in the DOM. Five steps, all green, twice in a row, and each
one confirmed to go red when broken on purpose. `TEST-PROTOCOL.md` §36 is what it now owes a
human, which is mostly judging by eye what a floor of 40px cannot.

Nothing under `src/` changed for any of it. Four constraints came out of it and are in
`CONSTRAINTS.md` — where the jsdom/layout line falls, why the stub must cover the window's
*children* and not just the window, and the two things that cost a run each: `xvfb-run`'s
private `Xauthority`, and a process group that has to be signalled rather than a pid.

The previous entry, 21 August 2026, on top of `v0.10.3` — the two items that release left behind,
plus the DOM test it was also missing. The Tasks view and a live search each have a way out
now: a labelled control ("Exit tasks", and a `×` in the search box) and Escape, both handing
focus back to the selected note in the list that replaces what was on screen. No decision:
this is a mode getting the exit it always needed. Three constraints came out of it and are in
`CONSTRAINTS.md` — the exits' focus hand-off waits for the reloaded list rather than firing on
the next frame; leaving the Tasks view is claimed by the *window* listener rather than by the
task pane; and leaving a search from a hit takes two presses, which is correct.

**This batch was driven live** under `Xvfb`, and that is what found the one real bug in it:
Escape out of the Tasks view was handled on `.task-list` and did nothing whenever focus was
not inside that element — which is both of the commonest ways of standing in that view. The
jsdom test had passed against the broken version because it dispatched the key on the pane;
it presses on `document.body` now. `TEST-PROTOCOL.md` §35 is what is still owed a human, and
it is mostly the Windows row and the two cases a sandbox cannot judge.

`test/header-who.test.ts` also landed, closing the gap `v0.10.3` shipped with: fourteen cases
over the Who field's panel, whose ranking half had been covered and whose DOM half had not.
The Who completion was confirmed live in the reader window in the same session.

**Still owed from `v0.10.3`**: `TEST-PROTOCOL.md` §34, the four header fixes. Three of them
are in the capture window, which still has no renderer harness, so they remain the batch
nobody has put their hands on.

The previous entry, 21 August 2026, on top of `v0.10.1` — five items from daily use, two of them
corrections to the pin work that had shipped the day before. Four carry decisions. **B77**:
the limit of three is per *folder*, not per vault, and a pin therefore orders a folder and
nothing else — in a tag, a person or a search result the rows stand in the plain sort, with
the mark still drawn on them. **B78**: the three sort labels are one field chooser, opening
the shared `ContextMenu` with the current field ticked. **B79**: the note window is 600×720,
a notepad rather than an index card on its side, clamped to the display's work area and given
minimums for the first time. **B80**: Discard gets `Mod-Shift-Backspace`, in that window
only — and deliberately not Escape, which is the key it must never acquire. The fifth needed
no decision: a Tasks button in the note list's header, handed the sidebar row's own
`openTasks`. See `HISTORY.md` for the account and `TEST-PROTOCOL.md` §33 for what is still
owed a human.

**Two of those are not confirmed live**: the Discard chord *declining* for a note handed over
from the library (no capture-renderer harness — the registry test covers the binding, not the
guard), and the sticky shelf's scrolling with `keepPinnedInView` on, which needs a list longer
than the pane. §32n's refusal dialog, which the previous entry listed as unconfirmed, has now
been driven and is confirmed.

The previous entry, 20 August 2026, on top of `v0.9.0` — seven items from daily use,
four of them landing on the marker-alignment work that had shipped the same
morning. One carries a decision: **B75**, a note can be pinned to the top of the
list and the pin is in the file. The rest are constraints: the bullet, the star
and the checkbox now hang off a baseline anchor so they stay on the line when a
picture is pasted into it (and are aligned by ink *left edge* rather than by
centroid, which is what the reported 3px and 4px turned out to be); an item is
blank when it *draws* blank rather than when its content size is zero; leaving a
nested list no longer flattens what is below it; a numbered list's gutter grows
to fit the widest number in the note; and the sidebar's arrow keys reach Tags,
People, Tasks, Settings, Help and Unlinked instead of stepping from the last
folder straight to Trash. See `HISTORY.md` for the whole account and
`TEST-PROTOCOL.md` §32 for what is still owed a human.

**Two of those were not confirmed live**: the pin limit's refusal dialog and the
widened sidebar walk. Both have real-DOM tests that dispatch real events and read
`document.activeElement`; neither had been driven in the packaged app. The refusal has since
been driven (21 August, above); the sidebar walk still has not.

The previous entry, 13 August 2026 on top of `v0.7.0` — six items from daily use.
Two carry decisions: **B43**, a PDF embedded with `![[…]]` draws its first page
in the note, and **B44**, renaming a folder repairs the links into it without
asking. Two more were features: a `← Back to <note>` button after following an
internal link, and the Trash branch folded by default. **Two were not work at
all** — "add insert/delete row and column" and "add column alignment" were
already built by B42 and only ever reachable by right-click, which is why they
read as missing; what was built is a toolbar above the table.

A follow-up on 13 August 2026 fixed a real gap in B44 reported from use
(**B45**): renaming a folder of *attachments* updated nothing, because
`note_links` held `[[…]]` links only and `rewriteWikiLinks` only ever touched
`wikiLink` nodes. Embeds are indexed now, behind a `kind` column, and the
attachment half of the repair matches the path in the target as a string rather
than resolving it — an attachment target never resolves to a note, which is
exactly why the first version was silent.

All six were driven in the real app under `Xvfb`, and doing so found a bug that
reading the code did not: B43's first version remembered a *missing* PDF for the
session, so a file put back never redrew. That is what B39 forbids, and only the
disappear-and-reappear cycle showed it. The capture window is the one route left
unwatched, as it has been since it gained no test harness. See
`TEST-PROTOCOL.md` §15–§16.

The previous batch, 12 August 2026 on `v0.6.0`: an in-app PDF viewer window
(**B40**), a picker that writes `[[…]]` note links (**B41**), and table editing
in the WYSIWYG (**B42**, which closed the `prosemirror-tables` question B17 left
open). See `TEST-PROTOCOL.md` §12–§14.

## Where the project stands

| Phase | State |
|---|---|
| 0 — markdown round trip | Done. 31 corpus files, byte-identical both ways. |
| 1 — resident shell | Done. Hotkey → caret measured inside budget. |
| 2 — the editor | Done. |
| 3 — the library window | **Done, now including dragging in the tree** — the one work item that was still outstanding, built 4 August 2026. Shipped before phase 4; the two were swapped in practice. |
| 4 — **pasting and images** | **Split, and more of it is done.** *Images* landed 5 August 2026: an image or PDF can be pasted, dropped or picked, lands in `_attachments/`, and renders inline (B28). *A remote picture arriving with a pasted web page* landed 7 August 2026: it is downloaded into `_attachments/` too, through an SSRF-guarded fetch pipeline, instead of being left as a dead `https://` link the CSP blocks (see Settled below). *Pasting from Outlook* — the `mso-list` reconstruction — is still **deferred, deliberately**: real samples reshaped what's actually unknown here (see below), and confirming the one remaining open question needs classic desktop Outlook, unavailable for about two weeks from 2 August 2026. Note that `handlePaste` deliberately claims image files only and passes everything else through, precisely so that work is neither preempted nor complicated; the new remote-image pipeline runs through `transformPasted` instead, upstream of `handlePaste`, for the same reason. |
| 5 — index and search | **Done.** Search bar, conflict banner (diff + keep/keep/merge) and the orphaned-attachments cleanup screen are all wired end to end — IPC, preload, real UI — and confirmed actually working via `Xvfb`: a real conflict pair resolved on disk, a real orphaned attachment trashed on disk, not just rendered. See "Settled" below. |
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

- **22 August 2026 — the capture-window gap below is narrower than the bullets say.**
  Four of them (PR #2's inline attachment, `v0.4.1`'s bug 4, `v0.5.0`'s capture disk-change
  notice, and the cornerstone features' capture half) named the same absence, and the
  absence is gone. What each of them can now claim, and what it still cannot, is the same
  split every time: **the route and the logic are covered** by `test/helpers/capture.ts`
  and its seven suites, and **a real picture decoding in the real window** is covered by
  `npm run drive:capture` — `naturalWidth` non-zero, driven twice. What is still owed is
  only what a script cannot judge, and `TEST-PROTOCOL.md` §36 lists it. Read the bullets
  below with that in front of them; they are kept as written because they are the record
  of how long this took to close.

- **`v0.4.0` shipped PR #2 before its two unseen items were walked through**,
  deliberately and knowingly — the Mac had been running `v0.3.3` for a week
  without Tasks, folder delete or attachments at all, and two of the eight
  reports of 6 August 2026 were nothing but that gap. The item below did not
  stop the release; it is still owed, and now against a build that is actually
  installed rather than one nobody has.
- **Two things from PR #2 are built but were never seen working.** Neither
  could be reached by automation, so neither is claimed as tested: whether the
  **capture window** really draws an inline attachment (its CSP and NodeView
  are in place, and the same code demonstrably works in the library, but no
  image was ever got into that window under `Xvfb`), and the **Tasks view's
  click → IPC wiring** (`toggleTask` was driven directly against real files and
  behaves correctly; the click that calls it is unexercised, because
  `--click-button` does not match task rows). `TEST-PROTOCOL.md` §4 and §6 walk
  through both. Do this on the `v0.4.0` build, first thing after installing it.
- **Two things from `v0.4.1` are unverified live, for the same reason.** The
  25vh of scroll room past the last line (bug 3) is a "does this feel right"
  question no script can answer, and arrowing the caret across an inline image
  in the *capture* window (bug 4) has never had a real image drawn in it under
  `Xvfb` — the same gap the item above already describes for the library
  window, just never closed for the other window either. `TEST-PROTOCOL.md` §9
  walks through both.
- **Two things from `v0.5.0` are unverified live, and both are the same
  capture-window gap by another name.** A pasted remote image was confirmed
  downloading and rendering inline — but only in the library reader; no image
  has ever landed in the *capture* window under `Xvfb` (see bug 4 above and
  the PR #2 item further up — this is now the fourth feature to trip on that
  same absence). The capture window's own disk-change notice (B31) is
  unverified for a different reason: there is no capture-renderer test
  harness to drive it at all, so it was never reachable by automation in the
  first place. The PDF/Office thumbnail's *happy path* is a third kind of gap
  again — not unverified but **unverifiable here**: this sandbox and CI have
  no OS thumbnail provider, so only the fallback (plain chip, confirmed
  clean) can ever be exercised outside real macOS/Windows hardware. All three
  are `TEST-PROTOCOL.md` items — §4.5, §10, and the paste-in-capture case
  folded into §4.2.
- **`v0.4.1` is the first test of the release-notes fix.** Every
  release up to and including `v0.4.0` published its *commit* message as its
  notes, not its tag annotation: `gh release create --notes-from-tag` reads the
  tag locally, and `actions/checkout` leaves a lightweight one pointing at the
  commit. It went unnoticed for four releases because a release commit's
  message reads like a changelog anyway — `v0.4.0` is where it showed, because
  that tag sits on a merge commit and the release came out as one line and a
  trailer. `v0.4.0`'s notes were corrected by hand; `release.yml` now fetches
  the real tag first. Check `v0.4.1`'s published notes before assuming it worked.
- **The index rebuilds itself once, on first launch after `v0.4.0`.** `migrate()`
  now carries a `PRAGMA user_version` and drops its tables on a bump (B26), so
  the first start re-scans the whole vault with the progress bar showing. That
  is expected, happens once per machine, and touches nothing in the vault — the
  index lives in the app-data folder (B9).

- **Did `v0.2.0` ever actually reach your Mac?** If you updated to `v0.2.0`
  between its release and the `v0.2.1` fix, the `.app` would have refused to
  launch at all ("is damaged and can't be opened") — worth confirming you're
  now on a working `v0.2.1` build, not stuck on the broken one or an older
  zip you kept around because `v0.2.0` didn't work.
- **The Windows auto-update path has no confirmed end-to-end run yet.** The
  logic is implemented and the release pipeline now publishes correctly, but
  nobody has watched a real install pick up an update through the two
  confirmation dialogs. Worth doing once, on the Windows machine.
- **Real samples arrived (7 `.eml` files, 2 August 2026) and the finding
  reshapes phase 4 more than it resolves it.** Kept locally at
  `test-emails/`, gitignored — real correspondence, this repo is public. Only
  one of the seven is genuine Word/Outlook-authored content (`Generator:
  Microsoft Word 15` in its own HTML head); the other six are HTML-email-
  marketing output (Mailchimp/HubSpot-style, 25–119 layout `<table>`s each,
  zero `mso-list`) — real but useless for the list-reconstruction problem
  specifically. The one genuine sample, and a second one you composed
  yourself (`Test-email 1.eml`, sent from `mkb-fonds.nl`), **both use real
  `<ol>`/`<ul>`/`<li>` tags already, not the flat `<p class=MsoListParagraph>`
  fake-list pattern `02-technisch-ontwerp.md` §6.3 assumes is "the reason
  pasting from Outlook goes wrong everywhere."** `mso-list` shows up in the
  Word-authored one purely as decorative CSS layered on top of otherwise
  structurally valid HTML. The self-composed one is cleaner still — `Aptos`
  font, a `data-editing-info` attribute — markers of new Outlook / Outlook on
  the web, not classic desktop Outlook's Word rendering engine at all. You
  confirmed these are from **Outlook for Mac**, which you believe shares that
  same web-based technology, and you don't have access to classic desktop
  Outlook (Windows) for about two weeks from 2 August 2026 — the one client
  that might still exhibit the flat-paragraph pattern, unconfirmed either
  way. **Deferred rather than built against an assumption**: with a real
  vault-relative existing schema whose own `parseDOM` may already handle
  `<ol>/<ul>/<li>` correctly, the actual size of "the largest unknown in the
  project" might be much smaller than assumed — or the flat pattern might
  still be real and simply absent from every sample gathered so far. Pick
  this back up once classic Outlook is reachable, either to confirm the
  flat-paragraph problem is real and needs the full reconstruction the design
  doc describes, or to confirm it mostly isn't and scope the work down
  accordingly. `emqnote --dump-clipboard=<prefix>` (built earlier, still
  untested against a live clipboard) remains the tool for capturing that —
  a live clipboard paste from an open compose window may still differ from a
  saved/sent `.eml`'s HTML even on the same client, since those are
  genuinely different HTML generation paths. `postal-mime` was added as a
  devDependency while investigating (used interactively to parse the real
  samples, confirmed to bundle cleanly, correctly placed — unlike
  `better-sqlite3`, it's pure JS with no native binary); nothing in `src/`
  imports it yet.

## Verification still owed

**Update, 2 August 2026: `Xvfb` actually works here.**
`xvfb-run -a --server-args="-screen 0 1280x800x24" node_modules/.bin/electron
out/main/index.js --library --screenshot=<path> --vault=<path>` renders the
real library window and writes a real PNG — confirmed while wiring the
search bar (below), not assumed. The dbus/GPU warnings it prints are normal
headless-Linux Electron noise, not failures. That reopens every item below
that only needs `--screenshot`/`--click-button` and a look, in this sandbox,
without waiting for the real machine — two of them (the "+ New note" button
and its placement) already got closed this way, struck through below. The
rest are still open only because nobody has gone through them yet, not
because they are unreachable. (Also no longer blocked on Node: an `nvm`
install of Node 24 on 2 August 2026 fixed both the jsdom-based tests and
`better-sqlite3`, which segfaulted under the sandbox's previous Node 18 —
see `00-PLAN.md`.) `npm test`, `npm run typecheck` and `npm run build` all
pass — 1216 tests, the full suite. (1784 over 136 files as of 22 August 2026,
measured rather than carried forward.)

- [x] ~~**The three cornerstone features of 14 August 2026 in the *capture* window**
      (B49 cell selection, B50 remote images, B51 the `/` menu).~~ Written, 22 August 2026:
      three suites and 25 tests against the harness, plus two driver steps for the halves
      that need real boxes — a dragged rectangle and the panel fitting on screen. All three
      were already confirmed in the *library* under `Xvfb`; what had never been exercised
      was this window's own copy of them, and B51's four main-side items in particular go
      out through closures that exist nowhere else. `TEST-PROTOCOL.md` §19u.
      **Still owed to a person**, and it is the feel rather than the behaviour: whether the
      rectangle keeps up with the pointer (§19b) and whether the flip above the caret reads
      as a decision rather than a jump (§19t). Also untouched by any of this: the *reader*
      window's drag, which nothing drags in yet, and everything about B50 that needs a real
      network (§19i–§19m).
- [ ] **How a dragged rectangle and a sixteen-row `/` panel feel on a real display.**
      Neither is something a script can judge: whether the rectangle keeps up with
      the pointer, and whether the panel flips above the caret gracefully in a short
      window. `TEST-PROTOCOL.md` §19b and §19t. *Narrowed 22 August 2026 and worth being
      exact about which way: the driver now settles that a real drag picks the right four
      cells and that the panel fits — with the caret near the foot it flips above it, 331px
      of panel in a 600×720 window. Fitting is not gracefulness, and landing on the right
      cells is not keeping up with the pointer. Both rows stay open for the half they were
      always about.*
- [ ] **What a remote host actually sees when a note with a web picture is opened.**
      From inside the app it is one request per picture, once, and nothing on a
      second open — but that is the app's account of itself. `TEST-PROTOCOL.md` §19m.

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
- [x] ~~The "+ New note" button in the note-list header... against the real
      window layout.~~ Seen via `Xvfb` while wiring the search bar, 2 August
      2026: renders correctly, reasonable spacing next to the sort buttons.
      Double-click-on-a-row still unverified — that needs `--click-button`
      against an actual note row, not just a look.
- [x] ~~Whatever the "+ New note" button's placement looks like next to the
      sort buttons.~~ Same screenshot: fine as built, `justify-content:
      space-between` did not put excessive air between them.
- [ ] The watcher's real acceptance criterion: edit a note on one machine,
      confirm it shows up in the library on the other **within 5 seconds** of
      OneDrive finishing the sync (`04-bouwplan.md`, phase 5). `index-watch.test.ts`
      proves the mechanism against a local temp directory with a 20 ms
      threshold; nothing here proves the 300 ms production default is the
      right number against real OneDrive sync latency, which was never
      measured either.

## Housekeeping

- [x] ~~Delete the merged branches.~~ Done 22 August 2026, and the bullet had gone stale
      in a way worth noticing: it named three branches, two of which no longer existed
      locally, while **nineteen** other fully-merged ones had piled up behind it since.
      All nineteen deleted with `git branch -d` (which refuses anything not actually
      merged, so the check is the command). What is left locally is `main`, the working
      branch, the `iphone-app` worktree, and one deliberate keep:
      **`integrate-five-features-prerebase`**, which is settled below and is not an open
      question.

      **The remotes are gone too, 22 August 2026** — asked for and done, the push a human
      had to authorise. Four, not the five this bullet listed: a `git fetch --prune` first
      reported `integrate-five-features` already deleted upstream, so the list here had
      been stale in that direction as well as the local one. Each of the remaining four was
      checked with `git rev-list --count origin/main..origin/<branch>` before the push
      rather than trusted from `--merged` alone; all four returned 0. Their tips, so that
      any of them can be put back with `git push origin <sha>:refs/heads/<name>`:

      ```
      batch-six-2026-08-16       0052872cac652a6fd77292dccf946ee1add147fd
      installer-auto-updater     6c16da233b898e382433fc987eda1bea96be9ac9
      tags-and-people            4f3126cf44c2d1db35a1f60c62045c91a09f8300
      ten-improvements-from-use  fa586a7498d47637437592a2d8d8ff002297b28d
      ```

      `origin` is now `main` and `iphone-app`, which is unmerged and active — it moved in
      that same fetch, so it was never a candidate.

      **`integrate-five-features-prerebase` is kept, deliberately and for good — decided
      22 August 2026, and there is nothing here for anyone to action.** It is the snapshot
      of the 5 August integration commit, the point where five features built in parallel
      by separate agents in separate worktrees were stitched onto one branch. Eleven
      commits: eight of work, three merges. Do not delete it; do not re-open this.

      **The reason it is kept is not the reason this file used to give**, and the old
      reason was close enough to true to be worth correcting rather than quietly replacing.
      It said the branch was redundant — eight non-merge commits, all patch-equivalent in
      `main` per `git cherry` — and kept only because `git branch -d` refused it and nobody
      had decided otherwise. The `git cherry` result is real and still holds. The inference
      drawn from it does not: **`git cherry` compares those eight patches and says nothing
      whatever about the three merges**, and the merges are what this branch is *for*. Two
      of them carry genuine conflict resolution — 195 lines of combined diff in the top
      merge, 60 in `e66889e` — resolution that interleaves IPC handler registrations from
      agents who had each edited `index.ts`, `ipc.ts`, `i18n.ts`, `Library.tsx` and
      `FolderTree.tsx` without seeing one another's work. No patch ID accounts for a line
      of it. "Patch-equivalent, therefore nothing is lost" was an argument about the eight,
      presented as an argument about all eleven.

      **That resolution was then checked against the tree rather than assumed**, which is
      the only part of this that ever justified an opinion. Four handlers came out of it.
      Three — `saveAttachment`, `pickAttachment`, `setPaneWidths` — are in `main` today.
      The fourth, `openAttachment`, is absent from the codebase entirely, and that is worth
      knowing the ending of: it was **not** dropped by the rebase. `bc428b6` removed it on
      8 August and replaced it with the broader `openWikiLink`, because a `[[…]]` chip
      naming a *note* called `openAttachment`, a note is not in `_attachments/`, and the
      click therefore did nothing. That is B35 in `05-besluitenlog.md`, a decision rather
      than an accident.

      So: nothing in the snapshot is unrecoverable, every line of it is either live in
      `main` or deliberately superseded, and **it is kept for what the rebase flattened
      away rather than for anything it still holds** — the record of how five parallel
      agents' work was first joined. That is archaeology, and archaeology is a thing this
      project spends real effort on elsewhere. It is also, since the remote deletion above,
      the last copy of it anywhere. `git branch -d` will keep refusing it; that refusal is
      now the wanted behaviour and not an obstacle to route around with `-D`.

- [x] ~~Move the workflow actions off Node 20.~~ Done 22 August 2026 — the eight pins are
      `@v7`, not the `@v5` this bullet asked for, and both halves of that are deliberate.

      **Why not `@v5`:** this was written when v5 was current. It no longer is —
      `actions/checkout` is at v7.0.1 and `actions/setup-node` at v7.0.0, and the node24
      move that ends the deprecation happened in **v5.0.0 of both**, so every major from
      v5 up is equally off Node 20. Taking v5 would have bought a bump that needs doing
      again; v7 is the same work with more runway. The behaviour changes in between were
      read rather than assumed, and neither reaches this repo: setup-node v5's automatic
      caching keys off a `packageManager` field in `package.json` (this project has none,
      and both workflows pass `cache: npm` explicitly anyway, which v6 then narrowed to
      npm regardless), and checkout v6 persists credentials to a separate file, which
      cannot affect `release.yml`'s `git fetch --force --tags origin` because this repo
      is public and that fetch needs no credentials at all.

      **`actions/upload-artifact` is `@v7` too, and getting there took being wrong first.**
      It was left alone in the original bump on the evidence of `v0.10.4`'s annotations,
      which name `checkout` and `setup-node` and nothing else — including on the `package`
      job, the only job that uses `upload-artifact`. The conclusion drawn from that
      absence was that its v4 already ran on node24. It does not: the moment the other two
      were bumped, `v0.10.5`'s `package` jobs warned about `upload-artifact@v4` by name and
      nothing else. **An action missing from one run's annotation is not evidence that it
      is fine** — the notice does not enumerate every offender, and reading it as if it did
      is the same shape of mistake as inferring a capability from a mechanism. Bumped and
      re-checked, which is the only thing that ever settled it.

      `@v7` rather than `@v5` for a second, sharper reason here: upload-artifact's v5 notes
      call its node24 support "preliminary" and say the action **by default still runs on
      Node.js 20**. v6 is where it actually moves. So `@v5` would have left the warning
      exactly where it was while looking like a fix.

- [x] ~~**Neither workflow has actually run since the bump.**~~ Both have, on 22 August
      2026. `v0.10.5` was tagged on top of the bump deliberately so that the expensive run
      would exercise it: `release.yml` went green end to end on `@v7`, including
      `create-release`'s `git fetch --force --tags origin` immediately after checkout —
      the one step `build.yml` never covers and the only reason there was any doubt. The
      release published, both platform artifacts and `latest.yml` with them. That run is
      also what caught `upload-artifact` still being on Node 20; its own bump has not been
      through a run yet, and `build.yml` on the next push is what will say.

## Settled

**Four packages, 7 August 2026, released as `v0.5.0`.** Built as four work
packages on separate branches by parallel agents and merged in two waves —
package D waited on package C because both rewrite large parts of
`Library.tsx`.

- **Package A — a picture pasted from a web page is downloaded into
  `_attachments/`**, never left pointing at the web. ProseMirror's stock HTML
  paste produces an `image` node holding the remote address, which
  serializes to `![alt](https://…)` — dead offline, dead on the other
  machine, blocked by the CSP even online. `remote-image.ts` (Electron-free,
  tested directly) holds every rule — a scheme allowlist (`https:`, `http:`,
  `data:`; `file:` conspicuously absent), a content-type allowlist, a
  magic-byte sniff that must agree with the declared type, SVG refused on
  this path though the file picker still allows one — and `fetch-attachment.ts`
  does the I/O, re-checking the allowlist on every redirect `Location` header,
  which is the one check standing between a pasted URL and
  `file:///etc/passwd` or an internal metadata endpoint. In-flight downloads
  are tracked as a `DecorationSet`, not a position, so typing ahead of an
  image or undoing the paste while it is still downloading both do the right
  thing for free.
- **Package B — a PDF/Office attachment gets a first-page thumbnail** (B30),
  drawn by the OS (`nativeImage.createThumbnailFromPath`) and served over a
  new `emqnote-thumb://` protocol, never a `data:` URL, for the same reason
  B28 already rejected one for attachment previews generally. The `<img>`
  element is the whole state machine — `onerror` removes it and leaves
  today's plain chip, so the fallback is byte-for-byte what shipped before
  this landed.
- **Package C — the library and the capture window now learn about a note
  that changed or disappeared outside the app** (B31), instead of the reader
  silently going stale and the next autosave recreating a file that was just
  deleted. A content hash (`own-writes.ts`), not a timer, tells the app's own
  debounced write apart from a real external one — a TTL would have turned a
  correctness property into a timing property, and OneDrive's own
  re-materialisation schedule is not a clock this app can trust. `unlinkDir`
  is handled too: a folder deleted outside the app no longer leaves its notes
  still indexed.
- **Package D — every panel has a right-click menu, and the library is fully
  keyboard-drivable.** Folder tree, note list and note panel (both windows)
  each get a `ContextMenu.tsx` — a React component, not `Menu.popup`, for the
  same reason `Ask.tsx` is a component and not `window.prompt`. A roving
  `tabIndex` keeps exactly one row per pane a Tab stop; Shift+F10 opens the
  menu at the focused row, so the keyboard route and the mouse route land on
  the same component. `onRenameFolder`/`onDeleteFolder` now take the path
  that was actually right-clicked instead of always acting on whatever the
  toolbar last selected.

Confirmed in the real app under `Xvfb`, driven over CDP: a real remote image
downloading and rendering inline in the library reader; a PDF wikiLink's
thumbnail request falling back cleanly to the plain chip on this Linux
sandbox; the library's entire disk-change path — silent reload when clean,
the Reload/Keep-mine bar with in-progress text preserved when dirty, the
Close/Keep-mine bar with no auto-close on a deletion, and a full minute of
continuous typing producing zero false positives from the app's own
autosave; the three context menus, including a right-click correctly
selecting a note-list row first; and keyboard-only navigation — roving
arrow-key movement, Tab cycling tree → notes → editor, Escape back out of
the editor, Shift+F10 opening a menu at the focused row. Not confirmed: a
pasted image drawing inside the *capture* window specifically, and the
capture window's own disk-change notice (no capture-renderer test harness
exists) — see the open items above.

**Eight fixes from daily use, 6 August 2026, released as `v0.4.1`.** Built
across three disjoint areas of the tree in parallel (library chrome, the
editor, the main process) and merged together, plus one that spanned two of
them and landed after the merge.

- **The capture window's file now renames on commit**, not never, when the
  subject changed since the file was first written. `capture-store.ts`'s
  `renameSessionFile` fires from `finish()`, `load()` and `flush()` — the
  commit paths — never from the debounced per-keystroke write, so OneDrive
  still never sees a trail of half-typed subjects.
- **The reader's note title is click-to-edit**, in place of the old Rename
  dialog. Enter or blur commits through the same `rename()` the dialog used;
  Escape cancels. `IPC.libraryRenameNote` also gained the `writer.activePath()`
  lock guard `libraryMoveNote` and `libraryToggleTask` already had.
- **The editor has 25vh of scroll room below the last line**, outside the
  editable flow, so a long note can scroll a full screen past its own end.
- **An arrow key now moves the caret across an inline image or PDF link**
  instead of landing on an invisible `NodeSelection` — `moveOverAtom` takes
  priority in the keymap, and `.ProseMirror-selectednode` is now visible too.
- **Clicking a task moves the caret to it**, without leaving the Tasks view —
  `Editor.focusTask` uses the same `taskItemsIn` ordinal the index and
  `toggleTask` already agree on, and never steals focus from the Tasks list.
- **Tasks and Trash swapped places in the folder tree's footer**, and
  **Orphaned Attachments moved out of the footer into Settings.**
- **Inserting a large PDF no longer freezes the app.** Two independent causes:
  the file picker dialog now has a parent window, so the OS can't raise it
  behind the library window while the renderer waits on it; and the actual
  copy moved off the main thread onto `fs/promises`, measured as cutting the
  longest IPC-blocking gap during a 19.7 MB copy from the low tens of
  milliseconds to single digits.

Bugs 1, 2, and the footer/Settings changes were confirmed in the real app
under `Xvfb`, driven over CDP. The scroll room and the image-caret fix in the
capture window were not — see the open item above and `TEST-PROTOCOL.md` §9.

**Six fixes from using the packaged `v0.3.3` build on macOS, 6 August 2026.**
Eight things were reported; two of them ("aggregated tasks not visible", "no
option to delete a folder") were PR #2 features on an untagged branch and
needed no code — see the first open item above. The six that were real:

- **An empty task checkbox came back as a plain bullet after a save.** Both
  halves of the round trip were broken and neither is visible from the other:
  `mdast-util-gfm-task-list-item` writes the box by finding the space after the
  bullet, and an empty item has none, so the box was dropped silently; and GFM
  will not read `- [ ]` back as a task either, since it requires whitespace
  *and* content after the box. `pipeline.ts` now has its own `listItem` handler
  and `empty-tasks.ts` is the matching reader. `to-mdast.ts`'s `isEmptyList`
  had to learn it too — it drops a list whose items are all empty, as editing
  residue, and a box is not residue. Written up in `03-markdown-dialect.md`
  §3.4, because it is a deliberate departure from GFM.
- **Deleting an empty task out of the middle of a list split the list in two.**
  `liftListItem` is what Backspace does to a list item everywhere else, and
  from the middle of a list it lifts the item out to the top level, leaving one
  list before and one after. Markdown has no way to write two adjacent lists of
  the same kind, so the serializer alternates the bullet character — which
  reads back as two lists with a gap. `commands.ts` closes it from both ends:
  `deleteEmptyItemBetweenSiblings` and `joinAdjacentLists`.
- **Notes can be created in any folder, including the vault root (B29).** The
  library's `+ New note` now sends the selected folder; the hotkey and the tray
  send none and keep the Inbox, which is what that folder is for.
  `newNoteFolder` vets what arrives over IPC.
- **Moving a note leaves the tree on the source folder** (also B29), so filing
  an Inbox does not mean clicking back after every note. The note stays open in
  the reader under its new path.
- **The row a drag started from fades while the drag is in the air**, and the
  folder that would take it gets a wash inside its outline rather than the
  outline alone.
- **Copying a list keeps its bullets, numbers and boxes.** ProseMirror's
  default `text/plain` serializer is `textBetween`, which flattens structure;
  `clipboard-text.ts` replaces it. The `text/html` flavour was always intact,
  so this only ever affected plain-text destinations — which is most of them.

The first two of the six are covered by tests at the markdown layer, the
clipboard by its own file, and `newNoteFolder`/`newNoteIn` by `capture-store`
and `capture-writer`. New-note filing and the move behaviour were additionally
driven in the real app under `Xvfb` over CDP: the file landed in the vault root
and in `01 Projecten`, and the tree stayed on `00 Inbox` after a move with the
reader following the note to its new path.

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

**Phase 5's SQLite index exists as its own module, tested against a real
database.** `src/main/index-db.ts` holds the schema
(`notes` + an FTS5 `notes_fts`), `upsertNote`/`deleteNote`/`getNote`/
`allNotes`/`needsRefresh`, and free-text `search()`. Two deliberate
departures from the sketch in `02-technisch-ontwerp.md` §7.1, both explained
in the module's own comments: `notes_fts` is a plain FTS5 table keyed on an
`UNINDEXED path` column rather than the `content=''` "contentless" form the
doc sketches, because a contentless table needs the *old* column values
handed back to it on every delete/update and syncing that by hand against a
second table's rowid space bought nothing at this scale; and `search()`
quotes and prefix-matches each word of the query separately
(`"word1"* "word2"*`, FTS5's implicit AND) rather than treating the whole
query as one phrase, verified against a real FTS5 table — a whole-query
phrase match requires the words to appear in that exact order, which is
wrong for a type-ahead box. `better-sqlite3` is now a real `dependencies`
entry (see the note in `CLAUDE.md`); it needed nothing beyond `npm install`
to work here — it ships prebuilt N-API binaries for every platform in the
package itself, no `node-gyp`/`electron-rebuild` step required, which is
also presumably why it was the anticipated choice over Tauri's Rust
equivalent in B2.

**The full-scan builder that fills the index also exists, also tested
against a real database and a real temp vault.** `src/main/index-scan.ts`'s
`fullScan(vault, db, onProgress?)` walks the vault and calls `upsertNote`
per file that is new or has a changed `mtime`/`size`, then deletes any
indexed row whose file is gone. One thing it does deliberately differently
from what the old Map did, explained in the module's own comment: a
dataless (evicted) file keeps its last-indexed row rather than being
dropped, because the Map was rebuilt from nothing every time so "not shown
until it hydrates" cost nothing there, while dropping a row from a
*persistent* index would mean a note someone could search for on Monday
silently stops matching on Tuesday because OneDrive evicted a file nobody
touched. `checkFilesOnDemand`'s `"ondemand"` short-circuit is wired through
but its actual trigger path (`process.platform === "darwin"`) cannot be
exercised on this Linux sandbox, same limitation that function already had
before phase 5.

**`vault-scan.ts`'s Map is gone — the swap the two items above were leading
up to.** `facets`/`notesMatching` now take a `db: IndexDb` parameter and
read from `index-db.ts` via `allNotes`, with `ensureScanned` calling
`fullScan` (still collapsing concurrent callers onto one running scan, same
as before) instead of rebuilding a Map. `collectFiles`/`isDataless` moved
into `index-scan.ts` — their only remaining caller — rather than staying
exported from a module that no longer walks the filesystem itself. Folder
browsing is unchanged: still straight from disk via `readNotesIn`, never
through the index, so opening a folder never waits on a scan. `NoteRecord`
gained `fileName` and `excerpt` columns so a tag/person query never has to
re-read a matched file to build the `NoteSummary` the library expects —
`index-scan.ts`'s `buildRecord` already had both from the `summarise()` call
it was making anyway. `index.ts` opens one `IndexDb` at
`app.getPath("userData")/index.sqlite` in `main`, after `app.whenReady`
(B9), and closes it in `will-quit`. `better-sqlite3` also needed adding to
`electron.vite.config.ts`'s `external` list and `check-bundle.ts`'s
allowlist, alongside `electron-updater` — the same reason: a dynamic
`require` for its native binary that cannot survive bundling, and the sole
existing test of that path (`npm run build`) had nothing to catch it until
`index.ts` actually imported `index-db.ts`, which happened only with this
swap. All 17 of `vault-scan.test.ts`'s existing tests pass unchanged in
behaviour against the new implementation, which is the real evidence the
swap preserved the interface.

What was still open at that point: nothing called `fullScan` on its own — a
capture or an app launch reaching `facets`/`notesMatching` was still what
triggered it, same as the Map always was, so the first thing to ask the index
a question after a cold start paid for the whole walk.

**Closed on 4 August 2026.** `vault-scan.ts`'s `startScan` is called from
`main()` right after `prepareVault()`, beside the watcher and skipped during
`--selftest` for the same reason, and reports progress into a thin bar at the
top of the library window (`IPC.libraryScanProgress`, plus
`IPC.libraryScanState` for a window that opened partway through and missed the
events). It shares `ensureScanned`'s collapse, so a question arriving mid-walk
joins the scan already running instead of starting a rival one — asserted on
promise identity in `vault-scan.test.ts`, since a second walk would produce
the same answers at twice the cost and so could not be caught by its output.

Measured on a generated 4000-note vault under `Xvfb`: about 15 s from launch
to the bar disappearing, roughly 11 s of it scanning. That is the wait that
used to begin when the library was first opened. Worth being exact about what
it did *not* do even then: the tree and the folder note list read straight
from disk, so the window always drew immediately. What waited was everything
index-backed — Tags, People, search and the conflict check — and it waited
silently, which is the part that is fixed.

**And the scan now runs in a worker — §7.2's last outstanding piece, closed
the same day, with the measurement it owed.** `src/main/scan-worker.ts` is
the worker entry (a second input in `electron.vite.config.ts`'s main build,
emitted beside `index.js`); `src/main/scan-host.ts` starts it, forwards its
progress, and falls back to the main thread if it cannot start.
`vault-scan.ts` never learns a thread exists: it gained a `ScanRunner` seam
and kept the collapse, which still belongs on its side — two workers walking
the same vault into the same database would be worse than two in-process
walks, not better.

Measured on a generated 4000-note vault, on this Linux sandbox (not the Mac
mini — the absolute numbers will differ there, the shape should not), with an
event-loop lag monitor running on the main thread. Two runs of each:

| | total | worst main-thread stall | stalls > 80 ms |
|---|---|---|---|
| in-process (what shipped before) | 14.4 s / 14.0 s | 535 ms / 469 ms | 40 / 40 |
| in the worker | 14.0 s / 15.1 s | 6.9 ms / 29.4 ms | 0 / 0 |

The in-process row is the one worth remembering: forty stalls clean over the
hotkey's *entire* 80 ms budget, one per hundred files, because a hundred files
is about half a second of work — `fullScan` yielding every hundred bounded
nothing at that granularity. Total scan time is unchanged, so nothing was
traded away for it.

What the worker forced, all deliberate, all written down in `CLAUDE.md`: a
database connection of its own (a `better-sqlite3` handle cannot cross a
thread; WAL is what makes a second one safe, plus a `busy_timeout` so the
watcher and the worker do not drop a write when they collide); an
Electron-free import graph, which is a rollup-chunking property rather than a
source-tree one and is now checked by `check:bundle` rather than hoped for;
and a loud main-thread fallback, since a worker entry missing from the package
would otherwise show up as an index that silently never gets built.

Confirmed in the real app under `Xvfb`, not only in tests: a 3000-note vault
indexed end to end, the library drawing its tree and note list immediately
with the progress bar running above them, all 3000 rows and FTS entries
present afterwards, the Tags facet reading 20 tags × 150 notes through the
main thread's own connection, and no fallback message on stderr in any run.
That ESM workers load from inside a packed `app.asar` at all — shared chunks
and all — was checked before the design leaned on it, not after.

Not confirmed: the same on Windows and macOS. The asar check was done on
Linux with the same Electron version, and neither packaged app has been
rebuilt since.

**The `chokidar` watcher for incremental reindexing now exists too, wired
into `index.ts`, not just written.** `src/main/index-watch.ts`'s
`watchVault(vault, db, options?)` starts watching once a vault is known
(`main`, right after `prepareVault`) and keeps the index in step with
changes that land afterward — the other machine's OneDrive sync, chiefly —
without waiting for something else to trigger a rescan. The 300 ms debounce
`02-technisch-ontwerp.md` §7.2 calls for is chokidar's own
`awaitWriteFinish` (polls a file's size until it stops changing) rather than
a hand-rolled timer on a plain fs watch, deliberately: OneDrive can write a
synced file over several separate writes, and a naive "react to the first
change event" watch would index it mid-write. `ignoreInitial: true` keeps
it purely incremental — the full scan already covers what exists at
startup — and it shares the same hidden-folder/trash rule `collectFiles`
walks by, so a file inside `_attachments` or `_trash` is never watched in
the first place. Skipped like the watcher-adjacent parts of `--selftest`
already were: it does not start during a measurement run, since background
fs polling is exactly the kind of unaccounted-for noise the hotkey→caret
numbers in `CLAUDE.md` cannot afford to quietly pick up. Closed on
`will-quit`, before the index it writes into.

Real chokidar against a real temp directory, not a mock — 8 tests in
`test/index-watch.test.ts`, using a much smaller `stabilityThreshold` than
the 300 ms production default and the smallest settle margin found reliable
across repeated runs. One genuine race surfaced and got fixed rather than
papered over: writing a file immediately after starting the watcher could
be missed, because chokidar's initial crawl has to finish before it is
actually attached, and `ignoreInitial` only suppresses the `add` events
that crawl would otherwise fire — it does not make attachment itself
faster. `VaultWatcher` now exposes a `ready()` the tests await instead of
guessing at a delay. This is the one file in the suite that costs real
wall-clock time — flagged in `CLAUDE.md`'s Tests section, since that
document is explicit about the suite needing to stay fast.

**The search bar's own query language — `02-technisch-ontwerp.md` §7.3 — now
exists, still with no search bar to type it into.** `src/main/search-query.ts`'s
`parseSearchQuery(input)` pulls `type:`, `tag:`, `attendee:"…"`, `after:` and
`before:` out of the box text and leaves the rest as free text; an
unrecognised key or an invalid value (`type:archived`, `after:volgende-week`)
falls back to being treated as free text rather than erroring, since a search
box has no error state to show. One deliberate translation from the design
doc: it spells the date filters `na:`/`voor:`, Dutch, predating the
English-UI decision in commit `c24d82b` — this implements `after:`/`before:`
instead, the same kind of divergence B19 already models, not an oversight.
`vault-scan.ts`'s new `searchNotes(vault, db, query, { scope?, excludePath? })`
runs a parsed query against the index: free text goes through `search()`'s
FTS5 ranking and keeps that order, a filters-only query falls back to
`allNotes`' alphabetical order, and a completely blank query returns
everything rather than being special-cased to nothing — clearing the last
filter should feel like "back to everything", not a cliff down to zero.
`after`/`before` compare against `created`'s date portion only, not the full
timestamp-with-offset string, which is spelled out in the function's own
comment since the wrong version of that comparison silently does something
that looks right and is not. `scope` (the folder-vs-global switch) is
implemented and tested but nothing passes one yet. 30 new tests between the
two modules (16 for the parser's own edge cases, the rest for the combining
function), all passing on the first real run against the actual index.

Not done: no `IPC.librarySearch`-shaped channel, no renderer search box.
Building those is real UI work — a text input, debounced typing, swapping
the note list's contents — not a small addition to this pass.

**Conflict-copy recognition (`02-technisch-ontwerp.md` §5.2) now exists
too, narrower than the design doc's own aside about it.** `src/main/
conflicts.ts`'s `findConflictCopies(paths)` pairs a machine-suffixed
OneDrive conflict copy (`Kickoff project Alpha-LAPTOP-ABC123.md`) with its
original from a plain list of vault-relative paths — no file reads, no
hashing, filenames only. Deliberately does *not* treat a bare ` (N)`
suffix as conflict evidence on its own, even though the design doc
mentions that shape too: `filename.ts`'s `uniquePath` already produces
exactly `Title (2).md` for a completely ordinary reason — two notes
independently created with the same title in the same minute — and
flagging that as "edited on two machines" would be a false alarm over
routine use of the app's own disambiguation. The machine-name suffix has
no such ambiguity; nothing in this app ever appends one. Matching works by
trying progressively larger hyphen-segment removals from a path's stem and
stopping at the first known file that results — smallest removal first,
so `Kickoff project Alpha-LAPTOP-ABC123.md` pairs with `Kickoff project
Alpha.md` rather than over-stripping to something shorter that also
happens to exist. Still an acknowledged heuristic, not a certainty, and
says so in its own comment: a genuinely hyphenated title sitting next to
its own unhyphenated prefix (`Weekly Report-Draft.md` beside `Weekly
Report.md`) reads as a false positive by the same rule that finds a real
conflict — the design doc's own "*herkent* dat patroon" (recognises the
pattern) already concedes this, not a gap introduced here. 12 tests,
including that acknowledged false positive as its own test rather than
leaving it undocumented.

Not wired in: nothing calls this from a scan or the watcher yet, there is
no banner, no diff, no "keep this / keep that / merge" UI — `04-bouwplan.md`
describes all three as part of this same acceptance criterion, and none of
them is a small addition to what exists now.

**Orphaned-attachment cleanup (`02-technisch-ontwerp.md` §6.5) now exists
too — every backend piece phase 5 named is now built and tested.**
`src/markdown/wiki-targets.ts`'s `collectWikiTargets(doc)` is the new small
piece underneath it: every `![[…]]`/`[[…]]` target a document points at,
`wikiEmbed` and `wikiLink` collected together and deliberately
undistinguished, since §6.4 routes an image through `wikiEmbed` but a
non-image attachment through the very same `[[…]]` syntax a note-to-note
link uses — a target cannot be told apart as "attachment" or "note" from
the document alone, only by later checking it against what actually exists
in `_attachments/`. `src/main/orphaned-attachments.ts`'s
`findOrphanedAttachments(vault)` does that check: every file under
`_attachments/` whose name no note references, matched by filename alone
(the same rule wikilink resolution itself already follows, which is why
moving a note never breaks its embeds — an attachment nested under
`_attachments/2026/07/` is referenced the same way a flat one would be).
One deliberate difference from `index-scan.ts`'s own file walk: a note
already in `_trash/` still counts as a reference, since it can still be
restored and an attachment it needs would otherwise get reported as
orphaned and cleaned up out from under it — a reference is a different
question from a listing, and trash answers it differently for each. 8
(orphan-finding) + 7 (wiki-target-collecting) new tests, both green on the
first real run. 438 tests total.

Not wired in, same as the two items above: no IPC channel, no thumbnail
grid, no explicit per-file delete confirmation in the UI. §6.5 is explicit
that deletion is always a manual, one-at-a-time choice — this only ever
produces the list to choose from.

**That closes out every backend piece phase 5 named as work**: the SQLite
index, the full-scan builder, the watcher, the search-bar query language,
conflict-copy recognition, orphaned-attachment finding.

**The search bar is now wired end to end — IPC, preload, and a real input
in the library window** — the first piece of phase 5's UI. `IPC.librarySearch`
(`"library:search"`) takes the raw query string; the main-process handler
runs it through `parseSearchQuery` then `searchNotes`, threading
`uncommittedNewPath()` through as `excludePath` the same way `libraryNotes`
and `libraryFacets` already do, so a note still being typed in capture stays
invisible to search too. `NoteList.tsx` gained a `.notes-search` input above
its existing header row; `Library.tsx` owns the query as state, debounced
150 ms on change the same way `onDocChange`/`onHeaderChange` already debounce
a save — searching runs a real query against the index on every call, and
firing one per keystroke would turn typing "kickoff" into seven round trips.
A non-blank query wins over the tree selection entirely rather than
combining with it: `loadNotes` (the one function every existing call site
already uses — after a save, after a folder rename, on `library:refresh`)
now checks the query first and calls `search()` instead of `notes()` when
there is one, so every one of those call sites stays correct without being
touched individually. Clicking anything in the tree while a search is active
clears it, cancelling a pending debounce too — a stronger signal (you picked
a specific folder) should not lose to a stale query about to re-fire 150 ms
later. Results reuse the same "show which folder" treatment a tag or person
view already gets, since search draws from the whole vault the same way.

Confirmed rendering correctly via `Xvfb` — see the note under "Verification
still owed" above — both empty and with a real note in the list; not
confirmed is an actual keystroke-driven round trip, since no flag exists to
inject text into a field the way `--click-button` clicks one. Every piece
underneath the box (the parser, the query-runner, the IPC plumbing) already
has its own tests from when phase 5's backend was built, so this is UI
wiring on top of already-verified logic, not new untested logic.

**Phase 5 is done — the conflict banner and the orphaned-attachments cleanup
screen both landed, and both were verified actually working, on disk, not
just rendered.** New backend underneath them:

- `src/main/diff.ts` — a line-by-line diff, the classic O(n·m) longest-
  common-subsequence table rather than the O(ND) Myers algorithm a real diff
  tool uses. Deliberate at this scale: a note is at most a few hundred
  lines, and the simpler algorithm is also the simpler one to get right. 11
  tests.
- `vault-io.ts`'s `resolveConflict(vault, pair, choice)` — `keepOriginal`
  trashes the conflict copy; `keepConflict` trashes the *original* (through
  the same `trashNote` a manual delete uses, never a permanent unlink,
  since this is still overwriting a note's canonical path) and renames the
  conflict copy into its place. No third branch for "merge" — that choice
  touches no file at all, so the renderer never calls this for it; it just
  opens the original note the same as clicking it in the list would, and
  leaves the conflict copy exactly where it is for the user to reconcile by
  hand, in their own time.
- `vault-io.ts`'s `trashAttachment` — deliberately *not* `trashNote` reused
  for a different file type: `uniquePath`'s collision suffix is hardcoded
  to `.md`, so a colliding `photo.png` would come back `photo (2).md` — an
  image silently turned into a markdown file by its own trash operation.
  Caught before it shipped, not after.
- `orphaned-attachments.ts`'s `attachmentPreview` — a data URL for an
  image attachment, no thumbnail actually generated. Deliberate scope cut:
  real resizing (`sharp`) was only ever anticipated for phase 4's inline
  images, and this screen is opened by hand, occasionally, for however many
  files happen to be orphaned.
- `vault-scan.ts`'s `conflicts(vault, db)` — `findConflictCopies` run
  against the same index every other view reads, refreshed eagerly on
  mount and on every `library:refresh` rather than staying lazy behind a
  fold the way Tags/People do: a banner that only shows up after the user
  goes looking for it defeats the point of a banner.
- `ConflictPair`/`ConflictChoice`/`DiffLine` moved to `shared/vault-types.ts`
  — they cross the IPC boundary, so they cannot live in a `src/main/`-only
  module the way they started out.

UI: `ConflictBanner.tsx` (a slim banner plus its dialog, one conflict shown
at a time even when several exist — resolving one never auto-advances into
the next, since trashing a note either way is too consequential to happen
back to back without the user choosing to look again) and
`OrphanedAttachments.tsx` (a thumbnail grid, loaded once per visit rather
than kept live, since `findOrphanedAttachments` re-parses every note in the
vault). Both reuse the existing `.overlay`/`.settings-buttons` dialog
chrome rather than inventing new chrome. `FolderTree.tsx` gained a fourth
footer entry next to Trash/Settings/Help for the cleanup screen — nothing
about it is urgent the way a sync conflict is, so it stays down there
rather than anywhere more prominent. The banner itself needed its own
layout fix: `.library`'s three-column grid had no row to put a banner in
without breaking it, so `Library.tsx` now renders a `.library-shell` flex
wrapper (banner, then the grid) instead of the grid being the direct child
of the window — a real, if small, restructuring, not just an added
component.

**Xvfb verification found and fixed a real bug this pass**: the orphaned-
attachments preview's `data:` URL was silently blocked by `library.html`'s
CSP (`default-src 'self'` with no `img-src`), which only surfaced as a
console warning, not a thrown error — the preview would have rendered as a
quietly broken image with nothing pointing at why. Fixed by adding
`img-src 'self' data:` to that one window's CSP. Beyond that: a real
conflict pair was created, resolved via `--click-button` clicking "Keep
this one", and confirmed the conflict copy actually landed in `_trash/` and
the original was untouched, banner gone, tree refreshed; a real orphaned
attachment was created, deleted via the same mechanism, and confirmed
trashed on disk with the screen falling back to its empty state. Not
simulated — the actual file operations, through the actual IPC handlers,
on files a real Electron process wrote.

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
