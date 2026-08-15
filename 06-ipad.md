# emqnote — an iPad version, considered

*Written 10 August 2026, at `v0.6.0`, against an undecided question.*
*Decided 15 August 2026: **no**. See §8, and B53 in `05-besluitenlog.md`.*

This document exists to be argued with, not implemented. It sets out what an iPad version
would cost, what it would be worth, and which of four routes is the one to take if the
answer is yes.

**The answer was no**, on §3's argument. It is kept as written — the analysis is what makes
the decision reviewable, and a document rewritten to agree with its own conclusion is worth
nothing to whoever reopens the question. Only §7 and §8 have been brought up to date; §1–§6
stand as they were on 10 August 2026, including the recommendation in §6 that was not
followed and the cost estimates that were never tested against reality.

**Nothing here has been built.** No code, no branch, no dependency.

---

## 1. The scope this answers

The iPad's job, as stated: **reading and tasks.** Looking a note up in a meeting, ticking
tasks off, searching the vault. Not long-form writing, not capture-first.

That scope is doing a lot of work in what follows, in both directions. It removes most of
the expensive parts of a port — no capture window, no global hotkey, no 80 ms budget, no
paste pipeline, no attachment ingest, no updater. It also lands squarely on the two
features that need the index, which is the one piece of the desktop that cannot cross.

And it has a third consequence, the uncomfortable one, which §3 opens with.

---

## 2. What ports, measured

Counted against the tree at `v0.6.0`, not estimated:

| Layer | Lines | Files | Ports? |
|---|---|---|---|
| `src/markdown/` | 2,086 | 13 | **Free.** No `electron` import, no `node:` import, anywhere. |
| `src/shared/` | 1,716 | 7 | **Free.** Same. |
| `src/renderer/` | 9,983 | 49 | **With UI work.** No `electron` and no `node:` import anywhere — it talks only to `window.emqnote`. |
| `src/main/` | 7,841 | 38 | **Mostly rewritten.** 24 files import `node:`, 12 import `electron`. |
| `src/preload/` | 148 | 2 | Rewritten. It is nothing but the Electron bridge. |
| `test/` | 13,223 | 97 | The markdown half runs anywhere. The `vault-io` half does not. |

Three things in that table are worth more than the totals.

**The serializer ports untouched.** `src/markdown/` is the part of this project with the
most thinking in it and the most specification behind it — B6's one-path rule, the schema
that is also the file format, `MARK_NESTING_ORDER`, the tag-escape exception of B19, the
`- [ ]` empty-task handling that took two modules to get right, and 28 corpus files that
are the specification rather than examples of it. It is also, by deliberate design, free of
Electron and free of Node. It runs in a WebView on an iPad with no changes at all, and it
stays under the same `roundtrip.test.ts` that guards it today.

**The renderer already talks to a bridge, not to Electron.** The seam a port needs is
drawn: 132 channels in `src/shared/ipc.ts`, exposed through `src/preload/index.ts`, and the
renderer reaches nothing else. Replacing the thing behind `window.emqnote` is a defined
job, not an excavation. That is unusually good luck and it is the strongest technical
argument in this document.

**A twelfth of `src/main/` ports too.** Twelve files — 2,010 lines — import neither
Electron nor `node:`, because they were deliberately built that way to stay testable:
`vault-scan.ts`, `index-db.ts`, `search-query.ts`, `link-resolve.ts`, `conflicts.ts`,
`note-files.ts`, `diff.ts`, `remote-image.ts`, and four smaller ones. `index-db.ts` needs a
different driver — it imports `better-sqlite3`, and that is a native Node module — but its
SQL, its schema, its `SCHEMA_VERSION` migration and every query shape survive as written.

Against that: **roughly a third of `src/main/` answers a problem iPadOS does not have.**
`capture-window.ts`, `tray.ts`, `latency.ts`, `selftest.ts`, the hotkey registration, the
resident premise of B2/B3, the whole 80 ms budget — iPadOS has no global hotkey, no tray,
and no resident background process to put a pre-rendered window in. Those files are not
ported or rewritten. They are *dropped*, and the iPad equivalents are different things
entirely: a Share Sheet extension, a Shortcuts action, a widget, Scribble.

