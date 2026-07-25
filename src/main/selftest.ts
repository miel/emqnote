import { app, dialog, type BrowserWindow } from "electron";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getCaptureWindow, hideCaptureWindow, showCaptureWindow } from "./capture-window.js";
import { LATENCY_BUDGET_MS, stats } from "./latency.js";
import { loadSettings } from "./settings.js";
import { INBOX } from "./vault.js";

/**
 * Measures the acceptance criterion of phase 1: hotkey to blinking caret under 80 ms.
 *
 *   EMQNOTE_SELFTEST=50 EMQNOTE_VAULT=/path/to/temp npm start
 *
 * The measurement starts where the shortcut arrives, in `showCaptureWindow`, and ends
 * when the renderer reports that a frame was painted after the caret was placed. What
 * it does *not* include is the OS delivering the shortcut; that is a window manager
 * action we cannot instrument. Everything we do ourselves is in there.
 */

let resolvePaint: (() => void) | null = null;

/** Called by the IPC handler as soon as the renderer has painted a frame. */
export function notifyPainted(): void {
  const resolve = resolvePaint;
  resolvePaint = null;
  resolve?.();
}

function waitForPaint(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolvePaint = null;
      resolve(false);
    }, timeoutMs);

    resolvePaint = () => {
      clearTimeout(timer);
      resolve(true);
    };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSelfTest(rounds: number): Promise<void> {
  const window = getCaptureWindow();
  if (window === null) {
    console.error("[selftest] no capture window");
    app.exit(1);
    return;
  }

  if (window.webContents.isLoading()) {
    await new Promise<void>((resolve) =>
      window.webContents.once("did-finish-load", () => resolve()),
    );
  }

  // Let things settle: the first time a window is shown always costs the OS a little
  // extra, and that says nothing about daily use of a resident app.
  await sleep(1000);
  showCaptureWindow();
  await waitForPaint(5000);
  hideCaptureWindow();
  await sleep(200);

  let missed = 0;
  for (let round = 0; round < rounds; round += 1) {
    showCaptureWindow();
    if (!(await waitForPaint(5000))) missed += 1;
    hideCaptureWindow();
    await sleep(120);
  }

  const saved = await captureRealNote();

  const result = stats();
  const summary = {
    platform: `${process.platform} ${process.arch}`,
    when: new Date().toISOString(),
    budgetMs: LATENCY_BUDGET_MS,
    rounds,
    missed,
    p50: Number(result.p50.toFixed(1)),
    p95: Number(result.p95.toFixed(1)),
    p99: Number(result.p99.toFixed(1)),
    max: Number(result.max.toFixed(1)),
    withinBudget: result.withinBudget,
    // Where the slow ones sat. A stall in round 1 is warm-up; a stall in round 37 is
    // something happening on the machine, and the difference decides what to do next.
    worst: result.worst,
    savedAs: saved,
  };

  console.log(JSON.stringify(summary, null, 2));

  // A packaged Windows app has no console, so stdout goes nowhere there. The file and
  // the dialog below are the only way the result is readable on the machine that
  // matters most — and without them a run looks exactly like nothing happening.
  let resultFile = "";
  try {
    resultFile = join(app.getPath("userData"), "selftest-result.json");
    writeFileSync(resultFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  } catch {
    // Reporting must not be the reason a measurement run fails.
  }

  // Only when there is no console to have read the JSON already. A packaged Windows
  // app has none, which is why the dialog exists — but shown unconditionally it turns
  // an automated run into one that waits forever for a click.
  if (!process.stdout.isTTY) {
    await showSummary(result, rounds, missed, saved, resultFile);
  }

  app.exit(result.withinBudget && missed === 0 && saved !== null ? 0 : 1);
}

async function showSummary(
  result: ReturnType<typeof stats>,
  rounds: number,
  missed: number,
  saved: string | null,
  resultFile: string,
): Promise<void> {
  await dialog.showMessageBox({
    type: result.withinBudget && saved !== null ? "info" : "warning",
    title: "emqnote self-test",
    message: `${rounds} rounds, budget ${LATENCY_BUDGET_MS} ms`,
    detail:
      `p50 ${result.p50.toFixed(0)} ms\n` +
      `p95 ${result.p95.toFixed(0)} ms\n` +
      `p99 ${result.p99.toFixed(0)} ms\n` +
      `slowest: ${result.worst.map((o) => `round ${o.round} at ${o.ms} ms`).join(", ")}\n` +
      `missed ${missed}\n` +
      `note written: ${saved ?? "no"}\n\n` +
      `Full result: ${resultFile}`,
    buttons: ["Close"],
  });
}

/**
 * Types into the editor from inside the page.
 *
 * Not via `webContents.sendInputEvent`: ProseMirror reads text input from `beforeinput`
 * and composition events, which Chromium does not synthesise for injected key events —
 * the characters simply never arrive. `execCommand("insertText")` does go down that
 * path, and a dispatched `keydown` is exactly what prosemirror-keymap listens for.
 */
const TYPE_SCRIPT = `
  (async () => {
    const editor = document.querySelector('.editor-content');
    if (editor === null) return 'no editor';
    editor.focus();

    const settle = () => new Promise((done) => setTimeout(done, 40));

    // Character by character, because ProseMirror's input rules fire per text input.
    // Inserting "- " in one go is reconciled as a DOM mutation and never triggers the
    // rule that turns it into a bullet.
    const text = async (value) => {
      for (const character of value) {
        document.execCommand('insertText', false, character);
        await new Promise((done) => setTimeout(done, 12));
      }
      await settle();
    };

    const key = (name) => {
      editor.dispatchEvent(new KeyboardEvent('keydown', {
        key: name, code: name, bubbles: true, cancelable: true,
      }));
      return settle();
    };

    await text('Self-test phase 2');
    await key('Enter');
    await text('- ');
    await text('First point');
    await key('Enter');
    await key('Tab');
    await text('Nested point');

    return editor.innerText;
  })()
`;

/**
 * Waits for the note to appear rather than sleeping a fixed amount.
 *
 * The write is debounced and queued, so how long it takes depends on the machine. A
 * fixed wait passed at ten rounds and failed at fifty, which is the worst kind of test:
 * one that reports a problem that is not there.
 */
async function waitForNote(inbox: string, timeoutMs: number): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const found = existsSync(inbox)
      ? readdirSync(inbox).filter((name) => name.endsWith(".md"))
      : [];

    if (found.length > 0 || Date.now() > deadline) return found;
    await sleep(100);
  }
}

