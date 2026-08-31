import { app, BrowserWindow } from "electron";
import { titleBarColours, windowBackground } from "./window-background.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { IPC } from "../shared/ipc.js";
import { matches, shortcut } from "../shared/shortcuts.js";
import { installEditorKeyClaims } from "./editor-keys.js";
import { installKeyProbe } from "./key-probe.js";

const here = fileURLToPath(new URL(".", import.meta.url));

/**
 * The library window: browse the vault, open a note, tidy up.
 *
 * Created on demand rather than kept warm. Unlike the capture window nobody is waiting
 * on it with a thought half-formed — you go there deliberately, and a few hundred
 * milliseconds when it opens costs nothing. Keeping it out of memory until it is asked
 * for also keeps the resident footprint down on a work laptop.
 */

let window: BrowserWindow | null = null;

export function showLibraryWindow(): void {
  if (window !== null && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return;
  }

  // On macOS the app runs as an accessory with no dock icon, which is right for a
  // capture tool. A real window you browse in belongs in the dock and the app switcher
  // for as long as it is open.
  if (process.platform === "darwin") app.setActivationPolicy("regular");

  const created = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: "emqnote",
    backgroundColor: windowBackground(),
    // **Frameless, with the platform's own controls inside the three panes' header band.**
    //
    // The three headers are one 40px line across the top of this window now, and an OS
    // title bar above them would be a fourth strip saying nothing — 28 to 32px spent on
    // the word "emqnote". Hidden, the controls move down into the band: traffic lights
    // inset on macOS, `titleBarOverlay` on Windows 11. `.pane-header-lights` and
    // `.pane-header-caption` are what keep the tree's and the note pane's contents clear
    // of them.
    //
    // `titleBarOverlay` rather than `frame: false` on Windows, deliberately: the caption
    // buttons stay the system's, which keeps the snap-layouts flyout that opens on
    // hovering maximise, and the window keeps its system menu. Its colours are pushed
    // again by `applyTheme` when the theme changes (B90).
    //
    // `autoHideMenuBar` is gone with the frame. It was here because on Windows the
    // application menu `installMinimalMenu` sets is drawn as a real strip inside the
    // frame — an "Edit" bar above the folder tree, which is what was reported — and a
    // frameless window draws no menu bar at all. The menu itself stays: on macOS it is
    // the app's, not the window's, and `installMinimalMenu`'s own comment says why it has
    // to exist. Its Edit accelerators are Chromium's own on Windows, which is the one
    // thing here that wants a look on real hardware (`TEST-PROTOCOL.md`).
    //
    // Linux keeps its native frame: `titleBarOverlay` is a no-op there and hiding the
    // frame would lose the window manager's controls for nothing.
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hidden" as const, trafficLightPosition: { x: 12, y: 12 } }
      : process.platform === "win32"
        ? {
            titleBarStyle: "hidden" as const,
            titleBarOverlay: { ...titleBarColours(), height: 40 },
          }
        : { autoHideMenuBar: true }),
    webPreferences: {
      preload: join(here, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });

  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer !== undefined) {
    void created.loadURL(`${devServer}/library.html`);
  } else {
    void created.loadFile(join(here, "../renderer/library.html"));
  }

  created.once("ready-to-show", () => {
    created.show();
    created.focus();
  });

  // If the renderer fails to load, "ready-to-show" never fires and the window stays
  // invisible with no clue why. Say so rather than sit there.
  created.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`[library] failed to load ${url}: ${description} (${code})`);
    created.show();
  });

  created.webContents.on("console-message", (_event, _level, message) => {
    console.error(`[library renderer] ${message}`);
  });

  // First, so `--key-probe` sees a key before anything below claims it. A no-op unless
  // the flag is set.
  installKeyProbe(created.webContents, "library");

  /**
   * Ctrl-Tab / Ctrl-Shift-Tab, claimed before anything else in the window can have it.
   *
   * The renderer used to listen for this itself, and on Windows it did nothing at all —
   * reported, and never explained. It was *measured* arriving normally on Linux, and the
   * binding spells `Ctrl` literally (`shortcuts.ts`), so it is not the comparison reading
   * the platform wrong. `before-input-event` is the earliest point anything in this
   * window can be claimed from: it runs ahead of every native accelerator and ahead of the
   * page, so it is the one place a fix can stand without knowing what it is standing
   * against. The Windows menu bar, removed in the same batch, is the other candidate and
   * would also be covered from here.
   *
   * `matches` against the registry rather than comparing fields by hand: this is the same
   * chord the help sheet prints, and two spellings of one binding is how they drift.
   * `preventDefault` is what makes this a replacement rather than a second route — the
   * `keydown` never fires, so `Library.tsx` has exactly one path into the ring.
   */
  created.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    const cycling = matches(shortcut("cyclePanes"), {
      key: input.key,
      ctrlKey: input.control,
      metaKey: input.meta,
      shiftKey: input.shift,
      altKey: input.alt,
    }, process.platform === "darwin");

    if (!cycling) return;
    event.preventDefault();
    created.webContents.send(IPC.libraryCyclePanes, { backward: input.shift });
  });

  // The editor chords claimed on the same argument, one file over: this window draws the
  // same ProseMirror editor in its reader pane.
  installEditorKeyClaims(created.webContents);

  created.on("closed", () => {
    window = null;
    // Back to a menu bar app once the last real window is gone.
    if (process.platform === "darwin") app.setActivationPolicy("accessory");
  });

  window = created;
}

