/**
 * Photographs emqnote's UI, element by element, into `design/ui-kit/` as 3× PNGs.
 *
 *   npm run ui:kit                 # ~70 parts plus a manifest, about seven minutes
 *   npm run ui:kit -- --keep       # leave the scaffolded vault behind to look at
 *
 * The parts bin the PowerPoint deck is built from — `scripts/build-ui-deck.py` reads the
 * manifest this writes and nothing else. Between them they exist so a mockup can be drawn
 * out of the app's real pixels instead of out of somebody's memory of them.
 *
 * Same shape as `drive-capture.ts`, and for the same reason: the app is run for real under
 * its own `Xvfb` and driven over CDP, because the questions here — does this menu look like
 * that, is the row this tall — are ones only a real renderer answers. Three things about
 * how it takes a picture are worth knowing before changing any of it:
 *
 *  · `Page.captureScreenshot` with `clip.scale = 3`, never Electron's `capturePage`. The
 *    latter can only hand back 1× of the native window buffer; the clip is what makes a
 *    crop that stays crisp when PowerPoint enlarges or prints it.
 *
 *  · States are produced the way a person produces them — a real `.click()` for a
 *    selection, a real `contextmenu` event for a menu. Writing `.note-on` onto a row by
 *    hand would photograph a row the app never drew.
 *
 *    Hover is the exception, and it is not in the kit: a row really does take the hover —
 *    `matches(':hover')` is true and the computed background becomes `--hover` — under a
 *    synthetic pointer *and* under a real X pointer moved with `xdotool`, but the frame
 *    `Page.captureScreenshot` returns is byte-identical to the resting one either way.
 *    Two files with the same bytes under different names would be worse than the gap.
 *
 *  · Isolation is `visibility`, never `display`. Hiding everything and turning one marked
 *    element back on leaves every box where it was, so the crop matches the rectangle that
 *    was measured, and the element keeps its own shadow.
 *
 * Deliberately not part of `npm test`: it needs a display, it takes minutes, and what it
 * produces is a design asset rather than an assertion.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Chromium's own switch; not 9333, so a `drive:capture` run can be going at the same time. */
const DEBUG_PORT = 9336;

/** `DEFAULT_HOTKEY` in `src/shared/ipc.ts`, spelled the way `xdotool` spells it. */
const HOTKEY = "ctrl+shift+y";

const OUT = join(process.cwd(), "design/ui-kit");
const NOTE = "01 Projecten/Alpha/24-vergadernotitie.md";

const keep = process.argv.includes("--keep");

/** What the deck builder reads: one row per photograph. */
interface Part {
  file: string;
  name: string;
  family: string;
  caption: string;
  selector: string;
  cssWidth: number;
  cssHeight: number;
  scale: number;
}

interface Shot {
  name: string;
  selector: string;
  family: string;
  caption: string;
  index?: number;
  /** Room left around the element, for a border or a shadow. */
  pad?: number;
  isolate?: boolean;
  /** Which role paints the ground the part is photographed against. */
  bg?: "background" | "surface" | "field";
  scroll?: boolean;
  /** Rebuild the element off to one side instead of marking it where it stands. */
  stage?: boolean;
  /** Measure by selector, photograph in place, mark nothing. */
  mark?: boolean;
}

const parts: Part[] = [];
const failures: string[] = [];

const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

// ---------------------------------------------------------------- the fixture vault

/**
 * A three-page PDF, computed rather than checked in — the same trick `drive-capture.ts`
 * uses, and here for the same reason: B43 draws a PDF as a page inside the note, and a
 * placeholder that merely looks like a PDF would photograph as an error chip.
 */
