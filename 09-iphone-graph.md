# emqnote iPhone — OneDrive delivery over Microsoft Graph

The direct successor to [`08-iphone-phase-0.md`](08-iphone-phase-0.md), and it exists because
that document's Phase 0 failed at its first precondition.

Phase 0 ran on the real business iPhone on 22 August 2026. `UIDocumentPickerViewController`
with `UTType.folder` lists iCloud Drive and Dropbox as selectable locations and greys out both
signed-in OneDrive accounts. Not a sign-in problem, and not MDM — the system Files app browses
OneDrive at file level without restriction. Microsoft's File Provider extension simply does not
implement the directory-domain capability that whole-folder selection requires.
[`apps/iphone/phase-0-results.md`](apps/iphone/phase-0-results.md) has the run;
`05-besluitenlog.md`'s **B77** has the decision that followed.

Graph is what is left. `07-iphone.md` §5 anticipated it as a fallback and deferred it; it is
no longer a fallback.

**Nothing in this document is proven yet.** The Swift in `apps/iphone/ios/App/` compiles and
links against MSAL 2.15, and the TypeScript half is covered by `npm run test:iphone`, but no
line of it has spoken to a real tenant or a real drive. The whole point of §G0 and §G2 below
is to change that, in that order, before anything depends on it.

## 1. What is being built, and where the line falls

```text
Mobile React capture screen
            |
@emqnote/core — schema, task commands, Markdown serializer   (unchanged)
            |
Durable local draft and outbox            src/delivery/       TypeScript, tested
            |
Sign-in and four HTTPS calls              ios/App/Graph*.swift, MSALAuth.swift
            |
Microsoft Graph → OneDrive → 00 Inbox
```

The division is deliberate and is the thing to preserve. **Swift does only what only Swift can
do**: hold a token in the Keychain, reach the Microsoft Authenticator broker, and make an HTTPS
request not subject to a webview's CORS rules. **Every decision stays in TypeScript** — which
item to attempt, when to retry, what the next collision-safe name is, whether an interrupted
upload counts as delivered. `npm run test:iphone` reaches all of it on any machine, which
matters because the half that can only be verified on the device is already large.

This preserves B6 unchanged: markdown is still written in exactly one place. The bytes are
already final before either bridge is contacted — `buildOutboxItem` serializes once, and
delivery only ever transports.

### Why native rather than `@azure/msal-browser` in the webview

Three reasons, in order of how much they would have cost to discover later. Graph's CORS
behaviour from a `capacitor://localhost` origin is not something to stake delivery on. A
webview cannot reach the broker, and a corporate Conditional Access policy requiring an
approved client app then fails with an error about the app rather than about the policy. And a
token in webview storage is a token in the part of the app that renders untrusted-ish content.

## 2. Phase G0 — registration and consent (blocking)

**No code. Prove the tenant permits this before building against it.** This is the same
discipline Phase 0 used, and Phase 0 is the reason to keep using it.

Register a **public client** — no client secret exists anywhere in this app; it uses PKCE — as
**multi-tenant plus personal accounts** (`signInAudience:
AzureADandPersonalMicrosoftAccount`), authority `https://login.microsoftonline.com/common`.

That shape is chosen for the specific uncertainty at hand. If the business tenant refuses to
let a user register an application, the registration can live in a personal Microsoft account's
directory while the *runtime* sign-in still targets the work account — which works as long as
the tenant allows user consent to third-party multi-tenant apps. `Files.ReadWrite` is
user-consentable by default, but plenty of tenants disable user consent wholesale, and that is
a setting no code here can read.

Redirect URI: `msauth.com.emqnote.capture://auth`, registered as an **iOS/macOS** platform.

Delegated scope: **`Files.ReadWrite`** and nothing more. Not `Files.ReadWrite.All`: this app
writes one file into one folder on the signed-in user's own drive, and asking a corporate
tenant for tenant-wide file access it has no use for is the kind of request that gets an
application refused for good reasons. MSAL adds `openid`, `profile` and `offline_access`
itself.