async function typeSampleNote(window: BrowserWindow): Promise<string> {
  const result = (await window.webContents.executeJavaScript(TYPE_SCRIPT)) as string;
  await sleep(400);
  return result;
}

/** What the note has to look like once the keystrokes below have been typed. */
const EXPECTED_BODY = [
  "Self-test phase 2",
  "",
  "- First point",
  "  - Nested point",
].join("\n");

/**
 * Types a real note with real key events and closes the window.
 *
 * Driving this with keyboard input rather than by setting a value is the point: it
 * exercises the whole chain — key event, ProseMirror keymap, the "- " autoformat rule,
 * Tab indentation, React, IPC, the phase-0 serializer, atomic file write. If the
 * outline behaviour breaks in a packaged build, this is what notices.
 */
async function captureRealNote(): Promise<string | null> {
  const window = getCaptureWindow();
  const vault = loadSettings().vaultPath;
  if (window === null || vault === null) return null;

  showCaptureWindow();
  await waitForPaint(5000);

  const typed = await typeSampleNote(window);
  console.log(`--- editor content after typing ---\n${typed}`);

  hideCaptureWindow();

  const inbox = join(vault, INBOX);
  const written = await waitForNote(inbox, 4000);

  if (written.length !== 1) {
    console.error(`[selftest] expected one note in the Inbox, found ${written.length}`);
    return null;
  }

  const contents = readFileSync(join(inbox, written[0]!), "utf8");
  console.log("--- written note ---");
  console.log(contents);

  if (!contents.includes(EXPECTED_BODY)) {
    console.error("[selftest] the note does not contain the expected outline");
    return null;
  }

  return written[0]!;
}
