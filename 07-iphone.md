# emqnote — iPhone quick capture

*Plan for a capture-only companion app. Reading, search, task management, distribution,
and general mobile parity are deliberately outside this scope.*

## 1. Purpose and boundary

The iPhone app has one job: create a new emqnote note quickly when the desktop app is not
available. The typical case is a call during which the user records a short note, adds
context, and turns one or more rows into tasks. When OneDrive has synchronized, the note
appears in `00 Inbox/` and opens normally in the desktop app.

This is a new capture decision, not a reversal of B53. B53 and [06-ipad.md](06-ipad.md)
reject a mobile client for reading and task management, and explicitly leave capture
underway as a separate question.

The first version does not include:

- reading or editing existing notes;
- folders, search, an Inbox view, or an aggregated task view;
- attachments, images, tables, note links, or general rich-text formatting;
- meeting type, contacts, calendar integration, or a vault-wide metadata scan;
- Microsoft Graph authentication;
- App Store, TestFlight, signing, or other distribution work.

## 2. Capture flow

The app launches straight into a new draft, or restores the one unfinished draft. There
is no home screen and no New Note button before the user can type.

| Control | Behaviour |
|---|---|
| **Title** | Focused on launch. Enter moves into the body. It may be left empty; the first non-empty body row then becomes the title. |
| **When** | Filled with the current local date, time, and offset; editable with the native date/time picker. |
| **Where** | Optional single-line field. |
| **Who** | Optional single-line field. Comma and semicolon both separate names, matching the desktop app. |
| **Body** | Touch-oriented ProseMirror editor. Markdown syntax is never shown. |
| **Task** | Permanent labelled quick button above the keyboard. Converts the current row or selected rows to tasks. |
| **Tag** | Permanent labelled quick button beside Task. Inserts `#` at the caret so typing can continue immediately as a tag. |
| **Save** | Commits the note to the durable local outbox, immediately attempts OneDrive delivery, and makes a fresh capture available. |

The standard iOS keyboard remains in use, including dictation, selection, autocorrect,
and external-keyboard support. `Cmd+Enter` may invoke Save when a hardware keyboard is
attached.

### 2.1 Task button

The Task button reuses the existing `toggleTask` command from
`src/renderer/editor/commands.ts` rather than defining a second task model.

- On a plain paragraph, it creates an unchecked task containing that text.
- On a bullet, it turns that item into an unchecked task without changing its text or
  nesting.
- On an empty row, it creates an unchecked task and leaves the caret ready for typing.
- With multiple rows selected, it turns every selected row into a task.
- On an existing task, it removes task status and leaves a normal bullet. The checkbox,
  not this button, controls whether a task is complete.
- Return after a task creates another unchecked task. Return on an empty task leaves the
  task list, following the existing editor behaviour.

### 2.2 Tag button

The Tag button is a text-entry accelerator, not a separate metadata editor.

- Tapping it focuses the body and inserts `#` at the current caret position.
- If there is no body selection, it restores the last body caret; if the body has never
  been focused, it inserts into a new row at the end.
- If the previous character is part of a word, it inserts a space before `#`, because
  `pad#tag` is deliberately not a tag in the emqnote dialect.
- If the caret already follows `#`, the button does not insert a second one.
- A selected word becomes `#selected-word`, with the selection replaced and the caret
  placed after it. Whitespace selections are replaced by a single `#`.
- The keyboard stays open and the user continues typing the tag immediately.

Tag recognition stays in the existing Markdown path. `bodyTagsOf`/`extractTags` recognizes
the body tag; the shared capture builder hoists it into `tags:` when the note is saved,
while leaving the visible `#tag` in the body. Even a note written by another tool is
recognized on the desktop app's first scan because `summarise` merges frontmatter tags
with tags extracted from the body. No mobile-only tag syntax or parser is introduced.

The first version does not add tag autocomplete or a separate Tags metadata field. Those
would require reading the vault or maintaining a second suggestion source, neither of
which belongs on the quick launch path.

## 3. Stored note

The app writes the existing dialect and the same initial-note metadata as desktop capture:

```markdown
---
title: Follow up with Els
type: quick
created: 2026-08-20T14:32:00+02:00
location: Teams
attendees: [Els Bakker]
tags: [planning]
source: manual
---

Discussed the revised planning. #planning

- [ ] Send Els the updated dates
```

The compatibility rules remain unchanged:

- the destination is `00 Inbox/`;
- filenames use the existing timestamp, title sanitisation, and `(2)` collision rules;
- title falls back to the first non-empty body row;
- empty optional metadata fields are omitted;
- a newly captured note has no `modified` value;
- `created` retains local time and its UTC offset;
- `type` is always `quick` and `source` remains `manual`;
- the app never overwrites an existing note.