function threePagePdf(): Buffer {
  const objects: string[] = [];
  const add = (body: string): void => {
    objects.push(body);
  };

  add(`<< /Type /Catalog /Pages 2 0 R >>`);
  add(`<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>`);
  for (let page = 1; page <= 3; page += 1) {
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Contents ${3 + (page - 1) * 2 + 1} 0 R ` +
        `/Resources << /Font << /F1 9 0 R >> >> >>`,
    );
    const stream =
      `0.85 0.87 0.9 rg\n30 ${495 - page * 40} 360 ${page * 40} re f\n` +
      `0 0 0 rg\nBT /F1 22 Tf 34 545 Td (Offerte \\261 pagina ${page}) Tj ET\n`;
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
 * A picture with real dimensions, drawn by ImageMagick.
 *
 * `30-afbeeldingsformaat.md` draws the same file at 400 px, at 250×180 and at full size,
 * so a two-pixel stand-in scaled up to 400 would photograph as a blur — and the blur would
 * then be what the kit says an embedded picture looks like.
 */
function picture(file: string, width: number, height: number, label: string): void {
  const drawn = spawnSync("convert", [
    "-size",
    `${width}x${height}`,
    "gradient:#c9d6e8-#8ea6c4",
    "-gravity",
    "center",
    "-pointsize",
    "28",
    "-fill",
    "#22303f",
    "-annotate",
    "0",
    label,
    file,
  ]);
  if (drawn.error !== undefined) throw new Error("ImageMagick's `convert` is not on the PATH");
}

function scaffoldVault(): string {
  const vault = mkdtempSync(join(tmpdir(), "emqnote-kit-"));
  const corpus = join(process.cwd(), "test/corpus");
  const folders: Record<string, string[]> = {
    "00 Inbox": ["27-snelle-notitie-met-wie-en-waar.md", "26-tags.md", "12-takenlijst.md"],
    "01 Projecten/Alpha": [
      "24-vergadernotitie.md",
      "22-alle-frontmatter-velden.md",
      "09-tabel-in-lijstitem.md",
      "31-vastgeprikt.md",
    ],
    "01 Projecten/Beta": ["06-gemengde-lijst.md", "20-lange-alinea.md"],
    "02 Klanten": ["25-geplakte-outlook-mail.md", "21-links-en-bijlagen.md"],
    "03 Archief": ["16-citaat-met-lijst.md"],
    // The typography bench: one folder holding the constructions the editor has to draw.
    "04 Voorbeelden": [
      "02-inline-opmaak.md",
      "03-onderstreept-en-gemarkeerd.md",
      "04-opsomming-zes-niveaus.md",
      "13-tabel-uitlijningen.md",
      "15-codeblok-met-backticks.md",
      "28-notitieverwijzingen-met-pad.md",
      "30-afbeeldingsformaat.md",
    ],
  };

  for (const [folder, files] of Object.entries(folders)) {
    mkdirSync(join(vault, folder), { recursive: true });
    for (const file of files) copyFileSync(join(corpus, file), join(vault, folder, file));
  }

  // The one note here that is not from the corpus, and the only one: no corpus note embeds
  // a PDF inline (B43's page) or hangs a file chip beside it, so those two specimens have
  // nowhere else to come from.
  writeFileSync(
    join(vault, "04 Voorbeelden", "2026-08-20-1000-bijlagen.md"),
    [
      "---",
      "title: Bijlagen in de tekst",
      "type: quick",
      "created: 2026-08-20T10:00:00+02:00",
      "attachments: [2026-07-25-1055-offerte.pdf, 2026-08-20-0915-plattegrond.png]",
      "---",
      "",
      "Een PDF die als pagina in de notitie staat:",
      "",
      "![[2026-07-25-1055-offerte.pdf]]",
      "",
      "Hetzelfde bestand als chip om naar te wijzen: [[2026-07-25-1055-offerte.pdf]]",
      "",
    ].join("\n"),
  );

  // An empty folder, so the three-pane shell can be photographed empty without emptying
  // the DOM by hand: a folder with nothing in it is a state the app really has.
  mkdirSync(join(vault, "05 Leeg"), { recursive: true });

  const attachments = join(vault, "_attachments");
  mkdirSync(attachments, { recursive: true });
  picture(join(attachments, "2026-07-25-1055-schermafbeelding.png"), 640, 400, "schermafbeelding");
  picture(join(attachments, "2026-08-20-0915-schermafbeelding.png"), 640, 400, "schermafbeelding");
  picture(join(attachments, "2026-08-20-0915-plattegrond.png"), 500, 360, "plattegrond");
  writeFileSync(join(attachments, "2026-07-25-1055-offerte.pdf"), threePagePdf());
  writeFileSync(join(attachments, "2026-07-25-1110-fase2-scope.pdf"), threePagePdf());

  // Whatever else the copied notes name, so no chip photographs as a missing file.
  for (const folder of Object.keys(folders)) {
    for (const file of readdirSync(join(vault, folder))) {
      const text = readFileSync(join(vault, folder, file), "utf8");
      for (const match of text.matchAll(/[\w.-]+\.(?:pdf|png|jpg|jpeg|docx|xlsx|msg)/g)) {
        const named = match[0];
        const at = join(attachments, named);
        if (existsSync(at)) continue;
        if (named.endsWith(".pdf")) writeFileSync(at, threePagePdf());
        else picture(at, 480, 320, named.slice(0, 18));
      }
    }
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
    const session = new Session(socket);
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    // The light theme, pinned, so the kit does not depend on what a headless OS reports.
    await session.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: "light" }],
    });
    return session;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.next++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((settle) => this.pending.set(id, settle));
  }

  async js<T>(expression: string): Promise<T> {
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

  /** Types the way a keyboard does — `text` on the `keyDown` is what makes it input. */
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

  close(): void {
    this.socket.close();
  }
}

async function targets(): Promise<Target[]> {
  const answer = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  return (await answer.json()) as Target[];
}

async function findTarget(ending: string, within = 20_000): Promise<Target> {
  const deadline = Date.now() + within;
  for (;;) {
    try {
      const found = (await targets()).find((target) => target.url.split("?")[0]!.endsWith(ending));
      if (found !== undefined) return found;
    } catch {
      // The port is not listening yet; that is what the deadline is for.
    }
    if (Date.now() > deadline) throw new Error(`no window at ${ending} after ${within}ms`);
    await wait(250);
  }
}

// ---------------------------------------------------------------- driving the app

/**
 * Clicks a row, button or menu item by the words on it — `captureWindowTo`'s rule, since
 * a row's own `textContent` carries its note count as well.
 *
 * Scoped to an open menu only when the caller says so. Searching menu-first would put the
 * slash menu — which carries the context-menu class too — in front of the whole window,
 * and a button plainly on screen would then not be found. (No backticks in this comment:
 * it lives inside the template literal below.)
 */
async function clickNamed(session: Session, name: string, scope: "page" | "menu" = "page"): Promise<void> {
  const found = await session.js<boolean>(`(() => {
    const within = ${scope === "menu"} ? document.querySelector('.context-menu') : document;
    if (within === null) return false;
    const targets = [...within.querySelectorAll('button, .branch, .context-menu-item')];
    const label = (node) =>
      (node.querySelector('.branch-name') ?? node.querySelector('.context-menu-label') ?? node)
        .textContent.trim();
    const match = targets.find((node) => label(node) === ${JSON.stringify(name)});
    match?.click();
    return match !== undefined;
  })()`);
  if (!found) throw new Error(`no clickable named ${JSON.stringify(name)}`);
  await wait(500);
}

async function clickSelector(session: Session, selector: string, index = 0): Promise<void> {
  const found = await session.js<boolean>(
    `(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];` +
      ` el?.click(); return el !== undefined; })()`,
  );
  if (!found) throw new Error(`nothing matched ${selector}[${index}] to click`);
  await wait(600);
}

async function openNoteTitled(session: Session, fragment: string): Promise<void> {
  const found = await session.js<boolean>(`(() => {
    const titles = [...document.querySelectorAll('.note-title')];
    const match = titles.find((node) => node.textContent.includes(${JSON.stringify(fragment)}));
    match?.closest('.note')?.click();
    return match !== undefined;
  })()`);
  if (!found) throw new Error(`no note titled ~${fragment}`);
  await wait(1_200);
}

async function twistyNamed(session: Session, name: string): Promise<void> {
  await session.js(`(() => {
    const rows = [...document.querySelectorAll('.branch')];
    const match = rows.find((node) =>
      (node.querySelector('.branch-name') ?? node).textContent.trim() === ${JSON.stringify(name)});
    match?.querySelector('.twisty')?.click();
  })()`);
  await wait(600);
}

async function rightClick(session: Session, selector: string, index = 0): Promise<void> {
  const found = await session.js<boolean>(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!el) return false;
    const box = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true,
      clientX: box.left + 40, clientY: box.top + box.height / 2,
    }));
    return true;
  })()`);
  if (!found) throw new Error(`nothing matched ${selector}[${index}] to right-click`);
  await wait(600);
}

