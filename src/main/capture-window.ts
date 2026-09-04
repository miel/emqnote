import { app, BrowserWindow, screen } from "electron";
import { titleBarColours, windowBackground } from "./window-background.js";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { IPC, type ShowPayload, type StatusPayload } from "../shared/ipc.js";
import { beginMeasurement } from "./latency.js";
import { installEditorKeyClaims } from "./editor-keys.js";
import { installKeyProbe } from "./key-probe.js";
import { getLibraryWindow } from "./library-window.js";

const here = fileURLToPath(new URL(".", import.meta.url));

/**
 * The capture window is created and rendered at startup, then kept hidden rather than
 * destroyed.
 *
 * That is the whole trick behind "near-instant": the hotkey does nothing but `show()`
 * and `focus()`. Nothing is loaded, nothing is built, nothing is scanned. It is what
 * Outlook effectively does too — that window is only fast because the program is
 * already running.
 */

let window: BrowserWindow | null = null;

/**
 * Set once, from `before-quit`, so the `close` handler below knows the difference
 * between "the user dismissed the note window" (hide it, keep the app resident) and
 * "the app is actually exiting" (let the window really close, or the tray's "Quit
 * emqnote" would hang forever waiting for a close that `preventDefault()` never lets
 * happen).
 */
let quitting = false;

export function setQuitting(value: boolean): void {
  quitting = value;
}

/**
 * The note window's shape, and why it is portrait.
 *
 * It was 720×440 — a 3×5 index card on its side, which is the wrong picture entirely: the
 * thing being replaced is an Outlook message, and the thing it is used as is a notepad.
 * Landscape also spent the window's height on chrome and its width on line length, so the
 * body ended up around 270px tall, four or five visible paragraphs, in the one window
 * whose whole content is the body. 600×720 roughly doubles that (`.editor` is `flex: 1`
 * and the only elastic row, so every pixel of window height lands in the body) and gives
 * a shape near letter-paper proportions.
 *
 * Clamped to the display's work area rather than trusted: 720 tall fits a 1366×768 laptop
 * screen only just, and a window taller than the space it is opened into is one whose
 * status bar — Discard, Insert, Help — is off the bottom edge with no way to reach it.
 * `workAreaSize` is already net of the menu bar, the dock and the taskbar, so the margin
 * here is only a border of breathing room.
 *
 * The minimums exist for the same reason and did not before: the status bar is a flex row
 * with no `flex-wrap`, and the header is a four-column grid, so a window dragged narrow
 * enough squeezes both into illegibility rather than reflowing.
 */
const CAPTURE_WIDTH = 600;
const CAPTURE_HEIGHT = 720;
const CAPTURE_MIN_WIDTH = 460;
const CAPTURE_MIN_HEIGHT = 360;
const SCREEN_MARGIN = 60;

