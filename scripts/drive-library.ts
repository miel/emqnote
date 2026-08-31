/**
 * Drives the **library window** in the real app, under a display, over CDP.
 *
 *   npm run drive:library                      # headless, on a bare Xvfb
 *   npm run drive:library -- --keep            # leave the vault behind to look at
 *   npm run drive:library -- --screenshot=/tmp/library.png
 *
 * The counterpart of `drive-capture.ts`, and it exists for the same reason one screen
 * over: `test/` mounts this window's renderer in jsdom, which answers every question about
 * state and wiring and none about the ones B94 raised. Three of its steps *cannot* be
 * asked anywhere else in this repository:
 *
 *  - **Tab.** jsdom implements no sequential focus navigation at all, so every test of the
 *    keyboard order can only check the two steps this app performs itself and has to take
 *    the browser's word for the other five. Here a real Tab is pressed and the answer is
 *    read off `document.activeElement`.
 *  - **Dragging the note's title moves the window.** It is main that moves it, over
 *    `IPC.windowDrag`, and `window.screenX` is the only place the result shows up.
 *  - **The window's own drag region.** `-webkit-app-region` does not exist in jsdom — the
 *    class of bug `TODO.md` records twice, where a press inside a band went to the window
 *    move and never to the control under it.
 *
 * Deliberately not part of `npm test`, for `drive-capture.ts`'s reasons: a display, and
 * seconds rather than milliseconds.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Chromium's own switch, one port up from `drive-capture.ts` so the two can run at once. */
const DEBUG_PORT = 9334;

/**
 * Four notes in two folders, dated so the default `modified` sort reads Alfa → Delta.
 *
 * The titles are alphabetical *and* the dates are descending, which is what lets one list
 * answer both halves of the split sort chooser: reversing the direction turns it round,
 * and switching the key does not.
 */
const NOTES = [
  { folder: "00 Inbox", title: "Alfa", modified: "2026-08-20T12:00:00+02:00" },
  { folder: "00 Inbox", title: "Beta", modified: "2026-08-19T12:00:00+02:00" },
  { folder: "00 Inbox", title: "Gamma", modified: "2026-08-18T12:00:00+02:00" },
  { folder: "01 Projecten", title: "Delta", modified: "2026-08-17T12:00:00+02:00" },
];

function scaffoldVault(): string {
  const vault = mkdtempSync(join(tmpdir(), "emqnote-library-"));
  for (const folder of ["00 Inbox", "01 Projecten", "_attachments"]) {
    mkdirSync(join(vault, folder), { recursive: true });
  }

  for (const note of NOTES) {
    writeFileSync(
      join(vault, note.folder, `${note.title}.md`),
      [
        "---",
        "type: quick",
        `title: ${note.title}`,
        "created: 2026-08-15T09:00:00+02:00",
        "---",
        "",
        `Tekst in ${note.title}.`,
        "",
        // An empty box beside a real one: the Tasks view and every badge must count one.
        "- [ ] ",
        `- [ ] Iets doen in ${note.title}`,
        "",
      ].join("\n"),
    );
    // The mtime is what the default sort reads, and `writeFileSync` has just set it to now.
    spawnSync("touch", ["-d", note.modified, join(vault, note.folder, `${note.title}.md`)]);
  }

  return vault;
}

// ---------------------------------------------------------------- CDP, over a bare socket

interface Target {
  id: string;
  url: string;
  webSocketDebuggerUrl: string;
}