## 4. Architecture

Use a dedicated mobile entry point inside a Capacitor iOS shell:

```text
Mobile React capture screen
            |
Existing ProseMirror schema, task commands, and Markdown serializer
            |
Durable local draft and outbox
            |
Small Swift File Provider bridge
            |
OneDrive / 00 Inbox
```

The React/WebView layer owns the screen, editor state, note construction, and Markdown
serialization. Swift owns only operations that must use iOS APIs: selecting the Inbox
folder, persisting its security-scoped bookmark, and performing coordinated file writes.
There is no Swift Markdown serializer.

### 4.1 Repository location and ownership

Keep the iPhone app in this repository under `apps/iphone/`. The Markdown dialect, task
behaviour, tag recognition, and capture construction are one product contract: keeping
both clients in one repository lets a change update the implementation, corpus, and both
builds atomically. A separate repository would require a published and versioned core
package, plus cross-repository release coordination, without buying anything at the
current single-user, single-product scale.

Use npm workspaces with one lockfile and aligned React and ProseMirror versions:

```text
emqnote/
├── apps/
│   └── iphone/
│       ├── package.json
│       ├── capacitor.config.ts
│       ├── vite.config.ts
│       ├── src/                 # Mobile capture UI and bridge adapter
│       ├── test/
│       └── ios/                 # Committed Xcode project and Swift bridge
├── packages/
│   └── core/
│       ├── package.json
│       └── src/
│           ├── markdown/        # Parser, schema, serializer, and tags
│           ├── capture/         # Frontmatter and note construction
│           ├── editor/          # Shared Task and Tag commands
│           ├── filename.ts      # Pure filename rules
│           └── time.ts
├── src/                         # Existing Electron app stays here for now
├── test/
└── package.json
```

`@emqnote/core` is a real workspace package with explicit subpath exports, for example
`@emqnote/core/markdown`, `@emqnote/core/capture`, and `@emqnote/core/editor`. It is
strictly platform-neutral: no Electron, `node:` imports, Capacitor, Swift, or filesystem
operations. An import-boundary test enforces that property in addition to the existing
bundle checks.

The Xcode project is committed under `apps/iphone/ios/`, because the security-scoped
bookmark and `NSFileCoordinator` bridge are maintained native source, not disposable
build output. Derived data and generated build products remain ignored.

Do not move the existing desktop application into `apps/desktop/` as part of the iPhone
work. It can remain at the repository root while it begins importing `@emqnote/core`.
Moving it later is possible if the asymmetry proves costly, but doing so now would create
a large mechanical diff with no value for the first mobile milestone.

A separate repository is reconsidered only if different teams or access controls require
it, or if `@emqnote/core` becomes a formally published and independently versioned package.

### 4.2 Repository work

1. Extract the pure frontmatter and document construction from
   `src/main/capture-store.ts` into `packages/core/src/capture/`.
2. Split timestamp and filename sanitisation from the Node filesystem collision check in
   `src/main/filename.ts`, moving the pure rules into `packages/core/src/filename.ts`.
3. Move the portable Markdown implementation and the specific shared editor commands into
   `@emqnote/core`, updating the desktop imports without changing behaviour.
4. Add `apps/iphone/` with a mobile Vite entry containing only the capture screen and a
   reduced configuration of the existing editor.
5. Reuse the existing schema, checkbox rendering, `toggleTask`, tag extraction, and
   serializer. Add a small tested `insertTagPrefix` editor command for the Tag button.
6. Wrap the mobile entry with Capacitor and add a narrow Swift bridge for the iOS file
   operations.

This preserves B6: Markdown is still written in one place. A native SwiftUI editor and a
second Swift serializer are rejected for the same dialect-drift reason recorded in B53.

## 5. OneDrive and durability

Typing must never wait for OneDrive.

On first use, the app asks the user to select the real `00 Inbox` folder through the iOS
Files picker. It validates the folder name and write access, then persists the returned
security-scoped bookmark. Selecting only the Inbox gives the app the minimum access its
single purpose requires.

Thereafter the write path is:

1. Keep one active draft in the app sandbox.
2. Save it locally after roughly 200 ms of typing inactivity and synchronously whenever
   the app moves to the background.
3. On Save, serialize the final bytes once and turn the draft into an immutable outbox
   item before contacting OneDrive.
4. Attempt a coordinated write into the selected Inbox while the app is foregrounded.
5. Retain failed items and retry whenever the app becomes active.
6. Before retrying after an interrupted delivery, compare the intended filename and exact
   bytes. Identical content means the first delivery succeeded; different content gets
   the next collision-safe name. This prevents both overwrites and duplicate notes.

