import { app, dialog, shell } from "electron";
import { isNewerVersion, parseLatestRelease } from "./update-check.js";

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
  if (process.platform === "win32") {
    await checkWindows(trigger);
  } else {
    await checkMac(trigger);
  }
}

async function reportError(trigger: "startup" | "manual", error: unknown): Promise<void> {
  if (trigger !== "manual") return;
  await dialog.showMessageBox({
    type: "error",
    title: "Could not check for updates",
    message: "Checking GitHub for the latest release failed.",
    detail: error instanceof Error ? error.message : String(error),
  });
}

async function reportUpToDate(trigger: "startup" | "manual"): Promise<void> {
  if (trigger !== "manual") return;
  await dialog.showMessageBox({
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

  const answer = await dialog.showMessageBox({
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
  const { autoUpdater } = await import("electron-updater");
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };

    autoUpdater.once("update-available", (info) => {
      void (async () => {
        const answer = await dialog.showMessageBox({
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
        await autoUpdater.downloadUpdate();
      })();
    });

    autoUpdater.once("update-downloaded", () => {
      void (async () => {
        const answer = await dialog.showMessageBox({
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
        await beforeInstall();
        autoUpdater.quitAndInstall();
        finish();
      })();
    });

    autoUpdater.once("update-not-available", () => {
      void reportUpToDate(trigger).then(finish);
    });

    autoUpdater.once("error", (error) => {
      void reportError(trigger, error).then(finish);
    });

    void autoUpdater.checkForUpdates();
  });
}