class Session {
  private next = 1;
  private readonly pending = new Map<number, (result: unknown) => void>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
      if (message.id === undefined) return;
      const settle = this.pending.get(message.id);
      this.pending.delete(message.id);
      settle?.(message.error === undefined ? message.result : new Error(message.error.message));
    });
  }

  static async open(target: Target): Promise<Session> {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((done, fail) => {
      socket.addEventListener("open", () => done(), { once: true });
      socket.addEventListener("error", () => fail(new Error("could not open the CDP socket")), {
        once: true,
      });
    });
    return new Session(socket);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.next++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((settle) => this.pending.set(id, settle));
  }

  /** Evaluates in the page and hands back the value, awaiting a promise if one comes back. */
  async evaluate<T>(expression: string): Promise<T> {
    const result = (await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as { result?: { value?: T }; exceptionDetails?: { text: string } };

    if (result instanceof Error) throw result;
    if (result.exceptionDetails !== undefined) {
      throw new Error(`page threw: ${result.exceptionDetails.text}`);
    }
    return result.result?.value as T;
  }

  async key(key: string, extra: Record<string, unknown> = {}): Promise<void> {
    for (const type of ["keyDown", "keyUp"]) {
      // eslint-disable-next-line no-await-in-loop
      await this.send("Input.dispatchKeyEvent", { type, key, ...extra });
    }
  }

  /**
   * Types characters the way a keyboard does — `text` on the `keyDown` is what makes
   * Chromium turn the event into input at all, and it is what `handleTextInput` (and so
   * B51's `/` menu, and every input rule in the app) is reached by. A bare `key` moves a
   * caret and writes nothing.
   */
  async type(text: string): Promise<void> {
    for (const character of text) {
      // eslint-disable-next-line no-await-in-loop
      await this.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        text: character,
        unmodifiedText: character,
        key: character,
      });
      // eslint-disable-next-line no-await-in-loop
      await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: character });
    }
  }

  /** A real pointer event at real coordinates, which is the whole reason this script exists. */
  async mouse(
    type: "mousePressed" | "mouseReleased" | "mouseMoved",
    x: number,
    y: number,
  ): Promise<void> {
    await this.send("Input.dispatchMouseEvent", {
      type,
      x: Math.round(x),
      y: Math.round(y),
      button: "left",
      buttons: type === "mouseReleased" ? 0 : 1,
      clickCount: type === "mouseMoved" ? 0 : 1,
    });
  }

  close(): void {
    this.socket.close();
  }
}

async function targets(): Promise<Target[]> {
  const answer = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  return (await answer.json()) as Target[];
}

/**
 * The capture window is the one whose URL ends in `index.html`.
 *
 * Named rather than taken by position: `library.html`, `pdfview.html` and `thumb.html` are
 * the other three, and which of them exists depends on what the run has done so far.
 */
async function findTarget(ending: string, within = 15_000): Promise<Target> {
  const deadline = Date.now() + within;
  for (;;) {
    try {
      const found = (await targets()).find((target) => target.url.split("?")[0]!.endsWith(ending));
      if (found !== undefined) return found;
    } catch {
      // The port is not listening yet; that is what the deadline is for.
    }
    if (Date.now() > deadline) throw new Error(`no window at ${ending} after ${within}ms`);
    await new Promise((done) => setTimeout(done, 250));
  }
}

// ---------------------------------------------------------------- X, without a window manager

/**
 * Starts an X server this run owns, and hands back its display and its process.
 *
 * `Xvfb` directly rather than `xvfb-run`, and the reason is authorisation rather than
 * taste. `xvfb-run` writes a fresh `Xauthority` into a temp directory and exports
 * `XAUTHORITY` to *its own child only*, so the app draws happily while every `xdotool` and
 * `xwininfo` this script runs is refused with "Authorization required, but no authorization
 * protocol specified" — a failure of the harness that reads exactly like a failure of the
 * window it is checking. A bare `Xvfb` with no `-auth` has nothing to refuse, and the
 * display number is then known here rather than chosen out of sight.
 *
 * There is no window manager on it. Nothing downstream may use `xdotool windowactivate`,
 * which aborts without `_NET_ACTIVE_WINDOW`; `windowfocus` is the one that works, and a
 * window has to be mapped before it can even be focused.
 */
