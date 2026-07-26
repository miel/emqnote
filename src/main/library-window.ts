import { app, BrowserWindow } from "electron";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
    backgroundColor: "#1e1f22",
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
        // "Trash" would never equal "Trash2".
        const targets = [...document.querySelectorAll('button, .branch')];
        const name = (node) => (node.querySelector('.branch-name') ?? node).textContent.trim();
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
