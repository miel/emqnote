# Upgrades when the repository goes private

**Status: a proposal, not a decision.** Nothing in `src/`, `electron-builder.yml` or
`.github/workflows/` has been changed by this document. When one of the routes below is
actually taken, that is where `05-besluitenlog.md` gains **B101** and this file becomes
the working notes behind it. Until then, B22 still describes what is shipped.

## Why this document exists

`miel/emqnote` is public today, and it is public *because of the updater*. B22
(`05-besluitenlog.md`, 30 July 2026) says it in as many words:

> **De repository moet publiek zijn.** `electron-updater`'s GitHub-provider en de kale
> `fetch` die de mac-kant doet tegen `api.github.com/repos/.../releases/latest` werken
> allebei alleen ongeauthenticeerd. De repo was privé; die stap (GitHub-instellingen,
> niet iets wat de code zelf doet) hoort hierbij en is onomkeerbaar voor de bestaande
> geschiedenis — een bewuste, aparte beslissing van de gebruiker.

That decision is now being revisited from the other end: the source should be private
again. The public bit was never the *point*, it was the price of an unauthenticated
update check — so the question this document answers is how to stop paying it without
breaking upgrades.

## What breaks, exactly

Two independent code paths reach GitHub, and neither sends a credential.

**macOS** — `src/main/updater.ts` holds the repository as a bare constant and fetches
with no headers at all:

```ts
const REPO = "miel/emqnote";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
```

Against a private repository that request answers `404` (GitHub does not distinguish
"absent" from "not yours" to an anonymous caller). `parseLatestRelease` gets nothing
usable, `reportError` runs, and the user sees a native **"Could not check for updates"**
dialog every time they ask — at most once a day on startup, and immediately from the tray
or the settings panel.

**Windows** — `checkWindows` hands the job to electron-updater and never calls
`setFeedURL`. The feed comes entirely from `app-update.yml`, written into the package at
build time from `electron-builder.yml`:

```yaml
publish:
  provider: github
  owner: miel
  repo: emqnote
```

There is no `private: true` and no `token:` anywhere in that file, so the provider issues
the same anonymous requests and fails the same way. The `error` handler is wired to
`fail`, so this too is a visible dialog rather than silence.

The good news in both cases: **the failure is loud.** Nobody has to notice a missing
update; they get told the check itself failed. That is worth keeping true in whichever
route is chosen.

### The three places the repository name is written

They must agree, and no test currently checks that they do:

| Where | What it says | Read by |
|---|---|---|
| `electron-builder.yml` → `publish.owner` / `publish.repo` | `miel` / `emqnote` | electron-builder at publish time, electron-updater at run time (via `app-update.yml`) |
| `src/main/updater.ts` → `const REPO` | `"miel/emqnote"` | the macOS `fetch` |
| `package.json` → `"repository"` | `"github:miel/emqnote"` | nothing at run time; metadata only |

The first two are load-bearing. The third is metadata and should follow anyway.

## The routes

### Route A — private repo, token inside the app

Set `publish.private: true`, ship a read token in the package, and add an
`Authorization` header to the macOS `fetch`. electron-updater then downloads assets
through the API (`Accept: application/octet-stream`) rather than from
`objects.githubusercontent.com`, which works fine.

It is the smallest change and it is the stopgap this document accepts for the current
phase — one user, two machines. But it does not survive contact with anyone else: a token
in an `asar` is not a secret. `npx asar extract` is a one-liner, and the token grants
read access to the whole private repository, not just its releases. A second, quieter
liability is expiry — a fine-grained PAT lasts a year at most, and when it lapses the
next check fails with a dialog that says nothing about tokens.

**Verdict: acceptable only while the audience is the author, and only with an exit.**

### Route B — private source, public releases repository *(recommended)*

Keep `miel/emqnote` private. Create a second, public repository —
`miel/emqnote-releases` — that contains nothing but a README and the releases.
`release.yml` publishes there; both update paths point there.

- **Neither update path changes shape.** They stay unauthenticated reads of a public
  feed, exactly as today. No token ever ships inside the app.