The UI distinguishes two truthful states:

- **In OneDrive Inbox** — the File Provider accepted the completed file;
- **Saved on this iPhone** — the local copy is durable and is waiting for OneDrive.

The app cannot promise when another machine has completed OneDrive synchronization. Save
therefore reports local durability and File Provider handoff, not PC arrival.

The desktop `.tmp` plus rename strategy must be tested against the actual OneDrive File
Provider before being copied. The iOS bridge should use `NSFileCoordinator`; the feasibility
phase chooses between a coordinated create and coordinated temporary-file move based on
observed provider behaviour rather than assuming local-filesystem atomicity.

Microsoft Graph is a fallback only if corporate policy blocks third-party access through
Files. It would require Microsoft sign-in, Entra application registration, permissions,
and a second delivery implementation, so it is not part of this first plan.

## 6. Responsiveness targets

These are p95 targets to measure on a named physical iPhone, not simulator promises:

| Measurement | Target |
|---|---|
| Warm resume to editable Title | under 250 ms |
| Cold launch to editable Title | under 1 second |
| Keystroke, Task button, or Tag button to visible result | within one frame |
| Local draft durable after typing stops | under 300 ms |
| Save acknowledgement | under 150 ms |

OneDrive transfer and cross-device synchronization time are deliberately outside the Save
latency budget. Nothing enumerates or scans the vault during launch.

## 7. Implementation phases

### Phase 0 — OneDrive feasibility, 1–2 days

On the real business iPhone:

- select `00 Inbox` through Files and restore access after relaunch;
- create and read back a complete `.md` file;
- test online, offline, background, and interrupted-write behaviour;
- confirm that corporate MDM permits the app to reach the folder;
- confirm that a delivered note appears in the PC Inbox and opens correctly;
- determine the safe coordinated-create operation for OneDrive's File Provider.

If folder access is blocked, stop and make a separate Graph-versus-no-app decision.

### Phase 1 — Shared capture core, 2–3 days

- Establish the npm workspaces and `@emqnote/core` import boundaries.
- Extract pure note construction and pure filename formatting into `packages/core/`.
- Move the portable Markdown code and shared Task/Tag commands without duplicating them.
- Preserve desktop capture byte-for-byte.
- Add tests for title fallback, date offset, Where, Who, body tags, task Markdown,
  sanitisation, and collisions.
- Run the existing corpus round-trip tests against the shared mobile bundle.

### Phase 2 — Mobile capture UI, about 1 week

- Create `apps/iphone/` and build the single capture screen and metadata controls.
- Add the reduced ProseMirror editor.
- Add persistent Task and Tag buttons above the keyboard.
- Add unit tests for every Task and Tag button caret/selection rule.
- Restore the active draft after backgrounding or process termination.
- Add Save, the two delivery states, and immediate reset to a fresh capture.

### Phase 3 — Durable OneDrive outbox, 3–5 days

- Implement sandbox draft storage and immutable outbox records.
- Implement the security-scoped bookmark and coordinated Inbox bridge.
- Add collision handling, idempotent retries, offline delivery, and clear repair UI when
  folder permission is lost.
- Ensure no OneDrive operation blocks editing or local Save acknowledgement.

### Phase 4 — Device hardening, 3–5 days

- Measure cold launch, warm resume, typing, Task, Tag, and Save latency.
- Test backgrounding during a call, force-quit recovery, airplane mode, expired folder
  access, Unicode titles and names, long notes, and repeated Save attempts.
- Test Dynamic Type, VoiceOver, 44-point touch targets, portrait and landscape, dictation,
  and an external keyboard.
- Complete the physical iPhone-to-OneDrive-to-PC acceptance flow.

A realistic first usable version is approximately two to three weeks if Phase 0 succeeds.

## 8. Acceptance criteria

The basic app is complete when all of the following hold on a physical iPhone:

1. Launching or resuming presents an editable draft within the measured latency targets.
2. Title, When, Where, Who, paragraphs, tasks, and inline tags survive a force quit.
3. Task turns a plain or selected row into the same task node and `- [ ]` bytes the desktop
   app uses.
4. Tag inserts a usable `#` without dismissing the keyboard, and the rest of the tag can
   be typed immediately.
5. A tag created through that button is present in the body, hoisted into frontmatter by
   the shared capture path, and available to the desktop app on its first scan/read.
6. Save acknowledges local durability without waiting for the network.
7. An offline capture is delivered exactly once after OneDrive becomes available.
8. A delivered file appears in `00 Inbox/`, is parsed without repair by the desktop app,
   and exposes its open tasks and tag immediately.
9. A filename collision never overwrites an existing note.
10. No launch, typing, Task, Tag, or local Save action enumerates the OneDrive vault.