export function createCaptureWindow(): BrowserWindow {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const created = new BrowserWindow({
    width: Math.max(CAPTURE_MIN_WIDTH, Math.min(CAPTURE_WIDTH, workArea.width - SCREEN_MARGIN)),
    height: Math.max(
      CAPTURE_MIN_HEIGHT,
      Math.min(CAPTURE_HEIGHT, workArea.height - SCREEN_MARGIN),
    ),
    minWidth: CAPTURE_MIN_WIDTH,
    minHeight: CAPTURE_MIN_HEIGHT,
    show: false,
    // **Every platform's own window controls, drawn into our 40px header band.**
    //
    // macOS has always had its real traffic lights here; Windows and Linux got three
    // buttons the renderer drew itself, in `TitleBar.tsx`, because `frame: false` leaves
    // a window with no controls and no grab area at all. Those never matched the OS, and
    // on Windows 11 they cost the snap-layouts flyout that hovering the real maximise
    // button opens.
    //
    // `titleBarOverlay` is the answer Chromium grew for exactly this: the frame is hidden
    // but the caption buttons are still the system's, drawn over the top-right of the page
    // in colours we hand it. The window keeps its system menu, its snap layouts, and its
    // Alt+Space. `height: 40` is the band's own height, so they sit inside it rather than
    // pushing it down. Colours from `titleBarColours`, re-pushed by `applyTheme` when the
    // theme changes (B90) — they are on screen for as long as the window is.
    //
    // The close button means *save and put away* on both, which is what the `close`
    // handler below is for: the same contract `IPC.captureClose` has always had.
    //
    // Linux keeps its native frame: `titleBarOverlay` is a no-op there, and hiding the
    // frame without it would lose the window manager's own controls.
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hidden" as const, trafficLightPosition: { x: 12, y: 12 } }
      : process.platform === "win32"
        ? {
            titleBarStyle: "hidden" as const,
            titleBarOverlay: { ...titleBarColours(), height: 40 },
          }
        : {}),
    resizable: true,
    // The note window belongs in Alt+Tab. It stays open until dismissed, so treating
    // it as a transient popup that cannot be switched back to was simply wrong.
    skipTaskbar: false,
    // Not always on top. The window stays open until you dismiss it, so pinning it
    // above everything else would mean it permanently covers whatever you switch to.
    alwaysOnTop: false,
    title: "emqnote",
    backgroundColor: windowBackground(),
    webPreferences: {
      preload: join(here, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      // Chromium puts hidden windows to sleep. That is exactly wrong for a window
      // whose only purpose is to appear instantly.
      backgroundThrottling: false,
    },
  });

  created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Switching away saves, it does not close.
  //
  // The first version hid the window on blur, and that was wrong: you alt-tab to look
  // something up during a meeting and your notes vanish. A note window stays open
  // until you say otherwise — Outlook's new-message window works exactly this way, and
  // that window is the thing being replaced.
  created.on("blur", () => {
    if (created.isVisible()) onBlur();
  });

  // The window controls are the platform's on both platforms now (see `titleBarStyle`
  // above), so the close button would otherwise destroy this BrowserWindow outright — and
  // the module only ever holds one, assigned once below and never reassigned, so every
  // path built on `window` (the hotkey's `reveal()`, "New note", the library's
  // double-click-to-edit) would find it destroyed forever. Treat a close exactly like
  // `IPC.captureClose` already does: commit through `onHide()` — the save-and-put-away
  // contract this window has always had — and keep the window around, hidden.
  //
  // This is what let the renderer stop drawing its own three buttons: the real Close now
  // means the same thing that one did.
  created.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    hideCaptureWindow();
  });

  // Before the claim below, deliberately: listeners run in the order they were added, so
  // this is what lets `--key-probe` record a key that is about to be claimed as well as
  // one that is not. A no-op without the flag.
  installKeyProbe(created.webContents, "capture");

  // The chords main claims ahead of the page. This window has never had a
  // `before-input-event` handler, and it is the window notes are actually written in —
  // see `editor-keys.ts` for why the claim is here rather than in the keymap.
  installEditorKeyClaims(created.webContents);

  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer !== undefined) {
    void created.loadURL(devServer);
  } else {
    void created.loadFile(join(here, "../renderer/index.html"));
  }

  window = created;
  return created;
}

export function getCaptureWindow(): BrowserWindow | null {
  return window;
}

type Handler = () => void;

let onHide: Handler = () => {};
let onBlur: Handler = () => {};

export function setHideHandler(handler: Handler): void {
  onHide = handler;
}

/** Called when the window loses focus: save what is there, keep the note open. */
export function setBlurHandler(handler: Handler): void {
  onBlur = handler;
}

/**
 * True when it was the *library* that brought this window up, so committing hands focus
 * back to it (B98).
 *
 * The report is one Alt+Tab: Mod+N in the library opens the capture window, Ctrl+Enter
 * files the note, and focus then goes wherever the OS decides — which is not the window
 * the gesture started in. What makes this answerable at all is that the distinction was
 * already here and simply not written down: `showCaptureWindow` is the hotkey, the tray
 * and the second instance, and `focusCaptureWindow` is the library's two routes and
 * nothing else (`IPC.captureNew`, `IPC.captureLoad`).
 *
 * **It is consumed, and both entries write it.** A hotkey capture taken from Outlook an
 * hour after a library one must not drag the library into the foreground, so
 * `showCaptureWindow` clears the flag rather than leaving `hideCaptureWindow` to be the
 * only writer. That is also what keeps `selftest.ts` — which drives show/hide in a loop
 * of fifty — from raising a window on every iteration.
 *
 * The flag lives beside the two handlers above rather than inside `reveal`, because
 * `reveal`'s own parameter is about latency and says nothing about who asked.
 */
let raisedByLibrary = false;

/**
 * Shows the window and starts the measurement.
 *
 * The order is deliberate: window to the front first, only then the message to the
 * renderer. On Windows a background process may not simply take the foreground;
 * because the call originates from a global shortcut the OS usually permits it, and
 * `moveTop` covers the cases where it still resists.
 */
export function showCaptureWindow(): void {
  raisedByLibrary = false;
  reveal(beginMeasurement());
}

/**
 * Shows the window without starting a measurement: the library's "New note" button and
 * double-click-to-edit both bring this window up too, and folding them into the hotkey
 * budget would quietly widen the rolling 200-sample window `stats()` reports with opens
 * the acceptance criterion never meant to cover.
 *
 * `completeMeasurement` looks the token up in `pending` and answers `null` for one that
 * was never begun, which is what keeps the eventual `capture:painted` round trip a
 * no-op instead of a special case.
 */