- **It is the only GitHub-only route that survives the stated end state.** A public
  audience cannot be served by a feed that needs a credential, so Route A would have to
  be undone before 1.0; this is already the shape 1.0 wants.
- **Source visibility becomes an independent decision.** Opening the source again later —
  or never — no longer touches distribution at all.
- **Cost: one extra repository and one PAT in CI.** `secrets.GITHUB_TOKEN` is scoped to
  the repository the workflow runs in and cannot create a release in another one. That
  token is a CI secret, not a shipped one, and its expiry fails a release loudly at tag
  time, which is the safe direction to fail in.

**Verdict: the recommendation.**

### Route C — no automatic updates at all

Drop the updater, publish installers wherever, upgrade by hand. This is already what
macOS does, so on that platform it costs nothing. On Windows it throws away a working
NSIS auto-updater and the two-confirmation flow B22 was built for — a flow `TODO.md`
still lists as never having had its first confirmed end-to-end run. Discarding a
mechanism before it has been observed working once is the wrong order.

**Verdict: rejected.**

## Procedure — Route B

### 1. Create the releases repository

Public `miel/emqnote-releases`, one commit, a README saying what it is: *"Release
binaries for emqnote. The source lives elsewhere."* No source, no issues, no wiki.

### 2. `electron-builder.yml`

```yaml
publish:
  provider: github
  owner: miel
  repo: emqnote-releases
```

The comment above that block currently reads "The repo has to be public for the
unauthenticated check to work." That sentence stays true but now means the *releases*
repository, and saying which one is the entire point of the split — rewrite it so the
next reader does not conclude the source has to be public.

The rest of the block is untouched. The default `releaseType` (draft) and the
pre-created-draft trick still apply, for the same non-atomic `getOrCreateRelease` reason
the existing comment gives; only the repository they operate on moves.

### 3. `src/main/updater.ts`

```ts
const REPO = "miel/emqnote-releases";
```

That is the whole change. `parseLatestRelease` already reads `html_url` out of the API
response, so the macOS "Download" button opens the new public releases page by itself —
no second constant, no second URL.

### 4. A token for CI

A fine-grained PAT, **Contents: read and write, on `emqnote-releases` only**. Store it as
the secret `RELEASES_TOKEN` on `emqnote`. Nothing else needs it, and it never leaves CI.

Write the expiry date somewhere a human will meet it again — a release that fails at tag
time is recoverable in five minutes, but only if the error is recognised.

### 5. `.github/workflows/release.yml`

Three jobs change. Every `gh` call gains `--repo miel/emqnote-releases`, and every
`GH_TOKEN` becomes `secrets.RELEASES_TOKEN`.

**`create-release`** keeps `--notes-from-tag`, and this is worth being sure about rather
than assuming, because the obvious guess is wrong in both directions.

`--notes-from-tag` is a **local** read. `gh` looks the tag up in the checkout it is
standing in and refuses if it is not there — the message in the binary is *"cannot
generate release notes from tag %s as it does not exist locally"* (checked against
`gh 2.45.0`). It does **not** read the tag from whatever `--repo` points at. The checkout
is still the private source repository, the annotation is still in it, and
`git fetch --force --tags origin` still turns `checkout`'s lightweight tag back into the
annotated object. So the flag goes on working across a cross-repository publish, and the
existing comment above that fetch stays true word for word.

Only the target and the token change:

```yaml
      - run: git fetch --force --tags origin
      - run: gh release create "$GITHUB_REF_NAME" --repo miel/emqnote-releases --draft --notes-from-tag
        env:
          GH_TOKEN: ${{ secrets.RELEASES_TOKEN }}
```

One consequence to know about, which is cosmetic but surprising the first time. The tag
`v0.14.0` does not exist in `emqnote-releases`, so GitHub creates it — as a **lightweight
tag on that repository's default branch**, which is a README commit with none of the
code in it. The release *notes* are the real annotation, taken from the source
checkout; the release's *tag* is a marker in a repository that has no history worth
pointing at. Nothing reads it — `updater.ts` and electron-updater both take `tag_name`
and `html_url` out of the API response and never resolve the tag to a commit — so this
costs nothing, but do not go looking for the source commit from a releases-repo tag,
because it is not there. The source tag in the private repository remains the record of
what was built.

