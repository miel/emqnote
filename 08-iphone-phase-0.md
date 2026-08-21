# emqnote iPhone — Phase 0 OneDrive feasibility

Phase 0 proves that the real business iPhone can safely write complete, non-overwriting
Markdown files into the actual OneDrive `00 Inbox` through iOS Files. It is complete only
when the full path has been observed:

```text
iPhone app → iOS File Provider → OneDrive → PC → emqnote parses note
```

This work requires a Mac with Xcode, the physical business iPhone, its corporate MDM
policy, and the real OneDrive account. It cannot be completed in the exe.dev Linux VM.

## 1. Prepare the native test shell

On the Mac, check out the `iphone-app` branch at or after commit `58a5c56`, install the
workspace dependencies, and add Capacitor to `apps/iphone`. The current official
[Capacitor setup](https://capacitorjs.com/docs) installs the runtime and CLI, adds the iOS
platform, synchronizes the web build, and opens the generated Xcode project.

Configure `apps/iphone/capacitor.config.ts`:

```ts
export default {
  appId: "<approved bundle identifier>",
  appName: "emqnote",
  webDir: "dist",
};
```

Then build the web application, add iOS, synchronize it, and open the committed Xcode
project:

```bash
npm run build:iphone
npx cap add ios
npx cap sync ios
npx cap open ios
```

Use the appropriate Apple signing team and run directly on the business iPhone.
Distribution work remains outside Phase 0.

## 2. Build a narrow feasibility bridge

Do not build the complete outbox yet. Add a temporary native test interface with these
operations:

- `selectInbox()`
- `restoreInbox()`
- `writeDirect(filename, bytes)`
- `writeByMove(filename, bytes)`
- `readBack(filename)`
- `showDiagnosticLog()`

Each operation returns structured results to JavaScript: success, duration, filename,
byte count, SHA-256, and any native error domain and code.

### Folder selection

Present `UIDocumentPickerViewController` for `UTType.folder`. Apple documents that
directory selection returns a security-scoped URL and can work with third-party File
Providers such as OneDrive. See
[Providing access to directories](https://developer.apple.com/documentation/uikit/providing-access-to-directories).

After selection:

1. Require `url.lastPathComponent == "00 Inbox"`.
2. Confirm that the URL identifies a directory.
3. Call `startAccessingSecurityScopedResource()`.
4. Perform a small coordinated read/write validation.
5. Save bookmark data.
6. Balance every successful access call with `stopAccessingSecurityScopedResource()`.

Apple warns that unbalanced security-scope calls leak kernel resources and can eventually
prevent further external-file access. See
[`startAccessingSecurityScopedResource()`](https://developer.apple.com/documentation/foundation/url/startaccessingsecurityscopedresource%28%29).

On relaunch:

1. Resolve the bookmark.
2. Check whether it is stale.
3. Recreate and persist it when stale.
4. Start security-scoped access.
5. Revalidate the folder name and availability.

## 3. Test both write strategies

Run file operations on a serial background queue rather than the main/UI thread.

### Strategy A — coordinated direct create

Coordinate a write for the final URL and write the data using `.withoutOverwriting`.

Do not use `FileManager.createFile` as the collision guard: Apple documents that it
overwrites an existing file. `Data.WritingOptions.withoutOverwriting` explicitly fails
when the destination exists. See
[`withoutOverwriting`](https://developer.apple.com/documentation/foundation/nsdata/writingoptions/withoutoverwriting).

Always use the URL supplied to the file coordinator's accessor block. The provider may
supply a different effective URL, and synchronous coordination can block while other
presenters finish. See
[`NSFileCoordinator.coordinate`](https://developer.apple.com/documentation/foundation/nsfilecoordinator/coordinate%28writingitemat%3Aoptions%3Aerror%3Abyaccessor%3A%29).

### Strategy B — coordinated temporary-file move

Write complete bytes to an app-sandbox temporary file, then perform a coordinated move
to the final OneDrive URL without replacing an existing item.

This strategy is acceptable only if testing proves that OneDrive:

- never exposes a partial final file;
- accepts the cross-container move reliably;
- does not leave temporary files in the Inbox;
- reports collisions instead of overwriting.

Prefer direct create if both strategies are equally safe. It has fewer states to recover
from.

## 4. Use a recognizable probe note

Use unique filenames such as:

```text
2026-08-21 1432 Phase 0 direct 001.md
2026-08-21 1433 Phase 0 move 001.md
```

The probe bytes include:

- valid emqnote frontmatter;
- Unicode text;
- an attendee;
- a body tag;
- an unchecked task.

After every write:

1. Read the file back through the selected folder URL.
2. Compare exact bytes and SHA-256.
3. Wait for it to appear on the PC.
4. Confirm that emqnote parses it without repair.
5. Confirm that its task and body tag are visible on the first desktop scan.

Do not delete test files until the PC-side result has been recorded.

## 5. Execute the test matrix

| Test | Required outcome |
|---|---|
| Online direct create | File Provider accepts it; readback bytes match |
| Online temporary move | Complete final file or a clear failure; no residue |
| App relaunch | Bookmark restores without another picker |
| Device restart | Bookmark restores, or produces a clear reselect requirement |
| Filename already exists | Original is untouched; write fails cleanly |
| Offline/Airplane Mode | Local capture remains safe; provider either accepts or returns a recoverable error |
| Reconnect | One retry produces exactly one final note |
| Background during write | Complete final file or no final file—never partial |
| Force quit during delayed move | Recovery distinguishes absent, complete, and conflicting files |
| OneDrive app terminated | Files integration continues to behave predictably |
| PC synchronization | Exact bytes arrive and desktop parses immediately |
| MDM restrictions | Folder remains selectable and writable |

Microsoft supports keeping OneDrive files and folders offline on iOS, although folder
availability can depend on the Microsoft 365 plan. Record whether `00 Inbox` was pinned
offline during each run rather than assuming it. See
[Microsoft's OneDrive offline guidance](https://support.microsoft.com/en-us/onedrive/read-files-or-folders-offline-in-onedrive-for-ios).

## 6. Record evidence

Create `apps/iphone/phase-0-results.md` containing:

- iPhone model and iOS version;
- Xcode version;
- OneDrive version and account type;
- relevant MDM restrictions;
- whether `00 Inbox` was available offline;
- result and timing for every matrix row;
- native error domains and codes;
- iPhone-to-PC synchronization times;
- selected write strategy and rationale;
- any condition requiring folder reselection.

Do not commit account names, tenant identifiers, or private filesystem paths.

## 7. Go/no-go decision

Proceed to Phase 3 only if:

- OneDrive exposes `00 Inbox` through the picker.
- Corporate policy permits read/write access.
- The bookmark survives normal relaunch.
- A coordinated operation produces either exact final bytes or no final file.
- Existing files are never overwritten.
- Offline or interrupted operations return a recoverable state.
- A delivered note reaches the PC and parses correctly.

Stop and make the Graph-versus-no-app decision from
[`07-iphone-reviewed-clean.md`](07-iphone-reviewed-clean.md) if OneDrive is unavailable
through Files or MDM blocks third-party folder access. Do not compensate by weakening
permissions, selecting the whole vault, or introducing an uncoordinated filesystem write.
