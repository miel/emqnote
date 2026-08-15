import type { EditorView } from "prosemirror-view";
import { tagAt } from "./tag-decoration.js";

/**
 * Opening a body `#tag` from the editor (B52).
 *
 * The same gesture a weblink takes (B33) and for the same reason: a tag is ordinary,
 * editable text — B19 — so a plain click has to go on placing the caret, or a typo in a
 * tag would be unfixable by the one gesture everybody reaches for. Mod+click (Cmd on
 * macOS, Ctrl elsewhere) is what opens it, and `.link-mod-hover` already turns the
 * pointer while the modifier is held, so the affordance costs nothing extra.
 *
 * `handleClick` fires before ProseMirror has moved the selection, so this resolves the
 * tag from the position the event itself reports rather than from `state.selection` —
 * exactly as `handleLinkClick` does.
 *
 * Where the tag then goes is decided in main: this side sends a name, not a query, and
 * the library is raised from there. That keeps one path for a click made in either
 * window, which is what `IPC.openWikiLink` already does with a `[[…]]` target.
 */
export function handleTagClick(view: EditorView, pos: number, event: MouseEvent): boolean {
  const isMac = window.emqnote.platform === "darwin";
  const modPressed = isMac ? event.metaKey : event.ctrlKey;
  if (!modPressed) return false;

  const name = tagAt(view.state, pos);
  if (name === null) return false;

  event.preventDefault();
  void window.emqnote.openTag(name);
  return true;
}