**`publish`** needs only the token swap; `electron-builder.yml` already points
electron-builder at the right repository.

```yaml
      - run: npx electron-builder ${{ matrix.target }} --publish always
        env:
          GH_TOKEN: ${{ secrets.RELEASES_TOKEN }}
          CSC_IDENTITY_AUTO_DISCOVERY: false
```

**`finalize-release`** needs `--repo` on all three `gh` calls (`release view`,
`release delete-asset`, `release edit`) and the same token. What it does is unchanged:
delete `latest-mac.yml` and the `-mac.zip.blockmap` that nothing reads, then un-draft so
the release becomes visible to `releases/latest`.

The `permissions: contents: write` lines govern `GITHUB_TOKEN`, which is no longer doing
the work. They are harmless; leaving them costs nothing and removing them is fine.

### 6. `build.yml` needs nothing

It publishes nothing, uses no secrets, and uploads only workflow artifacts. Its jobs keep
working unchanged on a private repository. Worth stating so nobody goes looking.

### 7. Optional: pin the three names together

Three places must agree, in two languages, and nothing currently checks it. A small test
beside `test/updater-import.test.ts` — parse `electron-builder.yml`, read `REPO` out of
`updater.ts`, assert they name the same repository — is exactly the shape this codebase
already uses for things a refactor can silently split (`styles-pane-bands.test.ts`,
`check:bundle`). Cheap, and it fails at `npm test` rather than at a release.

## The ordering trap

**An update feed cannot be migrated by an update the old feed can no longer deliver.**

Both installed copies point at `api.github.com/repos/miel/emqnote/releases/latest`. The
instant that repository is private, they get `404` forever, and no release published
anywhere afterwards can reach them. So the steps have an order:

1. **Create `emqnote-releases` while `emqnote` is still public.**
2. **Land the changes above and tag `v0.14.0`.** It publishes to the new repository.
3. **Install `v0.14.0` by hand on both machines** — the NSIS installer on Windows, the
   zip on macOS — and confirm from each that "Check for updates…" now answers from
   `emqnote-releases`.
4. **Only then flip `miel/emqnote` to private.**

Two things to know before step 4:

- **Going private does not retract what is already published.** Existing releases, tags
  and commit history have been public; anyone who cloned or downloaded still has them,
  and mirrors and caches are not recalled. Private from here is not private from before.
- **Any copy left on an older version is stranded.** It will keep asking the old feed and
  keep getting an error dialog. There is no remote fix; it has to be reinstalled by hand.
  With two machines that is a five-minute problem, which is precisely why this is the
  moment to do it.

## Procedure — Route A, if the stopgap is taken first

Only if the private switch has to happen before Route B is built. It is reversible and
Route B replaces it wholesale.

1. `electron-builder.yml` — add `private: true` under `publish`. **Do not put a token in
   this file**; it is committed.
2. Supply the token at run time instead. The honest mechanism is a build-time define fed
   by a CI secret, read in `checkWindows` before the check:

   ```ts
   autoUpdater.setFeedURL({
     provider: "github",
     owner: "miel",
     repo: "emqnote",
     private: true,
     token: UPDATE_TOKEN,
   });
   ```

3. macOS needs the header added by hand, because that path is a plain `fetch`:

   ```ts
   const response = await fetch(RELEASES_URL, {
     headers: { Authorization: `Bearer ${UPDATE_TOKEN}` },
   });
   ```

   The `html_url` in the response then points at a private release page — the "Download"
   button opens a page that only a signed-in collaborator can see. Acceptable when the
   only user is the owner; useless to anyone else.
4. The same ordering trap applies in full: build, install by hand on both machines,
   *then* flip the repository.

Known limits to write down while doing it: differential (blockmap) downloads do not apply
on the private asset path, so every Windows update is a full download; the token is
extractable from the package; and it expires.