export function getLibraryWindow(): BrowserWindow | null {
  return window;
}

/**
 * Photographs one of our own windows.
 *
 * `capturePage` rather than a screen grab: it captures only this window, needs no
 * screen-recording permission, and — the reason it exists — never records whatever else
 * happens to be on the user's desktop.
 *
 * Which window it is comes from the caller, so `--screenshot` on its own photographs the
 * capture window and `--library --screenshot` the library. Being unable to look at the
 * capture window is how a layout change to the one window that has to be perfect goes
 * unnoticed.
 */
export async function captureWindowTo(
  target: BrowserWindow | null,
  file: string,
  openNoteTitled?: string,
  clickButton?: string,
): Promise<boolean> {
  if (target === null || target.isDestroyed()) return false;

  if (openNoteTitled !== undefined) {
    await target.webContents.executeJavaScript(`
      (() => {
        const titles = [...document.querySelectorAll('.note-title')];
        const match = titles.find((node) => node.textContent.includes(${JSON.stringify(openNoteTitled)}));
        match?.closest('.note')?.click();
        return match !== undefined;
      })()
    `);
    await new Promise((done) => setTimeout(done, 900));
  }

  // `>` separates a sequence: "Tags>#klantx" unfolds the tag list and then picks one.
  // Anything worth photographing two levels in needs two clicks, and `>` cannot occur in
  // a folder name (Windows forbids it) or in a tag name.
  for (const label of clickButton === undefined ? [] : clickButton.split(">")) {
    await target.webContents.executeJavaScript(`
      (() => {
        // Folder rows too, not only buttons: the tree is where most of what is worth
        // photographing lives, and Trash is a row rather than a button. A row is matched
        // on its name element — its own textContent carries the note count as well, so
        // "Trash" would never equal "Trash2". A menu item (".context-menu-label") is the
        // same idea one level down: its own textContent concatenates the checkmark, the
        // label and the shortcut, so "Actions>Rename" would never match with only that — see
        // CLAUDE.md's context-menu constraint for why a plain button opening a menu is a
        // route this has to be able to follow.
        //
        // An open menu is searched *instead of* the page, not alongside it, and that is
        // the load-bearing half: the folder toolbar's own buttons read "Rename" and
        // "Delete" too (Library.tsx passes library.rename/library.delete to both it and
        // the reader menu), and they come first in document order. Searching the whole
        // page would make "Actions>Delete" click *Delete folder* — the destructive neighbour
        // of the item that was asked for. A step after the one that opened a menu can
        // only have meant something in that menu.
        //
        // (No backticks in this comment: it lives inside the template literal below.)
        const menu = document.querySelector('.context-menu');
        const targets = [...(menu ?? document).querySelectorAll('button, .branch')];
        // An icon-only button carries its name on aria-label instead of in its text —
        // the folder tree's three and the note list's magnifier, since the header bands
        // took over from the toolbars. Text first regardless, so nothing about the
        // buttons that do have words changes; the fallbacks only answer for an element
        // whose own text is empty. ChromeButton is what guarantees there is always a
        // name to find: see its label prop.
        const name = (node) => {
          const own =
            (node.querySelector('.branch-name') ?? node.querySelector('.context-menu-label') ?? node)
              .textContent.trim();
          return own !== '' ? own : (node.getAttribute('aria-label') ?? node.title ?? '').trim();
        };
        const match = targets.find((node) => name(node) === ${JSON.stringify(label.trim())});
        match?.click();
        return match !== undefined;
      })()
    `);
    await new Promise((done) => setTimeout(done, 600));
  }

  const image = await target.webContents.capturePage();
  await writeFile(file, image.toPNG());
  return true;
}
