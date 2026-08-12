import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  net,
  protocol,
  shell,
  type MenuItemConstructorOptions,
  type OpenDialogOptions,
} from "electron";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { IPC, type CapturePayload, type WikiLinkOutcome } from "../shared/ipc.js";
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
import { readLaunchOptions } from "./launch-options.js";
import { loadSettings, saveSettings } from "./settings.js";
import { buildTrayMenu, createTray } from "./tray.js";
import { checkForUpdates, setBeforeInstall } from "./updater.js";
import {
  checkFilesOnDemand,
  ensureVaultLayout,
  FILES_ON_DEMAND_INSTRUCTION,
  findOneDriveCandidates,
  tenantLabel,
  VAULT_FOLDER_NAME,
} from "./vault.js";
import {
  createFolder,
  diffConflict,
  duplicateNote,
  emptyTrash,
  folderContents,
  renameFolder,
  moveNote,
  openNote,
  readFolderTree,
  renameNote,
  resolveConflict,
  rewriteWikiLinks,
  saveNote,
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
  linkingNotes,
  notesMatching,
  resolveNoteLink,
  searchNotes,
  setScanRunner,
  startScan,
  tasks as tasksMatching,
} from "./vault-scan.js";
import { linkTargetFor } from "./link-resolve.js";
import { stopScanWorker, workerScanRunner } from "./scan-host.js";
import { closeIndex, getNote as getNoteMeta, openIndex, type IndexDb } from "./index-db.js";
import { watchVault, type VaultWatcher } from "./index-watch.js";
import { wasOwnWrite } from "./own-writes.js";
import { parseSearchQuery } from "./search-query.js";
import { attachmentPreview, findOrphanedAttachments } from "./orphaned-attachments.js";
import { copyAttachment, resolveAttachment, saveAttachment } from "./attachments.js";
import { attachmentNameFromUrl } from "../shared/attachment-url.js";
import { isPreviewable } from "./thumbnail-cache.js";
import { ensureThumbnail, runThumbnailProbe, thumbnailCacheDir } from "./thumbnails.js";
import { shutdownPdfThumb } from "./pdf-thumb.js";
import { fetchRemoteImage } from "./fetch-attachment.js";
import { isOpenableUrl } from "./remote-image.js";
import type {
  ConflictChoice,
  ConflictPair,
  SaveNoteRequest,
  ScanProgress,
  Selection,
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
    scheme: "emqnote-attachment",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
  {
    scheme: "emqnote-thumb",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

const launch = readLaunchOptions();

// One resident instance. A second launch simply opens the capture window.
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
  launch.selfTestRounds > 0 || launch.dumpClipboard !== null || launch.thumbnailProbe !== null;
if (!bypassesSingleInstance && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if (!bypassesSingleInstance) {
    app.on("second-instance", () => showCaptureWindow());
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
 * The notes linking to one, as `rewriteWikiLinks` wants them — the two move/rename
 * handlers ask the same question the same way, and the index may not be open yet.
 */
async function linkingNotesFor(
  vault: string,
  path: string,
): Promise<{ path: string; targets: string[] }[]> {
  if (indexDb === null) return [];
  return linkingNotes(vault, indexDb, path);
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

const writer = new CaptureWriter(
  () => loadSettings().vaultPath,
  (result) => {
    lastSavedAs = result.path;
    // A note still awaiting Ctrl+Enter/close has nothing worth telling the library about
    // yet: it stays filtered out of every listing (see `uncommittedNewPath`), so pushing a
    // refresh here would only make it rescan for no visible change, every 800ms while the
    // user keeps typing.
    if (writer.uncommittedNewPath() === null) notifyLibrary();
    sendStatus({ lastLatencyMs: lastLatency, savedAs: lastSavedAs });
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

  // One connection here for the questions the library asks; the scan runs in a worker
  // that opens the same file itself, which is why the path is handed over rather than
  // the handle (`scan-host.ts`).
  const indexPath = join(app.getPath("userData"), "index.sqlite");
  indexDb = openIndex(indexPath);
  setScanRunner(workerScanRunner(indexPath));

  // Menu bar app: no dock icon, no app switcher entry. The main window in phase 4 will
  // temporarily restore this when it opens.
  if (process.platform === "darwin") app.setActivationPolicy("accessory");

  const selfTestRounds = launch.selfTestRounds;
  const settings = loadSettings();
  cachedVaultPath = settings.vaultPath;

  installMinimalMenu();
  registerAttachmentProtocol();
  registerThumbnailProtocol();
  registerIpc();
  createCaptureWindow();

  // A measurement run leaves the machine as it found it: no login item, no second tray
  // icon next to the one already there, and no fight over the global shortcut with the
  // instance that is already running.
  if (selfTestRounds === 0) {
    app.setLoginItemSettings({ openAtLogin: settings.openAtLogin });
    createTray();
    registerHotkey();
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

  if (launch.openLibrary) showLibraryWindow();

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
 * That default menu is invisible on a frameless window but its accelerators are not:
 * it binds Ctrl+M to Minimise, which is why indenting inside a list minimised the
 * whole window. It also claims Ctrl+R for reload and Ctrl+Shift+I for developer tools.
 * The Edit roles have to stay, because on macOS the menu is what makes Cmd+C and
 * Cmd+V work at all.
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

    const outcome = await ensureThumbnail(thumbnailCacheDir(), resolved);
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

function registerHotkey(): void {
  const { hotkey } = loadSettings();

  globalShortcut.unregisterAll();
  const registered = globalShortcut.register(hotkey, () => showCaptureWindow());

  if (!registered) {
    dialog.showMessageBox({
      type: "warning",
      title: "Shortcut unavailable",
      message: `The shortcut ${hotkey} is already taken by another program.`,
      detail:
        "emqnote is running, but you can only open the window from the tray icon. " +
        "Pick a different shortcut in settings.json.",
    });
  }
}

async function prepareVault(): Promise<void> {
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
 * The one place that knows this wording, for both the people who reach it: first run,
 * and "Choose another folder…" in settings. Two dialogs asking the same question in
 * different words would be two chances to describe the tenant choice badly.
 */
async function askForVault(): Promise<string | null> {
  const candidates = findOneDriveCandidates();

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
    sendStatus({ lastLatencyMs: elapsed, savedAs: lastSavedAs });
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

  ipcMain.on(IPC.windowMinimise, () => getCaptureWindow()?.minimize());

  ipcMain.on(IPC.windowToggleMaximise, () => {
    const target = getCaptureWindow();
    if (target === undefined || target === null) return;
    if (target.isMaximized()) target.unmaximize();
    else target.maximize();
  });

  registerLibraryIpc();
  registerAppIpc();
}

/** What a window needs before it can draw: language, platform and the shortcut. */
function registerAppIpc(): void {
  ipcMain.handle(IPC.bootstrap, () => {
    const settings = loadSettings();
    return {
      locale: settings.locale,
      platform: process.platform,
      hotkey: settings.hotkey,
      vaultPath: settings.vaultPath,
      libraryPaneWidths: settings.libraryPaneWidths,
      librarySort: settings.librarySort,
    };
  });

  ipcMain.handle(IPC.setLocale, (_event, locale: Locale) => {
    saveSettings({ locale });
    buildTrayMenu();
    for (const target of [getCaptureWindow(), getLibraryWindow()]) {
      if (target !== null && !target.isDestroyed()) {
        target.webContents.send(IPC.libraryRefresh);
      }
    }
  });

  ipcMain.handle(IPC.setHotkey, (_event, hotkey: string) => {
    globalShortcut.unregisterAll();
    const registered = globalShortcut.register(hotkey, () => showCaptureWindow());

    if (!registered) {
      // Put the old one back rather than leaving the app with no shortcut at all.
      globalShortcut.register(loadSettings().hotkey, () => showCaptureWindow());
      return false;
    }

    saveSettings({ hotkey });
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
          ? [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] }]
          : [
              {
                name: "Images and PDFs",
                extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "pdf"],
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
  ipcMain.handle(IPC.openWikiLink, async (_event, target: string): Promise<WikiLinkOutcome> => {
    const vault = loadSettings().vaultPath;
    if (vault === null) return "none";

    const attachment = resolveAttachment(vault, target);
    if (attachment !== null) {
      void shell.openPath(attachment);
      return "attachment";
    }

    if (indexDb === null) return "none";
    const resolved = await resolveNoteLink(vault, indexDb, target);
    if (resolved.kind === "none") return "none";

    const paths = resolved.kind === "unique" ? [resolved.path] : resolved.paths;
    showLibraryWindow();
    const library = getLibraryWindow();
    if (library !== null && !library.isDestroyed()) {
      const summaries = paths.map((path) => {
        const slash = path.lastIndexOf("/");
        return {
          path,
          title: getNoteMeta(indexDb!, path)?.title ?? path,
          folder: slash === -1 ? "" : path.slice(0, slash),
        };
      });
      // A window that has only just been created by `showLibraryWindow` is still loading,
      // so the event would arrive before anything is listening for it. Waiting for the
      // renderer's own `did-finish-load` is what makes a link clicked from the capture
      // window work on the first click rather than only once the library is already up.
      const send = (): void => library.webContents.send(IPC.libraryOpenLink, { target, candidates: summaries });
      if (library.webContents.isLoading()) library.webContents.once("did-finish-load", send);
      else send();
    }

    return resolved.kind === "unique" ? "note" : "ambiguous";
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
  ipcMain.on(IPC.setSort, (_event, sort: SortKey) => {
    saveSettings({ librarySort: sort });
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

  ipcMain.handle(IPC.libraryNotes, async (_event, selection: Selection) => {
    const vault = vaultPath();
    // `indexDb` is only ever null in the sliver of startup before `main` opens it, and
    // in the `--dump-clipboard` exit, which never shows a library window at all.
    return vault === null || indexDb === null
      ? []
      : await notesMatching(vault, indexDb, selection, writer.uncommittedNewPath() ?? undefined);
  });

  ipcMain.handle(IPC.librarySearch, async (_event, query: string) => {
    const vault = vaultPath();
    return vault === null || indexDb === null
      ? []
      : await searchNotes(vault, indexDb, parseSearchQuery(query), {
          excludePath: writer.uncommittedNewPath() ?? undefined,
        });
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

  ipcMain.handle(IPC.libraryOrphanedAttachments, () => {
    const vault = vaultPath();
    return vault === null ? [] : findOrphanedAttachments(vault);
  });

  ipcMain.handle(IPC.libraryAttachmentPreview, (_event, path: string) => {
    const vault = vaultPath();
    return vault === null ? null : attachmentPreview(vault, path);
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

  // Refuses a note the capture window has claimed, the same guard `IPC.libraryMoveNote`
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
    return saveNote(vault, request);
  });

  // Refuses a note the capture window has claimed, the same way `librarySaveNote` does
  // and for a sharper reason: `CaptureWriter`'s session holds the path it is going to
  // write to, decided when the note was loaded. Moving the file out from under it does
  // not update that path, so the next debounced write recreates the note where it used
  // to be — one note, now in two folders, the second one written by a window that
  // believes it is still editing the first. The move dialog could only reach a note the
  // reader had open; dragging can reach any row in the list, which is what makes the
  // guard worth having rather than worth noting.
  ipcMain.handle(
    IPC.libraryMoveNote,
    async (_event, path: string, folder: string, rewriteLinks?: boolean) => {
      const vault = vaultPath();
      if (vault === null) return { path };
      if (writer.activePath() === path) return { path, locked: true };

      // Resolved *before* the move, and here rather than in the renderer: a target
      // resolves against where the note is now, so after `moveNote` there is nothing left
      // to find. The renderer only says whether the user agreed, never which notes to
      // touch — that list is main's to compute, twice if need be (B35).
      const references = rewriteLinks === true ? await linkingNotesFor(vault, path) : [];
      const moved = moveNote(vault, path, folder);
      if (references.length > 0) {
        rewriteWikiLinks(vault, references, linkTargetFor(moved), writer.activePath());
      }

      notifyLibrary();
      return { path: moved };
    },
  );

  // Refuses a note the capture window has claimed, the same way `libraryMoveNote` does
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

      // Same ordering, same reason as `libraryMoveNote` above: a rename changes the
      // filename, so it moves the link target as surely as a move does.
      const references = rewriteLinks === true ? await linkingNotesFor(vault, path) : [];
      const renamed = renameNote(vault, path, title);
      if (references.length > 0) {
        rewriteWikiLinks(vault, references, linkTargetFor(renamed), writer.activePath());
      }

      notifyLibrary();
      return { path: renamed };
    },
  );

  /**
   * How many notes link to one — the count the confirmation names before a move or a
   * rename. Answers an empty list when the index is not available (an un-hydrated
   * OneDrive vault), which reads as "nothing links here" and so asks nothing: offering to
   * rewrite links this app cannot currently see would be worse than staying quiet.
   */
  ipcMain.handle(IPC.libraryLinkingNotes, async (_event, path: string) => {
    const vault = vaultPath();
    if (vault === null || indexDb === null) return [];
    return (await linkingNotes(vault, indexDb, path)).map((one) => ({
      path: one.path,
      title: one.title,
    }));
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

  ipcMain.handle(IPC.libraryEmptyTrash, (_event) => {
    const vault = vaultPath();
    if (vault === null) return 0;
    const count = emptyTrash(vault);
    notifyLibrary();
    return count;
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

  /**
   * Points the app at another vault and restarts it.
   *
   * A restart and not a live switch, and that is B21 rather than laziness — four
   * separate pieces of state are decided once and never revisited:
   *
   *  - `CaptureWriter.session.path` is fixed on the first write, so a half-typed note
   *    would keep landing in the old vault.
   *  - `ensureScanned` collapses concurrent callers onto one `running` promise *without
   *    checking which vault it is for*, so a `facets()` straight after a switch can
   *    await the old vault's scan and read its cache. `invalidate()` exists and has no
   *    callers.
   *  - A pending `saveTimer` in the renderer would write the old note's bytes into the
   *    new vault at the same relative path, with `writeAtomic`'s `mkdirSync` creating
   *    the folder to hold it. Silently.
   *  - `filesOnDemandWarned` — now per vault, precisely so the restart does not land in
   *    a new OneDrive folder with the warning already suppressed.
   *
   * Everything in flight is flushed first. The renderer flushes its own pending save
   * before it calls this.
   */
  ipcMain.handle(IPC.switchVault, async (_event, path: string) => {
    await writer.flush();
    writer.finish();

    adoptVault(path);

    app.relaunch();
    app.quit();
  });

  ipcMain.handle(IPC.libraryRenameFolder, (_event, path: string, name: string) => {
    const vault = vaultPath();
    if (vault === null) return path;
    const renamed = renameFolder(vault, path, name);
    notifyLibrary();
    return renamed;
  });

  ipcMain.handle(IPC.libraryFolderContents, (_event, path: string) => {
    const vault = vaultPath();
    return vault === null ? { notes: 0, folders: 0 } : folderContents(vault, path);
  });

  // Same hazard `IPC.libraryMoveNote` guards against, one level up: `CaptureWriter`'s
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
