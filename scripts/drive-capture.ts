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
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Chromium's own switch — the app neither knows nor needs to know about it. */
const DEBUG_PORT = 9333;

/** `DEFAULT_HOTKEY` in `src/shared/ipc.ts`, spelled the way `xdotool` spells it. */
const HOTKEY = "ctrl+shift+y";

const NOTE = "2026-08-22 1200 Driven note.md";
const PICTURE = "driven-picture.png";
const PDF = "driven-document.pdf";
/**
 * A title the capture window wears for as long as one step needs to find it in X.
 *
 * Both windows are called "emqnote", so `xdotool search --name emqnote` answers with two
 * ids and no way to tell them apart — and focusing the wrong one sends the chord to the
 * library, where it does something else entirely and reports nothing.
 */
const STAMP = "emqnote-capture-under-drive";

const keep = process.argv.includes("--keep");
const screenshot =
  process.argv.find((argument) => argument.startsWith("--screenshot="))?.slice(13) ?? null;

// ---------------------------------------------------------------- the fixture vault

/**
 * A three-page PDF, built here rather than checked in.
 *
 * Same reasoning as `RED_PNG` one step further on: the assertion downstream is that pdf.js
 * genuinely rendered a page and that turning to another one produced a *different picture*,
 * so the file has to be one a real renderer will genuinely open. A checked-in binary would
 * do as well, but this is a hundred lines less repository and it can say out loud what
 * makes the pages differ.
 *
 * The pages differ by **area**, not only by a glyph: page n is drawn with a filled bar n
 * times as tall. Counting dark pixels can then tell them apart, which is what §17b asks for
 * — "the page *picture* changes each time, not only the counter" — and what a changed `src`
 * would not have shown.
 *
 * The xref offsets are computed rather than written, because a table that is wrong by a
 * byte produces a file some readers open and others refuse, which is the worst kind of
 * fixture: one that fails somewhere else, later, for a reason that looks like the app.
 */
