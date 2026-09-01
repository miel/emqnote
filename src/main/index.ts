import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  shell,
  type MenuItemConstructorOptions,
  type OpenDialogOptions,
  type WebContents,
} from "electron";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  IPC,
  type CapturePayload,
  type SaveError,
  type Theme,
  type WikiLinkOutcome,
} from "../shared/ipc.js";
import { knownVaults, rememberVault } from "./remembered.js";
import { listVaults } from "./vaults.js";
import { CaptureWriter } from "./capture-store.js";
import {
  createCaptureWindow,
  focusCaptureWindow,
  getCaptureWindow,
  hideCaptureWindow,
  sendStatus,
  setBlurHandler,
  setHideHandler,
  setQuitting,
  showCaptureWindow,
} from "./capture-window.js";
import { completeMeasurement, LATENCY_BUDGET_MS } from "./latency.js";
import { notifyPainted, runSelfTest } from "./selftest.js";
import { dumpClipboard } from "./clipboard-dump.js";
import {
  captureWindowTo,
  getLibraryWindow,
  showLibraryWindow,
} from "./library-window.js";
import { readLaunchOptions, shouldOpenLibraryAtLaunch } from "./launch-options.js";
import { titleBarColours } from "./window-background.js";
import { applyLoginItem } from "./login-item.js";
import { loadSettings, saveSettings } from "./settings.js";
import { buildTrayMenu, createTray } from "./tray.js";
import { checkForUpdates, setBeforeInstall } from "./updater.js";
import { AtomicWriteError, setRecoveryDirectory } from "./atomic-write.js";
import {
  checkFilesOnDemand,
  defaultVaultPath,
  ensureVaultLayout,
  FILES_ON_DEMAND_INSTRUCTION,
  findOneDriveCandidates,
  tenantLabel,
  VAULT_FOLDER_NAME,
} from "./vault.js";
import {
  createFolder,
  deleteFromTrash,
  diffConflict,
  duplicateNote,
  emptyTrash,
  folderContents,
  openTasksAt,
  trashContents,
  renameFolder,
  moveFolder,
  moveNote,
  openNote,
  readFilesIn,
  readFolderTree,
  renameNote,
  resolveConflict,
  rewriteTargetPrefix,
  rewriteWikiLinks,
  saveNote,
  setPinned,
  summariseFile,
  toggleTask,
  trashAttachment,
  trashFolder,
  trashNote,
} from "./vault-io.js";
// No explicit invalidation on writes: the scan stats every file anyway, so a changed
// note is re-read and an unchanged one is not. A capture landing mid-session costs the
// stat walk, not another full read.
import {
  conflicts,
  facets,
  locationFacets,
  folderTaskCounts,
  noteTaskCounts,
  linkingNotes,
  linkingNotesUnder,
  notesMatching,
  referencedTargets,
  resolveNoteLink,
  searchNotes,
  setScanRunner,
  startScan,
  targetsUnder,
  tasks as tasksMatching,
} from "./vault-scan.js";
import { linkTargetFor } from "./link-resolve.js";
import { folderRenameRewrites, movedPath } from "./folder-rename-links.js";
import { stopScanWorker, workerScanRunner } from "./scan-host.js";
import {
  closeIndex,
  getNote as getNoteMeta,
  openIndex,
  pinnedNotesIn,
  type IndexDb,
} from "./index-db.js";

/**
 * How many notes may be pinned **in one folder** (B75, narrowed by B77). Three, as asked
 * for: the feature is "keep the two or three things I am actually working on at the top",
 * and a pinned section that can grow without limit is just the note list again, in a
 * different order.
 *
 * Three *per folder* rather than three in the vault, because the folder is the unit the
 * feature is about: a fourth project should not be refused its pins because three other
 * projects have already spent the allowance. The immediate folder only — see
 * `pinnedNotesIn` in `index-db.ts` for why subfolders are not rolled up.
 */
const MAX_PINNED = 3;
import { watchVault, type VaultWatcher } from "./index-watch.js";
import { wasOwnWrite } from "./own-writes.js";
import { parseSearchQuery } from "./search-query.js";
import {
  attachmentsOrphanedByTrash,
  findUnlinkedAttachments,
} from "./unlinked-attachments.js";
import { probeTrashPath, reportTrashProbe } from "./trash-probe.js";
import { copyAttachment, resolveAttachment, saveAttachment } from "./attachments.js";
import {
  attachmentNameFromUrl,
  thumbPageFromUrl,
  thumbSizeFromUrl,
} from "../shared/attachment-url.js";
import { isPreviewable } from "./thumbnail-cache.js";
import {
  ensureThumbnail,
  pdfPageCount,
  runThumbnailProbe,
  thumbnailCacheDir,
} from "./thumbnails.js";
import { shutdownPdfThumb } from "./pdf-thumb.js";
import { attachmentRoute } from "./attachment-route.js";
import { openPdfViewer, shutdownPdfViewer } from "./pdf-window.js";
import { fetchRemoteImage } from "./fetch-attachment.js";
import { serveRemoteImage } from "./remote-images.js";
import { isOpenableUrl } from "./remote-image.js";
import { FOLDER_ERROR, folderOf, TRASH_FOLDER } from "../shared/vault-types.js";
import type {
  ConflictChoice,
  ConflictPair,
  FileSummary,
  LinkCandidateSummary,
  SaveNoteRequest,
  ScanProgress,
  Selection,
  SortDirection,
  SortKey,
  VaultFileEvent,
} from "../shared/vault-types.js";
import type { Locale } from "../shared/i18n.js";

// Windows: Roaming AppData can be synchronised by a corporate profile, which is exactly
// what we do not want for an index and window state. Must happen before 'ready'.
if (process.platform === "win32" && process.env.LOCALAPPDATA !== undefined) {
  app.setPath("userData", join(process.env.LOCALAPPDATA, "emqnote"));
}

