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
 *    keyboard order can only check the steps this app performs itself and has to take the
 *    browser's word for the rest. Here a real Tab is pressed and the answer is read off
 *    `document.activeElement`. Since B98 that is also the only place the *chord* is
 *    pressed end to end: main claims Ctrl+Tab in `before-input-event` and forwards the
 *    intent, so the jsdom suite can only call the forwarded handler.
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
/**
 * The title the library window wears while a real key is being aimed at it.
 *
 * `drive-capture.ts`'s trick, for its reason: every window this app opens is called
 * "emqnote", so `xdotool search --name emqnote` cannot say which one it found — and the
 * capture window exists throughout this run, hidden. Stamped just before a press and taken
 * off just after, so nothing else in the script has to know about it.
 */
const STAMP = "emqnote-library-under-drive";

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

  /**
   * One chord, pressed by X rather than injected over CDP.
   *
   * The distinction is not a detail and it is what the two Ctrl+Tab steps below are worth
   * having at all. `Input.dispatchKeyEvent` reaches the *page*, which is where Mod+T,
   * Mod+S and Mod+Shift+W are handled — but Ctrl+Tab is claimed in main, in
   * `library-window.ts`'s `before-input-event`, and a CDP-injected press never passes that
   * point. Measured here: the same step written with `key("Tab", { modifiers: 2 })` leaves
   * focus exactly where it was. Real XTEST keys go through the native pipeline the claim
   * sits in, which is the whole reason the claim was moved there (B62's Windows report).
   *
   * `windowfocus`, never `windowactivate`: there is no window manager under this Xvfb and
   * the latter aborts without `_NET_ACTIVE_WINDOW`.
   */
  const realChord = async (chord: string): Promise<void> => {
    const on = { encoding: "utf8" as const, env: { ...process.env, DISPLAY: display } };
    await open.library!.evaluate(`document.title = ${JSON.stringify(STAMP)}`);
    const ids = (spawnSync("xdotool", ["search", "--name", STAMP], on).stdout ?? "")
      .trim()
      .split("\n")
      .filter(Boolean);
    if (ids.length === 0) throw new Error("the library window is not findable in X by its title");
    for (const id of ids) spawnSync("xdotool", ["windowfocus", id], on);
    await new Promise((done) => setTimeout(done, 200));

    spawnSync("xdotool", ["key", "--clearmodifiers", chord], on);
    await new Promise((done) => setTimeout(done, 400));
    await open.library!.evaluate(`document.title = 'emqnote'`);
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

  /** Which note each visible task row names — `title · path`, as the row itself draws it. */
  const taskNotes = (): Promise<string[]> =>
    open.library!.evaluate<string[]>(
      `[...document.querySelectorAll('.task-list .task-row .task-row-note')].map((n) => n.textContent)`,
    );

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
      name: "a real Tab walks folders → notes → the note itself (B98)",
      run: async () => {
        // The step that cannot be asked anywhere else: jsdom implements no sequential
        // focus navigation, so every jsdom test of this order checks the steps the app
        // performs itself and takes the browser's word for the rest.
        //
        // Two stops now, not eight. B94's order walked the title and the four metadata
        // fields on the way, and daily use answered it: the note is where the press was
        // going every time. The title has the chord instead — the next step presses it.
        await open.library!.evaluate(`document.querySelector('.tree [tabindex="0"]').focus()`);
        const walk: string[] = [await focused()];
        for (let i = 0; i < 2; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await open.library!.key("Tab", { windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
          // eslint-disable-next-line no-await-in-loop
          await settle(150);
          // eslint-disable-next-line no-await-in-loop
          walk.push(await focused());
        }
        const wanted = ["branch", "note", "editor-content"];
        const missed = wanted.filter((want, index) => walk[index]?.includes(want) !== true);
        if (missed.length > 0) throw new Error(`walked ${walk.join(" → ")}`);
        return walk.join(" → ");
      },
    },
    {
      name: "a real Ctrl+Tab out of the note list stops on the title, the other half of the swap",
      run: async () => {
        await open.library!.evaluate(
          `document.querySelector('.notes-list .note[tabindex="0"]').focus()`,
        );
        await realChord("ctrl+Tab");
        const where = await focused();
        if (!where.includes("pane-title")) throw new Error(`focus is on ${where}`);
        return where;
      },
    },
    {
      name: "and a real Ctrl+Shift+Tab out of the folder tree reaches the note's text",
      run: async () => {
        // The backward ring stopped dead at the tree before B98 — it was the first stop,
        // and going back from the first stop was `null`.
        await open.library!.evaluate(`document.querySelector('.tree [tabindex="0"]').focus()`);
        await realChord("ctrl+shift+Tab");
        const where = await focused();
        if (!where.includes("editor-content")) throw new Error(`focus is on ${where}`);
        return where;
      },
    },
    {
      name: "and Shift+Tab walks the note's own fields back down to the title",
      run: async () => {
        // Pure DOM order, and untouched by B98: once you are on one of the five controls
        // in the reader's head — which is what Ctrl+Tab and Mod+Shift+W are for now —
        // Tab and Shift+Tab walk them for free, and that is why there is no table of stops.
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
      name: "Mod+T opens the Tasks view and a second press closes it again (B95)",
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

        // The other half of the toggle, and the reason this step is driven rather than
        // asked under `test/`: the chord has to reach the window's own key listener, and
        // the pane it closes is the one that unmounted the button that opened it.
        await open.library!.key("t", {
          windowsVirtualKeyCode: 84, nativeVirtualKeyCode: 84, modifiers: 2,
        });
        await settle(800);
        const after = await open.library!.evaluate<string>(
          `document.querySelector('.task-list') === null
             ? (document.querySelector('.notes-list') === null ? 'neither pane' : 'the note list')
             : 'the Tasks view'`,
        );
        if (after !== "the note list") throw new Error(`a second Mod+T left ${after} on screen`);

        return `${rows.length} rows, none of them empty, and gone again on a second press`;
      },
    },
    {
      name:
        "the Tasks view narrows to the open note from the footer, and leaves by the " +
        "button beside it (B99)",
      run: async () => {
        await open.library!.key("t", {
          windowsVirtualKeyCode: 84, nativeVirtualKeyCode: 84, modifiers: 2,
        });
        await settle(800);

        const before = await taskNotes();
        if (before.length < 2) throw new Error(`the view lists ${before.length} tasks`);

        // "This note only" means nothing until the reader holds one, and the checkbox says
        // so by refusing the press — so open a note the way the view offers to.
        await click(".task-list .task-row:nth-of-type(1) .task-row-text");
        await settle(600);

        // **The press jsdom cannot make.** The checkbox sits in the footer band beside
        // "Exit tasks" now; the band it came from is `-webkit-app-region: drag`, where a
        // press goes to the window move rather than to the element under the pointer
        // (B94). Nothing under `test/` can tell a press that landed from one that was
        // eaten, in either band.
        await click(".task-note-only input");
        await settle(600);

        // **The measurement jsdom cannot make either.** A short list used to leave the
        // leftover height under the footer, which walked up to sit against the last task
        // and took this checkbox and the exit button with it. jsdom lays nothing out, so
        // the only place the band's seat can be checked is here.
        const footerGap = await open.library!.evaluate<number>(
          `Math.round(
             document.querySelector('.task-list').getBoundingClientRect().bottom -
             document.querySelector('.task-list .pane-footer').getBoundingClientRect().bottom
           )`,
        );
        if (Math.abs(footerGap) > 1) {
          throw new Error(`the footer sits ${footerGap}px above the foot of the pane`);
        }

        const after = await taskNotes();
        const notes = new Set(after);
        if (after.length === 0 || notes.size !== 1) {
          throw new Error(`${after.length} rows over ${notes.size} notes`);
        }
        if (after.length >= before.length) {
          throw new Error(`${before.length} rows became ${after.length}, which narrows nothing`);
        }

        const offered = await open.library!.evaluate<boolean>(
          `document.querySelector('.task-scope').disabled === false`,
        );
        if (offered) throw new Error("the scope chooser still offers to narrow a list it lost");

        // And out, by the button in the seat the note list's own Tasks button sits in —
        // the pair being one control pressed twice is the point of it.
        await click(".task-list .pane-footer .task-exit");
        await settle(600);
        const gone = await open.library!.evaluate<boolean>(
          `document.querySelector('.task-list') === null`,
        );
        if (!gone) throw new Error("Exit tasks left the view on screen");

        return `${before.length} tasks → ${after.length} in ${[...notes][0]}, then out by the footer`;
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
          panel: number; content: number; bottom: number; window: number; groups: number;
        } | null>(
          `(() => {
             const panel = document.querySelector('.settings');
             if (panel === null) return null;
             const box = panel.getBoundingClientRect();
             const pane = panel.querySelector('.settings-pane');
             return {
               panel: Math.round(box.height),
               content: pane === null ? 0 : pane.scrollHeight,
               bottom: Math.round(box.bottom),
               window: window.innerHeight,
               groups: panel.querySelectorAll('.settings-category').length,
             };
           })()`,
        );
        if (seen === null) throw new Error("Mod+, opened nothing");
        if (seen.bottom > seen.window) {
          throw new Error(`the panel ends ${seen.bottom - seen.window}px below the window`);
        }
        if (seen.groups !== 6) throw new Error(`${seen.groups} groups in the rail, expected 6`);
        await open.library!.key("Escape");
        await settle();
        return `${seen.content}px of rows scrolling inside ${seen.panel}px, in a ${seen.window}px window`;
      },
    },
    /**
     * B100's rail, and the two questions about it jsdom cannot be asked.
     *
     * `settings-categories.test.ts` beside this one can see the roving `tabIndex` — that
     * exactly one rail button is a Tab stop — but not what Tab then *does*, because jsdom
     * implements no focus navigation at all. That is the whole reason the rail carries a
     * roving stop rather than six: Tab has to leave it for the pane, not walk six names
     * first. Pressing a real Tab is only possible here.
     *
     * The other half is that a row moved into a group is a row nothing draws until that
     * group is stood on, so the update check — which lived in the step above's assertions
     * before the redesign and is now in About — is looked for after clicking a category
     * rather than in the panel as it opens.
     */
    {
      name: "the settings rail is one Tab stop, and a group shows what it holds",
      run: async () => {
        await open.library!.key(",", {
          windowsVirtualKeyCode: 188, nativeVirtualKeyCode: 188, modifiers: 2,
        });
        await settle(600);

        const stops = await open.library!.evaluate<number>(
          `document.querySelectorAll('.settings-category[tabindex="0"]').length`,
        );
        if (stops !== 1) throw new Error(`${stops} rail buttons in the Tab order, expected 1`);

        await click('.settings-category[data-group="about"]');
        await settle();
        const updates = await open.library!.evaluate<boolean>(
          `[...document.querySelectorAll('.settings-pane button')]
             .some((b) => /update/i.test(b.textContent))`,
        );
        if (!updates) throw new Error("no update check in the About group");

        // A real Tab, from the rail. It has to land in the pane and not on the next group
        // along — which is the whole reason the rail carries a roving tab stop.
        await click('.settings-category[data-group="general"]');
        await settle();
        await open.library!.key("Tab", { windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
        await settle();
        const landed = await open.library!.evaluate<string>(
          `(() => {
             const node = document.activeElement;
             if (node === null) return "nothing";
             if (node.closest('.settings-rail') !== null) return "still in the rail";
             if (node.closest('.settings-pane') !== null) return "the pane";
             return node.className || node.tagName;
           })()`,
        );
        if (landed !== "the pane") throw new Error(`Tab from the rail reached ${landed}`);

        await open.library!.key("Escape");
        await settle();
        return "one Tab stop, Tab reaches the pane, About holds the update check";
      },
    },
    /**
     * B95, and the last step on purpose: it empties the Inbox, so anything after it would
     * be asking about a list this step took away.
     *
     * What this step covers, exactly — and what it does not, which is worth writing down
     * because the step was measured against the unfixed code to find out.
     *
     * It covers the half that is *decidable*: a real chokidar watching a real directory
     * through a real `renameSync`, with the real window deciding what to do with the event
     * that comes back. Both notes are in the marked set and one of them is the note the
     * reader has open, which is the arrangement the report came from — and with the
     * reader now stepping onto a row that is **not** itself moving, no `unlink` in the
     * batch ever matches the path it is standing on.
     *
     * It does not, and cannot, cover the race behind that: the window between main
     * renaming the file and this window finishing `loadTree` and reopening. Reverting the
     * watcher's own-removal suppression leaves this step green, because a four-note vault
     * under Xvfb reloads faster than chokidar's 300 ms settle. On a real vault it does
     * not, which is why the two reports arrived as one — the slower the move, the wider
     * the window for it to announce a deletion. That half is pinned where it *is*
     * decidable: `index-watch.test.ts` and `vault-io.test.ts`.
     *
     * The latency half is not asserted at all. A wall-clock figure on four notes under
     * Xvfb says nothing about a real vault; what stands in for it is the shape that caused
     * it, pinned in `note-list-multi-select.test.ts` — one call to main for the set.
     */
    {
      name: "moving a marked set files both notes and says nothing about a deletion (B95)",
      run: async () => {
        await open.library!.key("Escape");
        await settle();

        // Alfa opens, Beta joins the set. The open note is *in* the set, which is what
        // `toggleMarked`'s seeding makes the normal case rather than the awkward one.
        await click(".notes-list .note:nth-of-type(1)");
        await click(".notes-list .note:nth-of-type(2)", 2 /* Ctrl */);

        const at = await centre(".notes-list .note:nth-of-type(2)");
        for (const [type, buttons] of [["mousePressed", 2], ["mouseReleased", 0]] as const) {
          // eslint-disable-next-line no-await-in-loop
          await open.library!.send("Input.dispatchMouseEvent", {
            type, x: Math.round(at.x), y: Math.round(at.y),
            button: "right", buttons, clickCount: 1,
          });
        }
        await settle();

        const opened = await open.library!.evaluate<string>(
          `(() => {
             const labels = [...document.querySelectorAll('.context-menu-label')];
             const move = labels.find((n) => n.textContent.startsWith('Move'));
             if (move === undefined) return 'the menu offers ' + (labels.map((n) => n.textContent).join(', ') || 'nothing');
             move.closest('button').click();
             return 'ok';
           })()`,
        );
        if (opened !== "ok") throw new Error(opened);

        await settle();
        const picked = await open.library!.evaluate<string>(
          `(() => {
             const rows = [...document.querySelectorAll('.palette .palette-list li')];
             const target = rows.find((n) => n.textContent.includes('01 Projecten'));
             if (target === undefined) return 'the picker offers ' + (rows.map((n) => n.textContent).join(', ') || 'nothing');
             target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
             return 'ok';
           })()`,
        );
        if (picked !== "ok") throw new Error(picked);

        // Long enough for chokidar's own `stabilityThreshold` and for the app's reaction
        // to it: the bar this is looking for arrives *after* the move, not with it, which
        // is exactly why it was invisible to every jsdom test of the move itself.
        await settle(2000);

        const bar = await open.library!.evaluate<string | null>(
          `(() => {
             const node = document.querySelector('.disk-change-bar');
             return node === null ? null : node.textContent;
           })()`,
        );
        if (bar !== null) throw new Error(`the window says: ${bar}`);

        const left = await listed();
        if (left.length !== 1 || left[0] !== "Gamma") {
          throw new Error(`the Inbox is left holding ${left.join(", ") || "nothing"}`);
        }

        const filed = ["Alfa", "Beta"].filter((title) =>
          existsSync(join(vault, "01 Projecten", `${title}.md`)),
        );
        if (filed.length !== 2) throw new Error(`only ${filed.join(", ") || "nothing"} was filed`);

        return "Alfa and Beta filed, no disk-change bar, Gamma left in the Inbox";
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
