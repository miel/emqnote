# Graph results — OneDrive delivery over Microsoft Graph

Blank evidence sheet for the run described in [`09-iphone-graph.md`](../../09-iphone-graph.md).
Nothing here has been observed yet: every field is a placeholder until the run happens against
a real tenant and the business iPhone. Fill it in *during* the run, not afterwards from memory
— the error codes and timings are the whole point, and `phase-0-results.md` beside this one is
what a filled-in sheet is worth.

Do not record account names, tenant identifiers, or private filesystem paths
(`08-iphone-phase-0.md` §6 — it applies here unchanged).

## G0 — registration and consent

No device needed. Graph Explorer and the Entra portal only.

| Question | Answer | Evidence / exact error |
|---|---|---|
| Date of attempt | _not yet run_ | |
| Could an app be registered in the business tenant? | | |
| Where does the registration actually live? | | |
| `signInAudience` as registered | | |
| Redirect URI registered (iOS/macOS platform) | | |
| Did sign-in with delegated `Files.ReadWrite` succeed without an admin? | | |
| If refused: the `AADSTS` code | | |
| Is Microsoft Authenticator installed on the device? | | |
| Did Conditional Access demand an approved client app? | | |
| Does a personal-account registration reach the *work* drive? | | |
| Vault folder name inside OneDrive | | |
| Does `/me/drive/root:/<vault>/00 Inbox` resolve? | | |

**G0 go/no-go:** _pending_

_If neither the tenant nor a multi-tenant personal registration can obtain delegated
`Files.ReadWrite` for the work drive: stop, and record here what was refused and by which
setting. Do not record a workaround that widens the scope — §2's go/no-go rules those out._

## Environment

| Field | Value |
|---|---|
| Date of run | _not yet run_ |
| iPhone model | |
| iOS version | |
| Xcode version | |
| MSAL version | |
| Microsoft Authenticator installed / version | |
| Account type signed in (work or personal) | |
| Commit tested | |

## G2 — the matrix

"Pass" means the required outcome in `09-iphone-graph.md` §6, not merely "no crash". Record the
duration the probe panel reports, and the native error domain and code for anything that
failed.

| Test | Required outcome | Result | Timing | Error domain / code | Notes |
|---|---|---|---|---|---|
| Interactive sign-in | Succeeds; note broker or webview | | | | |
| Silent token after relaunch | No prompt | | | | |
| Silent token after device restart | No prompt, or a clear re-auth requirement | | | | |
| Silent token after >24 h | Refresh token still good | | | | |
| Resolve `00 Inbox` | Correct drive and item id | | | | |
| Wrongly named folder | Refused, not accepted | | | | |
| Upload a probe note | 201; readback bytes and sha256 identical | | | | |
| **`conflictBehavior=fail` on simple PUT** | **Honoured — decides which upload form ships** | | | | |
| Upload the same name again | 409 `nameAlreadyExists`; original byte-identical after | | | | |
| Unicode and `#` in the filename | Round-trips byte-identically | | | | |
| Airplane mode | Named recoverable error, never a hang | | | | |
| Reconnect | Exactly one final note | | | | |
| Interrupted upload, then `probeItem` | Distinguishes absent / identical / different | | | | |
| Backgrounded mid-upload | Complete file or no file, never partial | | | | |
| Two notes queued offline | Both arrive, once each | | | | |
| PC arrival | Desktop parses without repair; task and tag on first scan | | | | |

## Upload strategy

Strategy: _undecided_

Rationale:

_§4 prefers the simple `PUT …/content?@microsoft.graph.conflictBehavior=fail` if it is honoured,
because it is one round trip rather than two. Record here what the device actually showed —
including, if it was not honoured, exactly what happened to the file that was already there.
That observation is the one that matters most in this document._

## Synchronization times

One row per delivered probe note: the upload completing to the file appearing on the PC.

| Probe filename | Uploaded at | Seen on PC at | Delay |
|---|---|---|---|
| | | | |

## Readback comparison

The bytes come from `buildProbeNote` in `src/probe.ts`, whose desktop-side properties are
already pinned by `test/probe.test.ts` — so a mismatch here is Graph's doing, not the probe's.

| Probe filename | sha256 on iPhone | sha256 read back from Graph | sha256 on PC | Match? |
|---|---|---|---|---|
| | | | | |

## Re-authentication

Any condition that forced an interactive sign-in after the first one:

- _none recorded yet_

## Go/no-go

Each condition from `09-iphone-graph.md` §6, with the evidence that settles it:

| Condition | Met? | Evidence |
|---|---|---|
| Delegated `Files.ReadWrite` obtainable without weakening the request | | |
| A silent token survives a normal relaunch | | |
| `00 Inbox` resolves, and a wrong folder is refused | | |
| An upload produces either exact final bytes or no file | | |
| An existing file is never replaced | | |
| An interrupted delivery resolves to exactly one note | | |
| Offline and interrupted operations return a recoverable state | | |
| A delivered note reaches the PC and parses without repair | | |

**Decision:** _pending_

## Not covered by this run

- The Swift half has no automated tests, as `InboxBridge.swift` has none: the Xcode project has
  a single target and no XCTest target. This sheet and the probe panel are its only record.
- `07-iphone.md` §6's latency targets are Phase 4's, not this run's.