async function startX(): Promise<{ display: string; server: ChildProcess }> {
  for (let number = 90; number < 130; number += 1) {
    if (existsSync(`/tmp/.X${number}-lock`)) continue;

    const display = `:${number}`;
    const server = spawn("Xvfb", [display, "-screen", "0", "1280x800x24", "-nolisten", "tcp"], {
      stdio: "ignore",
      detached: true,
    });

    // The socket, not the lock file: the lock appears before the server is listening.
    const deadline = Date.now() + 5_000;
    while (!existsSync(`/tmp/.X11-unix/X${number}`)) {
      if (Date.now() > deadline || server.exitCode !== null) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((done) => setTimeout(done, 100));
    }
    if (existsSync(`/tmp/.X11-unix/X${number}`)) return { display, server };

    await stop(server);
  }

  throw new Error("could not start an X server on any display between :90 and :129");
}

/**
 * Whether the capture window is genuinely on screen.
 *
 * `xwininfo`'s Map State, not `xdotool getwindowgeometry`, which answers for a hidden
 * window too — and this window is hidden by design for all but a few seconds a day, so a
 * check that cannot tell the two apart would pass before the hotkey was ever pressed.
 * There is no window manager here: nothing may use `xdotool windowactivate`, which aborts
 * without `_NET_ACTIVE_WINDOW`.
 */
function isMapped(display: string): boolean {
  const on = { encoding: "utf8" as const, env: { ...process.env, DISPLAY: display } };
  const search = spawnSync("xdotool", ["search", "--name", "emqnote"], on);
  const ids = (search.stdout ?? "").trim().split("\n").filter(Boolean);
  return ids.some((id) => /Map State:\s*IsViewable/.test(spawnSync("xwininfo", ["-id", id], on).stdout ?? ""));
}

/**
 * Takes down the app, the X server and everything either of them started.
 *
 * The negative pid is the whole point: it signals the process group, which is what
 * `detached: true` above created. SIGTERM first, and SIGKILL only for whatever is still
 * there a moment later — an Electron main process that is given no chance to exit leaves
 * its `Singleton` lock behind in the user-data directory.
 */
async function stop(app: ChildProcess): Promise<void> {
  if (app.pid === undefined) return;
  const ended = new Promise<void>((done) => app.once("exit", () => done()));

  try {
    process.kill(-app.pid, "SIGTERM");
  } catch {
    // Already gone.
  }

  await Promise.race([ended, new Promise((done) => setTimeout(done, 3_000))]);

  try {
    process.kill(-app.pid, "SIGKILL");
  } catch {
    // Which is the expected case: it exited on the SIGTERM.
  }
}


// ---------------------------------------------------------------- the steps

interface Step {
  name: string;
  run: () => Promise<string>;
}

const keep = process.argv.includes("--keep");
const screenshot =
  process.argv.find((argument) => argument.startsWith("--screenshot="))?.split("=")[1] ?? null;

