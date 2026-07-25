import { app } from "electron";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
  console.log(
    JSON.stringify(
      {
        budgetMs: LATENCY_BUDGET_MS,
        rounds,
        missed,
        p50: Number(result.p50.toFixed(1)),
        p95: Number(result.p95.toFixed(1)),
        max: Number(result.max.toFixed(1)),
        withinBudget: result.withinBudget,
        savedAs: saved,
      },
      null,
      2,
    ),
  );

  app.exit(result.withinBudget && missed === 0 && saved !== null ? 0 : 1);
}

const SAMPLE_TEXT = [
  "Self-test phase 1",
  "",
  "First line of the note.",
  "Second line, soft break.",
  "",
  "A second paragraph.",
].join("\n");

/**
 * Actually types into the textarea and closes the window, so the whole chain is
 * exercised: keystroke, React, IPC, the phase 0 serializer, atomic file write. Only
 * that way do you know saving works, rather than that the functions exist.
 */
async function captureRealNote(): Promise<string | null> {
  const window = getCaptureWindow();
  const vault = loadSettings().vaultPath;
  if (window === null || vault === null) return null;

  showCaptureWindow();
  await waitForPaint(5000);

  await window.webContents.executeJavaScript(`
    (() => {
      const field = document.querySelector('textarea');
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype, 'value',
      ).set;
      setValue.call(field, ${JSON.stringify(SAMPLE_TEXT)});
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return field.value.length;
    })()
  `);

  hideCaptureWindow();
  await sleep(800);

  const inbox = join(vault, INBOX);
  const written = existsSync(inbox)
    ? readdirSync(inbox).filter((name) => name.endsWith(".md"))
    : [];

  if (written.length !== 1) {
    console.error(`[selftest] expected one note in the Inbox, found ${written.length}`);
    return null;
  }

  console.log("--- written note ---");
  console.log(readFileSync(join(inbox, written[0]!), "utf8"));

  return written[0]!;
}
