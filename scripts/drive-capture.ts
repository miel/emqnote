/**
 * Drives the **capture window** in the real app, under a display, over CDP.
 *
 *   npm run drive:capture                     # headless, via xvfb-run
 *   npm run drive:capture -- --keep           # leave the vault behind to look at
 *   npm run drive:capture -- --screenshot=/tmp/capture.png
 *
 * Why this exists, and what it is *not*. `test/helpers/capture.ts` mounts this window's
 * renderer in jsdom, which answers every question about state and wiring and none about
 * pixels: jsdom loads no images, computes no layout, and reports every rectangle as zero.
 * The questions left over are the ones four separate features have tripped on — does the
 * capture window actually *draw* an attachment, does the caret really walk across it, do
 * the header fields really have room — and each needs a real renderer with a real
 * compositor behind it.
 *
 * The capture window has been reachable this way since 15 August 2026 (`HISTORY.md`); what
 * it never had was a repeatable way in. That is all this is: the session that was driven by
 * hand, written down so it can be run again and can fail out loud.
 *
 * Deliberately not part of `npm test`. It needs a display, it takes seconds rather than
 * milliseconds, and the suite has to stay cheap enough to run on every change.
 *
 * No new dependency: Node has `fetch` and `WebSocket` as globals, so CDP is just a socket,
 * and `check:bundle` stays quiet. Nothing in `src/` changes for this — the app already
 * offers every hook it needs.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Chromium's own switch — the app neither knows nor needs to know about it. */
const DEBUG_PORT = 9333;

/** `DEFAULT_HOTKEY` in `src/shared/ipc.ts`, spelled the way `xdotool` spells it. */
const HOTKEY = "ctrl+shift+y";

const NOTE = "2026-08-22 1200 Driven note.md";
const PICTURE = "driven-picture.png";

const keep = process.argv.includes("--keep");
const screenshot =
  process.argv.find((argument) => argument.startsWith("--screenshot="))?.slice(13) ?? null;

// ---------------------------------------------------------------- the fixture vault

/**
 * A 2×2 red PNG, byte for byte.
 *
 * Written out rather than fetched or generated, because the assertion downstream is
 * `naturalWidth !== 0` — the picture has to be one a real Chromium will genuinely decode,
 * and a placeholder that only looks like a PNG would make the whole run pass for the wrong
 * reason. Small enough to inline; real enough to decode.
 */
const RED_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4" +
    "GBgYGJAQ0AACxKAQdaSVpzAAAAAElFTkSuQmCC",
  "base64",
);