**Exit condition:** Route A must be gone before any third party installs emqnote. Route B
is the replacement, and taking it later costs one more manual install on each machine —
the same ordering trap, run a second time.

## Documentation that becomes wrong

Every one of these asserts, or depends on, the repository being public. They are not part
of the mechanism, but leaving them is how the next reader reaches a wrong conclusion.

| File | What it says now |
|---|---|
| `electron-builder.yml`, above `publish:` | "The repo has to be public for the unauthenticated check to work." True of the *releases* repo under Route B; false under Route A. |
| `CONSTRAINTS.md` (B22 entry) | "Both paths read the same **public** GitHub repo." |
| `05-besluitenlog.md`, B22 | "**De repository moet publiek zijn.**" **Do not edit.** B22 records what was decided in July 2026 and stays as it is; B101 supersedes it. |
| `TODO-BEFORE-RELEASE.md` §1 | The `LICENSE` blocker is framed entirely as "The repository is public (the unauthenticated update check … depends on it being so)". The licence question survives the change; its stated reason does not. |
| `TODO.md` (~line 1198) and `HISTORY.md` (~line 1052) | The `actions/checkout` version pin is justified by "this repo is public and that fetch needs no credentials at all". After the switch that fetch *does* need credentials. It keeps working — `checkout` persists them — but the pin needs a different reason written down, or the next upgrade will be argued from a premise that no longer holds. |
| `TODO.md` (~line 966) | `test-emails/` is gitignored because "real correspondence, this repo is public". That constraint relaxes. Noted as a consequence, not a recommendation: OneDrive is still the better home for real correspondence. |
| `02-technisch-ontwerp.md` §9 | Already says private, and was already superseded by B22 in the other direction. It needs one pass either way. |
| `README.md` | "Per-user installer with auto-update on Windows; version check on macOS", plus wherever it eventually sends people to download. Under Route B that is `emqnote-releases`. |
| `CLAUDE.md`, the document table | Add a row for this file. |

## Verification

None of this can be proven by the unit suite; it is release-pipeline behaviour, and the
suite has never been able to see it.

**Before tagging**

- `npm run typecheck && npm test`. The `updater.ts` change is one constant, but
  `test/updater-import.test.ts` is what pins the `require`-not-`import` rule that made
  "Check for updates…" a no-op on Windows for every release after B22 — it must stay
  green, and it is the reason to run the suite for a one-line edit.

**On a throwaway tag first** — `v0.14.0-rc1`, published and then deleted. Watch
`release.yml` and check each of:

- the draft appears in **`emqnote-releases`**, not in `emqnote`;
- its notes are the tag annotation, not the commit message. This is the check worth
  making by eye every time: it is the one thing in the pipeline that has already been
  wrong for six consecutive releases without anyone noticing, up to and including
  `v0.3.3`, and it only showed at `v0.4.0` because that tag sits on a merge commit whose
  message is one line and a trailer;
- both platform jobs upload into that one draft, not into two;
- `finalize-release` removes `latest-mac.yml` and the `-mac.zip.blockmap`;
- `latest.yml` and the `.exe.blockmap` **survive** — those are what Windows reads;
- the release ends up un-drafted, because a draft never appears from `releases/latest`.

**From outside**, with no GitHub credentials in the environment — this is byte-for-byte
the request macOS makes:

```sh
curl -s https://api.github.com/repos/miel/emqnote-releases/releases/latest | jq .tag_name
```

**On Windows, end to end, once.** Install the previous version, publish the next, then
"Check for updates…" → "Download and install" → "Restart now", and confirm the app comes
back on the new version with the vault intact. `TODO.md` has carried this as unconfirmed
since B22, and for a public audience it is the mechanism *every* upgrade goes through.
This migration is the natural moment to finally do it.

**On macOS.** Tray → "Check for updates…" → the dialog names both versions → "Download"
opens the public releases page in a browser. Then the same check on an up-to-date build,
which must answer "you are up to date" rather than saying nothing.
