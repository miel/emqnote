# Profiling branch update handoff

Status captured on 2026-08-23 after `git fetch --prune origin`, before this
handoff document received its own documentation-only commit.

## Objective

Bring local `main` up to date with `origin/main`, then port the three profiling
commits onto the current codebase and adapt the integration where `main` has
changed since profiling was developed.

This has been assessed but not started. No local branch pointer, commit, or
working-tree file was changed during the assessment. The fetch did update
remote-tracking refs and tags.

## Current repository state

- Checked-out branch: `profiling`
- Profiling implementation tip: `c739963` (`Start event loop monitoring only
  while profiling`)
- Local `main`: `83acc2f` (`Version 0.8.2`)
- `origin/main`: `31c7359` (`The test count in TODO.md was one batch behind`)
- Local `main` is 81 commits behind `origin/main` and has no divergent commits.
- The profiling implementation is three commits ahead of local `main` and 81
  commits behind `origin/main`. The published handoff branch additionally
  contains this documentation-only commit.
- `profiling` has no configured upstream. There is currently no
  `origin/profiling` branch.
- On the originating worktree, before this handoff document was added, the only
  working-tree change was an unstaged edit to `package.json`; there were no
  staged or untracked files.

The three profiling commits, oldest first, are:

1. `3d2b99b` — `Add session profiling diagnostics`
2. `b9bc90a` — `Keep profiling API compatible with test bridges`
3. `c739963` — `Start event loop monitoring only while profiling`

Because `83acc2f` is an ancestor of `origin/main`, updating local `main` can be a
clean fast-forward. Because the profiling branch is local-only, rebasing it does
not rewrite an active remote branch.

## The originating worktree's separate `package.json` change

The current working copy of `package.json` is based on version `0.8.2` and has
seven uncommitted lines adding this top-level configuration:

```json
"allowScripts": {
  "better-sqlite3@13.0.2": true,
  "esbuild@0.25.12": true,
  "esbuild@0.28.1": true,
  "electron-winstaller@5.4.0": true,
  "fsevents@2.3.3": true
}
```

This edit is local to the originating worktree and is not part of any profiling
or handoff commit. A colleague making a fresh checkout of the published branch
will not receive it. Meanwhile, `origin/main` also changes `package.json`: it
advances the application version to `0.10.6` and adds the `drive:capture`
script, but it does not contain `allowScripts`.

In plain terms, the working copy and the remote both edited different parts of
an older version of the same document. Git may refuse to update `main` while
that document has an uncommitted edit, since replacing the tracked file could
discard local work. Preserve this edit separately before switching/updating
branches. After the port, reapply it to the current `package.json` and verify
that the five package/version entries are still correct for the updated
`package-lock.json`.

Do not accidentally fold this unrelated edit into a profiling commit.

## Profiling change footprint

Relative to old local `main`, profiling changes 14 files: 313 insertions and 28
deletions.

```text
src/main/index-watch.ts
src/main/index.ts
src/main/latency.ts
src/main/profiling.ts                  (new)
src/main/settings.ts
src/main/tray.ts
src/preload/index.ts
src/renderer/library/Library.tsx
src/renderer/library/Settings.tsx
src/renderer/useBootstrap.ts
src/shared/i18n.ts
src/shared/ipc.ts
src/shared/profiling.ts                (new)
test/profiling.test.ts                 (new)
```

Ten of those files were also changed on `origin/main`:

```text
src/main/index-watch.ts
src/main/index.ts
src/main/settings.ts
src/main/tray.ts
src/preload/index.ts
src/renderer/library/Library.tsx
src/renderer/library/Settings.tsx
src/renderer/useBootstrap.ts
src/shared/i18n.ts
src/shared/ipc.ts
```

A read-only three-way merge simulation predicts direct textual conflicts in
eight files:

```text
src/main/index.ts
src/main/settings.ts
src/preload/index.ts
src/renderer/library/Library.tsx
src/renderer/library/Settings.tsx
src/renderer/useBootstrap.ts
src/shared/i18n.ts
src/shared/ipc.ts
```

`src/main/index-watch.ts` and `src/main/tray.ts` changed on both sides but were
automatically mergeable in that simulation. They still need a semantic review.
The newly added profiling files and the profiling-only changes to
`src/main/latency.ts` should transplant without textual conflicts.

## Recommended execution sequence

On the originating worktree, first preserve the unrelated working-tree edit. A
targeted stash is suitable:

```bash
git stash push -m "WIP allowScripts before profiling rebase" -- package.json
```

A colleague starting from a fresh checkout should not have this local edit and
can skip the stash. In either case, inspect `git status --short` before changing
branches and preserve any unexpected local work.

Confirm that the working tree is clean, then create a recovery pointer and
fast-forward `main`:

```bash
git status --short
git branch profiling-before-main-port profiling
git switch main
git merge --ff-only origin/main
```

Then rebase the local feature branch onto updated `main`:

```bash
git switch profiling
git rebase main
```

Resolve each conflict by adapting the profiling behavior to the current
architecture, rather than mechanically choosing one side. During a rebase,
Git's labels are easy to misread: “ours” is the updated base plus commits already
replayed, while “theirs” is the old profiling commit currently being replayed.

For each resolved step:

```bash
git add <resolved-files>
git rebase --continue
```

If the port goes in the wrong direction, use `git rebase --abort`. The
`profiling-before-main-port` branch remains an additional recovery point.

After the profiling branch is working on the originating worktree, inspect and
apply the saved `package.json` change. Prefer `git stash apply` over `git stash
pop` initially so the saved copy remains available until the result is
verified. Identify the intended stash from `git stash list` rather than
assuming it is still `stash@{0}`. This step does not apply to a fresh checkout
that never had the local edit.

## Validation

At minimum, run:

```bash
npx vitest run test/profiling.test.ts
npm run typecheck
npm test
npm run build
```

Also review the full rebased feature diff against current `main`:

```bash
git diff --stat main..profiling
git diff main..profiling
```

Pay particular attention to initialization and teardown in `src/main/index.ts`,
settings persistence, the preload/IPC contract, and the Settings UI. Passing a
textual merge is not sufficient: 81 intervening commits touched all of those
integration areas.

## Completion criteria

- Local `main` exactly matches `origin/main`.
- `profiling` is based on the updated local `main` and contains the intended
  profiling functionality as three coherent commits (or an intentionally
  cleaned-up equivalent).
- Profiling starts and stops at the intended lifecycle points on the current
  architecture.
- IPC, preload types, settings, UI text, and test bridges agree on the current
  profiling API.
- Focused profiling tests, typecheck, full tests, and build pass.
- The unrelated `allowScripts` edit is either reapplied and validated or left
  safely preserved for a separate decision.