function threePagePdf(): Buffer {
  const objects: string[] = [];
  const add = (body: string): void => {
    objects.push(body);
  };

  // Object numbers follow write order: 1 catalog, 2 pages, then a page and its content
  // stream per page (3/4, 5/6, 7/8), then the font at 9.
  add(`<< /Type /Catalog /Pages 2 0 R >>`);
  add(`<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>`);
  for (let page = 1; page <= 3; page += 1) {
    const contents = `${3 + (page - 1) * 2 + 1} 0 R`;
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents ${contents} ` +
        `/Resources << /Font << /F1 9 0 R >> >> >>`,
    );
    const stream =
      `0 0 0 rg\n20 20 160 ${page * 50} re f\n` +
      `BT /F1 24 Tf 30 175 Td (Page ${page}) Tj ET\n`;
    add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`);
  }
  add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const startxref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) pdf += `${String(at).padStart(10, "0")} 00000 n \n`;
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${startxref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

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

/**
 * B97's picture: a real GIF87a, in a note, labelled `image/png` — and the label is the
 * whole point.
 *
 * That is what Word and Outlook write. The one the bug was reported with is 1282×293 with
 * `Software: Microsoft Office` in its comment block and `data:image/png;base64,R0lGODdh…`
 * in front of it, and until B97 every such picture was refused for the mismatch: the note
 * drew a grey chip with the whole image sitting in its own text.
 *
 * Driven rather than unit-tested for the reason the step below says out loud: jsdom loads
 * no images, so nothing under `test/` can tell a decoded picture from an `<img>` element
 * that happens to exist. Small enough to inline, and a genuine GIF Chromium will decode —
 * the same standard `RED_PNG` above is held to.
 */
const OFFICE_GIF_DATA_URL =
  "data:image/png;base64,R0lGODdhAQABAIAAAAAAAAAAACwAAAAAAQABAAACAkQBADs=";

/**
 * The size the note states for it, which is a different thing from the size the file is.
 *
 * The reported note read `![|1282x293](data:…)` — Office writes the pair, not a bare
 * width — and those are the numbers, so that the ratio being asserted is one a human can
 * check against the report. The picture behind them is 1×1, deliberately: a stored size is
 * a statement about how to *draw* it and owes nothing to the pixels, which is the whole
 * reason a wrong height could stand for as long as it did.
 */
const OFFICE_GIF_WIDTH = 1282;
const OFFICE_GIF_HEIGHT = 293;

function scaffoldVault(): string {
  const vault = mkdtempSync(join(tmpdir(), "emqnote-drive-"));
  mkdirSync(join(vault, "00 Inbox"), { recursive: true });
  mkdirSync(join(vault, "_attachments"), { recursive: true });

  writeFileSync(join(vault, "_attachments", PICTURE), RED_PNG);
  writeFileSync(join(vault, "_attachments", PDF), threePagePdf());
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
      // B97: a base64 picture, in the shape Office writes one — a GIF behind an
      // `image/png` label. Nothing in jsdom can say whether it decodes; see the step.
      //
      // B98 gave it the `|WxH` suffix Office writes too, and that is the second step's
      // whole subject: the pair is what the report carried and what the old code turned
      // into an inline pixel height that could not follow the column down. 1282 is far
      // wider than this window's text column (the window's own minimum is 460), so
      // `max-width: 100%` is guaranteed to be doing something by the time it is measured.
      `![|${OFFICE_GIF_WIDTH}x${OFFICE_GIF_HEIGHT}](${OFFICE_GIF_DATA_URL})`,
      "",
      // B96: the two states of a task item, for the step that copies them. What a box
      // *is* on the clipboard cannot be asked of jsdom — the editor draws it as a widget
      // decoration, which is not part of the document, and the system clipboard is not
      // part of a test environment either.
      "- [ ] Open taak",
      "- [x] Afgeronde taak",
      "",
      // A table, for the one thing about B49 that no jsdom test can reach: a rectangle of
      // cells selected by *dragging*. `cellPointerAt` goes through `posAtCoords`, which
      // needs real boxes, so this is the pointer half of a feature whose keyboard half is
      // covered in `test/capture-table.test.ts`.
      "| Wie | Wat |",
      "| --- | --- |",
      "| Jan | offerte |",
      "| Piet | planning |",
      "",
      // §15k and §17h: the inline page and its bar have never been seen in this window at
      // all, because they arrive over `fetch()` on `emqnote-thumb://` and jsdom cannot
      // serve one — so no jsdom test can reach past the chip.
      `![[${PDF}]]`,
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
             const img = document.querySelector('img.wiki-embed-image[src^="emqnote-attachment:"]');
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
      name: "a base64 picture in the note draws too, label and all (B97)",
      run: async () => {
        const seen = await open.capture!.evaluate<string>(
          `(() => {
             const img = document.querySelector('img.wiki-embed-image[src^="emqnote-remote:"]');
             if (img === null) {
               const chip = document.querySelector('.external-image');
               return JSON.stringify({ width: -1, chip: chip === null ? null : chip.textContent });
             }
             return JSON.stringify({ width: img.naturalWidth, chip: null });
           })()`,
        );

        const { width, chip } = JSON.parse(seen) as { width: number; chip: string | null };
        // The failure this step exists to catch is the *chip*, not a missing element: a
        // refusal in main leaves the node view in the state it starts in, so the note goes
        // on looking deliberate while the picture it holds is never drawn. That is exactly
        // how the reported bug looked, and no test in the suite can see it — the capture
        // window's CSP allows no `data:` in `img-src`, so this whole path runs through main
        // and `emqnote-remote://`, and jsdom serves neither and decodes nothing.
        if (width <= 0) {
          throw new Error(
            chip === null
              ? "no base64 picture and no chip either"
              : `still a chip labelled ${JSON.stringify(chip)} — main refused the data: URL`,
          );
        }
        return `naturalWidth ${width}`;
      },
    },
    {
      name: "and it keeps its proportions when the column is narrower than it (B98)",
      run: async () => {
        // The one measurement this bug is actually about, and there is nowhere else to
        // take it: jsdom has no layout at all, so `test/image-stored-size.test.ts` can say
        // what lands in `img.style` and nothing about what the browser then draws.
        //
        // `![|1282x293]` in a column a few hundred pixels wide: `.wiki-embed-image` caps
        // the width at 100%, and before B98 the inline `height: 293px` stood while it did
        // — beating the stylesheet's own `height: auto`, as an inline declaration always
        // will — so the picture was drawn `column × 293` and squashed sideways as the
        // window moved. Backing the fix out puts the ratio at roughly 1.5 here, not 4.4.
        const seen = await open.capture!.evaluate<string>(
          `(() => {
             const img = document.querySelector('img.wiki-embed-image[src^="emqnote-remote:"]');
             if (img === null) return JSON.stringify({ width: 0, height: 0 });
             const rect = img.getBoundingClientRect();
             return JSON.stringify({ width: rect.width, height: rect.height });
           })()`,
        );

        const { width, height } = JSON.parse(seen) as { width: number; height: number };
        if (width <= 0 || height <= 0) throw new Error(`drawn ${width}×${height}`);
        // Narrower than the file asked for, or the cap is not engaged and the step is
        // measuring nothing.
        if (width >= OFFICE_GIF_WIDTH) {
          throw new Error(`drawn ${width}px wide — the column never capped it`);
        }

        const wanted = OFFICE_GIF_WIDTH / OFFICE_GIF_HEIGHT;
        const drawn = width / height;
        // A percent of slack for the 1px border and for subpixel rounding, and no more:
        // the failure being guarded against is off by a factor of three.
        if (Math.abs(drawn - wanted) / wanted > 0.02) {
          throw new Error(`drawn ${width}×${height} is ${drawn.toFixed(2)}:1, wanted ${wanted.toFixed(2)}:1`);
        }
        return `${Math.round(width)}×${Math.round(height)}, ${drawn.toFixed(2)}:1`;
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
    {
      name: "an embedded PDF draws a real page, with pixels in it (B43, §15k)",
      run: async () => {
        // The page arrives as a blob on an `<img>`, so `naturalWidth` is the same question
        // it is for the picture two steps up: an element in the DOM proves the node view
        // ran, and proves nothing about whether pdf.js drew anything. The bar underneath is
        // built only once main answers with a page count, so its counter is the second
        // half of the same fact.
        const seen = await open.capture!.evaluate<{
          width: number;
          counter: string | null;
          previousDisabled: boolean | null;
          navHidden: boolean | null;
          state: string | null;
        }>(
          `(async () => {
             const box = document.querySelector('.wiki-embed-pdf');
             const wait = async (ready) => {
               for (let tries = 0; tries < 60; tries += 1) {
                 if (ready()) return;
                 await new Promise((done) => setTimeout(done, 100));
               }
             };
             await wait(() => {
               const img = document.querySelector('img.wiki-embed-pdf-page');
               return img !== null && img.naturalWidth > 0;
             });
             const img = document.querySelector('img.wiki-embed-pdf-page');
             const nav = [...document.querySelectorAll('.wiki-embed-pdf-nav')];
             return {
               width: img === null ? -1 : img.naturalWidth,
               counter: document.querySelector('.wiki-embed-pdf-counter')?.textContent ?? null,
               previousDisabled: nav.length === 0 ? null : nav[0].disabled,
               navHidden: nav.length === 0 ? null : nav[0].hidden,
               state: box === null ? null : box.dataset.page ?? null,
             };
           })()`,
        );

        if (seen.width <= 0) {
          throw new Error(`no page drawn: naturalWidth ${seen.width}, box state ${seen.state}`);
        }
        // "/ 3", from `pdfPageCount`. A "/ –" means main never answered, which is a
        // different failure from a page that would not render.
        if (seen.counter === null || !seen.counter.includes("3")) {
          throw new Error(`the counter reads ${JSON.stringify(seen.counter)}, not "/ 3"`);
        }
        // §17a: ◀ is dimmed on page 1, and *not* hidden — hiding is what a one-page
        // document gets, and the two states must not be confused.
        if (seen.previousDisabled !== true) throw new Error("◀ is not dimmed on page 1");
        if (seen.navHidden === true) throw new Error("the arrows are hidden on a 3-page PDF");

        return `naturalWidth ${seen.width}, counter "${seen.counter}"`;
      },
    },
    {
      name: "▶ turns the page, and the picture really changes (§17b)",
      run: async () => {
        // Dark pixels counted off a canvas, not a changed `src`. The fixture's pages differ
        // by the height of a filled bar precisely so this can tell them apart — a `src`
        // that changed while the same picture stayed on screen is the failure this is for,
        // and it is the one the library-side check was built to catch too.
        const ink = `(() => {
             const img = document.querySelector('img.wiki-embed-pdf-page');
             if (img === null || img.naturalWidth === 0) return -1;
             const canvas = document.createElement('canvas');
             canvas.width = img.naturalWidth;
             canvas.height = img.naturalHeight;
             const context = canvas.getContext('2d');
             context.drawImage(img, 0, 0);
             const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
             let dark = 0;
             for (let at = 0; at < data.length; at += 4) {
               if (data[at] < 128 && data[at + 1] < 128 && data[at + 2] < 128) dark += 1;
             }
             return dark;
           })()`;

        const first = await open.capture!.evaluate<number>(ink);
        if (first <= 0) throw new Error(`no ink on page 1: ${first}`);
        // The blob the first page is drawn from, so the wait below can tell "the new
        // picture has arrived" from "the old one is still there and is perfectly decoded".
        // Waiting for `complete && naturalWidth` alone is satisfied by the page already on
        // screen, which is how this check first passed for the wrong reason and then
        // failed for the right one.
        const before = await open.capture!.evaluate<string>(
          `document.querySelector('img.wiki-embed-pdf-page')?.src ?? ''`,
        );

        // A real pointer at the arrow's real place, the same way the drag is done — and
        // measured immediately before the click for the same reason.
        const at = await open.capture!.evaluate<{ x: number; y: number } | null>(
          `(() => {
             const nav = document.querySelectorAll('.wiki-embed-pdf-nav');
             if (nav.length < 2) return null;
             nav[1].scrollIntoView({ block: 'center' });
             const box = nav[1].getBoundingClientRect();
             return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
           })()`,
        );
        if (at === null) throw new Error("no ▶ on the bar");

        await open.capture!.mouse("mousePressed", at.x, at.y);
        await open.capture!.mouse("mouseReleased", at.x, at.y);

        // The counter is a *box you can type into* plus a total beside it — the viewer
        // window's own markup, down to the input — so the page you are on is the input's
        // value and never the counter's text, which reads "/ 3" whatever page it is.
        const after = await open.capture!.evaluate<{ ink: number; page: string | null }>(
          `(async () => {
             const at = () => document.querySelector('.wiki-embed-pdf-counter input');
             for (let tries = 0; tries < 60; tries += 1) {
               if (at() !== null && at().value !== '1') break;
               await new Promise((done) => setTimeout(done, 100));
             }
             // The number moves when the request goes out; the picture arrives after it,
             // as a different blob.
             for (let tries = 0; tries < 60; tries += 1) {
               const img = document.querySelector('img.wiki-embed-pdf-page');
               if (img !== null && img.src !== ${JSON.stringify(before)} && img.complete && img.naturalWidth > 0) break;
               await new Promise((done) => setTimeout(done, 100));
             }
             return { ink: ${ink}, page: at() === null ? null : at().value };
           })()`,
        );

        if (after.page !== "2") throw new Error(`the page box reads ${after.page}, not 2`);
        if (after.ink <= 0) throw new Error(`page 2 drew nothing: ${after.ink}`);
        if (after.ink === first) {
          throw new Error(
            `the page box moved to ${after.page} and the picture did not change ` +
              `(${first} dark pixels both times) — a changed src is not a changed page`,
          );
        }

        return `page 1 ${first} dark px → page ${after.page} ${after.ink} dark px`;
      },
    },
    {
      name: "a rectangle of table cells comes out of a real drag (B49)",
      run: async () => {
        // The half `test/capture-table.test.ts` says out loud that it cannot reach.
        // Shift+arrow builds the same `CellSelection` and is covered there; this is
        // `cellPointerAt` → `posAtCoords`, which reads boxes and therefore only means
        // anything where boxes exist.
        //
        // **The cells are measured after a click, not before it, and that cost a run.**
        // `table-toolbar.ts` draws its bar as a widget decoration above the table, and it
        // appears the moment the caret enters a cell — so every row below it shifts down by
        // the height of a toolbar that did not exist when the coordinates were taken. A
        // drag aimed at the second row then lands in the first, and the failure reads as a
        // rectangle that would not grow downwards: the app behaving perfectly, measured
        // wrongly. Clicking first and re-measuring is the whole fix, and it is the sort of
        // thing that only exists once there are real boxes to be stale about.
        const measure = async (): Promise<{
          from: { x: number; y: number };
          to: { x: number; y: number };
          text: string[];
          viewport: { width: number; height: number };
        } | null> =>
          open.capture!.evaluate(
            `(() => {
             const cells = [...document.querySelectorAll('.ProseMirror table td, .ProseMirror table th')];
             if (cells.length < 4) return null;
             const centre = (node) => {
               const box = node.getBoundingClientRect();
               return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
             };
             // The header's first cell to the second column of the row below it: two by two.
             return {
               from: centre(cells[0]),
               to: centre(cells[3]),
               text: cells.map((node) => node.textContent),
               viewport: { width: window.innerWidth, height: window.innerHeight },
             };
           })()`,
          );

        const before = await measure();
        if (before === null) throw new Error("no table was drawn in the note body");

        // The click that brings the toolbar up, and so settles the layout the drag is
        // aimed at.
        await open.capture!.mouse("mousePressed", before.from.x, before.from.y);
        await open.capture!.mouse("mouseReleased", before.from.x, before.from.y);
        await new Promise((done) => setTimeout(done, 300));

        const corners = await measure();
        if (corners === null) throw new Error("the table went away when it was clicked");

        await open.capture!.mouse("mousePressed", corners.from.x, corners.from.y);
        // Two moves rather than one: a drag that jumps straight to its end has never
        // exercised the part that has to keep up, and the intermediate cell is where a
        // rectangle that only ever grows down the column would show.
        await open.capture!.mouse(
          "mouseMoved",
          (corners.from.x + corners.to.x) / 2,
          corners.from.y,
        );
        await open.capture!.mouse("mouseMoved", corners.to.x, corners.to.y);
        await open.capture!.mouse("mouseReleased", corners.to.x, corners.to.y);
        await new Promise((done) => setTimeout(done, 300));

        const picked = await open.capture!.evaluate<string[]>(
          `[...document.querySelectorAll('.table-cell-selected')].map((node) => node.textContent)`,
        );
        if (picked.length !== 4) {
          // The coordinates go with the count: a rectangle that came out the wrong shape and
          // a cell that was never on screen to be dragged to look identical from the count
          // alone, and only one of them is a bug in the app.
          throw new Error(
            `${picked.length} cells selected, not 4: ${JSON.stringify(picked)} — dragged ` +
              `(${Math.round(corners.from.x)},${Math.round(corners.from.y)}) → ` +
              `(${Math.round(corners.to.x)},${Math.round(corners.to.y)}) in a ` +
              `${corners.viewport.width}×${corners.viewport.height} viewport, cells ` +
              JSON.stringify(corners.text),
          );
        }
        return `dragged ${JSON.stringify(picked)}`;
      },
    },
    {
      name: "the / menu opens with room to open in, near the foot of the window (B51)",
      run: async () => {
        await open.capture!.evaluate(`document.querySelector('.ProseMirror').focus()`);

        // **This step needs a caret, and the one before it leaves a rectangle.** A step
        // inherits the selection its predecessor finished with, which is the selection
        // half of the lesson already written down about layout: a step that measures
        // anything owes the steps before it a settled state, and a step that *types*
        // owes itself a known selection.
        //
        // Ctrl+End is the reason it matters here rather than anywhere else. It is not
        // bound in any keymap: the browser performs it, on the native selection — and
        // `CellSelection` is `visible = false`, so while a rectangle is up there is no
        // native selection to move. The key then does nothing, the twenty-four Enters
        // land inside a cell, and the `/` replaces the rectangle instead of opening the
        // menu. It passed most of the time only because the rectangle usually stopped
        // being one first, and "usually" is what made this look like a flake for weeks.
        //
        // An arrow key is what dissolves it — those *are* handled, and one press collapses
        // a rectangle to a caret in the cell it left off at. Checked rather than assumed,
        // because the collapse goes through the same DOM read-back the rectangle itself
        // has to survive, and this script exists to stop guessing about exactly that.
        for (let attempt = 0; attempt < 10; attempt += 1) {
          // eslint-disable-next-line no-await-in-loop
          const rectangle = await open.capture!.evaluate<number>(
            `document.querySelectorAll('.table-cell-selected').length`,
          );
          if (rectangle === 0) break;
          // eslint-disable-next-line no-await-in-loop
          await open.capture!.key("ArrowRight", { windowsVirtualKeyCode: 39, code: "ArrowRight" });
          // eslint-disable-next-line no-await-in-loop
          await new Promise((done) => setTimeout(done, 100));
        }

        // To the end of the note, then far enough down that the panel cannot fit below the
        // caret — which is the case the flip exists for and the one no jsdom test can set
        // up, every box there being zero.
        await open.capture!.key("End", { modifiers: 2, windowsVirtualKeyCode: 35, code: "End" });
        for (let press = 0; press < 24; press += 1) {
          // eslint-disable-next-line no-await-in-loop
          await open.capture!.key("Enter", {
            text: "\r",
            windowsVirtualKeyCode: 13,
            code: "Enter",
          });
        }
        await open.capture!.type("/");
        await new Promise((done) => setTimeout(done, 400));

        const seen = await open.capture!.evaluate<{
          rows: number;
          panel: { top: number; bottom: number; left: number; right: number; height: number };
          caretTop: number;
          window: { width: number; height: number };
        } | null>(
          `(() => {
             const menu = document.querySelector('.slash-menu');
             if (menu === null) return null;
             const box = menu.getBoundingClientRect();
             const range = window.getSelection().getRangeAt(0).cloneRange();
             const caret = range.getBoundingClientRect();
             return {
               rows: menu.querySelectorAll('.context-menu-item').length,
               panel: { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height },
               caretTop: caret.top,
               window: { width: window.innerWidth, height: window.innerHeight },
             };
           })()`,
        );
        if (seen === null) throw new Error("no / menu opened in the capture window");
        if (seen.rows !== 16) throw new Error(`the panel drew ${seen.rows} rows, not 16`);
        if (seen.panel.height <= 0) throw new Error("the panel has no height");

        // The whole of it on screen. This is `TEST-PROTOCOL.md` §19t's mechanical half —
        // whether it *fits* — and it is the half a script can settle; whether the flip
        // looks graceful is still a person's to judge.
        const off: string[] = [];
        if (seen.panel.top < 0) off.push(`top ${Math.round(seen.panel.top)}`);
        if (seen.panel.left < 0) off.push(`left ${Math.round(seen.panel.left)}`);
        if (seen.panel.bottom > seen.window.height) {
          off.push(`bottom ${Math.round(seen.panel.bottom)} > ${seen.window.height}`);
        }
        if (seen.panel.right > seen.window.width) {
          off.push(`right ${Math.round(seen.panel.right)} > ${seen.window.width}`);
        }
        if (off.length > 0) throw new Error(`the panel hangs off the window: ${off.join(", ")}`);

        const side = seen.panel.top < seen.caretTop ? "above" : "below";
        return `16 rows, ${Math.round(seen.panel.height)}px tall, ${side} the caret, inside a ${seen.window.width}×${seen.window.height} window`;
      },
    },
    {
      // Last, because it presses Ctrl+A: every step above wants the caret where it left it.
      name: "a real Ctrl+C puts the box on the system clipboard (B96)",
      run: async () => {
        // Three things have to be real here and none of them can be faked from inside the
        // page. The chord goes through X rather than through `Input.dispatchKeyEvent`,
        // because what is being asked is whether the *system* clipboard ends up holding
        // it. The window has to hold X focus, which the hotkey does not guarantee and
        // `openInCapture` above certainly does not. And the clipboard is read by the app's
        // own `--dump-clipboard`, a second process alongside the running one, because
        // nothing inside the renderer may read the clipboard it just wrote.
        await open.capture!.evaluate(`document.title = ${JSON.stringify(STAMP)}`);
        await new Promise((done) => setTimeout(done, 400));

        const on = { encoding: "utf8" as const, env: { ...process.env, DISPLAY: display } };
        const ids = (spawnSync("xdotool", ["search", "--name", STAMP], on).stdout ?? "")
          .trim()
          .split("\n")
          .filter(Boolean);
        if (ids.length === 0) throw new Error("the capture window is not findable in X by its title");
        for (const id of ids) spawnSync("xdotool", ["windowfocus", id], on);

        await open.capture!.evaluate(`document.querySelector('.ProseMirror').focus()`);
        await new Promise((done) => setTimeout(done, 300));
        // Escape closes whatever the step above left open; it does nothing to the note
        // (`Editor.tsx` says why that key is deliberately inert there).
        for (const chord of ["Escape", "ctrl+a", "ctrl+c"]) {
          spawnSync("xdotool", ["key", "--clearmodifiers", chord], on);
          // eslint-disable-next-line no-await-in-loop
          await new Promise((done) => setTimeout(done, 400));
        }

        const prefix = join(vault, "driven-clipboard");
        spawnSync(
          "node_modules/.bin/electron",
          ["out/main/index.js", `--dump-clipboard=${prefix}`],
          { stdio: "ignore", env: { ...process.env, DISPLAY: display } },
        );
        await open.capture!.evaluate(`document.title = 'emqnote'`);

        if (!existsSync(`${prefix}.html`)) throw new Error("nothing on the clipboard at all");
        const html = readFileSync(`${prefix}.html`, "utf8");

        // The attribute is what comes back into this app and the glyph is what every other
        // application has to draw; the bug was that only the first of the two was there.
        const missing = ["☐", "☑", 'data-checked="false"', 'data-checked="true"'].filter(
          (want) => !html.includes(want),
        );
        if (missing.length > 0) {
          throw new Error(`the clipboard HTML is missing ${missing.join(", ")}: ${html.slice(0, 400)}`);
        }
        return `${html.length} chars of HTML, both boxes present`;
      },
    },
    {
      // After the clipboard step, because it moves the window: every step above measures
      // client coordinates, but a window that has walked 200px to the right is not what
      // the next reader of a `--screenshot` expects, and nothing follows this one.
      name: "dragging the subject field moves the window; a click still lands in it (B94)",
      run: async () => {
        // **This window has two title states and only one of them needs the handler.** A
        // handed-over note's title is a plain `<h2>` inside the drag band and Chromium
        // moves the window itself; a brand-new note's is an `<input>`, which has to be
        // `no-drag` to be typed into and so swallows the press. Every step above handed
        // this window a note, so the window is put away and raised again — the everyday
        // route back to a blank one, and the only way to get the field on screen here.
        await open.capture!.evaluate(`window.emqnote.close()`);
        await new Promise((done) => setTimeout(done, 600));
        pressHotkey(display);
        await new Promise((done) => setTimeout(done, 1_200));

        const at = await open.capture!.evaluate<{ x: number; y: number } | null>(
          `(() => {
             const field = document.querySelector('input.subject');
             if (field === null) return null;
             const box = field.getBoundingClientRect();
             return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
           })()`,
        );
        if (at === null) throw new Error("no subject field — the window did not come back blank");

        // **Focus is put in the note's body first, and that is the whole of the second
        // assertion below.** A window raised by the hotkey already has the caret in the
        // subject field, so a drag that leaves it there proves nothing; the reported case
        // is a drag made while the caret was somewhere else, which used to move it into
        // the field and cost the body its place.
        await open.capture!.evaluate(`document.querySelector('.editor-content').focus()`);
        await new Promise((done) => setTimeout(done, 200));

        const before = await open.capture!.evaluate<number>(`window.screenX`);
        await open.capture!.mouse("mousePressed", at.x, at.y);
        for (const step of [20, 40, 60]) {
          // eslint-disable-next-line no-await-in-loop
          await open.capture!.mouse("mouseMoved", at.x + step, at.y);
          // eslint-disable-next-line no-await-in-loop
          await new Promise((done) => setTimeout(done, 80));
        }
        await open.capture!.mouse("mouseReleased", at.x + 60, at.y);
        await new Promise((done) => setTimeout(done, 600));

        // **The window moves further than the pointer did, and that is the harness rather
        // than the app** — `drive-library.ts`'s own drag step says the same thing at
        // length: CDP dispatches at *client* coordinates, so each move lands at a fixed
        // point inside a window that is itself travelling right. That it moved at all is
        // the question; the distance is not.
        const after = await open.capture!.evaluate<number>(`window.screenX`);
        if (after - before < 40) throw new Error(`the window moved ${after - before}px`);

        // **And the drag did not leave the caret in the field** (B102). The click Chromium
        // fires after a drag lands on the field like any other, so picking the window up
        // by it used to end with the caret sitting in it — which the reader's `<h1>` never
        // does, being a heading rather than a text field, so one gesture had two answers.
        const back = await open.capture!.evaluate<string>(
          `document.activeElement === null ? "nothing" : document.activeElement.className`,
        );
        if (!back.includes("editor-content")) {
          throw new Error(`after the drag the caret was on ${back}, not back in the note`);
        }

        // And the press that does not travel is still a press on a text field: it focuses
        // it, which is what `no-drag` is there for and what a drag must not have cost.
        await open.capture!.mouse("mousePressed", at.x, at.y);
        await open.capture!.mouse("mouseReleased", at.x, at.y);
        await new Promise((done) => setTimeout(done, 300));
        const focused = await open.capture!.evaluate<boolean>(
          `document.activeElement === document.querySelector('input.subject')`,
        );
        if (!focused) throw new Error("a click on the subject field did not put the caret in it");

        return (
          `window moved ${after - before}px, the caret went back to the note, ` +
          `a click still focuses it`
        );
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