Record, per attempt, in `apps/iphone/graph-results.md`:

| Question | Evidence to capture |
|---|---|
| Can an app be registered in the business tenant? | Yes, or the exact portal refusal |
| Does sign-in with `Files.ReadWrite` succeed without an admin? | Yes, or `AADSTS65001` / `AADSTS90094` |
| Is Microsoft Authenticator installed, and does Conditional Access require it? | Broker present; any approved-client-app or app-protection prompt |
| Does a personal-account registration reach the *work* drive? | The fallback's actual limit |
| Which drive holds the vault? | That `GET /me/drive/root:/<vault>/00 Inbox` resolves |

All of it in Graph Explorer and the Entra portal — no Xcode needed. The client id is not a
secret and is committed via the `EMQNOTE_CLIENT_ID` build setting; the authority stays `common`
so that no tenant identifier is committed anywhere (`08` §6) and so one build can sign into
either account type.

**Go/no-go.** If neither the tenant nor a multi-tenant personal registration can obtain
delegated `Files.ReadWrite` for the work drive, stop and reopen the no-app question. Do **not**
compensate with `Files.ReadWrite.All`, a service principal, an application permission, or a
stored password.

## 3. Project configuration that fails silently when wrong

Three settings, each of which produces a symptom that does not name its cause. All three are in
`CONSTRAINTS.md` as well.

- **The MSAL callback goes in `SceneDelegate`, not `AppDelegate`.** This app has a scene
  delegate, so `application(_:open:options:)` is never called at all. Nearly every MSAL iOS
  sample shows the AppDelegate form; following one gives a sign-in that opens Safari, completes,
  and never returns, logging nothing.
- **`LSApplicationQueriesSchemes` must list `msauthv2` and `msauthv3`.** Without them MSAL
  cannot detect the broker and silently falls back to an in-app webview.
- **The keychain sharing entitlement must include `com.microsoft.adalcache`.** Without it the
  interactive sign-in succeeds and `acquireTokenSilent` then never finds an account again, so
  every launch asks for a sign-in from scratch.

Also worth knowing: **MSAL 2.15 requires iOS 17**, so `IPHONEOS_DEPLOYMENT_TARGET` moved from
15.0 to 17.0. Building at 15.0 produces only a linker warning, not an error, which is exactly
the kind of thing that ships.

## 4. The four Graph calls

There are four, and there are deliberately no others. Acceptance criterion 10 says no action
may enumerate the vault; the simplest way to keep that true is for the code that could to not
exist. No listing, no search, no delta.

| Purpose | Call |
|---|---|
| Resolve the Inbox, once | `GET /me/drive/root:/<vault>/00 Inbox` |
| Deliver | `PUT /drives/{driveId}/items/{inboxId}:/{name}:/content?@microsoft.graph.conflictBehavior=fail` |
| Check a taken name | `GET /drives/{driveId}/items/{inboxId}:/{name}:` |
| Compare bytes | `GET …:/{name}:/content` |

The Inbox is addressed by path exactly once. Everything afterwards uses the returned drive and
item ids, so a later upload cannot walk into a different folder because a path component
changed underneath it. The resolved folder's name is verified to be exactly `00 Inbox` — the
same guard `InboxBridge` applies to a picked folder, and for the same reason: selecting the
whole vault is not a fallback.

### The one thing that must be measured, not believed

`@microsoft.graph.conflictBehavior=fail` is the entire collision guard, and **whether the
simple-upload endpoint honours it in the query string is what §G2 has to establish.** Microsoft
documents the annotation for upload sessions. The query-string form on `PUT …/content` is
widely used and widely asserted, which is not the same as measured, and the failure mode if it
is wrong is silent replacement of somebody's note.

If the device run shows it replacing, switch to `createUploadSession` with the annotation in
the body and one full-range `PUT`. A note is a few kilobytes; the extra round trip costs
nothing anybody would notice.

This is the Graph analogue of `08` §3's "strategy A versus strategy B", and it gets settled the
same way: by running it.

### Filename encoding