So the honest split is: about 3,800 lines cross for free, about 2,000 more cross with a
driver swap, about 10,000 cross with real UI work, about 5,800 get rewritten against a
completely different file API, and about 2,000 get thrown away as answers to a
non-question.

---

## 3. The argument against building anything

**The scope you named is the scope B7 already bought.**

B7 — "Vault blijft Obsidian-compatibel" — is justified in the decision log in these words:

> als de app stukloopt, als er iets **onderweg** gelezen moet worden, als het project ooit
> doodbloedt — dan is er standaardgereedschap dat de vault correct opent. Het kost vrijwel
> niets.

Reading a note while away from the desk is not a gap in the design. It is a case the design
was explicitly priced for, three years of decisions ago, and paid for with wikilinks, YAML
frontmatter and a fixed attachments folder. Obsidian mobile opens this vault today. It is
free. It is on the App Store, so no sideloading question arises. And ticking a checkbox in
it writes `- [x]`, the same bytes this serializer writes, because the dialect is GFM.

Tasks, the other half of the scope, is the same story one step down: Obsidian's own search
answers `task:`, and its Tasks community plugin does an aggregated cross-vault checkbox view
with far more filtering than `TaskList.tsx` has.

Meanwhile the thing Obsidian is genuinely, famously bad at — a paragraph, a table or a
nested mixed list hanging under a bullet, the failure that is written into this project's
own founding motivation and into `schema.ts`'s `paragraph block*` — is **the part you are
not asking the iPad to do.**

That is the whole argument. The iPad scope is the half of the problem the escape hatch
already covers, and it excludes the half that justified building an app in the first place.

This does not settle the question. Obsidian mobile may turn out to be unpleasant enough in
daily use — the vault's `_trash`, `_attachments` and `_templates` folders showing as
first-class, the frontmatter rendering as a property table, no HeaderBlock, a task list
that does not know about `type:` — that it fails at reading and tasks in practice while
succeeding on paper. **That is a two-week question, not a six-week one**, and §6 phase ii
is how to ask it. The discipline is the same one behind `--dump-clipboard` and behind a
hand-verified corpus rather than an invented one: do not guess at something the real thing
can answer directly.

---

## 4. The four routes

### A — Build nothing. Use the escape hatch.

Obsidian mobile (or iA Writer, or Taio) against the same OneDrive folder.

**For:** zero cost, zero maintenance, available this afternoon, and already paid for by
B7. Nothing in the vault has to change, because it was built to be read this way. If the
project ever stalls, this route is what happens anyway.

**Against:** the reading experience is Obsidian's, not this app's — no HeaderBlock, the
frontmatter shows as properties, the underscore folders are visible, `==highlight==` and
`<u>` render but are not editable the same way. Two apps means two mental models. And it
concedes that this vault's best mobile client is somebody else's app.

### B — A WebView shell reusing the existing renderer. **Recommended, if building.**

A Capacitor (or hand-rolled `WKWebView`) iOS app that loads the existing React +
ProseMirror renderer, imports `src/markdown/` and `src/shared/` unchanged, and implements a
subset of the 132 channels in Swift against the Files API.

**For:** B6 survives by construction — the same serializer bundle runs, so there is
physically no second path to markdown. The 28-file corpus keeps guarding the iPad's output
because it is the same output. The renderer's bridge seam is already drawn. And the
precedent is strong: Obsidian mobile is this exact architecture, so "can ProseMirror-class
editing work in a `WKWebView` over a File Provider vault" is not an open research question.

**Against:** everything in §5. It is still an iOS app with an iOS app's distribution
problem, an iOS app's file-access model, and no `chokidar`, no `better-sqlite3`, no
`node:fs`. The renderer's three-pane layout is wrong for a tablet and the touch UI is real
work, not a stylesheet.

### C — A native SwiftUI rewrite.

**For:** it would feel the best. Native scrolling, native text handling, real Scribble
support, no WebView tax, a Share Sheet extension without ceremony.

