import type { EditorView } from "prosemirror-view";
import { linkHrefAt } from "./commands.js";

/**
 * Opening a weblink from the editor (B33).
 *
 * A plain click has to keep placing the caret — the link's own text stays ordinary,
 * editable prose, and a click that instead tried to navigate would make it impossible
 * to fix a typo inside one. Mod+click (Cmd on macOS, Ctrl elsewhere — matching what
 * every browser already does for "open in a new tab") is the gesture that opens it.
 *
 * `handleClick` fires before ProseMirror has moved the selection to the click, so this
 * resolves the link from the position the event itself reports rather than from
 * `state.selection` — `linkHrefAt` in `commands.ts` is the position-based half of the
 * same lookup `linkAt` uses for the caret.
 *
 * The scheme is decided again in main (`app:open-external`, `src/main/index.ts`) and
 * never trusted from here — the same reasoning `remote-image.ts` documents for its own
 * allowlist. This side only asks; a refusal there is silent.
 */
export function handleLinkClick(view: EditorView, pos: number, event: MouseEvent): boolean {
  const isMac = window.emqnote.platform === "darwin";
  const modPressed = isMac ? event.metaKey : event.ctrlKey;
  if (!modPressed) return false;

  const href = linkHrefAt(view.state, pos);
  if (href === null) return false;

  // A cheap local filter, not the enforcement — main decides again from scratch
  // (`isOpenableUrl`, `src/main/remote-image.ts`) and never trusts this side. This just
  // means a `mailto:` link typed into a note declines the caret-eating click instead of
  // round-tripping to main only to be refused there.
  if (!/^https?:\/\//i.test(href)) return false;

  event.preventDefault();
  void window.emqnote.openExternal(href);
  return true;
}