function scaffoldVault(): string {
  const vault = mkdtempSync(join(tmpdir(), "emqnote-drive-"));
  mkdirSync(join(vault, "00 Inbox"), { recursive: true });
  mkdirSync(join(vault, "_attachments"), { recursive: true });

  writeFileSync(join(vault, "_attachments", PICTURE), RED_PNG);
  writeFileSync(
    join(vault, "00 Inbox", NOTE),
    [
      "---",
      "type: quick",
      "title: Driven note",
      "created: 2026-08-22T12:00:00+02:00",
      "tags:",
      "  - klantx",
      "---",
      "",
      "# Driven note",
      "",
      `![[${PICTURE}]]`,
      "",
      "Tekst na de afbeelding, met een #klantx erin.",
      "",
    ].join("\n"),
  );

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
 * Raises the hidden capture window with the real global accelerator.
 *
 * Not a CDP call, and not a code path added for testing: showing the window is main's
 * business, and the hotkey is how a person asks for it. `globalShortcut` works on a bare
 * `Xvfb` — Electron grabs on the root window — so this exercises the whole path, hotkey
 * included, rather than reaching past it.
 */
function pressHotkey(display: string): void {
  spawnSync("xdotool", ["key", "--clearmodifiers", HOTKEY], {
    stdio: "inherit",
    env: { ...process.env, DISPLAY: display },
  });
}

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

async function main(): Promise<number> {
  const vault = scaffoldVault();
  console.log(`vault: ${vault}`);

  const { display, server } = await startX();
  console.log(`display: ${display}`);

  const app: ChildProcess = spawn(
    "node_modules/.bin/electron",
    [
      "out/main/index.js",
      `--vault=${vault}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
    ],
    // Its own process group, so the teardown below can take the whole tree down. Killing
    // the pid alone leaves the Electron children running, and that is not a tidiness point
    // but the next run's failure: the survivor still holds `--remote-debugging-port`, and
    // the port bind then fails with something that reads like a bug in the app.
    //
    // `--user-data-dir` is deliberately left alone: an unpackaged `out/main/index.js` run
    // writes to `~/.config/Electron`, not `~/.config/emqnote`, which is worth knowing
    // before reading any settings back by hand.
    { stdio: ["ignore", "pipe", "pipe"], detached: true, env: { ...process.env, DISPLAY: display } },
  );

  // Electron on a headless Linux prints dbus and GPU warnings that are not failures. Kept
  // out of the way unless the run itself goes wrong, where they are the first thing worth
  // reading.
  const noise: string[] = [];
  app.stdout?.on("data", (chunk: Buffer) => noise.push(chunk.toString()));
  app.stderr?.on("data", (chunk: Buffer) => noise.push(chunk.toString()));

  // Held on an object rather than in two `let`s, and that is a typing point rather than a
  // style one: a `let` only ever assigned inside a callback stays narrowed to `null` for
  // the code after the loop, so every later use would be an error. A property's narrowing
  // is invalidated by the intervening `step.run()` call, which is exactly right here.
  const open: { capture: Session | null; library: Session | null } = {
    capture: null,
    library: null,
  };
  let failed: { step: string; why: string } | null = null;

  const steps: Step[] = [
    {
      name: "the real hotkey puts the capture window on screen",
      run: async () => {
        // The library opens by itself on a deliberate launch (B61); wait for it first, so
        // the app is past startup before the accelerator is pressed.
        await findTarget("library.html");
        const target = await findTarget("index.html");
        open.capture = await Session.open(target);

        pressHotkey(display);
        await new Promise((done) => setTimeout(done, 1_500));
        if (!isMapped(display)) {
          throw new Error("no emqnote window reports Map State: IsViewable");
        }
        return "mapped";
      },
    },
    {
      name: "a handed-over note draws its picture, with pixels in it",
      run: async () => {
        open.library = await Session.open(await findTarget("library.html"));
        // The same IPC a double-click in the note list ends in.
        await open.library.evaluate(
          `window.emqnote.library.openInCapture(${JSON.stringify(`00 Inbox/${NOTE}`)})`,
        );
        await new Promise((done) => setTimeout(done, 1_500));

        const width = await open.capture!.evaluate<number>(
          `(() => {
             const img = document.querySelector('img.wiki-embed-image');
             return img === null ? -1 : img.naturalWidth;
           })()`,
        );

        // `naturalWidth`, not the presence of an `<img>`. This is the assertion the whole
        // script is for: an element in the DOM proves the node view ran, and proves
        // nothing at all about whether the picture arrived and decoded. Four features have
        // been unverified on exactly that difference.
        if (width <= 0) throw new Error(`naturalWidth was ${width}`);
        return `naturalWidth ${width}`;
      },
    },
    {
      name: "the caret walks across the picture instead of vanishing",
      run: async () => {
        await open.capture!.evaluate(`document.querySelector('.ProseMirror').focus()`);
        const before = await open.capture!.evaluate<string>(
          `JSON.stringify([window.getSelection().anchorOffset, window.getSelection().isCollapsed])`,
        );

        for (let press = 0; press < 6; press += 1) {
          // eslint-disable-next-line no-await-in-loop
          await open.capture!.key("ArrowRight", { windowsVirtualKeyCode: 39, code: "ArrowRight" });
        }
        await new Promise((done) => setTimeout(done, 300));

        const after = await open.capture!.evaluate<string>(
          `JSON.stringify([window.getSelection().anchorOffset, window.getSelection().isCollapsed])`,
        );
        // A caret that is *somewhere* after six presses. The rule it is checked against is
        // `image-caret.ts`'s and is unit-tested there; what could only be seen here is
        // whether the arrow reaches this window's editor at all.
        if (after === before) throw new Error(`the caret did not move: still ${after}`);
        return `${before} → ${after}`;
      },
    },
    {
      name: "the header's fields have real room on a real display",
      run: async () => {
        const widths = await open.capture!.evaluate<Record<string, number>>(
          `(() => {
             const out = {};
             for (const name of ['tags', 'location', 'attendees']) {
               const field = document.querySelector('input.' + name);
               out[name] = field === null ? -1 : Math.round(field.getBoundingClientRect().width);
             }
             return out;
           })()`,
        );

        // §34's "a field with no room": every rectangle is zero in jsdom, so this is one of
        // the few things only a compositor can answer. A field narrower than this cannot be
        // typed in, which is how it was reported.
        const cramped = Object.entries(widths).filter(([, width]) => width < 40);
        if (cramped.length > 0) {
          throw new Error(`cramped: ${cramped.map(([name, w]) => `${name} ${w}px`).join(", ")}`);
        }
        return Object.entries(widths)
          .map(([name, width]) => `${name} ${width}px`)
          .join(", ");
      },
    },
    {
      name: "a tag Mod+clicked in the capture window raises the library, filtered",
      run: async () => {
        // §21j, driven by hand once and never since. Ctrl on Linux.
        const clicked = await open.capture!.evaluate<boolean>(
          `(() => {
             const tag = [...document.querySelectorAll('.ProseMirror .tag')]
               .find((node) => node.textContent.includes('klantx'));
             if (tag === undefined) return false;
             const box = tag.getBoundingClientRect();
             for (const type of ['mousedown', 'mouseup', 'click']) {
               tag.dispatchEvent(new MouseEvent(type, {
                 bubbles: true, cancelable: true, ctrlKey: true,
                 clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
               }));
             }
             return true;
           })()`,
        );
        if (!clicked) throw new Error("no #klantx tag was drawn in the note body");

        await new Promise((done) => setTimeout(done, 1_500));
        // `.branch-on` inside a `.filter-section`: the selected facet row, the same class
        // `FilterSection.tsx` puts on it. Scoped to the filter sections on purpose — the
        // folder tree uses `.branch` and `.branch-on` too, and the selected *folder* is lit
        // whether or not a tag was ever clicked, so an unscoped selector would report a
        // pass for every run.
        const lit = await open.library!.evaluate<string | null>(
          `(() => {
             const row = document.querySelector('.filter-section .branch-on .branch-name');
             return row === null ? null : row.textContent.trim();
           })()`,
        );
        if (lit === null) throw new Error("no facet row is lit in the library");
        if (!lit.includes("klantx")) throw new Error(`the lit facet reads ${lit}`);
        return `library filtered on ${lit}`;
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

  if (screenshot !== null && open.capture !== null) {
    try {
      const shot = (await open.capture.send("Page.captureScreenshot", { format: "png" })) as {
        data?: string;
      };
      if (shot.data !== undefined) {
        writeFileSync(screenshot, Buffer.from(shot.data, "base64"));
        console.log(`screenshot: ${screenshot}`);
      }
    } catch {
      console.error("could not photograph the capture window");
    }
  }

  open.capture?.close();
  open.library?.close();
  await stop(app);
  await stop(server);

  if (failed !== null) {
    console.error("\n--- what the app printed ---");
    console.error(noise.join(""));
  }

  // The vault stays on a failure whatever `--keep` says: the evidence is the point, and
  // this is the one thing here that cannot be reconstructed afterwards.
  if (keep || failed !== null) console.log(`vault kept at ${vault}`);
  else rmSync(vault, { recursive: true, force: true });

  return failed === null ? 0 : 1;
}

process.exit(await main());