A note's filename reaches Graph straight out of `sanitiseTitle`, which strips what Windows
forbids and nothing else. So `#`, `?` and `%` all survive into a name, and all three end a URL
path early if unencoded. `#` is the one that actually happens — the Tag button puts them in
bodies and a title lifted from a body brings one along. `GraphClient.encoded` percent-encodes
the path while leaving Graph's own `:` and `/` delimiters literal.

## 5. Exactly once, and never overwriting

`07-iphone.md` §5 step 6 requires that an interrupted delivery be resolved by comparing the
intended filename and the exact bytes. The flow:

1. Upload with `conflictBehavior=fail`. A 201 is the end of it — the item leaves the outbox.
2. A 409 means the name is taken. Read the item's *content* back and compare sha256 against the
   bytes we hold.
   - **Identical** — the first attempt landed and never reported back. Delivered. This is what
     makes retrying safe and what makes criterion 7's "exactly once" true rather than
     approximately true.
   - **Different** — somebody else's note. Take the next collision-safe name, never overwrite.
   - **The check itself failed** — no honest answer exists, so retry. Guessing here is the one
     place a wrong answer either duplicates a note or destroys work.

**Identity is decided by downloading and comparing, not by a hash facet (B79).** Business
OneDrive publishes only `quickXorHash`, never sha256. Implementing QuickXorHash in Swift to
compare against would put an unverified assumption in the single place this app must not guess.
A note is a few kilobytes.

The collision suffix comes from `collisionCandidate` in `packages/core/src/filename.ts` — the
same function `uniquePath` walks on the desktop. This is not tidiness: `conflicts.ts` refuses
to treat a bare ` (N)` as a OneDrive conflict copy *because* it is `uniquePath`'s own shape, so
a suffix invented for iOS would either collide with desktop numbering or make the desktop
mistake an ordinary note for a conflict copy.

## 6. Phase G2 — the on-device matrix

Fill in `apps/iphone/graph-results.md` **during** the run. Record error codes, not impressions.
The `ProbePanel` (tap the "emqnote" eyebrow on the capture screen) runs every operation
individually and reports duration, byte count, sha256 and the native error domain and code.

| Test | Required outcome |
|---|---|
| Interactive sign-in | Succeeds; record whether the broker or a webview was used |
| Silent token after relaunch | No prompt |
| Silent token after device restart | No prompt, or a clear re-auth requirement |
| Silent token after >24 h | The refresh token is still good |
| Resolve `00 Inbox` | Correct drive and item id; a wrongly named folder is refused |
| Upload a probe note | 201; readback bytes and sha256 identical |
| **`conflictBehavior=fail` on simple PUT** | Honoured; if not, adopt the upload-session form |
| Upload the same name again | 409 `nameAlreadyExists`; the original is byte-identical afterwards |
| Unicode and `#` in the filename | Round-trips byte-identically |
| Airplane mode | A named, recoverable error — never a hang |
| Reconnect | Exactly one final note |
| Interrupted upload, then `probeItem` | Distinguishes absent, identical, and different |
| Backgrounded mid-upload | A complete file or no file — never a partial one |
| Two notes queued offline | Both arrive, once each, in order |
| PC arrival | Desktop parses without repair; task and `#phase0` tag visible on first scan |

**Go/no-go before relying on any of it.** Do not compensate by widening the scope, by using
`conflictBehavior=replace`, or by treating "probably delivered" as delivered.

## 7. What is still not proven after G2

Worth writing down so it is not mistaken for finished:

- The Swift half has **no automated test coverage**, exactly as `InboxBridge.swift` has none.
  The Xcode project has a single target and no XCTest target. The probe panel is its only
  instrument, and the evidence sheet is its only record.
- Nothing here has been measured against `07-iphone.md` §6's latency targets on a named device.
  That is Phase 4's job, and it needs Graph in place first.
- Delivery to a SharePoint or shared library is out of scope. The vault is on the user's own
  OneDrive for Business, so `/me/drive` and `Files.ReadWrite` are the whole story; a shared
  library would need different addressing and a wider scope, and that would be a new decision.
