import type { WebContents } from "electron";
import { matches, shortcut } from "../shared/shortcuts.js";
import { IPC } from "../shared/ipc.js";

/**
 * Editor chords claimed in main, ahead of the window.
 *
 * This is `library-window.ts`'s `cyclePanes` claim applied to an *editor* command, and it
 * is here for the same reason: `Mod-Shift-T` — the checkbox item — was reported doing
 * nothing at all on Windows, and the cause was not found. The command itself is fine
 * (`toggleTask` wraps a plain paragraph, converts a numbered list and ticks an existing
 * item, all covered by tests), and the chord is spelled once in `shortcuts.ts`, so what is
 * left is delivery: something between the keyboard and ProseMirror's keymap takes it.
 *
 * `before-input-event` runs ahead of every native accelerator and ahead of the page, which
 * is the earliest point anything in a window can be claimed from — the only kind of fix
 * available against a consumer nobody has identified. The Windows per-window menu bar is
 * the other candidate and would also be covered from here.
 *
 * Two things follow from that and are load-bearing:
 *
 * - `preventDefault()` makes this a **replacement**, not a second route. The `keydown`
 *   never reaches the page, so `keymap.ts`'s binding no longer fires; it stays in the
 *   registry because that is what the help sheet prints and what `shortcuts.test.ts`
 *   checks, and because the registry is where the chord is defined.
 * - The renderer runs the command only when the editor genuinely has focus, so the chord
 *   stays inert in the subject field, the folder tree and the note list exactly as it was
 *   before. Main cannot know that — which is why the intent is forwarded rather than
 *   carried out here.
 *
 * Windows did report it unchanged, and that next step is taken: `task` now carries
 * `Mod-Shift-d` beside `Mod-Shift-t` in `shortcuts.ts`, `paragraph`'s precedent exactly.
 * Nothing here changed for it — `editorKeyIntent` asks `matches` about the whole entry,
 * so both spellings are claimed from this same handler, which is the point of matching
 * against the registry rather than comparing fields by hand.
 *
 * The claim stands, but it is no longer the argument: a fix that survives its own report
 * is a diagnosis that was incomplete, and this file has stopped asserting one. `--key-probe`
 * (`key-probe.ts`) logs every key a window is handed, before anything here claims it, so
 * the next round arrives with the operating system's own account of what happened rather
 * than a third guess — the same move `--trash-probe` made for B57.
 */
export const CLAIMED_EDITOR_KEYS = ["task"];

export interface KeyInput {
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

/**
 * Which claimed command this key press is, or `null`.
 *
 * Split out from the handler below so it can be tested without Electron, and matched
 * through `matches` against the registry rather than by comparing fields by hand: two
 * spellings of one binding is how a shortcut and the sheet that prints it come to differ.
 */
export function editorKeyIntent(input: KeyInput, isMac: boolean): string | null {
  for (const id of CLAIMED_EDITOR_KEYS) {
    const hit = matches(
      shortcut(id),
      {
        key: input.key,
        ctrlKey: input.control,
        metaKey: input.meta,
        shiftKey: input.shift,
        altKey: input.alt,
      },
      isMac,
    );
    if (hit) return id;
  }
  return null;
}

/** Installs the claim on a window's contents. Both windows draw the same editor. */
export function installEditorKeyClaims(contents: WebContents): void {
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    const id = editorKeyIntent(input, process.platform === "darwin");
    if (id === null) return;

    event.preventDefault();
    contents.send(IPC.editorCommand, { id });
  });
}