// ---------------------------------------------------------------- taking one picture

/**
 * Builds a stand-alone copy of an element off to one side, inside a rebuilt shell of its
 * own ancestors.
 *
 * This exists because of ProseMirror. The plain path marks the element with a class and
 * photographs it where it stands, which is fine for React's rows — but the editor redraws
 * its own DOM whenever a transaction lands, and the marker is gone by the time the
 * rectangle is measured. Every typography specimen failed exactly that way.
 *
 * A bare clone would lose its styling: nearly every rule in the editor is written as
 * `.editor-content table` and the like, so an element lifted out of its ancestors stops
 * matching the rules that shape it. So the ancestors are rebuilt as empty shells — same
 * tag, same classes, same inline style, no other children — and the clone goes back in at
 * the bottom of the chain, at the width it really had.
 */
async function stageClone(session: Session, selector: string, index: number): Promise<boolean> {
  return await session.js<boolean>(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!el) return false;
    document.getElementById('kit-stage')?.remove();

    const width = Math.round(el.getBoundingClientRect().width);
    const holder = document.createElement('div');
    holder.id = 'kit-stage';
    holder.style.cssText =
      'position:fixed;left:24px;top:24px;z-index:2147483647;display:inline-block;';

    const chain = [];
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      chain.push(node);
    }
    let cursor = holder;
    for (const ancestor of chain.reverse()) {
      const shell = document.createElement(ancestor.tagName);
      shell.className = typeof ancestor.className === 'string' ? ancestor.className : '';
      const style = ancestor.getAttribute('style');
      if (style !== null) shell.setAttribute('style', style);
      // The shells carry the ancestors' selectors, not their layout: a pane that is a flex
      // column with a fixed height would otherwise stretch or clip the one child it has.
      Object.assign(shell.style, {
        position: 'static', height: 'auto', minHeight: '0', maxHeight: 'none',
        overflow: 'visible', flex: 'none', display: 'block', margin: '0',
      });
      cursor.appendChild(shell);
      cursor = shell;
    }

    const clone = el.cloneNode(true);
    clone.classList.add('kit-clone');
    clone.style.width = width + 'px';
    clone.style.margin = '0';
    cursor.appendChild(clone);
    document.body.appendChild(holder);
    return true;
  })()`);
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  vh: number;
}

async function shoot(session: Session, shot: Shot): Promise<void> {
  const {
    name,
    selector,
    index = 0,
    family,
    caption,
    pad = 12,
    isolate = true,
    bg = "surface",
    scroll = true,
    stage = false,
    mark = true,
  } = shot;

  // Three ways in. Marked in place is the ordinary one; staged is for anything ProseMirror
  // redraws under you; unmarked is for an element that survives neither — the type-ahead
  // is redrawn as you type *and* takes its layout from the field it hangs under, so a
  // clone in a rebuilt shell collapses to the counts alone.
  const marker = stage ? ".kit-clone" : mark ? ".kit-target" : null;
  const found = (expression: string): string =>
    marker === null
      ? `document.querySelectorAll(${JSON.stringify(selector)})[${index}]${expression}`
      : `document.querySelector('${marker}')${expression}`;

  if (stage) {
    if (!(await stageClone(session, selector, index))) {
      throw new Error(`nothing matched ${selector}[${index}]`);
    }
  } else if (mark) {
    const marked = await session.js<boolean>(`(() => {
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if (!el) return false;
      document.querySelectorAll('.kit-target').forEach((node) => node.classList.remove('kit-target'));
      el.classList.add('kit-target');
      ${scroll ? "el.scrollIntoView({ block: 'nearest', inline: 'nearest' });" : ""}
      return true;
    })()`);
    if (!marked) throw new Error(`nothing matched ${selector}[${index}]`);
  }
  await wait(250);

  const isolated = isolate && mark;
  if (isolated) {
    await session.js(`(() => {
      let sheet = document.getElementById('kit-isolate');
      if (sheet === null) {
        sheet = document.createElement('style');
        sheet.id = 'kit-isolate';
        document.head.appendChild(sheet);
      }
      sheet.textContent = ${stage}
        ? '#root { visibility: hidden !important; }' +
          'body { background: var(--${bg}) !important; }'
        : 'body * { visibility: hidden !important; }' +
          '.kit-target, .kit-target * { visibility: visible !important; }' +
          '.overlay { background: transparent !important; backdrop-filter: none !important; }' +
          'body { background: var(--${bg}) !important; }';
    })()`);
    await wait(150);
  }

  const measured = await session.js<string>(`(() => {
    const el = ${found("")};
    if (!el) return 'null';
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height, vh: window.innerHeight });
  })()`);
  const box = JSON.parse(measured) as Box | null;
  if (box === null) throw new Error(`the element vanished before ${name} was taken`);
  if (box.w < 2 || box.h < 2) throw new Error(`${name} measured ${box.w}×${box.h}`);

  const clip = {
    x: Math.max(0, Math.round(box.x - pad)),
    y: Math.max(0, Math.round(box.y - pad)),
    width: Math.round(box.w + pad * 2),
    height: Math.round(box.h + pad * 2),
    scale: 3,
  };
  const taken = (await session.send("Page.captureScreenshot", {
    format: "png",
    clip,
    captureBeyondViewport: clip.y + clip.height > box.vh,
    fromSurface: true,
  })) as { data: string };
  if (taken instanceof Error) throw taken;

  const file = `${name}.png`;
  writeFileSync(join(OUT, file), Buffer.from(taken.data, "base64"));

  if (isolated) await session.js(`document.getElementById('kit-isolate').textContent = '';`);
  await session.js(`(() => {
    document.getElementById('kit-stage')?.remove();
    document.querySelectorAll('.kit-target').forEach((node) => node.classList.remove('kit-target'));
  })()`);

  parts.push({
    file,
    name,
    family,
    caption,
    selector,
    cssWidth: clip.width,
    cssHeight: clip.height,
    scale: 3,
  });
  console.log(`  ✓ ${name} — ${clip.width}×${clip.height}`);
}

/** One picture, with its failure recorded by name rather than ending the run. */
async function tryShoot(session: Session, shot: Shot): Promise<void> {
  try {
    await shoot(session, shot);
  } catch (error) {
    failures.push(`${shot.name}: ${(error as Error).message}`);
    console.log(`  ✗ ${shot.name} — ${(error as Error).message}`);
  }
}

/** A step the pictures after it depend on; a failure here is reported, not thrown. */
async function act(what: string, run: () => Promise<void>): Promise<boolean> {
  try {
    await run();
    return true;
  } catch (error) {
    failures.push(`act "${what}": ${(error as Error).message}`);
    console.log(`  ! ${what} — ${(error as Error).message}`);
    return false;
  }
}

// ---------------------------------------------------------------- X, without a window manager

async function startX(): Promise<{ display: string; server: ChildProcess }> {
  for (let number = 90; number < 130; number += 1) {
    if (existsSync(`/tmp/.X${number}-lock`)) continue;

    const display = `:${number}`;
    const server = spawn("Xvfb", [display, "-screen", "0", "1600x1000x24", "-nolisten", "tcp"], {
      stdio: "ignore",
      detached: true,
    });

    // The socket, not the lock file: the lock appears before the server is listening.
    const deadline = Date.now() + 5_000;
    while (!existsSync(`/tmp/.X11-unix/X${number}`)) {
      if (Date.now() > deadline || server.exitCode !== null) break;
      // eslint-disable-next-line no-await-in-loop
      await wait(100);
    }
    if (existsSync(`/tmp/.X11-unix/X${number}`)) return { display, server };

    await stop(server);
  }

  throw new Error("could not start an X server on any display between :90 and :129");
}

/** The negative pid is the point: `detached: true` made a group, and the group has to go. */
async function stop(child: ChildProcess): Promise<void> {
  if (child.pid === undefined) return;
  const ended = new Promise<void>((done) => child.once("exit", () => done()));
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  await Promise.race([ended, wait(3_000)]);
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // Which is the expected case: it exited on the SIGTERM.
  }
}

// ---------------------------------------------------------------- the shot list

/**
 * Order is deliberate. The capture window is photographed empty before it is handed a
 * note, because "empty" is a state you cannot get back to without closing the window; the
 * wide-viewport shots come last, because the device-metrics override changes the layout
 * for everything after it.
 */
async function main(): Promise<number> {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const vault = scaffoldVault();
  console.log(`vault: ${vault}`);
  const { display, server } = await startX();
  console.log(`display: ${display}\n`);

  const app: ChildProcess = spawn(
    "node_modules/.bin/electron",
    [
      "out/main/index.js",
      `--vault=${vault}`,
      "--library",
      `--remote-debugging-port=${DEBUG_PORT}`,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: { ...process.env, DISPLAY: display },
    },
  );

  // Electron on a headless Linux prints dbus and GPU warnings that are not failures.
  const noise: string[] = [];
  app.stdout?.on("data", (chunk: Buffer) => noise.push(chunk.toString()));
  app.stderr?.on("data", (chunk: Buffer) => noise.push(chunk.toString()));

  const open: { library: Session | null; capture: Session | null } = { library: null, capture: null };

  try {
    const library = await Session.open(await findTarget("library.html"));
    open.library = library;
    for (let tries = 0; tries < 60; tries += 1) {
      if (await library.js<boolean>(`document.querySelectorAll('.branch').length > 4`)) break;
      // eslint-disable-next-line no-await-in-loop
      await wait(400);
    }
    await wait(1_500);

    // ------------------------------------------------------------ the capture window, empty
    console.log("capture window (empty)");
    spawnSync("xdotool", ["key", "--clearmodifiers", HOTKEY], {
      env: { ...process.env, DISPLAY: display },
    });
    await wait(2_000);
    const capture = await Session.open(await findTarget("index.html"));
    open.capture = capture;
    await wait(800);

    await tryShoot(capture, {
      name: "shell-capture-empty", family: "Shells", selector: ".window",
      caption: "Capture window, empty — the blank to build on", pad: 0, isolate: false,
    });
    await tryShoot(capture, {
      name: "chrome-titlebar", family: "Chrome", selector: ".titlebar",
      caption: "Title bar with minimise / maximise / save-and-close",
    });
    await tryShoot(capture, {
      name: "header-grid-empty", family: "Header block", selector: ".header-grid",
      caption: "Header block, empty — When / Tags / Where / Who", bg: "background",
    });
    // No shot of the empty editor: it photographs as a flat rectangle, because the
    // placeholder does not draw. `Editor.tsx` puts `data-placeholder` on the contenteditable
    // root while `styles.css` reads it from `p:only-child:empty::before` with `attr()`,
    // which only ever reads an element's own attributes — and a ProseMirror paragraph is
    // never `:empty` anyway, it carries a trailing <br>.
    await tryShoot(capture, {
      name: "chrome-statusbar", family: "Chrome", selector: ".statusbar",
      caption: "Capture window footer: state, hint, Insert / Help",
    });

    // ------------------------------------------------------------ the capture window, filled
    console.log("capture window (a note)");
    await act("hand the note to the capture window", async () => {
      await library.js(`window.emqnote.library.openInCapture(${JSON.stringify(NOTE)})`);
      await wait(2_000);
    });

    await tryShoot(capture, {
      name: "window-capture", family: "Windows", selector: ".window",
      caption: "Capture window, 600×720 — the whole thing", pad: 0, isolate: false,
    });
    await tryShoot(capture, {
      name: "header-grid", family: "Header block", selector: ".header-grid",
      caption: "Header block, filled", bg: "background",
    });
    const cells: [string, string][] = [
      ["header-cell-when", "When — the created date, click to change"],
      ["header-cell-tags", "Tags — #tags, with type-ahead"],
      ["header-cell-where", "Where — location"],
      ["header-cell-who", "Who — attendees, comma or semicolon"],
    ];
    for (const [index, [name, what]] of cells.entries()) {
      // eslint-disable-next-line no-await-in-loop
      await tryShoot(capture, {
        name, family: "Header block", selector: ".header-cell", index,
        caption: what, bg: "background", pad: 6,
      });
    }
    await tryShoot(capture, {
      name: "chrome-capture-actions", family: "Chrome", selector: ".capture-actions",
      caption: "Capture window actions: Insert, Help", pad: 8,
    });

    await act("open the slash menu", async () => {
      await capture.js(`(() => {
        const editor = document.querySelector('.ProseMirror');
        editor.focus();
        const selection = window.getSelection();
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(editor.querySelector('p'));
        range.collapse(false);
        selection.addRange(range);
      })()`);
      await wait(300);
      await capture.key("Enter", { windowsVirtualKeyCode: 13, code: "Enter" });
      await capture.type("/");
      await wait(700);
    });
    await tryShoot(capture, {
      name: "menu-slash", family: "Menus", selector: ".slash-menu",
      caption: "The “/” menu — every block the editor can insert", bg: "background", pad: 20,
    });
    await capture.key("Escape", { windowsVirtualKeyCode: 27, code: "Escape" });
    await wait(300);

    await act("open the find bar", async () => {
      await capture.js(`document.querySelector('.ProseMirror').focus()`);
      await capture.send("Input.dispatchKeyEvent", {
        type: "keyDown", key: "f", code: "KeyF", windowsVirtualKeyCode: 70, modifiers: 2,
      });
      await capture.send("Input.dispatchKeyEvent", {
        type: "keyUp", key: "f", code: "KeyF", modifiers: 2,
      });
      await wait(700);
    });
    await tryShoot(capture, {
      name: "editor-find-bar", family: "Editor", selector: ".find-bar",
      caption: "Find in note", bg: "background", pad: 16,
    });
    await capture.key("Escape", { windowsVirtualKeyCode: 27, code: "Escape" });
    await wait(300);

    await act("open the Insert menu", async () => {
      await clickNamed(capture, "Insert");
    });
    await tryShoot(capture, {
      name: "menu-insert", family: "Menus", selector: ".context-menu",
      caption: "The Insert menu", bg: "background", pad: 20,
    });
    await act("open the table grid", async () => {
      await clickNamed(capture, "Table…");
    });
    await tryShoot(capture, {
      name: "menu-table-grid", family: "Menus", selector: ".table-grid",
      caption: "Table size picker — drag out the rectangle", bg: "background", pad: 20,
    });
    await capture.key("Escape", { windowsVirtualKeyCode: 27, code: "Escape" });
    await wait(400);

    await act("open the tag type-ahead", async () => {
      await capture.js(`(() => {
        const field = document.querySelector('input.tags');
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      })()`);
      await capture.type(" #kl");
      await wait(800);
    });
    await tryShoot(capture, {
      name: "header-tag-suggest", family: "Header block", selector: ".tag-suggest",
      caption: "Tag type-ahead, hanging under the field", pad: 14, mark: false, isolate: false,
    });
    await capture.key("Escape", { windowsVirtualKeyCode: 27, code: "Escape" });

    // ------------------------------------------------------------ the library, default width
    console.log("\nlibrary window");
    await act("open Alpha and its meeting note", async () => {
      await twistyNamed(library, "01 Projecten");
      await clickNamed(library, "Alpha");
      await wait(800);
      await openNoteTitled(library, "besluitvorming");
    });

    await tryShoot(library, {
      name: "window-library", family: "Windows", selector: ".library-shell",
      caption: "Library window, 1180×760 — the whole thing", pad: 0, isolate: false,
    });
    await tryShoot(library, {
      name: "pane-tree", family: "Folder tree", selector: ".tree",
      caption: "The folder tree pane", pad: 0,
    });
    await tryShoot(library, {
      name: "pane-notes", family: "Note list", selector: ".notes",
      caption: "The note list pane", pad: 0,
    });
    await tryShoot(library, {
      name: "tree-toolbar", family: "Folder tree", selector: ".tree-toolbar",
      caption: "New / Rename / Delete", pad: 8,
    });
    await tryShoot(library, {
      name: "tree-row-selected", family: "Folder tree", selector: ".branch-on",
      caption: "Folder row, selected, with its note and task counts", pad: 6,
    });

    // No hovered variants, and it is not for want of trying — see the note at the top of
    // this file. `--hover` is on the deck's palette slide for anyone tinting a row by hand.
    await act("a plain folder row", async () => {
      const index = await library.js<number>(`(() => {
        const rows = [...document.querySelectorAll('.branch')];
        return rows.findIndex((node) =>
          (node.querySelector('.branch-name')?.textContent ?? '') === '02 Klanten');
      })()`);
      if (index < 0) throw new Error("no 02 Klanten row");
      await tryShoot(library, {
        name: "tree-row", family: "Folder tree", selector: ".branch", index,
        caption: "Folder row, at rest", pad: 6,
      });
    });
    await act("a parent row", async () => {
      const index = await library.js<number>(`(() => {
        const rows = [...document.querySelectorAll('.branch')];
        return rows.findIndex((node) =>
          (node.querySelector('.branch-name')?.textContent ?? '') === '01 Projecten');
      })()`);
      if (index < 0) throw new Error("no 01 Projecten row");
      await tryShoot(library, {
        name: "tree-row-parent", family: "Folder tree", selector: ".branch", index,
        caption: "Parent row, expanded — the twisty turns", pad: 6,
      });
    });
    await tryShoot(library, {
      name: "tree-footer", family: "Folder tree", selector: ".tree-footer",
      caption: "Pinned footer: Tags, People, Tasks, Settings, Shortcuts, Unlinked attachments",
      pad: 8,
    });

    await tryShoot(library, {
      name: "notes-search", family: "Note list", selector: ".notes-search",
      caption: "Search box with its scope button", pad: 8,
    });
    await tryShoot(library, {
      name: "notes-header", family: "Note list", selector: ".notes-header",
      caption: "Count, sort, Tasks, + New note", pad: 8,
    });
    await tryShoot(library, {
      name: "note-row-selected", family: "Note list", selector: ".note-on",
      caption: "Note row, selected — excerpt, tags, attendees, open tasks", pad: 8,
    });

    interface Row {
      index: number;
      pinned: boolean;
      tags: boolean;
      tasks: boolean;
      who: boolean;
      on: boolean;
    }
    const readRows = async (): Promise<Row[]> =>
      JSON.parse(
        await library.js<string>(`(() => {
          const out = [];
          document.querySelectorAll('.note').forEach((node, index) => out.push({
            index,
            pinned: node.querySelector('.note-pin') !== null,
            tags: node.querySelector('.note-tags') !== null,
            tasks: node.querySelector('.note-tasks') !== null,
            who: node.querySelector('.note-attendees') !== null,
            on: node.classList.contains('note-on'),
          }));
          return JSON.stringify(out);
        })()`),
      ) as Row[];

    await act("the pinned row in Alpha", async () => {
      const pinned = (await readRows()).find((row) => row.pinned && !row.on);
      if (pinned === undefined) throw new Error("no pinned row in Alpha");
      await tryShoot(library, {
        name: "note-row-pinned", family: "Note list", selector: ".note", index: pinned.index,
        caption: "Note row, pinned to the top", pad: 8,
      });
    });

    await act("note row variants in the Inbox", async () => {
      await clickNamed(library, "00 Inbox");
      await wait(900);
      const rows = await readRows();
      const variants: [string, string, Row | undefined][] = [
        ["note-row-tags", "Note row with tag chips", rows.find((row) => row.tags && !row.tasks && !row.who)],
        ["note-row-tasks", "Note row with an open-task count", rows.find((row) => row.tasks)],
        ["note-row-people", "Note row with attendees", rows.find((row) => row.who)],
        ["note-row", "Note row, plain", rows.find((row) => !row.tasks && !row.who && !row.tags)],
      ];
      for (const [name, caption, row] of variants) {
        if (row === undefined) continue;
        // eslint-disable-next-line no-await-in-loop
        await tryShoot(library, {
          name, family: "Note list", selector: ".note", index: row.index, caption, pad: 8,
        });
      }
    });

    await act("a search across the vault", async () => {
      await library.js(`(() => {
        const scope = document.querySelector('.search-scope');
        if (scope && scope.getAttribute('aria-pressed') !== 'true') scope.click();
      })()`);
      await wait(400);
      await library.js(`document.querySelector('.notes-search input').focus()`);
      await library.type("alpha");
      await wait(1_200);
      await tryShoot(library, {
        name: "notes-search-active", family: "Note list", selector: ".notes-search",
        caption: "Search, with the whole vault in scope", pad: 8,
      });
      const folderRow = await library.js<number>(`(() => {
        const rows = [...document.querySelectorAll('.note')];
        return rows.findIndex((node) => node.querySelector('.note-folder') !== null);
      })()`);
      if (folderRow >= 0) {
        await tryShoot(library, {
          name: "note-row-search", family: "Note list", selector: ".note", index: folderRow,
          caption: "Search result — the row grows a folder line", pad: 8,
        });
      }
      // Cleared through the native setter, since React owns the value.
      await library.js(`(() => {
        const input = document.querySelector('.notes-search input');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await wait(800);
    });

    // ------------------------------------------------------------ menus and dialogs
    console.log("\nmenus and dialogs");
    await act("a folder's context menu", async () => {
      await rightClick(library, ".branch", 2);
      await tryShoot(library, {
        name: "menu-folder", family: "Menus", selector: ".context-menu",
        caption: "Folder context menu", bg: "background", pad: 24,
      });
      await library.key("Escape", { windowsVirtualKeyCode: 27, code: "Escape" });
      await wait(400);
    });
    await act("a note's context menu", async () => {
      await rightClick(library, ".note", 0);
      await tryShoot(library, {
        name: "menu-note", family: "Menus", selector: ".context-menu",
        caption: "Note context menu", bg: "background", pad: 24,
      });
      await tryShoot(library, {
        name: "menu-note-in-situ", family: "Menus", selector: ".library-shell",
        caption: "The same menu where it appears", pad: 0, isolate: false,
      });
      await library.key("Escape", { windowsVirtualKeyCode: 27, code: "Escape" });
      await wait(400);
    });
    await act("the Move dialog", async () => {
      await rightClick(library, ".note", 0);
      await clickNamed(library, "Move", "menu");
      await wait(600);
      await tryShoot(library, {
        name: "dialog-move", family: "Dialogs", selector: ".overlay > *",
        caption: "Move to which folder?", bg: "background", pad: 24,
      });
      await library.key("Escape", { windowsVirtualKeyCode: 27, code: "Escape" });
      await wait(400);
    });
    await act("the new-folder prompt", async () => {
      await clickNamed(library, "+ New");
      await wait(600);
      await tryShoot(library, {
        name: "dialog-ask", family: "Dialogs", selector: ".ask",
        caption: "Ask — a prompt with a text field", bg: "background", pad: 24,
      });
      await library.key("Escape", { windowsVirtualKeyCode: 27, code: "Escape" });
      await wait(400);
    });
    await act("Settings", async () => {
      await clickNamed(library, "Settings");
      await wait(900);
      await tryShoot(library, {
        name: "dialog-settings", family: "Dialogs", selector: ".settings",
        caption: "Settings — vault, theme, text size, hotkey, updates", bg: "background", pad: 24,
      });
      await library.key("Escape", { windowsVirtualKeyCode: 27, code: "Escape" });
      await wait(500);
    });
    await act("the shortcuts sheet", async () => {
      await clickNamed(library, "Keyboard shortcuts");
      await wait(900);
      await tryShoot(library, {
        name: "dialog-help", family: "Dialogs", selector: ".help",
        caption: "Keyboard shortcuts", bg: "background", pad: 24,
      });
      await library.key("Escape", { windowsVirtualKeyCode: 27, code: "Escape" });
      await wait(500);
    });

    // ------------------------------------------------------------ the other views
    console.log("\nviews");
    await act("the Tasks view", async () => {
      await clickNamed(library, "Tasks");
      await wait(1_200);
      await tryShoot(library, {
        name: "view-tasks", family: "Views", selector: ".notes",
        caption: "Tasks view — every open task in the vault", pad: 0,
      });
      await tryShoot(library, {
        name: "view-task-row", family: "Views", selector: ".task-row",
        caption: "One task row: checkbox, text, the note it came from", pad: 8,
      });
      await tryShoot(library, {
        name: "view-task-toolbar", family: "Views", selector: ".task-toolbar",
        caption: "Tasks toolbar: scope and open-only", pad: 8,
      });
    });
    await act("the tag filter", async () => {
      await clickNamed(library, "Tags");
      await wait(900);
      await tryShoot(library, {
        name: "view-filter-tags", family: "Views", selector: ".tree-footer",
        caption: "Tags, unfolded — every tag with its count", pad: 8,
      });
    });
    await act("the people filter", async () => {
      await clickNamed(library, "People");
      await wait(900);
      await tryShoot(library, {
        name: "view-filter-people", family: "Views", selector: ".tree-footer",
        caption: "People, unfolded", pad: 8,
      });
    });
    await act("unlinked attachments", async () => {
      await clickNamed(library, "Unlinked attachments");
      await wait(1_200);
      await tryShoot(library, {
        name: "view-files", family: "Views", selector: ".notes",
        caption: "Unlinked attachments — files no note names any more", pad: 0,
      });
      await clickSelector(library, ".files-list li", 0);
      await wait(1_200);
      await tryShoot(library, {
        name: "view-file-preview", family: "Views", selector: ".file-preview",
        caption: "File preview, with its page bar", pad: 0, bg: "background",
      });
    });

    // ------------------------------------------------------------ the reader, wide
    console.log("\nreader and typography, at 1440×900");
    await library.send("Emulation.setDeviceMetricsOverride", {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await wait(1_000);
    await act("back to the meeting note", async () => {
      await clickNamed(library, "Alpha");
      await wait(900);
      await openNoteTitled(library, "besluitvorming");
    });

    await tryShoot(library, {
      name: "window-library-wide", family: "Windows", selector: ".library-shell",
      caption: "Library window at 1440×900", pad: 0, isolate: false,
    });
    await tryShoot(library, {
      name: "pane-reader", family: "Reader", selector: ".reader",
      caption: "The reader pane", pad: 0, bg: "background",
    });
    await tryShoot(library, {
      name: "reader-header", family: "Reader", selector: ".reader-header",
      caption: "Reader header — title and path", bg: "background", pad: 10,
    });
    await tryShoot(library, {
      name: "reader-footer", family: "Reader", selector: ".reader-footer",
      caption: "Reader footer — saved state, Insert / Actions / Help", pad: 8,
    });
    await act("the Actions menu", async () => {
      await clickNamed(library, "Actions");
      await wait(600);
      await tryShoot(library, {
        name: "menu-actions", family: "Menus", selector: ".context-menu",
        caption: "Reader Actions menu", bg: "background", pad: 24,
      });
      await library.key("Escape", { windowsVirtualKeyCode: 27, code: "Escape" });
      await wait(400);
    });

    // The corpus is the specimen set: each note here is one the serializer already treats
    // as the specification for a construction, so what the editor draws for it is what the
    // dialect says that construction is.
    const specimens: [string, [string, string, number, string][]][] = [
      ["besluitvorming", [
        ["editor-heading", ".editor-content h2", 0, "Heading"],
        ["editor-paragraph", ".editor-content p", 0, "Paragraph"],
        ["editor-list-ordered", ".editor-content ol", 0, "Numbered list with blocks under an item"],
        ["editor-table", ".editor-content table", 0, "Table"],
        ["editor-blockquote", ".editor-content blockquote", 0, "Quote"],
      ]],
      ["zes niveaus", [["editor-list-bullets", ".editor-content ul", 0, "Bullets, six levels deep"]]],
      ["Takenlijst", [["editor-tasks", ".editor-content ul", 0, "Task list with checkboxes"]]],
      ["uitlijningen", [["editor-table-aligned", ".editor-content table", 0, "Table with column alignments"]]],
      ["Codeblok", [["editor-code", ".editor-content pre", 0, "Code block"]]],
      ["opmaak", [["editor-marks", ".editor-content p", 0, "Inline marks: bold, italic, code, strikethrough"]]],
      ["gemarkeerd", [["editor-marks-underline", ".editor-content p", 0, "Underline and ==highlight=="]]],
      ["Tags", [["editor-tag-chips", ".editor-content p", 0, "#tag chips in the body"]]],
      ["Verwijzingen", [["editor-wiki-links", ".editor-content p", 1, "Wiki links to other notes"]]],
      ["breedte", [["editor-image", ".wiki-embed-image-box", 0, "An embedded picture at a given width"]]],
      ["Bijlagen", [
        ["editor-pdf-page", ".wiki-embed-pdf", 0, "A PDF drawn as a page in the note (B43)"],
        ["editor-attachment-chip", ".wiki-link", 0, "Attachment chip — a file to point at, with its thumbnail"],
      ]],
    ];

    const folders = ["04 Voorbeelden", "00 Inbox", "02 Klanten", "03 Archief", "Beta"];
    for (const [fragment, shots] of specimens) {
      // eslint-disable-next-line no-await-in-loop
      const opened = await act(`open “${fragment}”`, async () => {
        const here = async (): Promise<boolean> =>
          await library.js<boolean>(`(() => {
            const titles = [...document.querySelectorAll('.note-title')];
            return titles.some((node) => node.textContent.includes(${JSON.stringify(fragment)}));
          })()`);
        if (!(await here())) {
          for (const folder of folders) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await clickNamed(library, folder);
            } catch {
              continue;
            }
            // eslint-disable-next-line no-await-in-loop
            await wait(700);
            // eslint-disable-next-line no-await-in-loop
            if (await here()) break;
          }
        }
        await openNoteTitled(library, fragment);
        await wait(900);
      });
      if (!opened) continue;

      // eslint-disable-next-line no-await-in-loop
      const showing = await library.js<string>(
        `document.querySelector('.reader-header h1')?.textContent ?? ''`,
      );
      if (!showing.includes(fragment)) {
        failures.push(`specimen "${fragment}": the reader is showing "${showing}" instead`);
        console.log(`  ! ${fragment} — the reader is showing "${showing}"`);
        continue;
      }
      for (const [name, selector, index, caption] of shots) {
        // Staged, not marked in place: the editor redraws its own DOM.
        // eslint-disable-next-line no-await-in-loop
        await tryShoot(library, {
          name, family: "Editor", selector, index, caption,
          bg: "background", pad: 10, stage: true,
        });
      }
    }

    // ------------------------------------------------------------ the blank shell
    console.log("\nblank shells");
    await act("an empty folder, from a fresh window", async () => {
      await library.js(`location.reload()`);
      await wait(4_000);
      await library.send("Emulation.setDeviceMetricsOverride", {
        width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
      });
      await wait(600);
      await clickNamed(library, "05 Leeg");
      await wait(1_200);
      await tryShoot(library, {
        name: "shell-library", family: "Shells", selector: ".library-shell",
        caption: "Library window, empty — the blank to build on", pad: 0, isolate: false,
      });
      await tryShoot(library, {
        name: "reader-empty", family: "Reader", selector: ".reader-empty",
        caption: "Reader, with nothing picked", bg: "background", pad: 20,
      });
    });

    writeFileSync(join(OUT, "manifest.json"), JSON.stringify(parts, null, 1));
  } catch (error) {
    console.error("\n--- what the app printed ---");
    console.error(noise.join(""));
    throw error;
  } finally {
    open.library?.close();
    open.capture?.close();
    await stop(app);
    await stop(server);
  }

  if (keep) console.log(`\nvault kept at ${vault}`);
  else rmSync(vault, { recursive: true, force: true });

  console.log(`\n${parts.length} parts in design/ui-kit`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} did not come out:`);
    for (const line of failures) console.log(`  · ${line}`);
  }
  return failures.length === 0 ? 0 : 1;
}

process.exit(await main());