export function focusCaptureWindow(): void {
  raisedByLibrary = true;
  reveal(-1);
}

function reveal(token: number): void {
  const target = window;
  if (target === null || target.isDestroyed()) {
    // Should not happen now that `close` above keeps the window alive — but a stale
    // build, a crash, or some other native teardown outside our control could still
    // leave `window` pointing at a destroyed BrowserWindow, and the old behaviour here
    // (silently returning) bricked the hotkey and "New note" until the app was
    // restarted. Recreating and waiting for the fresh window to paint turns that into
    // one slow appearance instead of a dead shortcut; not a cost the hot path pays,
    // since it only runs when the window is already gone.
    const created = createCaptureWindow();
    created.once("ready-to-show", () => reveal(token));
    return;
  }

  if (process.platform === "darwin") {
    // A menu bar app has no dock icon and therefore does not receive keyboard focus
    // on its own.
    app.focus({ steal: true });
  }

  // Windows will not let a background process take the foreground on request. Raising
  // the window as always-on-top wins that argument; the flag is dropped again as soon
  // as the window actually has focus, so it does not stay pinned above everything.
  //
  // This used to be cleared on a 250 ms timer, which was worse than it looked: the
  // window is shown far more often than every 250 ms, so a timer from one appearance
  // would fire during the next and fight it. That is the most likely explanation for
  // the one 814 ms outlier in an otherwise flat run of fifty. An event beats a guess.
  if (!target.isVisible()) {
    target.setAlwaysOnTop(true);
    target.once("focus", () => {
      if (!target.isDestroyed()) target.setAlwaysOnTop(false);
    });
    target.show();
    target.moveTop();
  }

  target.focus();
  target.webContents.send(IPC.captureShow, { token } satisfies ShowPayload);
}

export function hideCaptureWindow(): void {
  const target = window;
  if (target === null || target.isDestroyed() || !target.isVisible()) return;

  const returnToLibrary = raisedByLibrary;
  raisedByLibrary = false;

  // **Before the hide, and only for the hotkey's own route**: hand the foreground back to
  // whatever had it (`TEST-PROTOCOL.md` §52c, and the Alt+F4 half of the same report;
  // §59 records the pass both came out of).
  //
  // B98 answered this for the library's two routes and left the hotkey's alone on the
  // reasoning that the OS decides — which it does, and on Windows it decided nothing at
  // all. Filing a note from Outlook left the foreground on no window: Tab did nothing,
  // and an Alt+Tab was needed to get back to the application the note had just been
  // written about. `reveal` is why: this window takes the foreground from a background
  // process by raising itself always-on-top, and a window that took the foreground that
  // way leaves it nowhere when it goes.
  //
  // `blur()` is `HWNDMessageHandler::Deactivate()` on Windows, which walks the Z-order
  // and hands the foreground to the next visible window — which is the one the hotkey was
  // pressed over. It costs a `blur` event, and that event's handler is `writer.flush()`:
  // a save that was about to happen a line later through `onHide()` anyway.
  //
  // Windows only. macOS returns to the previous application on its own when a window is
  // ordered out, and Linux is the window manager's business; `blur()` on either is at
  // best a no-op and at worst an argument with a policy that already works.
  if (!returnToLibrary && process.platform === "win32") target.blur();

  target.hide();
  onHide();
  target.webContents.send(IPC.captureReset);

  // After the hide, deliberately: raising the library while this window is still on
  // screen would blur it, and `blur` above saves. Hidden first, the save has already
  // happened through `onHide()` and the handler has nothing left to do.
  if (returnToLibrary) returnFocusToLibrary();
}

/**
 * Hands the foreground back to the library window, if there still is one.
 *
 * `getLibraryWindow` rather than `showLibraryWindow`: that one *creates* the window when
 * there is none, and a note being filed is not a request to open the note browser. A
 * library closed while the capture window was up simply gets nothing, which is the
 * behaviour every other capture has.
 *
 * `app.focus({ steal: true })` for `reveal`'s reason one screen up — with no library
 * window this app runs as a macOS accessory, and although the policy is `regular` again
 * while one exists (`library-window.ts`'s `closed` handler flips it back), the app has
 * just hidden its own frontmost window and a plain `focus()` on a second one is not
 * reliably enough to bring the application forward with it.
 */
function returnFocusToLibrary(): void {
  const library = getLibraryWindow();
  if (library === null || library.isDestroyed()) return;

  if (process.platform === "darwin") app.focus({ steal: true });
  if (library.isMinimized()) library.restore();
  library.focus();
}

export function sendStatus(status: StatusPayload): void {
  const target = window;
  if (target === null || target.isDestroyed()) return;
  target.webContents.send(IPC.captureStatus, status);
}