**Against, and this is the one that should end the conversation:** it requires a second
markdown serializer, in Swift. B6 says markdown is written in exactly one place and calls
itself binding. The failure mode is not hypothetical and it is written into the rule
itself — two paths drift, and the drift shows up as a pasted list indenting differently
from a typed one, breaking the round trip at exactly the constructions used most. A Swift
serializer would have to reproduce `MARK_NESTING_ORDER`, the B19 tag-escape exception,
the `- [ ]` handling that GFM does not read back on its own, the `isEmptyList` source-offset
check that tells `- [ ]` from `- \[ ]`, and the alternating bullet character that keeps two
lists apart — and it would have to keep reproducing them, forever, on the platform where
the round trip is hardest to inspect. Every one of those is a fix that already cost real
debugging once.

The corpus could in principle be run against a Swift implementation too. That is the only
version of this route worth considering, and it roughly doubles the estimate in §6.

### D — No app: Shortcuts and Files.

An iOS Shortcut that writes a correctly-shaped `.md` into the Inbox folder — frontmatter,
`YYYY-MM-DD HHmm Subject.md`, ISO 8601 with offset.

**For:** about an hour of work. No distribution problem, no Xcode, no certificate. Gets
dictation for free via Siri.

**Against:** it answers capture, and capture is not the scope. It gets nothing for reading
and nothing for tasks. Listed here because it is cheap and because §1's scope could
plausibly change — if the iPad's job ever becomes "get a thought down while away", this is
the first thing to try, not an app.

---

## 5. The costs, in detail

### 5.1 Distribution, which is mostly not a programming problem

There is no Apple Developer ID today. B22 records this as the reason macOS gets a version
check and a link rather than a real auto-updater. On the Mac that is survivable, because an
unsigned app can be unzipped and run. **On iPadOS there is no such fallback.** The options:

- **Apple Developer Program, $99/yr.** Gives a 1-year provisioning profile, TestFlight, and
  ad-hoc distribution to registered devices. Reinstall once a year. This is the only route
  that produces a tool you can actually rely on.
- **Free personal team.** Seven-day certificate. Every week, plug the iPad into a Mac and
  re-sign from Xcode, or run AltStore/SideStore and refresh over Wi-Fi. For a tool that is
  supposed to be there when you reach for it, in a meeting, this is not a distribution
  method — it is a chore that will end with the app not being installed.
- **App Store proper.** A single-user private note app in review is an awkward fit, and it
  is a recurring obligation rather than a one-time cost.

### 5.2 The blocker to settle before anything else: MDM

The vault is on a **business** OneDrive (B14). If that iPad is enrolled in Intune or another
MDM, two things may be true independently:

- Sideloading may be barred outright by device policy.
- An **Intune App Protection Policy** on OneDrive commonly forbids opening or copying
  corporate data into an unmanaged app. Under that policy the vault is visible in the
  OneDrive app and *not* reachable from the Files picker of a third-party app — which kills
  route B, route C and route D at the same wall, and takes route A with them, since
  Obsidian is equally unmanaged.

This is answerable in ten minutes on the actual device and costs nothing. It should be the
first thing done, before any other question in this document is worth thinking about.

### 5.3 There is no `node:fs`

File access is a `UIDocumentPickerViewController` folder pick, a persisted security-scoped
bookmark, and reads and writes through `NSFileCoordinator`. That is workable — it is what
Obsidian mobile and iA Writer do — but three properties differ from the desktop in ways
that touch decisions already taken:

- **Files are on-demand.** OneDrive's File Provider makes enumeration cheap and *reading*
  expensive: materialising a note is a network round trip, measured in seconds, that can
  fail offline. Every operation that today assumes a local disk needs a loading state and a
  failure path.
- **B10 matters more, not less.** "Opening a note must not touch the file" is currently
  justified as the cheapest OneDrive conflict prevention there is. On a File Provider it is
  also a bandwidth and latency property: an unnecessary write is a full upload.
- **`writeAtomic`'s `.tmp` + `rename()` needs re-examining.** Whether that pattern behaves
  as atomically through a File Provider as it does on a local disk is not something to
  assume. It is a genuine open question, and it sits underneath every write the app makes.

### 5.4 There is no `chokidar`

