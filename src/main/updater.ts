import { app, dialog, shell, type MessageBoxOptions, type MessageBoxReturnValue } from "electron";
import { createRequire } from "node:module";
import type { AppUpdater } from "electron-updater";
import { isNewerVersion, parseLatestRelease } from "./update-check.js";
import { getLibraryWindow } from "./library-window.js";
import { IPC } from "../shared/ipc.js";

const REPO = "miel/emqnote";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

let beforeInstall: () => Promise<void> = async () => {};

/**
 * Lets the caller flush anything in-flight — mirrors the `writer.flush()` →
 * `writer.finish()` sequence `switchVault` already runs before its own
 * `app.relaunch()` — before the Windows path restarts the app to install. A setter
 * rather than a parameter on `checkForUpdates`, the same way `capture-window.ts` takes
 * its hide/blur handlers: the tray menu's "Check for updates…" item calls
 * `checkForUpdates` directly and has no reason to know about the writer.
 */
export function setBeforeInstall(handler: () => Promise<void>): void {
  beforeInstall = handler;
}

/**
 * Whether a check is in the air right now (B98).
 *
 * The reported confusion is the gap between the click and the dialog: the settings
 * panel's button is fire-and-forget by design — `IPC.checkForUpdates` resolves once the
 * check has been *started*, because on Windows the call only settles after the user has
 * answered a download prompt — so for as long as GitHub takes to answer, nothing on
 * screen has changed and the click looks lost.
 *
 * This is the one thing worth telling the window, and it is deliberately not the result:
 * every outcome is a native dialog and stays one.
 */
let checking = false;

/**
 * `true` when this call owns the check, `false` when one was already running.
 *
 * A second check while the first is in the air is not something to queue: the once-a-day
 * startup check can still be waiting on GitHub when the panel is opened, and two of them
 * would race to raise two dialogs about the same answer. The settings button is disabled
 * while this is `true`, so from the panel the refused click cannot be made at all; from
 * the tray it can, and the answer it gets is the dialog the check already in the air is
 * about to raise, which is the answer it asked for.
 */
function beginCheck(): boolean {
  if (checking) return false;
  checking = true;
  reportChecking();
  return true;
}

/** Idempotent, because both `announce` and `checkForUpdates`'s `finally` call it. */
function endCheck(): void {
  if (!checking) return;
  checking = false;
  reportChecking();
}

/** Guarded exactly as `index.ts`'s `notifyLibrary` is: the panel may not be open at all. */
function reportChecking(): void {
  const library = getLibraryWindow();
  if (library === null || library.isDestroyed()) return;
  library.webContents.send(IPC.updateCheckState, checking);
}

/**
 * Every outcome this module has, and the one place the check is declared over.
 *
 * The check ends when the *check* ends, not when the user has finished answering — the
 * Windows path stays inside `checkWindows` for as long as a download takes, and a button
 * reading "Checking for updates…" through all of it would be describing something that
 * finished minutes ago. Since every outcome here is a message box, putting `endCheck` in
 * front of `showMessageBox` puts it in front of all five of them at once, rather than a
 * flag to be kept in step at each branch.
 */
async function announce(options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
  endCheck();
  return dialog.showMessageBox(options);
}

/**
 * Checks the latest tagged GitHub release against the running version.
 *
 * Windows gets a real install: electron-updater's NSIS-based auto-update, gated behind
 * two explicit confirmations — one before downloading, one before restarting to
 * install — so a background check never interrupts capture without asking. macOS gets a
 * lighter path, deliberately: no Squirrel.Mac, no code-signing requirement (see B22 in
 * 05-besluitenlog.md), just a version check that opens the release page for the same
 * manual reinstall used today.
 *
 * `trigger` controls how quiet a "nothing to report" result stays. The automatic
 * startup check says nothing unless there really is an update — it must not interrupt
 * the user with "you're up to date" every morning. The "Check for updates…" tray item
 * always reports back, including failures, because the user asked and deserves an
 * answer.
 */
export async function checkForUpdates(trigger: "startup" | "manual"): Promise<void> {
  if (!beginCheck()) return;
  try {
    if (process.platform === "win32") {
      await checkWindows(trigger);
    } else {
      await checkMac(trigger);
    }
  } catch (error) {
    // Both callers are `void checkForUpdates(…)` — the tray item and the startup check
    // have nothing to await — so without this a throw anywhere below becomes an unhandled
    // rejection and the click does *nothing at all*, which is exactly how the broken
    // `autoUpdater` import stayed invisible for every release since B22. The same
    // reasoning as `trash-delete.ts`: on a path with no other output, a failure has to
    // name itself. `reportError` still respects `trigger`, so the startup check stays
    // quiet.
    await reportError(trigger, error);
  } finally {
    // `announce` has almost always ended it already. What is left for this is the one
    // path that raises no dialog at all: the startup check finding nothing, which
    // `reportUpToDate` returns from before it ever reaches a message box.
    endCheck();
  }
}

