import { app, type WebContents } from "electron";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { SHORTCUTS, matches } from "../shared/shortcuts.js";
import { readLaunchOptions } from "./launch-options.js";

/**
 * `--key-probe`: what this app's windows are actually handed, one line per key.
 *
 * `--dump-clipboard`, `--thumbnail-probe` and `--trash-probe` each exist because a report
 * had survived a fix and the next step was evidence rather than a fourth guess. This is
 * that same step for `Mod-Shift-T`, which was reported dead on Windows, claimed in
 * `editor-keys.ts`'s `before-input-event` — the earliest point in a window, ahead of every
 * native accelerator and ahead of the page — and reported dead again.
 *
 * The user's theory when reporting it a second time was a browser conflict: Ctrl+Shift+T
 * is "reopen the closed tab". Worth writing down that it cannot be the mechanism *here*,
 * because it is the obvious thing to try next: that command belongs to Chrome the browser,
 * not to Blink, and an Electron app has no tab strip and no code for it — and even if it
 * did, `before-input-event` runs first. What is left is either that the key never reaches
 * the window at all, or that something outside this process takes it before Electron sees
 * it. Those two look identical from inside the app and are told apart by exactly one
 * observation, which is why this logs rather than concludes:
 *
 * - **A line for the press, with `claim=task`** — the key arrives and the claim fires, so
 *   the fault is downstream of here (the renderer's `hasFocus()` gate, or the command).
 * - **A line for the press, with `claim=—`** — it arrives and no registry entry matches,
 *   which would mean the modifiers are not what the chord spells.
 * - **No line at all** — nothing in this source tree can be responsible. The key was taken
 *   before Electron, by the OS or by another resident application.
 *
 * That third case is the one the app cannot see, and it is stated in the log's own header
 * rather than left implicit, the way `--trash-probe` prints its blind spots beside its
 * findings instead of in a footnote.
 *
 * It reports and claims nothing: the handler is installed *before* the ones that call
 * `preventDefault()`, so a claimed key is logged as well as an unclaimed one, and removing
 * the flag leaves behaviour exactly as it was.
 */

/** Where the log goes. Beside `latency.log` and `selftest-result.json`, outside the vault (B9). */
export function keyProbePath(): string {
  return join(app.getPath("userData"), "key-probe.log");
}

let started = false;

function write(line: string): void {
  try {
    appendFileSync(keyProbePath(), `${line}\n`, "utf8");
  } catch {
    // A probe that crashed the app it is diagnosing would be worse than a missing line.
  }
  // Also to stdout, which is empty on a packaged Windows build and everything when run
  // from a terminal — hence the file being the deliverable rather than this.
  console.log(`[key-probe] ${line}`);
}

/** Which registry entry this key press is, spelled the way the help sheet spells it. */
export function keyProbeClaim(
  input: { key: string; control: boolean; meta: boolean; shift: boolean; alt: boolean },
  isMac: boolean,
): string {
  const event = {
    key: input.key,
    ctrlKey: input.control,
    metaKey: input.meta,
    shiftKey: input.shift,
    altKey: input.alt,
  };
  // Every entry, not only the claimed ones: an entry that matches while its command does
  // nothing is a different bug from no entry matching at all, and the log has to be able
  // to say which.
  const hits = SHORTCUTS.filter((entry) => matches(entry, event, isMac)).map(
    (entry) => `${entry.id}:${entry.where}`,
  );
  return hits.length === 0 ? "—" : hits.join(",");
}

/**
 * Installs the logger on one window's contents, when `--key-probe` asked for it.
 *
 * The flag is read here rather than passed in, so every window is one unconditional call
 * and there is one place that decides whether the probe is on at all.
 *
 * Call it before `installEditorKeyClaims` and before any other `before-input-event`
 * handler: listeners run in the order they were added, and this one must see a key that a
 * later handler is about to claim.
 */
export function installKeyProbe(contents: WebContents, label: string): void {
  if (!readLaunchOptions().keyProbe) return;

  if (!started) {
    started = true;
    write("");
    write(`--- key probe started ${new Date().toISOString()} ---`);
    write(
      "Each line is one key event as Electron's before-input-event handed it over, " +
        "logged before anything claims it.",
    );
    write(
      "NO LINE FOR A PRESS means the key never reached the window: nothing in this " +
        "app can be responsible, and the OS or another resident application took it.",
    );
  }

  contents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;
    const claim = keyProbeClaim(input, process.platform === "darwin");
    write(
      `${label} key=${JSON.stringify(input.key)} code=${input.code} ` +
        `ctrl=${input.control} meta=${input.meta} shift=${input.shift} alt=${input.alt} ` +
        `repeat=${input.isAutoRepeat} claim=${claim}`,
    );
  });
}