No recursive filesystem watch on iOS. The replacements are `NSFilePresenter`,
`NSMetadataQuery`, or polling on foreground — all coarser than what `index-watch.ts` has.

One thing here is a point *in favour* of how the desktop was built: B31's own-write
detection is a content hash, not a timer, and it was chosen over a TTL precisely because
"OneDrive's own re-materialisation schedule is the one clock this app cannot trust." That
reasoning transfers to iPadOS unchanged, and `own-writes.ts` ports as-is. Had it been built
as a time window, it would have had to be redesigned here.

### 5.5 There is no `better-sqlite3`

It is a native Node module. The index would need SQLite through a Capacitor plugin, or
WASM in OPFS. `index-db.ts`'s SQL, schema and `SCHEMA_VERSION` migration all survive a
driver swap; only the handle changes. And B9 already makes this cheap: the index is a
derived cache outside the vault, so an iPad rebuilding its own from scratch destroys
nothing, which is the same property B26 leans on when it bumps the schema version.

**But note the twist, because it is easy to get backwards.** B26 put task state in the index
because a folder walk was a 470–535 ms main-thread stall and the hotkey budget is 80 ms.
*That reason does not transfer* — the iPad has no hotkey and no resident window to keep
responsive. What replaces it is a worse reason: a full walk over a File Provider does not
just cost CPU, it **materialises every note in the vault** over the network. So the index is
needed on iPad more urgently than on the desktop, and for a completely different cause,
and its first build is the expensive moment rather than a background detail.

### 5.6 Editing on a touch device

Mostly dodged by the stated scope, and worth keeping dodged. ProseMirror in a `WKWebView`
works — again, Obsidian ships it — but iOS autocorrect and IME against `contenteditable` is
a well-known source of subtle, hard-to-reproduce bugs, and none of the Outlook shortcuts
that motivate `keymap.ts` (Ctrl+B, Ctrl+Shift+L, Tab/Shift+Tab, Ctrl+Alt+1/2/3) exist
without a hardware keyboard. If the scope grows from "reading and tasks" to "writing", this
section stops being a footnote and becomes the largest unknown in the project.

### 5.7 A permanent second target

This project currently ships twelve items in a day, built as five packages by parallel
agents and merged in waves. A second client does not add 10% to that; it makes every future
feature a two-platform question and every constraint in `CLAUDE.md` a thing to check twice.
`build.yml` gains a macOS runner with Xcode, a signing identity in secrets and a TestFlight
step. `check:bundle` gains a third import graph to police — the iPad bundle must contain no
Electron *and* no Node, which is a stricter rule than either existing entry has.

---

## 6. The plan, if the answer is yes

Route B, five phases. The first two are deliberately not code.

| Phase | Work | Cost |
|---|---|---|
| **i** | Settle §5.2 on the actual iPad: is it MDM-managed, and can a third-party app reach the vault folder through the Files picker? Install Obsidian and try to open it. **If this fails, stop — nothing else in this document matters.** | half a day, no code |
| **ii** | Use Obsidian mobile against the real vault for two weeks, for exactly reading and ticking tasks. Write down what actually failed, in the shape §3 predicts might. | 2 weeks elapsed, ~0 work |
| **iii** | Capacitor iOS project. `src/markdown/` and `src/shared/` imported unchanged. A Swift `FileBridge` over a security-scoped bookmark implementing a subset of the channels: `libraryTree`, `libraryNotes`, `libraryOpenNote`, `librarySaveNote`, `libraryTasks`, `libraryToggleTask`, `librarySearch`, `libraryFacets`. `vault-io.ts`'s rules reimplemented against `NSFileCoordinator` — and `filename.ts`, `note-files.ts`, `conflicts.ts`, `link-resolve.ts` and `search-query.ts` reused verbatim. | 2–3 weeks |
| **iv** | Touch UI. A navigation stack — folders → notes → note — not the three-pane library. Tasks and Search as tabs. `Editor.tsx` read-mostly, `HeaderBlock` in its existing `reader` variant, `TaskList.tsx` largely as-is. | 2 weeks |
| **v** | The index. `index-db.ts`'s SQL verbatim over a WASM or plugin driver, built on first launch with visible progress, `SCHEMA_VERSION` shared with the desktop. | 1 week |