async function main(): Promise<number> {
  const vault = scaffoldVault();
  console.log(`vault: ${vault}`);

  const { display, server } = await startX();
  console.log(`display: ${display}`);

  const app: ChildProcess = spawn(
    "node_modules/.bin/electron",
    ["out/main/index.js", `--vault=${vault}`, `--remote-debugging-port=${DEBUG_PORT}`],
    { stdio: ["ignore", "pipe", "pipe"], detached: true, env: { ...process.env, DISPLAY: display } },
  );

  const noise: string[] = [];
  app.stdout?.on("data", (chunk: Buffer) => noise.push(chunk.toString()));
  app.stderr?.on("data", (chunk: Buffer) => noise.push(chunk.toString()));

  const open: { library: Session | null } = { library: null };
  let failed: { step: string; why: string } | null = null;

  /** The centre of one element, in the window's own coordinates. */
  const centre = async (selector: string): Promise<{ x: number; y: number }> => {
    const box = await open.library!.evaluate<{ x: number; y: number } | null>(
      `(() => {
         const node = document.querySelector(${JSON.stringify(selector)});
         if (node === null) return null;
         const r = node.getBoundingClientRect();
         return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
       })()`,
    );
    if (box === null) throw new Error(`nothing at ${selector}`);
    return box;
  };

  const click = async (
    selector: string,
    modifiers = 0,
  ): Promise<void> => {
    const at = await centre(selector);
    await open.library!.send("Input.dispatchMouseEvent", {
      type: "mousePressed", x: Math.round(at.x), y: Math.round(at.y),
      button: "left", buttons: 1, clickCount: 1, modifiers,
    });
    await open.library!.send("Input.dispatchMouseEvent", {
      type: "mouseReleased", x: Math.round(at.x), y: Math.round(at.y),
      button: "left", buttons: 0, clickCount: 1, modifiers,
    });
    await settle();
  };

  const settle = (ms = 400): Promise<unknown> => new Promise((done) => setTimeout(done, ms));

  /** The note titles as the list reads them, top to bottom. */
  const listed = (): Promise<string[]> =>
    open.library!.evaluate<string[]>(
      `[...document.querySelectorAll('.notes-list .note-title')].map((n) => n.textContent)`,
    );

  /** What has focus, described the way a person would describe it. */
  const focused = (): Promise<string> =>
    open.library!.evaluate<string>(
      `(() => {
         const node = document.activeElement;
         if (node === null) return "nothing";
         const classes = node.className === "" ? "" : "." + String(node.className).split(" ").join(".");
         return node.tagName.toLowerCase() + classes;
       })()`,
    );

  const steps: Step[] = [
    {
      name: "the library window is on screen with its four notes",
      run: async () => {
        open.library = await Session.open(await findTarget("library.html"));
        await settle(2_000);
        if (!isMapped(display)) throw new Error("no emqnote window reports Map State: IsViewable");
        const titles = await listed();
        if (titles.length !== 3) throw new Error(`the Inbox lists ${titles.join(", ")}`);
        return titles.join(" / ");
      },
    },
    {
      name: "an empty checkbox is not counted as a task",
      run: async () => {
        // Every note carries one empty box and one real one. The badge counts the real
        // ones only — which is a question about the index and the scan, so it is asked of
        // the running app rather than of a fixture.
        const badges = await open.library!.evaluate<string[]>(
          `[...document.querySelectorAll('.notes-list .note-tasks')].map((n) => n.textContent)`,
        );
        const wrong = badges.filter((badge) => !badge.endsWith(": 1"));
        if (badges.length !== 3 || wrong.length > 0) {
          throw new Error(`badges read ${badges.join(", ")}`);
        }
        return badges.join(", ");
      },
    },
    {
      name: "the sort chooser is two controls, and neither is in the tab order",
      run: async () => {
        const seen = await open.library!.evaluate<{ direction: number; choose: number; label: string }>(
          `(() => {
             const direction = document.querySelector('.notes .sort-direction');
             const choose = document.querySelector('.notes .sort-choose');
             return {
               direction: direction === null ? -99 : direction.tabIndex,
               choose: choose === null ? -99 : choose.tabIndex,
               label: choose === null ? "" : choose.textContent,
             };
           })()`,
        );
        if (seen.direction !== -1 || seen.choose !== -1) {
          throw new Error(`tabIndex ${seen.direction} / ${seen.choose}`);
        }
        return `${seen.label}, both out of the tab order`;
      },
    },
    {
      name: "pressing the arrows turns the list over",
      run: async () => {
        const before = await listed();
        await click(".notes .sort-direction");
        const after = await listed();
        if (after.join() !== [...before].reverse().join()) {
          throw new Error(`${before.join(" / ")} became ${after.join(" / ")}`);
        }
        await click(".notes .sort-direction");
        return `${before.join(" / ")} ⇄ ${after.join(" / ")}`;
      },
    },
    {
      name: "Ctrl+click marks two rows, and the menu is about the set",
      run: async () => {
        await click(".notes-list .note:nth-of-type(1)");
        await click(".notes-list .note:nth-of-type(2)", 2 /* Ctrl */);
        const marked = await open.library!.evaluate<number>(
          `document.querySelectorAll('.notes-list .note-marked').length`,
        );
        if (marked !== 2) throw new Error(`${marked} rows marked`);

        const at = await centre(".notes-list .note:nth-of-type(2)");
        await open.library!.send("Input.dispatchMouseEvent", {
          type: "mousePressed", x: Math.round(at.x), y: Math.round(at.y),
          button: "right", buttons: 2, clickCount: 1,
        });
        await open.library!.send("Input.dispatchMouseEvent", {
          type: "mouseReleased", x: Math.round(at.x), y: Math.round(at.y),
          button: "right", buttons: 0, clickCount: 1,
        });
        await settle();

        const items = await open.library!.evaluate<string[]>(
          `[...document.querySelectorAll('.context-menu-label')].map((n) => n.textContent)`,
        );
        if (items.length !== 2 || items[0]?.includes("2") !== true) {
          throw new Error(`the menu offers ${items.join(", ")}`);
        }
        await open.library!.key("Escape");
        await settle();
        return items.join(" / ");
      },
    },
    {
      name: "Escape drops the marks, and a plain click opens one note again",
      run: async () => {
        await open.library!.evaluate(
          `document.querySelector('.notes-list .note[tabindex="0"]').focus()`,
        );
        await open.library!.key("Escape");
        await settle();
        const marked = await open.library!.evaluate<number>(
          `document.querySelectorAll('.notes-list .note-marked').length`,
        );
        if (marked !== 0) throw new Error(`${marked} rows still marked`);
        return "none marked";
      },
    },
    {
      name: "a real Tab walks folders → notes → title → When → Tags → Where → Who → note",
      run: async () => {
        // The step that cannot be asked anywhere else: jsdom implements no sequential
        // focus navigation, so every jsdom test of this order checks the two steps the app
        // performs itself and takes the browser's word for the other five.
        await open.library!.evaluate(`document.querySelector('.tree [tabindex="0"]').focus()`);
        const walk: string[] = [await focused()];
        for (let i = 0; i < 7; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await open.library!.key("Tab", { windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
          // eslint-disable-next-line no-await-in-loop
          await settle(150);
          // eslint-disable-next-line no-await-in-loop
          walk.push(await focused());
        }
        const wanted = ["branch", "note", "pane-title", "created", "tags", "location", "attendees", "editor-content"];
        const missed = wanted.filter((want, index) => walk[index]?.includes(want) !== true);
        if (missed.length > 0) throw new Error(`walked ${walk.join(" → ")}`);
        return walk.join(" → ");
      },
    },
    {
      name: "and Shift+Tab walks back down it",
      run: async () => {
        // From Who, which is where a Ctrl+Shift+Tab out of the note lands you next to.
        await open.library!.evaluate(`document.querySelector('.header-reader .attendees').focus()`);
        const walk: string[] = [await focused()];
        for (let i = 0; i < 4; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await open.library!.key("Tab", {
            windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: 8,
          });
          // eslint-disable-next-line no-await-in-loop
          await settle(150);
          // eslint-disable-next-line no-await-in-loop
          walk.push(await focused());
        }
        const wanted = ["attendees", "location", "tags", "created", "pane-title"];
        const missed = wanted.filter((want, index) => walk[index]?.includes(want) !== true);
        if (missed.length > 0) throw new Error(`walked ${walk.join(" → ")}`);
        return walk.join(" → ");
      },
    },
    {
      name: "Mod+Shift+W reaches When from inside the note",
      run: async () => {
        await open.library!.evaluate(`document.querySelector('.editor-content').focus()`);
        await open.library!.key("w", {
          windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87, modifiers: 2 | 8,
        });
        await settle();
        const where = await focused();
        if (!where.includes("created")) throw new Error(`focus is on ${where}`);
        return where;
      },
    },
    {
      name: "Mod+T opens the Tasks view, counting only the boxes with something written on them",
      run: async () => {
        await open.library!.key("t", {
          windowsVirtualKeyCode: 84, nativeVirtualKeyCode: 84, modifiers: 2,
        });
        await settle(800);
        const rows = await open.library!.evaluate<string[]>(
          `[...document.querySelectorAll('.task-list .task-row .task-row-title')].map((n) => n.textContent)`,
        );
        if (rows.length === 0) throw new Error("the Tasks view lists nothing at all");
        const empty = rows.filter((row) => row.trim() === "");
        if (empty.length > 0) throw new Error(`${empty.length} of ${rows.length} rows name no task`);
        await open.library!.key("Escape");
        await settle();
        return `${rows.length} rows, none of them empty`;
      },
    },
    {
      name: "Mod+S opens the sort chooser's own menu, under the button",
      run: async () => {
        await open.library!.key("s", {
          windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2,
        });
        await settle();
        const items = await open.library!.evaluate<string[]>(
          `[...document.querySelectorAll('.context-menu-label')].map((n) => n.textContent)`,
        );
        if (items.length !== 3) throw new Error(`the menu offers ${items.join(", ")}`);
        await open.library!.key("Escape");
        await settle();
        return items.join(" / ");
      },
    },
    {
      name: "Mod+/ opens the shortcut sheet, and / searches it",
      run: async () => {
        await open.library!.key("/", {
          windowsVirtualKeyCode: 191, nativeVirtualKeyCode: 191, modifiers: 2,
        });
        await settle();
        const before = await open.library!.evaluate<number>(
          `document.querySelectorAll('.help-row').length`,
        );
        if (before < 20) throw new Error(`the sheet drew ${before} rows`);

        await open.library!.key("/", { windowsVirtualKeyCode: 191, nativeVirtualKeyCode: 191 });
        await settle(150);
        const caret = await focused();
        if (!caret.includes("help-search")) throw new Error(`/ left focus on ${caret}`);

        await open.library!.type("ctrl alt t");
        await settle();
        const rows = await open.library!.evaluate<string[]>(
          `[...document.querySelectorAll('.help-row dt')].map((n) => n.textContent)`,
        );
        if (rows.length !== 1) throw new Error(`"ctrl alt t" left ${rows.join(", ")}`);

        // And the two columns fit inside the panel, which is the other half of B94's
        // change to `balanceColumns` and the half no row count can see.
        const fits = await open.library!.evaluate<{ panel: number; content: number }>(
          `(() => {
             const groups = document.querySelector('.help-groups');
             return { panel: groups.clientHeight, content: groups.scrollHeight };
           })()`,
        );
        await open.library!.key("Escape");
        await settle(150);
        await open.library!.key("Escape");
        await settle();
        return `${before} rows → ${rows[0]}, sheet ${fits.content}px in ${fits.panel}px`;
      },
    },
    {
      name: "the shortcut sheet's two columns are within a group of each other",
      run: async () => {
        await open.library!.key("/", {
          windowsVirtualKeyCode: 191, nativeVirtualKeyCode: 191, modifiers: 2,
        });
        await settle();
        const columns = await open.library!.evaluate<number[]>(
          `[...document.querySelectorAll('.help-column')].map((c) => Math.round(c.getBoundingClientRect().height))`,
        );
        await open.library!.key("Escape");
        await settle();
        if (columns.length !== 2) throw new Error(`${columns.length} columns`);
        const gap = Math.abs((columns[0] ?? 0) - (columns[1] ?? 0));
        if (gap > 60) throw new Error(`columns ${columns.join(" and ")} px`);
        return `${columns.join("px and ")}px`;
      },
    },
    {
      name: "dragging the note's title moves the window; clicking it opens the rename",
      run: async () => {
        await click(".notes-list .note:nth-of-type(1)");
        const before = await open.library!.evaluate<number>(`window.screenX`);
        const at = await centre(".reader-header .pane-title");

        await open.library!.send("Input.dispatchMouseEvent", {
          type: "mousePressed", x: Math.round(at.x), y: Math.round(at.y),
          button: "left", buttons: 1, clickCount: 1,
        });
        for (const step of [20, 40, 60]) {
          // eslint-disable-next-line no-await-in-loop
          await open.library!.send("Input.dispatchMouseEvent", {
            type: "mouseMoved", x: Math.round(at.x + step), y: Math.round(at.y),
            button: "left", buttons: 1,
          });
          // eslint-disable-next-line no-await-in-loop
          await settle(80);
        }
        await open.library!.send("Input.dispatchMouseEvent", {
          type: "mouseReleased", x: Math.round(at.x + 60), y: Math.round(at.y),
          button: "left", buttons: 0, clickCount: 1,
        });
        await settle(600);

        // **The window moves further than the pointer did, and that is the harness rather
        // than the app.** CDP dispatches at *client* coordinates, so each move lands at a
        // fixed point inside a window that is itself moving right — which a real pointer
        // held still would not do. What is being checked is that the window moved at all
        // and that the rename stayed shut, not the distance.
        const after = await open.library!.evaluate<number>(`window.screenX`);
        const renaming = await open.library!.evaluate<boolean>(
          `document.querySelector('.reader-title-input') !== null`,
        );
        if (renaming) throw new Error("a drag opened the rename");
        if (after - before < 40) throw new Error(`the window moved ${after - before}px`);

        // And the press that does not travel is still a click.
        await click(".reader-header .pane-title");
        const editing = await open.library!.evaluate<boolean>(
          `document.querySelector('.reader-title-input') !== null`,
        );
        if (!editing) throw new Error("a click did not open the rename");
        await open.library!.key("Escape");
        await settle();
        return `window moved ${after - before}px, click still renames`;
      },
    },
    {
      name: "the settings panel fits the window, however short it is",
      run: async () => {
        await open.library!.send("Browser.setWindowBounds", {
          windowId: 1, bounds: { height: 520 },
        }).catch(() => undefined);
        await settle(400);
        await open.library!.key(",", {
          windowsVirtualKeyCode: 188, nativeVirtualKeyCode: 188, modifiers: 2,
        });
        await settle(600);
        const seen = await open.library!.evaluate<{
          panel: number; content: number; bottom: number; window: number; updates: boolean;
        } | null>(
          `(() => {
             const panel = document.querySelector('.settings');
             if (panel === null) return null;
             const box = panel.getBoundingClientRect();
             return {
               panel: Math.round(box.height),
               content: panel.scrollHeight,
               bottom: Math.round(box.bottom),
               window: window.innerHeight,
               updates: [...panel.querySelectorAll('button')].some((b) => /update/i.test(b.textContent)),
             };
           })()`,
        );
        if (seen === null) throw new Error("Mod+, opened nothing");
        if (seen.bottom > seen.window) {
          throw new Error(`the panel ends ${seen.bottom - seen.window}px below the window`);
        }
        if (!seen.updates) throw new Error("no update check in the panel");
        await open.library!.key("Escape");
        await settle();
        return `${seen.content}px of rows scrolling inside ${seen.panel}px, in a ${seen.window}px window`;
      },
    },
  ];

  for (const step of steps) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const detail = await step.run();
      console.log(`  ok    ${step.name} — ${detail}`);
    } catch (error) {
      failed = { step: step.name, why: error instanceof Error ? error.message : String(error) };
      console.error(`  FAIL  ${step.name} — ${failed.why}`);
      break;
    }
  }

  if (screenshot !== null && open.library !== null) {
    try {
      const shot = (await open.library.send("Page.captureScreenshot", { format: "png" })) as {
        data?: string;
      };
      if (shot.data !== undefined) {
        writeFileSync(screenshot, Buffer.from(shot.data, "base64"));
        console.log(`screenshot: ${screenshot}`);
      }
    } catch {
      console.error("could not photograph the library window");
    }
  }

  open.library?.close();
  await stop(app);
  await stop(server);

  if (failed !== null) {
    console.error("\n--- what the app printed ---");
    console.error(noise.join(""));
  }

  if (keep || failed !== null) console.log(`vault kept at ${vault}`);
  else rmSync(vault, { recursive: true, force: true });

  return failed === null ? 0 : 1;
}

process.exit(await main());