// Must be registered before 'ready' — Electron refuses it any later. `standard: true`
// is what lets a relative-looking `emqnote-attachment://name.png` resolve at all;
// `secure: true` keeps it out of mixed-content warnings even though it never leaves
// the machine. A `data:` URL was rejected for this on purpose: it would cross IPC as
// base64 on every render and bloat a screenshot by a third — see attachments.ts.
// `emqnote-thumb` beside it (B30) for the same reasons, same privileges: a first-page
// PDF thumbnail is rendered (B36) or read from cache, and served the same way — never
// as a `data:` URL, which would mean pushing a full base64 image through IPC on every
// `setDoc` (every note-open) and reopening the CSP hole B28 closed for attachment
// previews generally. See thumbnails.ts / thumbnail-cache.ts.
//
// `corsEnabled: true` is `emqnote-thumb`-only, added for B36: `wikiLinkNodeView` reads
// the response with `fetch()` now, not an `<img src>` load — the only way to see the
// 404-vs-422 status a plain `<img>`'s `onerror` cannot — and `fetch()` enforces CORS
// even for a scheme this app owns end to end, where an `<img>` tag never did. Confirmed
// live: without this, every thumbnail fetch failed with a CORS error and every PDF
// silently showed as a plain chip, passing every existing test while being visibly
// broken in the real app.
protocol.registerSchemesAsPrivileged([
  {
    // `corsEnabled` on this one is B40's: the viewer window `fetch()`es the PDF's bytes
    // out of the vault, and a `fetch()` enforces CORS even for a scheme this app owns end
    // to end — precisely the failure B36 hit above, where every test passed and every
    // thumbnail was silently broken in the real app. An `<img src>` never needed it,
    // which is why the attachment scheme got this far without.
    scheme: "emqnote-attachment",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
  {
    scheme: "emqnote-thumb",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
  {
    // B50: a picture a note names by `https://…`, fetched by main and served out of a
    // cache in `userData`. Same privileges as its two neighbours but **no `corsEnabled`**,
    // and that omission is deliberate: nothing `fetch()`es this one — `externalImageView`
    // loads it as an `<img>`, which never needed the privilege. If a renderer is ever made
    // to `fetch()` it, this is the line to change first, because both times that has been
    // missed the feature was silently dead in the real app while every test passed (B36 on
    // `emqnote-thumb`, B40 on `emqnote-attachment`).
    scheme: "emqnote-remote",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

const launch = readLaunchOptions();

// One resident instance. A second launch raises a window rather than starting a second
// app — the library since B61, because clicking the shortcut of a running app is the same
// gesture as clicking the shortcut of a stopped one and should not mean two different
// things. The one exception is a relaunch that carries `--login`, which is what the login
// item does when the app somehow survived a sign-out.
//
// A self-test is the exception: it has to be able to run while the everyday instance
// is resident, otherwise it would quietly hand off to that instance and appear to do
// nothing at all — which is exactly what happened the first time it was tried on
// Windows. It runs on its own vault and exits when done. `--dump-clipboard` needs the
// same exception for the same reason: its whole point is running it alongside the
// resident instance, right after copying something from Outlook. `--thumbnail-probe`
// needs it for the same reason again: it exists to be run against the everyday vault,
// on demand, without first quitting the resident app.
const bypassesSingleInstance =
  launch.selfTestRounds > 0 ||
  launch.dumpClipboard !== null ||
  launch.thumbnailProbe !== null ||
  launch.trashProbe !== null;
if (!bypassesSingleInstance && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if (!bypassesSingleInstance) {
    app.on("second-instance", (_event, argv) => {
      if (shouldOpenLibraryAtLaunch(readLaunchOptions(argv))) showLibraryWindow();
      else showCaptureWindow();
    });
  }
  void main();
}

let lastLatency: number | null = null;
let lastSavedAs: string | null = null;
/**
 * The vault path, cached so `registerAttachmentProtocol`'s handler does not read
 * `settings.json` from disk on every single attachment request — a note with several
 * inline images re-issues that read on every one of them, and again on every `setDoc`.
 * Kept in step by `adoptVault`, the only place the path actually changes, and seeded
 * once at startup in `main`; nothing else needs it, since every other reader here can
 * afford `loadSettings()`.
 */
let cachedVaultPath: string | null = null;
/**
 * The search index (`02-technisch-ontwerp.md` §7). Opened once in `main`, after
 * `app.whenReady`, since its path lives under `app.getPath("userData")` — B9, same
 * reasoning as `settings.ts`. Null only in the sliver of time before that, and in the
 * `--dump-clipboard` early exit, which never touches it; `will-quit` guards on it for
 * exactly that second case, since that handler is registered unconditionally and a
 * quit during the second-instance-lock check never reaches `main` at all.
 */
let indexDb: IndexDb | null = null;
/** Incremental reindexing after the initial full scan — §7.2. Started once a vault is known, closed on quit. */
let vaultWatcher: VaultWatcher | null = null;

/**
 * Tells the library to reload. Used for the vault changing underneath it, and also for
 * the capture window claiming or releasing a note — the library's `editable` flag on
 * whatever it has open is only ever as fresh as the last of these.
 */
function notifyLibrary(): void {
  const library = getLibraryWindow();
  if (library !== null && !library.isDestroyed()) {
    library.webContents.send(IPC.libraryRefresh);
  }
}

/**
 * Waits for the library window to write anything it still has pending.
 *
 * The library's save is debounced in the *renderer*, where main cannot see it — which is
 * fine while the only way to switch vaults is a button in that same window, since
 * `Settings.tsx` flushes on its way to `switchVault`. The tray's copy of the gesture has
 * no such window in the loop, and a debounced write landing after `app.relaunch()` would
 * put the old note's bytes into the new vault at the same relative path, creating the
 * folder to hold it. Silently — the third of the four hazards B21 lists.
 *
 * Bounded, because this stands in front of a restart the user asked for: a library window
 * that is wedged or mid-dialog must delay it, not cancel it. Two seconds is far longer
 * than a write and far shorter than a hang worth noticing.
 */
function flushOpenLibrary(): Promise<void> {
  const library = getLibraryWindow();
  if (library === null || library.isDestroyed()) return Promise.resolve();

  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      ipcMain.off(IPC.libraryFlushed, done);
      resolve();
    };
    const timer = setTimeout(done, 2000);

    ipcMain.on(IPC.libraryFlushed, done);
    library.webContents.send(IPC.libraryFlushSaves);
  });
}

/**
 * Points the app at another vault and restarts it.
 *
 * A restart and not a live switch, and that is B21 rather than laziness — four separate
 * pieces of state are decided once and never revisited:
 *
 *  - `CaptureWriter.session.path` is fixed on the first write, so a half-typed note
 *    would keep landing in the old vault.
 *  - `ensureScanned` collapses concurrent callers onto one `running` promise *without
 *    checking which vault it is for*, so a `facets()` straight after a switch can await
 *    the old vault's scan and read its cache. `invalidate()` exists and has no callers.
 *  - A pending `saveTimer` in the renderer would write the old note's bytes into the new
 *    vault at the same relative path, with `writeAtomic`'s `mkdirSync` creating the
 *    folder to hold it. Silently.
 *  - `filesOnDemandWarned` — now per vault, precisely so the restart does not land in a
 *    new OneDrive folder with the warning already suppressed.
 *
 * One function and not two copies of it: the tray reaches this as well as the settings
 * panel (14 August 2026), and a second sequence written out beside this one is how one of
 * those four gets forgotten on the path nobody tested.
 */
async function switchVaultTo(path: string): Promise<void> {
  await writer.flush();
  writer.finish();
  await flushOpenLibrary();

  adoptVault(path);

  app.relaunch();
  app.quit();
}

/**
 * The notes linking to a set of them, as `rewriteWikiLinks` wants them — the move and
 * rename handlers ask the same question the same way, and the index may not be open yet.
 *
 * Deduped by the *linking* note, merging its targets: one note pointing at three of the
 * notes being moved is one file to rewrite, and handing `rewriteWikiLinks` the same path
 * three times would have it parse, mutate and write that file three times over (B95).
 */
async function linkingNotesFor(
  vault: string,
  paths: string[],
): Promise<{ path: string; targets: string[] }[]> {
  if (indexDb === null) return [];

  const byPath = new Map<string, { path: string; targets: string[] }>();
  for (const path of paths) {
    // eslint-disable-next-line no-await-in-loop
    for (const one of await linkingNotes(vault, indexDb, path)) {
      const existing = byPath.get(one.path);
      if (existing === undefined) byPath.set(one.path, { path: one.path, targets: [...one.targets] });
      else existing.targets.push(...one.targets);
    }
  }
  return [...byPath.values()];
}

/**
 * A folder changed place — renamed (B44) or moved back out of the trash — with the links
 * into it repaired around the move.
 *
 * One function for both handlers rather than a copy each, because the *ordering* is the
 * whole of B44/B45 and a second copy is how the next one drifts. Both questions are asked
 * **before** the folder moves, since a target resolves against where a note is *now* and
 * afterwards there is nothing left for the index to find; both rewrites happen after it,
 * against paths rebased onto the folder's new location. `apply` — one call to
 * `renameFolder` or to `moveFolder` — is the only line that differs between the two.
 *
 * The lock guard is the one `IPC.libraryTrashFolder` has: `CaptureWriter`'s session pins
 * the path it will write to next, and moving the folder under it does not update that
 * path, so the next debounced write would recreate the note in a folder nobody else
 * believes exists.
 *
 * It does not confirm, on either route. B44 argues that for the rename — a folder rename
 * is not a gesture anyone makes about one note, and a dialog counting notes the user has
 * never thought about is friction in front of a repair they cannot reasonably decline —
 * and a restore is the same act read backwards.
 */
async function relocateFolder(
  vault: string,
  path: string,
  apply: () => string,
): Promise<string> {
  const active = writer.activePath();
  if (active !== null && active.startsWith(`${path}/`)) {
    throw new Error(FOLDER_ERROR.locked);
  }

  const linking = indexDb === null ? new Map() : await linkingNotesUnder(vault, indexDb, path);
  // The other half (B45), and the one the first version of the rename was missing
  // entirely: every target that *carries a path* into this folder — a picture, a PDF, a
  // path-form note link. `linkingNotesUnder` above answers a question about resolution and
  // an attachment never resolves to a note, so it can say nothing about the folder of
  // images this was first reported for.
  const carrying = indexDb === null ? [] : await targetsUnder(vault, indexDb, path);

  const moved = apply();

  for (const rewrite of folderRenameRewrites(path, moved, linking)) {
    rewriteWikiLinks(vault, rewrite.references, rewrite.newTarget, writer.activePath());
  }
  // After the move and after the link pass, so a note that was itself inside the folder is
  // written at the path it now has. Both passes match on the *old* spelling, which exists
  // only once, so neither can undo the other.
  rewriteTargetPrefix(
    vault,
    carrying.map((one) => movedPath(one.path, path, moved)),
    path,
    moved,
    writer.activePath(),
  );

  notifyLibrary();
  return moved;
}

/**
 * Pushes a note's disk-level change to whichever window has it open.
 *
 * The library gets every event unconditionally: main has no reliable way to know what
 * the reader currently has open — building one would mean a second source of truth for
 * something the library renderer already holds authoritatively (`open` in
 * `Library.tsx`) — so it filters against its own state instead. The capture window is
 * the opposite: its one open path genuinely *is* main's own state
 * (`writer.activePath()`), so it is filtered here rather than by sending the renderer a
 * value to compare against — the renderer's own `status.savedAs` is absolute for a
 * brand-new unsaved note and vault-relative for a loaded one, so comparing that against
 * a vault-relative event path would silently never match for a new note.
 *
 * Never called for this app's own write — see `index.ts`'s `watchVault` call site,
 * which only reaches this when the watcher's `own` flag is false. `notifyLibrary`
 * above stays unconditional regardless; this is strictly in addition to it.
 */
function notifyFileEvent(event: VaultFileEvent): void {
  const library = getLibraryWindow();
  if (library !== null && !library.isDestroyed()) {
    library.webContents.send(IPC.vaultFileChanged, event);
  }

  const capture = getCaptureWindow();
  if (capture !== null && !capture.isDestroyed() && writer.activePath() === event.path) {
    capture.webContents.send(IPC.vaultFileChanged, event);
  }
}

/**
 * How far the startup scan has got, or null when nothing is scanning.
 *
 * Kept here as well as pushed, because the library window is usually not open when the
 * scan runs — the app starts at login and gets opened hours later — so a window that
 * appears halfway through has missed every event and has to ask.
 */
let scanProgress: ScanProgress | null = null;
let scanReported = 0;

/** No faster than this: one IPC message per file is a few thousand for one bar. */
const SCAN_REPORT_INTERVAL_MS = 120;

function sendScanProgress(progress: ScanProgress | null): void {
  scanProgress = progress;
  const library = getLibraryWindow();
  if (library !== null && !library.isDestroyed()) {
    library.webContents.send(IPC.libraryScanProgress, progress);
  }
}

/**
 * Walks the vault at launch rather than leaving the first question to pay for it.
 *
 * `vault-scan.ts`'s `ensureScanned` has always run the scan lazily, on whatever asked the
 * index something first — which in practice is the library's own conflict check, run
 * eagerly on mount. So the first library open after a cold start sat there walking the
 * entire vault before it drew a thing, with nothing on screen to explain the wait.
 * Starting here costs the same work at a moment when nobody is waiting on it, and
 * `startScan` shares the same collapse, so a library opened mid-walk joins the scan in
 * progress instead of starting a second one beside it.
 *
 * Deliberately after `prepareVault()` and deliberately not awaited: this must not sit in
 * front of the tray, the hotkey or the capture window's first paint. `fullScan` yields to
 * the event loop every hundred files for the same reason — the hotkey runs on this thread
 * too, and its budget is 80 ms.
 *
 * Skipped entirely during a measurement run, exactly like the watcher above and for the
 * same reason: a full vault walk is precisely the unaccounted-for noise the hotkey→caret
 * numbers cannot afford to pick up.
 */
function beginStartupScan(vault: string, db: IndexDb): void {
  void startScan(vault, db, (progress) => {
    const now = Date.now();
    // Always let the last one through, or the bar freezes just short of full and the
    // window it is in never hears that it is done.
    if (progress.done < progress.total && now - scanReported < SCAN_REPORT_INTERVAL_MS) {
      return;
    }
    scanReported = now;
    sendScanProgress(progress);
  }).finally(() => sendScanProgress(null));
}

/**
 * Whatever a write threw, in the shape both windows show. `AtomicWriteError` is the
 * expected case and the only one carrying a recovery path; anything else is reported
 * faithfully rather than dressed up as one.
 */
function asSaveError(error: unknown): SaveError {
  if (error instanceof AtomicWriteError) {
    return { code: error.code, message: error.message, recoveryPath: error.recoveryPath };
  }
  return {
    code: (error as NodeJS.ErrnoException | null)?.code ?? "UNKNOWN",
    message: error instanceof Error ? error.message : String(error),
    recoveryPath: null,
  };
}

/**
 * The last write that would not land, or null. Cleared by the next write that does, so
 * the notice in the capture window's footer disappears on its own once OneDrive lets go
 * — which is the common case, since `atomic-write.ts` only gives up after retrying.
 */
let lastSaveError: SaveError | null = null;

const writer = new CaptureWriter(
  () => loadSettings().vaultPath,
  (result) => {
    lastSavedAs = result.path;
    // A write that landed is the only honest way to clear a previous failure: the file is
    // demonstrably writable again.
    lastSaveError = null;
    // A note still awaiting Ctrl+Enter/close has nothing worth telling the library about
    // yet: it stays filtered out of every listing (see `uncommittedNewPath`), so pushing a
    // refresh here would only make it rescan for no visible change, every 800ms while the
    // user keeps typing.
    if (writer.uncommittedNewPath() === null) notifyLibrary();
    sendStatus({
      lastLatencyMs: lastLatency,
      savedAs: lastSavedAs,
      saveError: lastSaveError,
    });
  },
  (failure) => {
    lastSaveError = {
      code: failure.code,
      message: failure.message,
      recoveryPath: failure.recoveryPath,
    };
    // Logged as well as shown. The window says the short version; a `code` and a full
    // path in the terminal are what a bug report needs, and this is the class of failure
    // where the report arrives hours after the fact.
    console.error(
      `[save] ${failure.path ?? "(unnamed note)"} — ${failure.code}: ${failure.message}` +
        (failure.recoveryPath === null
          ? " — no recovery copy could be written"
          : ` — text preserved at ${failure.recoveryPath}`),
    );
    sendStatus({
      lastLatencyMs: lastLatency,
      savedAs: lastSavedAs,
      saveError: lastSaveError,
    });
  },
);

async function main(): Promise<void> {
  await app.whenReady();

  if (launch.dumpClipboard !== null) {
    dumpClipboard(launch.dumpClipboard);
    app.exit(0);
    return;
  }

  if (launch.thumbnailProbe !== null) {
    const vault = loadSettings().vaultPath;
    if (vault === null) {
      console.log("no vault configured — pass --vault=<path> alongside --thumbnail-probe");
      app.exit(1);
      return;
    }
    const code = await runThumbnailProbe(vault, thumbnailCacheDir(), launch.thumbnailProbe);
    app.exit(code);
    return;
  }

  // Alongside the resident instance, like the probes above it — and here that is the
  // point rather than a convenience: if the delete only works with emqnote quit, the app
  // is the holder, and running this both ways is how that gets settled.
  if (launch.trashProbe !== null) {
    app.exit(reportTrashProbe(probeTrashPath(loadSettings().vaultPath, launch.trashProbe)));
    return;
  }

  // One connection here for the questions the library asks; the scan runs in a worker
  // that opens the same file itself, which is why the path is handed over rather than
  // the handle (`scan-host.ts`).
  const indexPath = join(app.getPath("userData"), "index.sqlite");
  indexDb = openIndex(indexPath);
  setScanRunner(workerScanRunner(indexPath));

  // Where a note goes when the vault will not take it. Under `userData` and never inside
  // the vault, deliberately: the vault is the thing refusing the write, and OneDrive is
  // usually why. Set before any window exists, because the capture window is created and
  // rendered at startup and can be typed into the moment it is shown.
  setRecoveryDirectory(join(app.getPath("userData"), "recovered"));

  // Menu bar app: no dock icon, no app switcher entry. The main window in phase 4 will
  // temporarily restore this when it opens.
  if (process.platform === "darwin") app.setActivationPolicy("accessory");

  const selfTestRounds = launch.selfTestRounds;
  const settings = loadSettings();
  cachedVaultPath = settings.vaultPath;

  // B90, and it has to be here rather than in `registerAppIpc` below: `themeSource` is
  // what `prefers-color-scheme` answers from, and `windowBackground()` — the colour
  // Chromium paints before the renderer's first frame — reads `shouldUseDarkColors` at
  // window construction. Applied after that, a dark-theme machine set to light would open
  // every window with a flash of the wrong theme, which is the exact defect
  // `window-background.ts` exists to have fixed.
  applyTheme(settings.theme);

  installMinimalMenu();
  registerAttachmentProtocol();
  registerThumbnailProtocol();
  registerRemoteImageProtocol();
  registerIpc();
  createCaptureWindow();

  // A measurement run leaves the machine as it found it: no login item, no second tray
  // icon next to the one already there, and no fight over the global shortcut with the
  // instance that is already running.
  if (selfTestRounds === 0) {
    applyLoginItem(settings.openAtLogin);
    // The same three the settings panel reaches over IPC. Handed in rather than imported,
    // since `askForVault` and `switchVaultTo` live here and the tray is created here.
    createTray({
      list: () => listVaults(knownVaults(), findOneDriveCandidates(), loadSettings().vaultPath),
      choose: askForVault,
      switchTo: switchVaultTo,
    });
    registerHotkeysAndWarn();
  }

  setHideHandler(() => {
    writer.finish();
    lastSavedAs = null;
    // Whether or not there was anything to write, the window has released whatever
    // note it had — including a note it never wrote a byte to, which `writer.finish`'s
    // own refresh (guarded on `written`) would otherwise miss entirely.
    notifyLibrary();
  });

  // Switching away is not closing: write what is there and leave the note open.
  setBlurHandler(() => {
    void writer.flush();
  });

  setBeforeInstall(async () => {
    await writer.flush();
    writer.finish();
  });

  await prepareVault();

  // A measurement run must never touch the network or show a dialog — same reasoning
  // as skipping the tray and hotkey above. The watcher joins that list for a different
  // reason: background fs polling is exactly the kind of unaccounted-for noise the
  // hotkey→caret numbers in `CLAUDE.md` cannot afford to quietly pick up.
  const watchedVault = loadSettings().vaultPath;
  if (selfTestRounds === 0 && watchedVault !== null && indexDb !== null) {
    vaultWatcher = watchVault(watchedVault, indexDb, {
      isOwnWrite: wasOwnWrite,
      // `notifyLibrary` fires unconditionally, exactly as it always has — the library's
      // own lists, facets and conflict banner need to refresh on the app's own writes
      // too. `notifyFileEvent` is strictly additional and only for a real external
      // change: suppressing it for an own write is what keeps the "changed on disk"
      // notice from appearing ~800ms after every keystroke pause, since the app's own
      // debounced autosave is itself a filesystem write this same watcher observes.
      onChange: (event) => {
        notifyLibrary();
        if (!event.own) notifyFileEvent({ path: event.path, kind: event.kind });
      },
    });
    beginStartupScan(watchedVault, indexDb);
  }

  if (selfTestRounds === 0) maybeCheckForUpdatesOnStartup();

  // B61. Not `launch.openLibrary` any more: a launch nobody asked for — the login item at
  // sign-in — stays silent, and every other one puts the library on screen, because a
  // deliberate start that shows no window at all reads as an app that failed to start.
  // `wasOpenedAtLogin` is macOS's own answer and is only ever true there.
  if (shouldOpenLibraryAtLaunch(launch, app.getLoginItemSettings().wasOpenedAtLogin)) {
    showLibraryWindow();
  }

  // Clicking the icon of a running app: macOS sends this rather than `second-instance`,
  // and with `LSUIElement` set there is no dock icon, so this is Finder or Spotlight.
  app.on("activate", () => {
    if (selfTestRounds === 0) showLibraryWindow();
  });

  if (launch.screenshot !== null) {
    const file = launch.screenshot;
    // Without --library it is the capture window that gets photographed, which is the
    // one whose layout is easiest to break and hardest to notice.
    if (launch.openLibrary) showLibraryWindow();
    else showCaptureWindow();

    setTimeout(() => {
      const target = launch.openLibrary ? getLibraryWindow() : getCaptureWindow();
      void captureWindowTo(target, file, flagNote(), flagButton()).then((ok) => {
        console.log(ok ? `screenshot written to ${file}` : "no window to capture");
        app.exit(ok ? 0 : 1);
      });
    }, 2500);
  }
  if (selfTestRounds > 0) await runSelfTest(selfTestRounds);
}

/**
 * Replaces Electron's default application menu with only the clipboard roles.
 *
 * That default menu's accelerators are the reason: it binds Ctrl+M to Minimise, which is
 * why indenting inside a list minimised the whole window. It also claims Ctrl+R for
 * reload and Ctrl+Shift+I for developer tools. The Edit roles have to stay, because on
 * macOS the menu is what makes Cmd+C and Cmd+V work at all.
 *
 * This comment used to say the menu was "invisible on a frameless window", which is true
 * of the capture window and of nothing else — and saying it in the one place that sets
 * the menu for the whole app is what kept a Windows bug invisible for months. On Windows
 * a `Menu.setApplicationMenu` menu is drawn *per window*, so the library window and the
 * PDF window, which are both natively framed, grew a real menu strip between the title
 * bar and the page: a bar reading "Edit" above the folder tree, on a window that has no
 * business having one. Those two carry `autoHideMenuBar: true` for it — a no-op on macOS,
 * where the menu belongs to the app rather than the window, and deliberately not
 * `setMenu(null)`, which would take the Edit roles and their accelerators with it.
 */
function installMinimalMenu(): void {
  const template: MenuItemConstructorOptions[] = [];

  if (process.platform === "darwin") {
    template.push({
      label: "emqnote",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        {
          // Deliberately not `role: "quit"`. Cmd+Q is window-scoped here, not an app
          // quit — a user decision, not a platform oversight: from the library window
          // it closes that window (already clean, see `library-window.ts`'s "closed"
          // handler); from the note window it commits and hides it, the same
          // save-and-put-away contract the traffic light and `IPC.captureClose` follow.
          // The resident app keeps running either way — the tray's "Quit emqnote" stays
          // the only true exit. The label matches that tray item on purpose, for muscle
          // memory, even though this one does not quit the process.
          label: "Quit emqnote",
          accelerator: "Command+Q",
          click: () => {
            const focused = BrowserWindow.getFocusedWindow();
            if (focused === getCaptureWindow()) hideCaptureWindow();
            else focused?.close();
          },
        },
      ],
    });
  }

  template.push({
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "pasteAndMatchStyle" },
      { role: "selectAll" },
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Serves attachment files to a renderer as `emqnote-attachment://vault/<name>`.
 *
 * `net.fetch` on a `file://` URL is the modern replacement for the old
 * `protocol.registerFileProtocol` — it streams rather than buffering the whole file
 * into memory first, which matters once this is a multi-megabyte screenshot.
 *
 * Reads `cachedVaultPath` rather than calling `loadSettings()` here: a note with
 * several inline images re-issues this request on every one of them, and again on
 * every `setDoc`, so a synchronous JSON read on every single one added up. `adoptVault`
 * is the only place the vault path actually changes and keeps the cache in step, so
 * this is never more than one event loop turn behind it. `resolveAttachment` is the
 * security boundary here regardless — a request for a name that does not resolve to a
 * real file inside the vault gets a 404, never a peek outside it.
 */
function registerAttachmentProtocol(): void {
  protocol.handle("emqnote-attachment", (request) => {
    const vault = cachedVaultPath;
    if (vault === null) return new Response(null, { status: 404 });

    const name = attachmentNameFromUrl(request.url, "emqnote-attachment");
    const resolved = resolveAttachment(vault, name);
    if (resolved === null) return new Response(null, { status: 404 });

    return net.fetch(pathToFileURL(resolved).toString());
  });
}

/**
 * `<userData>/remote-images` — a derived cache outside the vault, beside `thumbnails` (B9).
 *
 * Named here rather than in `remote-images.ts` so that module never imports Electron and
 * every refusal it makes can be exercised by a test, the discipline `vault-io.ts` and
 * `remote-image.ts` already follow.
 */
function remoteImageCacheDir(): string {
  return join(app.getPath("userData"), "remote-images");
}

/**
 * Serves a picture a note names by its web address, as `emqnote-remote://vault/<url>` (B50).
 *
 * The URL travels in the *path*, `encodeURIComponent`d, for the reason `attachment-url.ts`
 * measured for B38: a `standard:` scheme's host is lowercased by Chromium and cannot hold a
 * `%2F` at all, so a `https://Example.com/A/B.png` could not even be expressed as one.
 *
 * Two refusals share the 404, and that is on purpose — a chip is what the note draws for
 * either. **The setting is one of them**: `loadRemoteImages` is enforced here, in main, and
 * not by the renderer deciding whether to ask. Everything the renderer might be talked into
 * is decided again on this side, which is the same rule `remote-image.ts` opens with.
 */
function registerRemoteImageProtocol(): void {
  protocol.handle("emqnote-remote", async (request) => {
    if (!loadSettings().loadRemoteImages) return new Response(null, { status: 404 });

    const url = attachmentNameFromUrl(request.url, "emqnote-remote");
    const file = await serveRemoteImage(remoteImageCacheDir(), url);
    if (file === null) return new Response(null, { status: 404 });

    // **`no-store`, and it is what makes the setting mean anything.** Without it Chromium
    // caches the response per URL in the renderer, so reopening a note it had already
    // drawn painted the picture again without this handler being called at all — the
    // switch turned off and the pictures stayed, which is the one way a privacy setting
    // must not fail. Measured in the running app; nothing under `test/` could have seen
    // it. It costs a read of a local file per draw, which is what the attachment scheme
    // beside it has always cost.
    const response = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  });
}

/**
 * Serves a first-page PDF thumbnail as `emqnote-thumb://vault/<name>` (B30, rendered
 * in-house since B36). Reuses `resolveAttachment` verbatim for the traversal guard — this
 * is the same file the attachment scheme would serve, just a different rendering of it —
 * and adds `isPreviewable` on top, since a plain `[[Some Note]]` link or a
 * `.txt` attachment must 404 without ever reaching `ensureThumbnail` at all.
 *
 * Two failure shapes reach here, and they must not look the same: **404** for "nothing
 * to preview" — the file does not resolve, is not a PDF, or genuinely could not be read
 * — and **422** for "resolved, and it is a PDF, but pdf.js could not draw a page from
 * it" (corrupt, password-protected, ...). Before B36 every failure 404'd and a broken
 * PDF looked exactly like a plain attachment with no preview at all; `attachment-view.ts`'s
 * `wikiLinkNodeView` reads the 422 back out via `fetch()` (an `<img>`'s own `onerror`
 * cannot see a status code) and marks the chip instead of silently reverting it.
 */
function registerThumbnailProtocol(): void {
  protocol.handle("emqnote-thumb", async (request) => {
    const vault = cachedVaultPath;
    if (vault === null) return new Response(null, { status: 404 });

    const name = attachmentNameFromUrl(request.url, "emqnote-thumb");
    const resolved = resolveAttachment(vault, name);
    if (resolved === null || !isPreviewable(name)) return new Response(null, { status: 404 });

    // `?size=page` is B43's inline embed asking for the same page at the size a note
    // column wants, and `&page=` is which one — the embed turns pages in place now.
    // Everything above this line — the traversal guard, the previewable gate — is the
    // same question whatever is asked for, which is why it is one handler and one scheme.
    // A page past the end of the document is not checked here: only pdf.js knows where
    // the end is, so it comes back as a 422 like any other render it could not do.
    const outcome = await ensureThumbnail(
      thumbnailCacheDir(),
      resolved,
      thumbSizeFromUrl(request.url),
      thumbPageFromUrl(request.url),
    );
    if (outcome.kind === "unavailable") return new Response(null, { status: 404 });
    if (outcome.kind === "failed") return new Response(outcome.error, { status: 422 });

    return net.fetch(pathToFileURL(outcome.file).toString());
  });
}

/** Optional `--open-note=<part of a title>` so a screenshot can show a real note. */
function flagNote(): string | undefined {
  const match = process.argv.find((argument) => argument.startsWith("--open-note="));
  return match?.slice("--open-note=".length);
}

/** Optional `--click-button=<label>` so a dialog can be photographed open. */
function flagButton(): string | undefined {
  const match = process.argv.find((argument) => argument.startsWith("--click-button="));
  return match?.slice("--click-button=".length);
}

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * At most once a day, well clear of the hotkey → caret budget: this runs after
 * `prepareVault()`, not in the startup path a latency measurement cares about.
 */
function maybeCheckForUpdatesOnStartup(): void {
  const { updateLastCheckedAt } = loadSettings();
  const stale =
    updateLastCheckedAt === null ||
    Date.now() - updateLastCheckedAt > UPDATE_CHECK_INTERVAL_MS;
  if (!stale) return;

  saveSettings({ updateLastCheckedAt: Date.now() });
  void checkForUpdates("startup");
}

/**
 * Both global accelerators, registered together (B60).
 *
 * One function rather than one per hotkey, because `globalShortcut` has no way to give up
 * a single claim without knowing what it was: `unregisterAll()` is what every path used,
 * and with a second hotkey in existence that silently takes the other one down. Everything
 * that changes a chord — startup, `IPC.setHotkey`, `IPC.setLibraryHotkey` — comes through
 * here, so the app's claim on the machine is stated in exactly one place.
 *
 * Returns which of the two the OS refused, so a caller changing one chord can put the old
 * one back rather than leaving the app with no shortcut at all.
 */
function registerGlobalHotkeys(): { hotkey: boolean; libraryHotkey: boolean } {
  const { hotkey, libraryHotkey } = loadSettings();

  globalShortcut.unregisterAll();
  return {
    hotkey: globalShortcut.register(hotkey, () => showCaptureWindow()),
    libraryHotkey: globalShortcut.register(libraryHotkey, () => showLibraryWindow()),
  };
}

function registerHotkeysAndWarn(): void {
  const registered = registerGlobalHotkeys();
  const { hotkey, libraryHotkey } = loadSettings();

  // Named individually: "a shortcut is taken" without saying which one leaves the reader
  // to work out for themselves which of the two things stopped working.
  const taken = [
    ...(registered.hotkey ? [] : [`${hotkey} (new note)`]),
    ...(registered.libraryHotkey ? [] : [`${libraryHotkey} (browse notes)`]),
  ];
  if (taken.length === 0) return;

  dialog.showMessageBox({
    type: "warning",
    title: "Shortcut unavailable",
    message: `Already taken by another program: ${taken.join(", ")}.`,
    detail:
      "emqnote is running, and everything is still reachable from the tray icon. " +
      "Pick a different shortcut in the settings.",
  });
}

async function prepareVault(): Promise<void> {
  // A measurement run must never sit on a dialog waiting for a human, and since the
  // vault is no longer guessed into `settings.json` (see `settings.ts`) it now genuinely
  // can be null here on a machine that has one OneDrive and has never been set up. The
  // documented invocation always carries `--vault=`, which fills the path in before this
  // and so never reaches the question — but a `--selftest` without one used to inherit
  // the guess and now would block forever on an unattended machine, which is a CI job
  // that hangs rather than fails. Nothing to prepare without a vault: exiting the way
  // the cancel path already does leaves `main()` to carry on and the self-test to report
  // its own failure.
  if (loadSettings().vaultPath === null && launch.selfTestRounds > 0) return;

  if (loadSettings().vaultPath === null) {
    const chosen = await askForVault();
    if (chosen === null) return;
    adoptVault(chosen);
    buildTrayMenu();
  }

  const vault = loadSettings().vaultPath;
  if (vault === null) return;

  ensureVaultLayout(vault);
  await warnAboutFilesOnDemand(vault);
}

/**
 * Records a deliberately chosen vault.
 *
 * Only from an explicit choice — first run, or the chooser in settings. Never from
 * `loadSettings`, which applies `launch.vaultOverride` *after* the merge, so a
 * `--vault=` run or a self-test would otherwise drop its temporary folder into the
 * remembered list and offer it back as somewhere to keep notes.
 */
function adoptVault(path: string): void {
  saveSettings({ vaultPath: path });
  cachedVaultPath = path;
  rememberVault(path);
}

/**
 * Asks where the vault goes.
 *
 * With more than one business OneDrive — two employers, two tenants — there is no good
 * guess, because putting the vault on the wrong tenant means work content in the wrong
 * place. Better to ask once.
 *
 * With exactly one there *is* a good guess, and for a long time the app acted on it
 * silently: `defaults()` seeded `settings.vaultPath` with `defaultVaultPath()`, so
 * `prepareVault` never saw the `null` that makes it ask, and a fresh install on the
 * common one-tenant machine created and populated a folder nobody had been shown. The
 * guess is still the guess — it is what this dialog puts in front of you and what
 * `defaultPath` opens the picker on — but it is now something to accept rather than
 * something that happened. One click either way, and the difference is knowing.
 *
 * The one place that knows this wording, for all three of the people who reach it: a
 * first run with one OneDrive, a first run with several, and "Choose another folder…"
 * in settings. Two dialogs asking the same question in different words would be two
 * chances to describe the tenant choice badly.
 */
async function askForVault(): Promise<string | null> {
  const candidates = findOneDriveCandidates();

  if (candidates.length === 1) {
    const suggestion = defaultVaultPath();

    // The full path, not a tenant label: this is the one dialog where the answer is a
    // folder that does not exist yet, and "we will create <path>" is only reassuring if
    // you can read where. `cancelId` is the second button rather than a dismissal — there
    // is no third outcome here, and closing the box lands on "choose another folder",
    // which asks again rather than deciding for you.
    if (suggestion !== null) {
      const answer = await dialog.showMessageBox({
        type: "question",
        title: "Where should your vault go?",
        message: "Keep your notes here?",
        detail:
          `emqnote will keep your notes in:\n\n${suggestion}\n\n` +
          "That is the business OneDrive on this machine, so the notes sync to your " +
          "other machines. The folder is created if it is not there yet.",
        buttons: ["Use this folder", "Choose another folder…"],
        cancelId: 1,
        defaultId: 0,
      });

      if (answer.response === 0) return suggestion;
    }
  }

  if (candidates.length > 1) {
    const labels = candidates.map(tenantLabel);
    const answer = await dialog.showMessageBox({
      type: "question",
      title: "Which OneDrive should hold your vault?",
      message: "There is more than one business OneDrive on this machine.",
      detail:
        "Pick the tenant your work notes belong to. The vault goes into a " +
        `'${VAULT_FOLDER_NAME}' folder inside it.`,
      buttons: [...labels, "Choose another folder…"],
      cancelId: labels.length,
      defaultId: 0,
    });

    const picked = candidates[answer.response];
    if (picked !== undefined) return join(picked, VAULT_FOLDER_NAME);
  }

  const choice = await dialog.showOpenDialog({
    title: "Where should your vault go?",
    message: "Pick the folder your notes should live in.",
    defaultPath: candidates[0],
    properties: ["openDirectory", "createDirectory"],
  });

  return choice.canceled ? null : (choice.filePaths[0] ?? null);
}

/**
 * OneDrive's Files On-Demand leaves files behind as empty placeholders. Checking up
 * front is cheaper than a search function that is quietly wrong — but it stays a best
 * guess, so `unknown` is a valid outcome and holds nothing up.
 */
async function warnAboutFilesOnDemand(vault: string): Promise<void> {
  const warned = loadSettings().filesOnDemandWarned;
  if (warned.includes(vault)) return;

  const state = await checkFilesOnDemand(vault);
  if (state !== "ondemand") return;

  await dialog.showMessageBox({
    type: "warning",
    title: "Make the vault always available",
    message: "Your vault is set to Files On-Demand.",
    detail: FILES_ON_DEMAND_INSTRUCTION,
  });

  saveSettings({ filesOnDemandWarned: [...warned, vault] });
}

function registerIpc(): void {
  ipcMain.on(IPC.capturePainted, (_event, token: number) => {
    const elapsed = completeMeasurement(token);
    notifyPainted();
    if (elapsed === null) return;

    lastLatency = elapsed;
    sendStatus({ lastLatencyMs: elapsed, savedAs: lastSavedAs, saveError: lastSaveError });
    buildTrayMenu();

    if (elapsed > LATENCY_BUDGET_MS) {
      console.warn(
        `[latency] ${elapsed.toFixed(1)} ms — over the ${LATENCY_BUDGET_MS} ms budget`,
      );
    }
  });

  ipcMain.on(IPC.captureChange, (_event, payload: CapturePayload) => {
    writer.update(payload);
  });

  ipcMain.on(IPC.captureClose, () => {
    hideCaptureWindow();
  });

  /**
   * Throws the note being composed away (B68). Every other way out of this window —
   * the X, Ctrl+Enter, Escape, blurring it, quitting — commits, so a note started by
   * mistake was a note that existed and had to be hunted down in the library afterwards.
   *
   * The ordering is the whole of it. `writer.discard()` ends the session *before* it
   * answers, so the file it names is nobody's any more: the following
   * `hideCaptureWindow()` runs `writer.finish()` on a fresh, empty session, and
   * `writeSession` answers `NOTHING` for a `null` payload rather than putting the note
   * back where it was just taken from.
   *
   * It goes to `_trash`, not out of existence. That is what makes it safe to offer with
   * no confirmation in front of it — B54's own argument, which is also why dragging a
   * note onto the trash asks nothing: the named way back is what a dialog would
   * otherwise have to stand in for. `_trash` is also on the watcher's ignore list and
   * `writer.activePath()` is `null` by now, so nothing needs telling that the file moved
   * — `notifyFileEvent` has no window left to tell.
   */
  ipcMain.on(IPC.captureDiscard, () => {
    void (async () => {
      const discarded = await writer.discard();
      const vault = loadSettings().vaultPath;
      if (discarded !== null && vault !== null) {
        try {
          trashNote(vault, discarded);
        } catch (error) {
          // A draft that will not move is not worth a dialog over a window that is on
          // its way out — but it must not be silent either, or the note reappears in the
          // library with nothing having said why.
          console.error(`Could not discard ${discarded}:`, error);
        }
      }
      lastSavedAs = null;
      hideCaptureWindow();
      notifyLibrary();
    })();
  });

  // Reuses the exact hand-over path a fresh `captureLoad` uses: `openNote` reads the
  // current bytes, `writer.load` resets the session's `lastContent` baseline against
  // them (without that, the very next debounced write would compare against the *old*
  // baseline and rewrite what was just reread), and `captureLoadNote` puts it in front
  // of the renderer. Only ever sent by the renderer when it believes it has nothing of
  // its own to lose — see `Capture.tsx`'s `dirtyRef`.
  ipcMain.handle(IPC.captureReload, async () => {
    const vault = loadSettings().vaultPath;
    if (vault === null) return false;
    const path = writer.activePath();
    if (path === null) return false;

    const note = openNote(vault, path);
    if (note === null) return false;

    await writer.load(note);
    getCaptureWindow()?.webContents.send(IPC.captureLoadNote, note);
    return true;
  });

  registerLibraryIpc();
  registerAppIpc();
}

/**
 * Tells both windows that a setting they *draw with* has changed, so they re-read the
 * bootstrap.
 *
 * Its own message rather than `libraryRefresh`. That one means "ask the vault again" and
 * every save raises it; the library answers it by reloading the tree, the notes, the
 * facets and the conflicts, none of which is where a language or a font size lives, and
 * the capture window answered it not at all. `setLocale` had been sending it to both
 * windows for exactly this purpose since B60, and neither window ever acted on it — which
 * is why changing the language only took effect in the library, and only because the
 * Settings panel refreshes itself on the way out.
 *
 * `useBootstrap` is the single subscriber, so this reaches every window that draws from
 * settings without either of them wiring it up separately.
 */
function notifySettingsChanged(): void {
  for (const target of [getCaptureWindow(), getLibraryWindow()]) {
    if (target !== null && !target.isDestroyed()) {
      target.webContents.send(IPC.settingsChanged);
    }
  }
}

/**
 * B90's theme, applied to every window at once.
 *
 * `nativeTheme.themeSource` and not a class on the documents: `prefers-color-scheme` is
 * what all three stylesheets already ask — `styles.css`, `library.css` and
 * `pdfview.css` — and it is also what the parts nobody writes CSS for obey, the scrollbars
 * and the popup a `<select>` opens (see the `color-scheme` line at the top of
 * `styles.css`). Setting it re-answers that question live in every open renderer, so the
 * panel needs no reload and no window has to be told.
 *
 * Validated rather than trusted, like `setEditorFontSize`: this is a string in a file a
 * person can edit, and Electron throws on a value that is not one of the three.
 */
function applyTheme(theme: Theme): Theme {
  const valid: Theme[] = ["system", "light", "dark"];
  const chosen = valid.includes(theme) ? theme : "system";
  nativeTheme.themeSource = chosen;

  // The one part of the chrome that `prefers-color-scheme` cannot reach: on Windows 11
  // both windows are frameless with `titleBarOverlay`, and the caption buttons Chromium
  // draws into the header band are painted from colours handed over at construction. A
  // light theme with dark caption buttons in the corner of the band is exactly the kind
  // of half-switched window B90 exists to prevent, so they are pushed again here.
  //
  // `setTitleBarOverlay` throws on a window that has no overlay, which is every window on
  // macOS and Linux — hence the platform guard rather than a try. Windows only.
  if (process.platform === "win32") {
    const colours = titleBarColours();
    for (const target of [getCaptureWindow(), getLibraryWindow()]) {
      if (target === null || target === undefined || target.isDestroyed()) continue;
      target.setTitleBarOverlay({ ...colours, height: 40 });
    }
  }

  return chosen;
}

/** What a window needs before it can draw: language, platform and the shortcut. */
function registerAppIpc(): void {
  ipcMain.handle(IPC.bootstrap, () => {
    const settings = loadSettings();
    return {
      locale: settings.locale,
      platform: process.platform,
      hotkey: settings.hotkey,
      libraryHotkey: settings.libraryHotkey,
      vaultPath: settings.vaultPath,
      libraryPaneWidths: settings.libraryPaneWidths,
      librarySort: settings.librarySort,
      librarySortDirection: settings.librarySortDirection,
      loadRemoteImages: settings.loadRemoteImages,
      keepPinnedInView: settings.keepPinnedInView,
      editorFontSize: settings.editorFontSize,
      theme: settings.theme,
    };
  });

  // B50. Nothing to invalidate and nothing to reload: the next request over
  // `emqnote-remote://` reads the setting again, and a note already on screen keeps what
  // it drew until it is opened afresh — which is honest, and cheaper than reaching into
  // two windows to redraw every picture in them.
  ipcMain.handle(IPC.setLoadRemoteImages, (_event, load: boolean) => {
    saveSettings({ loadRemoteImages: load });
  });

  // B76. Saved and nothing else: the library redraws from its own bootstrap the moment
  // the panel refreshes it, and no window but that list has anything to reconsider.
  ipcMain.handle(IPC.setKeepPinnedInView, (_event, keep: boolean) => {
    saveSettings({ keepPinnedInView: keep });
  });

  /**
   * B88. Told to both windows, which the two switches above are not: the panel that sets
   * this lives in the library and the window that most needs it is the other one, so a
   * save alone would leave the capture window drawing the old size until the next login.
   *
   * Clamped in main rather than trusted from the renderer: the setting is a number in a
   * file a person can edit, and `--editor-font-size: 0px` is a window with no note in it
   * and no way to get the panel back to fix it.
   */
  ipcMain.handle(IPC.setEditorFontSize, (_event, px: number) => {
    const size = Math.round(Math.min(32, Math.max(10, Number.isFinite(px) ? px : 16)));
    saveSettings({ editorFontSize: size });
    notifySettingsChanged();
  });

  /**
   * B90. Saved and applied; nothing is broadcast, and that is not an omission — Chromium
   * re-evaluates `prefers-color-scheme` in every open renderer the moment `themeSource`
   * changes, so both windows have already redrawn by the time this resolves. The panel
   * calls `onChanged` on its own account, which is what keeps its own `<select>` honest.
   */
  ipcMain.handle(IPC.setTheme, (_event, theme: Theme) => {
    saveSettings({ theme: applyTheme(theme) });
  });

  /**
   * The same check the tray's "Check for updates…" runs, from the Settings panel — which
   * is where anyone looks for it, and on Windows the tray icon can be folded away into the
   * overflow chevron where nobody would find it at all.
   *
   * `"manual"` because it is: the trigger decides how quiet a "nothing to report" stays,
   * and a check somebody pressed a button for owes an answer either way (`updater.ts`).
   *
   * `void`, not awaited, and the handler resolves at once. `checkForUpdates` on Windows
   * only settles when the user has answered a dialog — possibly after a download — and
   * this promise's other end is a button in a renderer that has nothing to do with the
   * answer. It catches everything itself, so nothing is dropped by letting it run on.
   */
  ipcMain.handle(IPC.checkForUpdates, () => {
    void checkForUpdates("manual");
  });

  ipcMain.handle(IPC.setLocale, (_event, locale: Locale) => {
    saveSettings({ locale });
    buildTrayMenu();
    notifySettingsChanged();
  });

  /**
   * Both of these save first and register afterwards, then roll the setting back if the
   * OS refused — the reverse of the order the single-hotkey version used, and it has to
   * be: `registerGlobalHotkeys` reads the settings file, because it is the one place that
   * knows both chords. Rolling back re-registers from the restored settings, so a refused
   * chord leaves the machine exactly as it was.
   */
  ipcMain.handle(IPC.setHotkey, (_event, hotkey: string) => {
    const previous = loadSettings().hotkey;
    saveSettings({ hotkey });

    if (!registerGlobalHotkeys().hotkey) {
      saveSettings({ hotkey: previous });
      registerGlobalHotkeys();
      return false;
    }

    buildTrayMenu();
    return true;
  });

  ipcMain.handle(IPC.setLibraryHotkey, (_event, libraryHotkey: string) => {
    const previous = loadSettings().libraryHotkey;
    saveSettings({ libraryHotkey });

    if (!registerGlobalHotkeys().libraryHotkey) {
      saveSettings({ libraryHotkey: previous });
      registerGlobalHotkeys();
      return false;
    }

    buildTrayMenu();
    return true;
  });

  ipcMain.handle(
    IPC.saveAttachment,
    async (_event, bytes: ArrayBuffer, originalName: string) => {
      const vault = loadSettings().vaultPath;
      if (vault === null) return null;
      return saveAttachment(vault, new Uint8Array(bytes), originalName);
    },
  );

  // A picture that came in with a pasted web page. The renderer hands over a URL it
  // read off the pasted HTML — attacker input, in the ordinary case — so nothing about
  // it is trusted here: `fetch-attachment.ts` and `remote-image.ts` decide what may be
  // requested, what a redirect may point at and what may be written.
  //
  // A measurement run makes no network calls, for the same reason it starts no watcher
  // and checks for no updates: unaccounted-for background work is exactly what the
  // hotkey→caret figures cannot afford to pick up.
  ipcMain.handle(IPC.fetchRemoteImage, async (_event, url: string) => {
    if (launch.selfTestRounds > 0) return null;
    const vault = loadSettings().vaultPath;
    if (vault === null) return null;
    return fetchRemoteImage(vault, url);
  });

  // The picker reads the chosen file itself rather than round-tripping its bytes
  // through the renderer first — unlike a paste or a drop, which start out as bytes
  // already in the browser's hands and have no file on disk to read from directly.
  ipcMain.handle(IPC.pickAttachment, async (event, filter?: "image" | "any") => {
    const vault = loadSettings().vaultPath;
    if (vault === null) return null;

    // Without a parent, the OS is free to render this non-modally, and it can end up
    // behind the library window with the renderer sitting in `await pickAttachment()`
    // looking exactly like a hang — there is simply nothing on screen saying otherwise.
    const parent = BrowserWindow.fromWebContents(event.sender);
    // "image" is the note panel's right-click "Insert image" — everything else,
    // including no argument at all, keeps the toolbar button's combined filter.
    const dialogOptions: OpenDialogOptions = {
      title: "Insert an attachment",
      properties: ["openFile"],
      filters:
        filter === "image"
          ? [
              {
                name: "Images",
                extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"],
              },
            ]
          : [
              {
                name: "Images and PDFs",
                extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "pdf"],
              },
            ],
    };
    const choice =
      parent === null
        ? await dialog.showOpenDialog(dialogOptions)
        : await dialog.showOpenDialog(parent, dialogOptions);
    if (choice.canceled || choice.filePaths[0] === undefined) return null;

    const path = choice.filePaths[0];
    // `copyAttachment` streams the file straight to its destination rather than
    // reading it into a `Buffer` here first — the difference that matters for a
    // multi-megabyte PDF, which would otherwise block every IPC channel in both
    // windows for as long as the read (and then the write) took.
    return copyAttachment(vault, path, basename(path));
  });

  /**
   * One note, described the way both link dialogs want it: the ambiguity picker (B35),
   * which needs the folder to tell two same-named notes apart, and the insertion picker
   * (B41), which needs `target` — how a link to it is spelled.
   *
   * Shared because the two used to be one shape short of each other, and a picker whose
   * rows disagree with the picker beside it about what a note *is* would be the same
   * split `titleOf` in `vault-io.ts` had to close between the list and the reader.
   */
  const linkCandidateOf = (path: string, title: string): LinkCandidateSummary => {
    const slash = path.lastIndexOf("/");
    return {
      path,
      title,
      folder: slash === -1 ? "" : path.slice(0, slash),
      target: linkTargetFor(path),
    };
  };

  /**
   * A click on a `[[…]]` chip, from either window (B35).
   *
   * The node cannot tell an attachment from a note — §6.4 spells both the same way — so
   * the order here is the answer: a target that resolves inside `_attachments/` is a
   * file, and only what is left over is asked about as a note. That order is deliberate
   * rather than incidental. An attachment is named by exactly one thing, its filename, so
   * a hit there is certain; a note is matched by three progressively looser rules, so
   * asking first would let a note titled like a file steal a click on the file.
   *
   * A note always surfaces in the *library* window, whichever window the click came from:
   * capture has no reader and no dialog for an ambiguous target, and the whole reason its
   * bundle is separate is that it must not grow one.
   */
  ipcMain.handle(IPC.openWikiLink, async (event, target: string): Promise<WikiLinkOutcome> => {
    const vault = loadSettings().vaultPath;
    if (vault === null) return "none";

    const attachment = resolveAttachment(vault, target);
    if (attachment !== null) {
      // A PDF opens in this app's own viewer (B40) — one click, straight to the pages,
      // rather than handing the file to Preview or Acrobat and losing the reader out of
      // the app. Everything else this app cannot draw still goes to the OS, which is
      // exactly what `attachmentRoute` says and the only thing it says.
      if (attachmentRoute(target) === "viewer") openPdfViewer(vault, target);
      else void shell.openPath(attachment);
      return "attachment";
    }

    if (indexDb === null) return "none";
    const resolved = await resolveNoteLink(vault, indexDb, target);
    if (resolved.kind === "none") return "none";

    const paths = resolved.kind === "unique" ? [resolved.path] : resolved.paths;
    showLibraryWindow();
    const library = getLibraryWindow();
    if (library !== null && !library.isDestroyed()) {
      const summaries = paths.map((path) =>
        linkCandidateOf(path, getNoteMeta(indexDb!, path)?.title ?? path),
      );
      // Where the click came from, so the note that opens can offer a way back to it.
      // Main can only answer this for the capture window, whose one open path genuinely
      // is main's own state; for a click in the library's own reader it sends `null`,
      // which that window reads as "the note I currently have open". Building a main-side
      // view of what the reader shows is exactly the second source of truth the
      // disk-change path already refuses to keep.
      const originPath =
        event.sender === getCaptureWindow()?.webContents ? writer.activePath() : null;
      const origin =
        originPath === null
          ? null
          : { path: originPath, title: getNoteMeta(indexDb!, originPath)?.title ?? originPath };

      // A window that has only just been created by `showLibraryWindow` is still loading,
      // so the event would arrive before anything is listening for it. Waiting for the
      // renderer's own `did-finish-load` is what makes a link clicked from the capture
      // window work on the first click rather than only once the library is already up.
      const send = (): void =>
        library.webContents.send(IPC.libraryOpenLink, { target, candidates: summaries, origin });
      if (library.webContents.isLoading()) library.webContents.once("did-finish-load", send);
      else send();
    }

    return resolved.kind === "unique" ? "note" : "ambiguous";
  });

  /**
   * The ⧉ on an embedded PDF's bar: this file, in the OS's own viewer.
   *
   * Deliberately *not* `openWikiLink` with a flag — that one asks `attachmentRoute`, whose
   * whole job is to send a `.pdf` to B40's window, and the point of this channel is to go
   * round it. The two ways to read a PDF stay both reachable: a plain `[[file.pdf]]` chip
   * and the file list's Open button still raise B40's window, while the ⧉ *inside a note*
   * is now the way out to Preview or Acrobat for printing and annotating.
   *
   * It takes a target where `pdf-window.ts`'s `openExternally` takes none. That one is sent
   * by the viewer window, which is showing untrusted PDF content and shows one document at
   * a time, so main remembers the name itself rather than letting the page choose a path.
   * Here the sender is a note that may hold a dozen embeds and main knows nothing about
   * which was clicked — so the target arrives with the click, the same as `openWikiLink`,
   * and is made safe the same way: `resolveAttachment` is what decides, and it refuses
   * anything landing outside the vault after `realpathSync` (B28).
   */
  ipcMain.handle(IPC.openInSystemViewer, (_event, target: string): void => {
    if (typeof target !== "string" || target === "") return;

    const vault = loadSettings().vaultPath;
    if (vault === null) return;

    const resolved = resolveAttachment(vault, target);
    if (resolved !== null) void shell.openPath(resolved);
  });

  /**
   * "Copy link" on a file row (B47), and anything else that needs the clipboard from a
   * renderer. `clipboard.writeText` rather than `navigator.clipboard`, which needs a
   * secure context a sandboxed `file://` page does not have — its failure is a rejected
   * promise nobody sees, which is the worst possible shape for a copy.
   */
  ipcMain.handle(IPC.copyText, (_event, text: string): void => {
    if (typeof text !== "string") return;
    clipboard.writeText(text);
  });

  /**
   * Mod+click on a `#tag` in a note body (B52).
   *
   * The same shape as `openWikiLink` above and deliberately so: the click can be made in
   * either window, and the library is the only window with a note list to filter — so
   * both go through main rather than the library shortcutting its own clicks, which is
   * how one gesture ends up with two behaviours.
   *
   * Nothing is resolved here. A tag is a name; `notesMatching` folds case where the list
   * is actually built, and asking the index about it first would only be a second place
   * for that rule to live. A vault that is not open still raises the window, which then
   * shows what it always shows without one.
   *
   * The `isLoading` deferral is not optional: the first Mod+click from the capture window
   * is very often the call that *creates* the library window, and an event sent before
   * `did-finish-load` arrives at nothing listening.
   */
  ipcMain.handle(IPC.openTag, (_event, name: string): void => {
    if (typeof name !== "string" || name === "") return;

    showLibraryWindow();
    const library = getLibraryWindow();
    if (library === null || library.isDestroyed()) return;

    const send = (): void => library.webContents.send(IPC.libraryOpenTag, { name });
    if (library.webContents.isLoading()) library.webContents.once("did-finish-load", send);
    else send();
  });

  // Which `[[…]]` targets name no file — what marks a chip or an embed as pointing at a
  // missing attachment. The same `resolveAttachment` the click and both protocol handlers
  // use, so the marker can never disagree with what happens when the chip is clicked.
  //
  // A vault that is not open yet answers "nothing is missing" rather than "all of them":
  // the marker is a statement about the vault, and an unanswerable question must not
  // produce one. Not `async`, and deliberately so — this is `statSync` per target on a
  // handful of targets, and the 80 ms hotkey budget is nowhere near it.
  ipcMain.handle(IPC.checkAttachments, (_event, targets: string[]): string[] => {
    const vault = loadSettings().vaultPath;
    if (vault === null) return [];

    return targets.filter((target) => resolveAttachment(vault, target) === null);
  });

  /**
   * How many pages an embedded PDF has — what lets the inline page (B43) say "Page 2 of 7"
   * and stop offering a next page at the end.
   *
   * Over IPC rather than as a header on the `emqnote-thumb` response, which is where it is
   * otherwise free. Two custom-scheme CORS traps have already shipped in this app (B36 on
   * `emqnote-thumb`, B40 on `emqnote-attachment`), both invisible to every test and fatal
   * in the real window, and a *custom response header* is the next rung of that same ladder
   * — readable only with `Access-Control-Expose-Headers` set exactly right on a scheme
   * whose canonicalisation had to be measured to be believed. This channel is the same
   * question asked the way every other question in this app is asked, and it costs one
   * round trip per embed, next to the `checkAttachments` one above it that every embed
   * already makes.
   *
   * `null` means unanswerable — no vault, not a previewable name, the file is gone, or
   * pdf.js could not open it. The embed's own page fetch is what says *which*, since it is
   * the half that can tell a 404 from a 422; this one only ever offers or withholds the
   * page controls.
   */
  ipcMain.handle(IPC.pdfPageCount, async (_event, target: string): Promise<number | null> => {
    const vault = loadSettings().vaultPath;
    if (vault === null || !isPreviewable(target)) return null;

    const resolved = resolveAttachment(vault, target);
    if (resolved === null) return null;

    return pdfPageCount(thumbnailCacheDir(), resolved);
  });

  /**
   * The notes the picker offers when writing a `[[…]]` link (B41).
   *
   * Deliberately the *same* `searchNotes` the library's search bar runs, not a second
   * listing: a vault has one idea of which notes exist and one filter language, and the
   * picker inheriting `tag:` and `after:` for free is a consequence of that rather than a
   * feature anyone had to build. `excludePath` keeps a brand-new, still-uncommitted note
   * out of its own link picker.
   *
   * `linkTargetFor` is the reason this exists at all rather than the renderer mapping
   * `library.search` itself — it is main-side (B37 decides what a note extension is), and
   * a second copy of that rule in the renderer is one that drifts.
   */
  ipcMain.handle(IPC.linkCandidates, async (_event, query: string): Promise<LinkCandidateSummary[]> => {
    // `loadSettings()` rather than the library group's own `vaultPath()` helper: this
    // handler is registered with the app-level ones, beside `openWikiLink`, because the
    // capture window calls it too.
    const vault = loadSettings().vaultPath;
    if (vault === null || indexDb === null) return [];

    const notes = await searchNotes(vault, indexDb, parseSearchQuery(query), {
      excludePath: writer.uncommittedNewPath() ?? undefined,
    });

    // Enough to scroll through, the same ceiling `MoveDialog` puts on folders and for the
    // same reason: the picker is for finding a note, and a list nobody can read is not
    // finding it. Anything past this is what the filter box is for.
    return notes.slice(0, 50).map((note) => linkCandidateOf(note.path, note.title));
  });

  // Mod+click on a weblink in the editor (B33). The renderer only reports where the
  // click landed and what href the mark carries — attacker-writable, in the ordinary
  // case, since the note could have been written or pasted from anywhere — so the
  // scheme decision is made again here, exactly as `remote-image.ts` documents for its
  // own allowlist, and never trusted from the report. A refusal logs and does nothing:
  // there is no file to have half-written, so there is nothing to undo.
  ipcMain.handle(IPC.openExternal, (_event, href: string) => {
    if (!isOpenableUrl(href)) {
      console.warn(`Refusing to open external link with a disallowed scheme: ${href}`);
      return;
    }
    void shell.openExternal(href);
  });

  // Fire-and-forget: the drag itself is already reflected on screen, this only has to
  // survive a restart. Debounced on the renderer side to a drag's end, not every move.
  ipcMain.on(IPC.setPaneWidths, (_event, widths: { tree: number; notes: number }) => {
    saveSettings({ libraryPaneWidths: widths });
  });

  // Same fire-and-forget shape as `setPaneWidths` just above: the note list already
  // shows the new order the moment it is clicked, this only has to survive a relaunch.
  ipcMain.on(IPC.setSort, (_event, sort: SortKey, direction: SortDirection) => {
    saveSettings({ librarySort: sort, librarySortDirection: direction });
  });

  /**
   * Moving a window by something that is also a control (B94) — see `IPC.windowDrag` for
   * why this cannot be `-webkit-app-region: drag`.
   *
   * The offset is taken once, on `"start"`, and every `"move"` restores it. Following the
   * pointer's *delta* instead would accumulate every rounding error and every dropped
   * message into a window that slides away from the grip; asking "where should the window
   * be for the pointer to be where it is" cannot drift, because it is not a sum.
   *
   * One drag at a time, and it is checked against the sender: the two windows can both be
   * open, and a stale `"move"` from the other one would move the wrong window. It is not
   * cleared on mouse-up — there is no such message — so what makes it safe is that every
   * `"move"` re-derives from the recorded pair, and a renderer that is not dragging sends
   * nothing.
   */
  let windowDrag: {
    contents: WebContents;
    window: BrowserWindow;
    windowX: number;
    windowY: number;
    pointerX: number;
    pointerY: number;
  } | null = null;

  ipcMain.on(IPC.windowDrag, (event, phase: "start" | "move", x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    if (phase === "start") {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window === null) return;
      // `getPosition` is typed as a bare `number[]`, so both halves read as possibly
      // undefined; a window always has a position, and `?? 0` is the shape the rest of
      // this file uses for that same lie in Electron's types.
      const [windowX = 0, windowY = 0] = window.getPosition();
      windowDrag = {
        contents: event.sender,
        window,
        windowX,
        windowY,
        pointerX: x,
        pointerY: y,
      };
      return;
    }

    const drag = windowDrag;
    if (drag === null || drag.contents !== event.sender || drag.window.isDestroyed()) return;
    // A maximised window cannot be moved, and trying reads as the drag doing nothing;
    // restoring it under the pointer is what every title bar does.
    if (drag.window.isMaximized()) drag.window.unmaximize();
    drag.window.setPosition(
      Math.round(drag.windowX + (x - drag.pointerX)),
      Math.round(drag.windowY + (y - drag.pointerY)),
    );
  });
}

/**
 * Everything the library window asks for.
 *
 * Each handler resolves the vault fresh rather than capturing it, so a vault that only
 * became known after startup — first run, where it is chosen while the app is already
 * up — is picked up without special handling. `withVault` also means a missing vault
 * answers with something empty instead of throwing across the IPC boundary.
 *
 * That per-call resolution is *not* a promise that the vault can be changed while the
 * app runs. It cannot: `CaptureWriter`'s session path, `ensureScanned`'s shared promise
 * and the renderer's pending save are all decided once and never revisited. Switching
 * restarts the app, deliberately — B21 has the full list.
 */
function registerLibraryIpc(): void {
  const vaultPath = (): string | null => loadSettings().vaultPath;

  ipcMain.on(IPC.libraryOpen, () => showLibraryWindow());
  // The folder is the library's; the hotkey and the tray send none and get the Inbox.
  // `newNoteIn` vets it and declines once the session has a file, so this cannot retarget
  // a note that is already on disk.
  ipcMain.on(IPC.captureNew, (_event, folder?: string) => {
    if (typeof folder === "string") writer.newNoteIn(folder);
    focusCaptureWindow();
  });

  ipcMain.handle(IPC.libraryTree, () => {
    const vault = vaultPath();
    return vault === null
      ? { path: "", name: "Vault", children: [], noteCount: 0 }
      : readFolderTree(vault, writer.uncommittedNewPath() ?? undefined);
  });

  /**
   * The non-note files in one folder (B47).
   *
   * Straight from disk, like `readNotesIn` and for the same reason (`vault-scan.ts`'s own
   * comment: browsing one folder must not wait on a scan) — and doubly so here, since the
   * index holds only notes and never could answer this.
   */
  ipcMain.handle(IPC.libraryFolderFiles, (_event, folder: string) => {
    const vault = vaultPath();
    return vault === null ? [] : readFilesIn(vault, folder);
  });

  /**
   * The open-task half of the tree's badge — out of the index, unlike `IPC.libraryTree`
   * beside it, which is why it is a second call and not a field on that one.
   */
  ipcMain.handle(IPC.libraryFolderTaskCounts, async () => {
    const vault = vaultPath();
    return vault === null || indexDb === null ? {} : await folderTaskCounts(vault, indexDb);
  });

  /** The same numbers per note, for the note list's own count. Same split, same reason. */
  ipcMain.handle(IPC.libraryNoteTaskCounts, async () => {
    const vault = vaultPath();
    return vault === null || indexDb === null ? {} : await noteTaskCounts(vault, indexDb);
  });

  ipcMain.handle(IPC.libraryNotes, async (_event, selection: Selection) => {
    const vault = vaultPath();
    // `indexDb` is only ever null in the sliver of startup before `main` opens it, and
    // in the `--dump-clipboard` exit, which never shows a library window at all.
    return vault === null || indexDb === null
      ? []
      : await notesMatching(vault, indexDb, selection, writer.uncommittedNewPath() ?? undefined);
  });

  ipcMain.handle(
    IPC.librarySearch,
    async (_event, query: string, scope: string | undefined) => {
      const vault = vaultPath();
      return vault === null || indexDb === null
        ? []
        : await searchNotes(vault, indexDb, parseSearchQuery(query), {
            // Passed straight through, `undefined` included: `searchNotes` reads an
            // absent scope and an empty one as the same "no restriction", so the renderer
            // declining to narrow and the renderer narrowing to the vault root cannot
            // come to mean two different things here.
            scope,
            excludePath: writer.uncommittedNewPath() ?? undefined,
          });
    },
  );

  // The `tags` half of the same answer `libraryFacets` gives, for the header's Tags
  // field (B66). No `excludePath`: this list is what the vault knows, and a note being
  // typed right now has nothing to contribute to its own completion.
  ipcMain.handle(IPC.locationSuggestions, async () => {
    const vault = vaultPath();
    return vault === null || indexDb === null ? [] : await locationFacets(vault, indexDb);
  });

  ipcMain.handle(IPC.tagSuggestions, async () => {
    const vault = vaultPath();
    return vault === null || indexDb === null ? [] : (await facets(vault, indexDb)).tags;
  });

  // And the `people` half of it, for the Who field (B81). Same answer, same reasons: no
  // `excludePath`, because a note being typed right now has nothing to contribute to its
  // own completion.
  ipcMain.handle(IPC.peopleSuggestions, async () => {
    const vault = vaultPath();
    return vault === null || indexDb === null ? [] : (await facets(vault, indexDb)).people;
  });

  ipcMain.handle(IPC.libraryFacets, async () => {
    const vault = vaultPath();
    return vault === null || indexDb === null
      ? { tags: [], people: [], available: false }
      : await facets(vault, indexDb, writer.uncommittedNewPath() ?? undefined);
  });

  // A library window that opened partway through the startup scan missed every progress
  // event that came before it existed, so it asks once on mount rather than waiting for
  // the next one — on a vault that finishes quickly there may not be a next one.
  ipcMain.handle(IPC.libraryScanState, () => scanProgress);

  ipcMain.handle(IPC.libraryConflicts, async () => {
    const vault = vaultPath();
    return vault === null || indexDb === null ? [] : await conflicts(vault, indexDb);
  });

  ipcMain.handle(IPC.libraryConflictDiff, (_event, pair: ConflictPair) => {
    const vault = vaultPath();
    return vault === null ? [] : diffConflict(vault, pair);
  });

  ipcMain.handle(
    IPC.libraryResolveConflict,
    (_event, pair: ConflictPair, choice: ConflictChoice) => {
      const vault = vaultPath();
      if (vault === null) return;
      resolveConflict(vault, pair, choice);
      notifyLibrary();
    },
  );

  /**
   * The cleanup screen's list.
   *
   * The reference set comes out of the index rather than out of every note on disk —
   * `note_links` has held exactly it since B45 — which is what stopped this stalling at
   * "Looking…" on a Files On-Demand vault. `ensureScanned` first, so a cold index is
   * built once, with the progress bar the library already shows, instead of by a second
   * walk nobody can see; `allLinks` is `null`-safe by being skipped entirely, in which
   * case the scan falls back to reading the notes itself.
   */
  ipcMain.handle(IPC.libraryUnlinkedAttachments, async () => {
    const vault = vaultPath();
    if (vault === null) return [];

    const referenced = indexDb === null ? null : await referencedTargets(vault, indexDb);
    // `null` means the index could not answer, not that nothing is referenced — the scan
    // reads the notes itself in that case rather than offering to delete every attachment
    // in the vault.
    const unlinked = await findUnlinkedAttachments(vault, referenced ?? undefined);

    // Answered as `FileSummary` rows rather than bare paths, because the pane that shows
    // them is B47's file list: the same rows a folder's own files draw, so a name, a type
    // and a size come with each. `summariseFile` is the very function `readFilesIn` uses,
    // which is what stops the two lists describing one file two different ways. A file
    // that vanished between the scan naming it and this stat — a real race on a synced
    // vault — drops out rather than becoming a row that cannot be drawn.
    return unlinked
      .map((path) => summariseFile(vault, join(vault, path)))
      .filter((file): file is FileSummary => file !== null);
  });

  ipcMain.handle(IPC.libraryTrashAttachment, (_event, path: string) => {
    const vault = vaultPath();
    if (vault === null) return path;
    const trashed = trashAttachment(vault, path);
    notifyLibrary();
    return trashed;
  });

  ipcMain.handle(IPC.libraryTasks, async (_event, scope: string, openOnly: boolean) => {
    const vault = vaultPath();
    return vault === null || indexDb === null
      ? []
      : await tasksMatching(vault, indexDb, scope, openOnly);
  });

  // Refuses a note the capture window has claimed, the same guard `IPC.libraryMoveNotes`
  // uses and for the same reason: the write goes straight to the file, bypassing the
  // capture window's own session, and its next debounced write would otherwise land on
  // top of — or right after — this one with no conflict copy on either side.
  ipcMain.handle(
    IPC.libraryToggleTask,
    (_event, path: string, ordinal: number, expectedText: string) => {
      const vault = vaultPath();
      if (vault === null) return { toggled: false };
      if (writer.activePath() === path) return { toggled: false, locked: true };
      const toggled = toggleTask(vault, path, ordinal, expectedText);
      if (toggled) notifyLibrary();
      return { toggled };
    },
  );

  /**
   * B75's pin. The capture-window guard above applies unchanged — this writes the file.
   *
   * The limit is three *per folder* (B77) and it is enforced here rather than in the
   * renderer. The renderer only knows the list currently on screen, and that list is
   * very often not the folder being counted: a note can be pinned from a tag's list or
   * from a search result, where rows come from everywhere. Counted from the index, over
   * `folderOf(path)`; the note being pinned is discounted from that count, so re-pinning
   * something already pinned is never refused for being the fourth of three.
   *
   * **Unpinning is never refused for the limit.** If the index lagged a partial startup
   * scan and a fourth pin slipped through, or a fourth arrived from the other machine
   * through OneDrive, the list draws four pinned notes and every one of them can be
   * unpinned — the file says what it says, and hiding one of them would be the app
   * disagreeing with the vault.
   */
  ipcMain.handle(IPC.librarySetPinned, (_event, path: string, pinned: boolean) => {
    const vault = vaultPath();
    if (vault === null) return { pinned: !pinned };
    if (writer.activePath() === path) return { pinned: !pinned, locked: true };

    if (pinned && indexDb !== null) {
      const already = pinnedNotesIn(indexDb, folderOf(path)).filter((other) => other !== path);
      if (already.length >= MAX_PINNED) return { pinned: false, limit: MAX_PINNED };
    }

    if (!setPinned(vault, path, pinned)) return { pinned: !pinned };
    notifyLibrary();
    return { pinned };
  });

  ipcMain.handle(IPC.libraryOpenNote, (_event, path: string) => {
    const vault = vaultPath();
    if (vault === null) return null;
    const note = openNote(vault, path);
    // Read-only if the capture window has this exact note claimed — two windows open
    // on one note is fine, two windows writing the same file underneath OneDrive is the
    // failure B10 exists to prevent.
    return note === null ? null : { ...note, editable: writer.activePath() !== path };
  });

  ipcMain.handle(IPC.libraryNoteEditable, (_event, path: string) => {
    return writer.activePath() !== path;
  });

  /**
   * Hands a note to the capture window and brings it to the front.
   *
   * Mirrors `finish()`'s ordering inside `writer.load`: whatever capture was composing
   * is flushed and closed first, so a half-typed note is never abandoned mid-session.
   */
  ipcMain.handle(IPC.captureLoad, async (_event, path: string) => {
    const vault = vaultPath();
    if (vault === null) return false;
    // A destroyed or missing window cannot be shown, so do not claim the note before
    // finding that out: `writer.load` below marks it as being edited, and until this
    // window is dismissed nothing else — including a retry from the library — can write
    // to it. Claiming it here and then failing to reveal the window would leave the
    // note permanently reported as locked, for real this time, rather than a window that
    // recovers on its own next appearance.
    const target = getCaptureWindow();
    if (target === null || target.isDestroyed()) return false;
    const note = openNote(vault, path);
    if (note === null) return false;

    await writer.load(note);
    focusCaptureWindow();
    getCaptureWindow()?.webContents.send(IPC.captureLoadNote, note);
    notifyLibrary();
    return true;
  });

  ipcMain.handle(IPC.librarySaveNote, (_event, request: SaveNoteRequest) => {
    const vault = vaultPath();
    if (vault === null) return { written: false, path: request.path };
    // The renderer's own `editable` flag is only ever as fresh as the last
    // `library:refresh` round trip (see `notifyLibrary`) — this is the check that
    // actually holds regardless of that staleness: never write under the capture
    // window's own note.
    if (writer.activePath() === request.path)
      return { written: false, path: request.path, locked: true };

    // The reader's `save()` does not catch, so a throw crossing this boundary was an
    // unhandled rejection in the renderer and nothing on screen — while the note went on
    // reading "Saved". Answered instead, so the reader can say what happened and where
    // the text went. See `atomic-write.ts`.
    try {
      return saveNote(vault, request);
    } catch (error) {
      const failure = asSaveError(error);
      console.error(`[save] ${request.path} — ${failure.code}: ${failure.message}`);
      return { written: false, path: request.path, error: failure };
    }
  });

  // Refuses a note the capture window has claimed, the same way `librarySaveNote` does
  // and for a sharper reason: `CaptureWriter`'s session holds the path it is going to
  // write to, decided when the note was loaded. Moving the file out from under it does
  // not update that path, so the next debounced write recreates the note where it used
  // to be — one note, now in two folders, the second one written by a window that
  // believes it is still editing the first. The move dialog could only reach a note the
  // reader had open; dragging can reach any row in the list, which is what makes the
  // guard worth having rather than worth noting.
  //
  // **One handler for the whole set, and one `notifyLibrary` at the end of it** (B95). The
  // renderer used to loop over a one-note channel, and every turn of that loop cost a
  // `linkingNotes` walk of the index, a round trip, a broadcast and the seven-part reload
  // the library runs on one — so filing six notes was some thirty full walks of the vault,
  // most of a second each on Windows where `checkFilesOnDemand` shells out to `attrib`.
  //
  // The per-note order inside the loop is the old handler's, unchanged and load-bearing:
  // each note's references are resolved immediately before *that* note moves, never once
  // for the batch up front. Two notes in one set can link to each other, and a target
  // resolves against where a note is at the moment the question is asked.
  //
  // A refusal is per note rather than for the batch: dragging a set can reach the one row
  // the capture window happens to have claimed, and refusing the other five for its sake
  // would make one open note able to veto a filing gesture.
  ipcMain.handle(
    IPC.libraryMoveNotes,
    async (_event, paths: string[], folder: string, rewriteLinks?: boolean) => {
      const vault = vaultPath();
      if (vault === null) return { moved: [], locked: [] };

      const moved: { from: string; to: string }[] = [];
      const locked: string[] = [];

      for (const path of paths) {
        if (writer.activePath() === path) {
          locked.push(path);
          continue;
        }

        // Resolved *before* the move, and here rather than in the renderer: a target
        // resolves against where the note is now, so after `moveNote` there is nothing
        // left to find. The renderer only says whether the user agreed, never which notes
        // to touch — that list is main's to compute, twice if need be (B35).
        // eslint-disable-next-line no-await-in-loop
        const references = rewriteLinks === true ? await linkingNotesFor(vault, [path]) : [];
        const to = moveNote(vault, path, folder);
        if (references.length > 0) {
          rewriteWikiLinks(vault, references, linkTargetFor(to), writer.activePath());
        }
        moved.push({ from: path, to });
      }

      notifyLibrary();
      return { moved, locked };
    },
  );

  // Refuses a note the capture window has claimed, the same way `libraryMoveNotes` does
  // and for the same reason: renaming writes straight to the file, bypassing the capture
  // window's own session, which holds the path it will write to next. Renaming out from
  // under it would not update that path, so its next debounced write would recreate the
  // note under its old name.
  ipcMain.handle(
    IPC.libraryRenameNote,
    async (_event, path: string, title: string, rewriteLinks?: boolean) => {
      const vault = vaultPath();
      if (vault === null) return { path };
      if (writer.activePath() === path) return { path, locked: true };

      // Same ordering, same reason as `libraryMoveNotes` above: a rename changes the
      // filename, so it moves the link target as surely as a move does. One note, so a
      // one-element set — a rename is always about the note being read.
      const references = rewriteLinks === true ? await linkingNotesFor(vault, [path]) : [];
      const renamed = renameNote(vault, path, title);
      if (references.length > 0) {
        rewriteWikiLinks(vault, references, linkTargetFor(renamed), writer.activePath());
      }

      notifyLibrary();
      return { path: renamed };
    },
  );

  /**
   * How many notes link to these — the count the confirmation names before a move or a
   * rename. Answers an empty list when the index is not available (an un-hydrated
   * OneDrive vault), which reads as "nothing links here" and so asks nothing: offering to
   * rewrite links this app cannot currently see would be worse than staying quiet.
   *
   * A set, and deduped by the linking note (B95): the question a marked set raises is "how
   * many notes would have their links rewritten", and a note pointing at two of the six
   * being moved is one answer to it, not two. One `ensureScanned` for the whole batch is
   * the other half — asked per note, this was a full walk of the vault per note, awaited
   * one after another, and it was the largest single cost of filing a set.
   */
  ipcMain.handle(IPC.libraryLinkingNotes, async (_event, paths: string[]) => {
    const vault = vaultPath();
    if (vault === null || indexDb === null) return [];

    const byPath = new Map<string, { path: string; title: string }>();
    for (const path of paths) {
      // eslint-disable-next-line no-await-in-loop
      for (const one of await linkingNotes(vault, indexDb, path)) {
        if (!byPath.has(one.path)) byPath.set(one.path, { path: one.path, title: one.title });
      }
    }
    return [...byPath.values()];
  });

  // The source file is only read, never written, but a note the capture window has
  // claimed may hold edits that have not yet crossed the 800 ms debounce — copying it
  // now would silently duplicate a stale version of what the user is looking at on
  // screen, so this refuses the same way its siblings do.
  ipcMain.handle(IPC.libraryDuplicateNote, (_event, path: string) => {
    const vault = vaultPath();
    if (vault === null) return { path };
    if (writer.activePath() === path) return { path, locked: true };
    const duplicated = duplicateNote(vault, path);
    notifyLibrary();
    return { path: duplicated };
  });

  ipcMain.handle(IPC.libraryTrashNote, (_event, path: string) => {
    const vault = vaultPath();
    if (vault === null) return false;
    // The vault's own _trash folder, not the system one: a OneDrive file sent to the
    // Windows recycle bin is not synced, so it would be gone from the other machine
    // with no way back. _trash travels with the vault.
    trashNote(vault, path);
    notifyLibrary();
    return true;
  });

  /**
   * The lock guard is `IPC.libraryDeleteFromTrash`'s, which this used to be missing
   * altogether: emptying the trash can reach a note the capture window has claimed just
   * as naming one can, and there the file simply comes back on the next debounced write
   * — `writeAtomic`'s own `mkdirSync` recreating the trash folder around it.
   *
   * `emptyTrash` counts what would not go rather than throwing on it, so one folder
   * something else holds open does not keep the rest of the trash. The count comes back
   * either way and the renderer says so.
   */
  ipcMain.handle(IPC.libraryEmptyTrash, (_event) => {
    const vault = vaultPath();
    if (vault === null) return { removed: 0, failed: 0 };

    const active = writer.activePath();
    if (active !== null && active.startsWith(`${TRASH_FOLDER}/`)) {
      return { removed: 0, failed: 0, locked: true };
    }

    const emptied = emptyTrash(vault);
    notifyLibrary();
    if (emptied.firstFailure !== undefined) {
      console.error(
        `Could not empty the whole trash: ${emptied.firstFailure.code} at ` +
          `${emptied.firstFailure.path} — ${emptied.firstFailure.message}`,
      );
    }
    return emptied;
  });

  ipcMain.handle(IPC.libraryCreateFolder, (_event, parent: string, name: string) => {
    const vault = vaultPath();
    if (vault === null) return parent;
    const created = createFolder(vault, parent, name);
    notifyLibrary();
    return created;
  });

  ipcMain.handle(IPC.listVaults, () =>
    listVaults(knownVaults(), findOneDriveCandidates(), loadSettings().vaultPath),
  );

  ipcMain.handle(IPC.chooseVault, () => askForVault());

  // The whole of it is `switchVaultTo`, above — the settings panel and the tray reach the
  // same function. This renderer has already flushed its own pending save on the way here;
  // `flushOpenLibrary` inside asks again, which costs one no-op round trip and means the
  // tray path is not relying on a window it did not go through.
  ipcMain.handle(IPC.switchVault, (_event, path: string) => switchVaultTo(path));

  /**
   * Renaming a folder moves every note inside it, so it moves every `[[path|Title]]` link
   * target that points into it — and until B44 it simply broke them all, silently, since a
   * note link says nothing about being broken until it is clicked (B35).
   *
   * `relocateFolder` above is the whole of the repair, and the reason it is a function
   * rather than the body of this handler is `IPC.libraryMoveFolder` right below: the two
   * differ by one call, and the ordering they share is exactly what B44 and B45 are about.
   */
  ipcMain.handle(IPC.libraryRenameFolder, async (_event, path: string, name: string) => {
    const vault = vaultPath();
    if (vault === null) return path;
    return relocateFolder(vault, path, () => renameFolder(vault, path, name));
  });

  /**
   * Restoring a folder out of the trash. The links into it are repaired exactly as a
   * rename's are — same guard, same ordering, same two passes — because from `note_links`'
   * point of view a folder that moved and a folder that was renamed are one event.
   *
   * There is no move-a-folder gesture anywhere else in the app: filing is what the tree is
   * for, and dragging a whole folder around it is not something anyone asked for. This
   * exists because a folder in `_trash` has nowhere to be *renamed* to, so the one way
   * back out of the trash had to be a move.
   */
  ipcMain.handle(IPC.libraryMoveFolder, async (_event, path: string, parent: string) => {
    const vault = vaultPath();
    if (vault === null) return path;
    return relocateFolder(vault, path, () => moveFolder(vault, path, parent));
  });

  /**
   * The second permanent delete the app has ever performed, and the first that names one
   * thing (B24). `deleteFromTrash` carries the `realpathSync` guard `emptyTrash` has, on
   * the target as well as on the trash folder; the confirmation naming what is about to
   * go is the renderer's, the same shape Empty trash already uses.
   *
   * The lock guard is `IPC.libraryTrashFolder`'s, widened by one case: a *note* can be the
   * thing being deleted here, so the capture window's claimed path is compared for equality
   * as well as for containment. Without it the file would simply come back on the next
   * debounced write — `writeAtomic`'s own `mkdirSync` recreating the trash folder around it.
   */
  ipcMain.handle(IPC.libraryDeleteFromTrash, (_event, path: string) => {
    const vault = vaultPath();
    if (vault === null) return { deleted: false };

    const active = writer.activePath();
    if (active !== null && (active === path || active.startsWith(`${path}/`))) {
      return { deleted: false, locked: true };
    }

    let outcome;
    try {
      outcome = deleteFromTrash(vault, path);
    } catch (error) {
      // The only way out of `deleteFromTrash` that still throws is its own guard refusing
      // a path that is not inside `_trash` at all — nothing a person can act on, and
      // nothing the message on screen tries to explain. The filesystem refusing is not an
      // exception any more; it comes back as `outcome` below, named.
      console.error(`Refused to delete ${path} from the trash:`, error);
      return { deleted: false, failed: true };
    }

    notifyLibrary();
    if (outcome.removed) return { deleted: true };

    // Logged with the whole error and answered with the short form. The `code` is the
    // point: B57 removed this app's own handle from the picture and the report came back
    // unchanged, so the next one has to arrive with the operating system's own word for
    // what happened, and with the entry that refused rather than the folder that was
    // asked for.
    console.error(
      `Could not delete ${path} from the trash: ${outcome.failure.code} at ` +
        `${outcome.failure.path} — ${outcome.failure.message}`,
    );
    return { deleted: false, failed: true, reason: outcome.failure };
  });

  ipcMain.handle(IPC.libraryFolderContents, (_event, path: string) => {
    const vault = vaultPath();
    return vault === null ? { notes: 0, folders: 0 } : folderContents(vault, path);
  });

  // `folderContents`' neighbour, and deliberately not that function called with `_trash`:
  // it counts only note files and skips the app's own folder names, both of which are
  // right for a folder in the vault tree and wrong for the trash, where everything is
  // going. See `trashContents`.
  ipcMain.handle(IPC.libraryTrashContents, async () => {
    const vault = vaultPath();
    if (vault === null) return { notes: 0, folders: 0, files: 0, openTasks: 0, linkedFiles: 0 };

    // The two questions are asked separately because they are separate: `trashContents`
    // counts what is inside `_trash` and `attachmentsOrphanedByTrash` counts what is
    // outside it and would stop being reachable. The reference set comes out of the
    // index for the reason the unlinked pane's own handler gives — on a Files On-Demand
    // vault, reading every note instead can block on a hydration — and `null` there
    // means "the index could not answer", which falls back to the walk rather than to a
    // zero that would quietly understate the dialog.
    const referenced = indexDb === null ? null : await referencedTargets(vault, indexDb);
    const orphaned = await attachmentsOrphanedByTrash(vault, referenced ?? undefined);

    return { ...trashContents(vault), linkedFiles: orphaned.length };
  });

  ipcMain.handle(IPC.libraryOpenTasksAt, (_event, path: string) => {
    const vault = vaultPath();
    return vault === null ? 0 : openTasksAt(vault, path);
  });

  // Same hazard `IPC.libraryMoveNotes` guards against, one level up: `CaptureWriter`'s
  // session pins the path it will write to when a note is loaded, and moving — or here,
  // trashing — the folder underneath it does not update that path. The next debounced
  // write would then recreate the note at its old location inside a folder that no
  // longer otherwise exists. Checked before `trashFolder` runs, not after, so a note
  // mid-edit is never even momentarily moved into `_trash`.
  ipcMain.handle(IPC.libraryTrashFolder, (_event, path: string) => {
    const vault = vaultPath();
    if (vault === null) return { trashed: false };

    const active = writer.activePath();
    if (active !== null && active.startsWith(`${path}/`)) {
      return { trashed: false, locked: true };
    }

    trashFolder(vault, path);
    notifyLibrary();
    return { trashed: true };
  });

  ipcMain.on(IPC.libraryRevealNote, (_event, path: string) => {
    const vault = vaultPath();
    if (vault !== null) shell.showItemInFolder(join(vault, path));
  });
}

app.on("window-all-closed", () => {
  // A resident app keeps running when its window is closed; that is the whole point.
});

// The capture window's own `close` handler now calls `preventDefault()` so the
// traffic-light/Alt+F4 close commits the note and hides the window instead of
// destroying it (see `capture-window.ts`). That would make a real quit — the tray's
// "Quit emqnote", or the OS shutting the app down — hang forever waiting for a close
// that never happens, unless something tells that handler to stand down first.
// `before-quit` fires before Electron starts closing windows, so it is the one place
// early enough to flip the flag before any window's `close` event is even dispatched.
app.on("before-quit", () => {
  setQuitting(true);
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  void writer.flush();
  // The hidden PDF-render window (B36) has nothing left to render once the app is on
  // its way out — same reasoning as the watcher and the scan worker just below.
  shutdownPdfThumb();
  shutdownPdfViewer();
  // Registered unconditionally, so this can fire before `main` ever opened either of
  // these — the second-instance-lock check quits without calling `main` at all in that
  // path. The watcher closes first, same fire-and-forget style `writer.flush()` above
  // already uses, so it is not still reindexing into a database that just closed under
  // it — not a hard guarantee, just narrowing the race rather than ignoring it.
  if (vaultWatcher !== null) void vaultWatcher.close();
  // Same reasoning one line further: the scan worker holds its own connection to the
  // index, so it has to stop before the file's other connection closes underneath it.
  stopScanWorker();
  if (indexDb !== null) closeIndex(indexDb);
});