/**
 * electron-updater's `autoUpdater`, loaded the way electron-updater is actually written.
 *
 * **Not `await import("electron-updater")`**, which is what this used to be and is why
 * "check for updates" did nothing on Windows for every release since B22. That package is
 * CJS, and `autoUpdater` is its one export defined as a lazy `Object.defineProperty`
 * getter rather than a plain assignment — a shape `cjs-module-lexer` does not recognise,
 * so it is the one name missing from the ESM namespace Node synthesises. Measured inside
 * the real packaged `app.asar`: the namespace carries `AppUpdater`, `NsisUpdater`,
 * `MacUpdater` and thirteen more, and `autoUpdater` comes back `undefined`. The next line
 * then threw on `undefined.autoDownload`, and the `void` at the call site swallowed it.
 *
 * The failure could only ever show on Windows, because `checkMac` uses a plain `fetch`
 * and this is the only code in the app that loads electron-updater at all. Nothing under
 * `test/` could have caught it either — it is a property of Node's CJS/ESM interop, not of
 * this source tree, the same family as B36's trailing slash and B40's missing
 * `corsEnabled`. `test/updater-import.test.ts` pins it now.
 *
 * `require` rather than the `.default.autoUpdater` that also works: CJS is the module
 * system this package ships for, and going through it does not depend on a static
 * analyser recognising a pattern — which is the thing that failed here. It stays inside
 * the function so macOS, which needs none of it, still never loads it.
 */
function loadAutoUpdater(): AppUpdater {
  const require = createRequire(import.meta.url);
  return (require("electron-updater") as { autoUpdater: AppUpdater }).autoUpdater;
}

async function reportError(trigger: "startup" | "manual", error: unknown): Promise<void> {
  if (trigger !== "manual") return;
  await announce({
    type: "error",
    title: "Could not check for updates",
    message: "Checking GitHub for the latest release failed.",
    detail: error instanceof Error ? error.message : String(error),
  });
}

async function reportUpToDate(trigger: "startup" | "manual"): Promise<void> {
  if (trigger !== "manual") return;
  await announce({
    type: "info",
    title: "Up to date",
    message: `emqnote ${app.getVersion()} is the latest version.`,
  });
}

async function checkMac(trigger: "startup" | "manual"): Promise<void> {
  let release;
  try {
    const response = await fetch(RELEASES_URL);
    release = parseLatestRelease(await response.json());
  } catch (error) {
    await reportError(trigger, error);
    return;
  }

  if (release === null || !isNewerVersion(app.getVersion(), release.version)) {
    await reportUpToDate(trigger);
    return;
  }

  const answer = await announce({
    type: "info",
    title: "Update available",
    message: `emqnote ${release.version} is available (you have ${app.getVersion()}).`,
    detail: "Download the new version and replace the app the same way you installed it.",
    buttons: ["Download", "Later"],
    defaultId: 0,
    cancelId: 1,
  });

  if (answer.response === 0) shell.openExternal(release.htmlUrl);
}

async function checkWindows(trigger: "startup" | "manual"): Promise<void> {
  const autoUpdater = loadAutoUpdater();
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };

    // The startup check is deliberately silent about everything except an update being
    // there — but from the moment the user clicks "Download and install", every outcome
    // is an answer to something they asked for, and a download that fails after that must
    // not be as quiet as the check that preceded it.
    let owedAnAnswer = trigger === "manual";
    // One report per check. electron-updater emits `error` *and* rejects the promise the
    // failing call returned, so a failed download reaches this from two directions; the
    // flag is set synchronously because the first arrival is still inside `showMessageBox`
    // when the second gets here, and `settled` cannot stand in for it.
    let reported = false;
    const fail = (error: unknown): void => {
      if (reported) return;
      reported = true;
      void reportError(owedAnAnswer ? "manual" : "startup", error).then(finish);
    };

    autoUpdater.once("update-available", (info) => {
      void (async () => {
        const answer = await announce({
          type: "info",
          title: "Update available",
          message: `emqnote ${info.version} is available (you have ${app.getVersion()}).`,
          buttons: ["Download and install", "Later"],
          defaultId: 0,
          cancelId: 1,
        });

        if (answer.response !== 0) {
          finish();
          return;
        }
        owedAnAnswer = true;
        await autoUpdater.downloadUpdate();
      })().catch(fail);
    });

    autoUpdater.once("update-downloaded", () => {
      void (async () => {
        const answer = await announce({
          type: "info",
          title: "Update downloaded",
          message: "Restart emqnote now to finish installing?",
          buttons: ["Restart now", "Later"],
          defaultId: 0,
          cancelId: 1,
        });

        if (answer.response !== 0) {
          finish();
          return;
        }
        owedAnAnswer = true;
        await beforeInstall();
        autoUpdater.quitAndInstall();
        finish();
      })().catch(fail);
    });

    autoUpdater.once("update-not-available", () => {
      void reportUpToDate(trigger).then(finish);
    });

    autoUpdater.once("error", fail);

    // The rejection is the same failure the `error` event above already reports, so this
    // catch is only here to keep it from surfacing as an unhandled rejection alongside the
    // dialog. `fail` is idempotent through `finish`, so letting both run would be correct
    // too — but reporting one failure twice is not.
    autoUpdater.checkForUpdates().catch(() => {});
  });
}
