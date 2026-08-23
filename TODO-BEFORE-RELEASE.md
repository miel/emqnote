# What is left before a public 1.0

Written 23 August 2026, against `v0.11.0`, after the decision to **postpone Outlook email
import and mailing a note into the vault to a release after 1.0**.

This file is the release gate and nothing else: it holds only what must be true before
`v1.0.0` is tagged and published for people who are not the author. The phase plan stays in
[`04-bouwplan.md`](04-bouwplan.md), the day-to-day backlog in [`TODO.md`](TODO.md), and the
account of what shipped when in [`HISTORY.md`](HISTORY.md).

Items are grouped by what kind of thing they are, because they fail differently: a missing
licence is a legal blocker, an unmeasured budget is a claim nobody can defend, and an
unwalked manual test is a risk to somebody else's files.

---

## 0. The decision that sizes the rest

- [ ] **Decide whether pasting from Outlook is in 1.0, and record it as B85.**

      `04-bouwplan.md` defines v1 as *all acceptance criteria of phases 0 through 6*.
      Dropping email import removes phase 6 — but **phase 4's `mso-list` reconstruction is
      not phase 6**. Pasting from Outlook and mailing a note into the vault are separate
      features that happen to share the pipeline in
      [02-technisch-ontwerp.md §6.3](02-technisch-ontwerp.md#63-plak-pijplijn).

      Pasting is the founding use case — the app replaces *composing in Outlook* — so the
      default should be that it stays in. But the seven real `.eml` samples of 2 August 2026
      (see `TODO.md`) all carried genuine `<ol>/<ul>/<li>`, not the flat
      `<p class=MsoListParagraph>` pattern §6.3 assumes. So the work here is probably not
      the reconstruction:

      1. Paste once from classic desktop Outlook on Windows, captured with
         `emqnote --dump-clipboard=<prefix>` — the live clipboard is a different HTML
         generation path from a saved `.eml`, so this is not answered by the samples.
      2. If the lists arrive as real list elements, **§6.3 is answered rather than
         deferred**, and the schema's own `parseDOM` already does the job. Say so.
      3. If the flat pattern is real, scope the reconstruction and decide then whether it
         gates 1.0.

- [ ] **Rewrite "v1 is af" in `04-bouwplan.md`.** As written it is a definition of done that
      has already been decided against. Whatever comes out of the item above, the criteria
      1.0 is actually shipped against have to be the ones written down.

---

## 1. Public-distribution blockers

New work, and absent from every design document — all of them assume one user on two
machines who copies a zip over OneDrive.

- [ ] **There is no `LICENSE` file.** The repository is public (the unauthenticated update
      check in `electron-builder.yml` depends on it being so), and `package.json` carries no
      `license`, `author` or `homepage` field, with `private: true`. Without a licence nobody
      may legally use what is published. **The hardest blocker on this list and the shortest
      to clear.**
- [ ] **Decide and document the macOS story.** The app is ad-hoc signed and zip-only, by
      decision (B22, and the long comment in `electron-builder.yml` explaining why `identity:
      "-"` is not optional). That is fine for a zip that travels over OneDrive; a stranger
      downloading from GitHub gets the quarantine attribute and a "cannot verify the
      developer" dialog. Two ways out, and either is acceptable — silence is not:
      - Document the right-click → Open step in the README, or
      - Buy a Developer ID and notarize, which also replaces the manual-reinstall update path
        with electron-updater's real one.
- [ ] **Document the Windows SmartScreen warning.** The NSIS installer is unsigned, so every
      new version warns until reputation accrues. Document it or sign it.
- [ ] **Run the Windows auto-update path end to end, once.** Open in `TODO.md` since B22
      landed. For two personal machines an unwatched update path is a nuisance; for public
      users it is the mechanism *every* upgrade goes through, including any 1.0.1 that fixes
      something urgent.
- [ ] **Rewrite `README.md` for people who did not build it.** It is a builder's README today:
      features and `npm run pack:*`. A public one needs download links, the first-run story
      (choosing a vault, OneDrive Files On-Demand), the signing caveats above, and a plain
      statement of what leaves the machine — remote images fetched for a pasted web page, and
      the version check against the GitHub releases API. Nothing else does.

---

## 2. Acceptance criteria that were never measured

`04-bouwplan.md` is explicit that a phase is done when its criteria are *demonstrated*, not
when the code exists. These are undemonstrated, and the first two have no measuring tool at
all.

- [ ] **Search results under 30 ms at 5,000 notes**, and **opening a note under 50 ms**
      (phases 5 and 3). Nothing in `scripts/` or the suite measures either at scale;
      `--selftest` measures hotkey → caret and nothing else. Needs a benchmark script and a
      generated vault of the right size.
- [ ] **A real latency series on Windows.** Still three informal numbers — 112/77/52 ms —
      against an 80 ms budget. Carried unresolved since it was first written down. The tool
      exists; it needs a run:

      ```
      emqnote.exe --selftest=50 --vault=%TEMP%\emqnote-proef
      ```

      Results land in `%LOCALAPPDATA%\emqnote\` as `selftest-result.json` plus `latency.log`.
      Record the machine and the refresh rate with the figure — a number without those two
      means nothing (`CLAUDE.md`).
- [ ] **Memory of the resident process.** An explicit "v1 is af" bullet, never measured, and
      it is the evidence behind B2 — whether residency is viable at all on the work laptop.
- [ ] **The watcher's real criterion: a change on the other machine visible within 5 seconds
      of OneDrive finishing its sync.** `index-watch.test.ts` proves the mechanism against a
      local temp directory at a 20 ms threshold; nothing proves the 300 ms production default
      is the right number against real OneDrive latency, which has never been measured either.
- [ ] **Settle the hotkey → caret discrepancy, or annotate it.** p50 60 ms at phase 3 against
      p50 27–31 ms on the same Mac mini and the same 60 Hz display, unexplained (`TODO.md`,
      "Unexplained, worth settling"). Publishing a latency claim that cannot be reproduced is
      worse than publishing the slower one.
- [ ] **The vault opens in Obsidian and everything shows correctly**, images and nested lists
      included. A "v1 is af" criterion, and the whole point of plain files.
- [ ] **A week on both machines without a single conflict copy.** The other "v1 is af"
      criterion. It costs a week of ordinary use, so it should be started early rather than
      discovered at the end.

---

## 3. Verification still owed to a human

Drawn from `TODO.md`'s "Verification still owed" and `TEST-PROTOCOL.md`. The four at the top
are the ones that touch files rather than pixels, and they are the ones that matter most when
the files belong to someone else.

- [ ] **Rename a folder while a note inside it is open and dirty.** The one path where a
      debounced save landing after the rename would recreate the old folder. The ordering is
      in `renameFolderAt` and is untested end to end.
- [ ] **Switch vaults from Settings** — the restart happens, the new vault is scaffolded, and
      **nothing was written into the old one**.
- [ ] **The write-conflict lock, watched on screen, in both directions** — library → capture
      locks the reader, closing capture unlocks it; a note already in capture opens read-only
      in the library. The logic is covered by `capture-store.test.ts` and
      `capture-writer.test.ts`; nobody has watched it happen.
- [ ] **`F1` in both windows, and every shortcut on the sheet actually firing.** The sheet is
      the app's only documentation of itself.
- [ ] **`TEST-PROTOCOL.md` §37** — the bullets on macOS and Windows (a font-fallback claim
      made from a sandbox whose only face is DejaVu Sans), the shortcut sheet's balance, and
      the title field's `<h1>`/input swap, which is exactly the thing that looked fine while
      being broken.
- [ ] **The two "feel" rows, §19b and §19t** — whether a dragged rectangle keeps up with the
      pointer, and whether the `/` panel's flip above the caret reads as a decision rather
      than a jump. The driver settles that the cells are right and the panel fits; fitting is
      not gracefulness.
- [ ] **Dark mode judged by eye.** Every colour is a token or `currentColor`, so it should
      follow — but it has only ever been seen in light mode.
- [ ] The remaining rows in `TODO.md`'s "Verification still owed": the checkbox walk, a brand
      new note's disappearing act, and what a remote host sees when a note with a web picture
      is opened (§19m).

---

## 4. Housekeeping the public will see

- [ ] **`00-PLAN.md` is six releases stale.** It says `v0.5.0` and "460 tests over 27
      testbestanden"; the suite is 1845 over 145 files and the phase table predates most of
      what shipped. It is the first document anyone lands on in a public repository.
- [ ] **`TODO.md` is 1163 lines, most of it release history.** Hand the narrative to
      `HISTORY.md` and leave it as what is open — which is what its own header already claims
      it is.
- [ ] **Decide, once, that the design documents stay Dutch.** `CLAUDE.md` already records the
      convention (code, comments, tests and UI strings English; `00`–`07` and the corpus
      Dutch), and it is a defensible thing for a public repository. It only needs saying out
      loud in the README so it reads as a decision rather than an oversight.

---

## The shortest honest path

Licence and README first, because they are cheap and one of them is a genuine blocker. Then
the single Outlook paste that settles §6.3 one way or the other. Then the benchmark script,
because it turns two undefendable claims into numbers. Then the two Windows runs — selftest
and auto-update — which need the machine and can be done in one sitting. Then the four
file-touching manual verifications. `00-PLAN.md` and B85 last, once there is something true
to write in them.