**6–9 weeks** for someone who has not shipped an iOS app before — where the ramp on
provisioning profiles, entitlements and the File Provider is most of the variance, not the
TypeScript. Plus $99/yr. Plus a permanent second maintenance target, forever.

Against: Obsidian mobile, free, this afternoon, at the cost of it not being your app.

Two things the plan deliberately does **not** include, and should not acquire without a
new decision: a capture path on iPad (that is route D's territory and a different scope),
and any writing of markdown outside `src/markdown/` (that is B6, and it is binding).

---

## 7. Recommendation, and what was decided

The recommendation, as written on 10 August 2026, was:

> **Do phase i today. Then do phase ii. Do not write code before both are done.**
>
> Phase i can end the question outright and costs ten minutes. Phase ii is the only honest
> way to find out whether §3's argument holds, and its output — a written list of what
> actually failed while reading notes on an iPad for two weeks — is worth more than any
> estimate in this document. If that list is short, the answer is route A and this file
> becomes a decision entry that says so. If it is long and specific, phases iii–v have a
> real justification and a real requirements list, which is a much better position to start
> from than this one.
>
> The one thing worth avoiding is starting at phase iii.

**What happened, on 15 August 2026: route A, on §3's argument, without running either
phase.** That is the honest description and it belongs here rather than being tidied away.
The scope named in §1 is the scope B7 already bought, and it excludes the one thing this app
exists to do — so the two phases would have been a way of checking an argument that was
already sufficient to decide against six to nine weeks of work. What they cost was cheap;
what they would have bought was a better-founded *no*, not a different answer.

The consequence is worth naming, because it is the one thing to pick up first if this is
ever reopened: **nobody has established that Obsidian mobile is actually pleasant to read
this vault in**, and §3 says in so many words that it might not be — the underscore folders
showing as first-class, the frontmatter rendering as a property table, no HeaderBlock, a
task list that knows nothing about `type:`. If that turns out to be true in daily use, the
thing that changed is §3's premise, not §5's costs, and phase ii is still where to start.

---

## 8. The decision

**Taken 15 August 2026: no.** The entry below is what went into `05-besluitenlog.md`, as
**B53** — the draft in this section was numbered B38 when it was written, a number the log
took two days later for something else entirely (an attachment is found anywhere in the
vault) and has since passed fourteen more times.

The "if yes" draft that stood beside it has been deleted rather than kept for symmetry: an
undecided document needs both, a decided one needs the one that was taken, and route B's
case survives in §4 and §6 for anyone reopening this.

> ## B53 — Geen iPad-client; de vluchtweg ís het antwoord
>
> **Genomen** op 15 augustus 2026. Onderweg lezen en taken afvinken gebeurt in Obsidian
> mobile op dezelfde vault. Er komt geen eigen iPad-app.
>
> **Waarom.** B7 kocht dit geval al, met zoveel woorden: standaardgereedschap dat de vault
> correct opent, "als er iets onderweg gelezen moet worden". Het gevraagde bereik — lezen
> en taken — is precies dat geval, en sluit juist het onderdeel uit dat het bouwen van
> deze app rechtvaardigde: gemengde geneste outlines, waar Obsidian faalt.
>
> **Op grond van die redenering, niet van een proef.** Fase i en fase ii zijn niet
> uitgevoerd. Dit is een beredeneerd besluit, geen gemeten; wie het wil omdraaien begint
> daar.
>
> **Wat is afgevallen.** Een Capacitor-schil om de bestaande renderer (technisch de beste
> route, 6–9 weken plus $99/jaar plus een tweede onderhoudsdoel), en een native
> SwiftUI-herbouw (een tweede serializer, wat B6 verbiedt).
>
> **Prijs.** De beste mobiele client voor deze vault is andermans app. Twee mentale
> modellen. Het kopblok, de mappen zonder underscore en het takenoverzicht bestaan
> onderweg niet.

The log's own entry carries two paragraphs this draft did not: the full argument against a
Swift serializer, and a note that capture on iPad (route D) is a separate question this
decision does not answer.
