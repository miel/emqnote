import { baseKeymap, chainCommands } from "prosemirror-commands";
import type { Command } from "prosemirror-state";
import { shortcutsWhere } from "../../shared/shortcuts.js";
import {
  backspace,
  COMMANDS,
  enter,
  moveOverAtom,
  tabIndent,
  tabOutdent,
  type CommandContext,
} from "./commands.js";
import { cellBreak, clearCells, extendCellSelection, goToCell } from "./table-commands.js";

/**
 * The shortcuts of Outlook and Word, deliberately to the letter.
 *
 * This is not a detail but the point: twenty years of muscle memory is the main thing
 * the email-to-self routine has going for it. An editor that puts Ctrl+B somewhere
 * else has already lost, however good the rest of it is.
 *
 * Which key does what is *not* decided here — it is decided in
 * `src/shared/shortcuts.ts`, which the help sheet reads from as well. This walks that
 * registry and looks each `id` up in `COMMANDS`, so a binding exists once and an entry
 * with nothing behind it throws on startup rather than silently doing nothing.
 *
 * `Mod` is Cmd on macOS and Ctrl everywhere else; ProseMirror resolves it per platform,
 * which is why the registry spells bindings its way.
 */
export function outlookKeymap(context: CommandContext): Record<string, Command> {
  const keys: Record<string, Command> = {};

  for (const entry of shortcutsWhere("editor")) {
    const build = COMMANDS[entry.id];
    if (build === undefined) {
      throw new Error(`shortcut "${entry.id}" has no command in COMMANDS`);
    }

    const command = build(context);
    for (const binding of entry.keys) keys[binding] = command;
  }

  // Tab and Shift+Tab are the exception the registry cannot express: they share the
  // `indent`/`outdent` ids but must *always* be consumed, whether or not there was
  // anywhere to indent to. Pressing Tab twice used to walk the caret out of the note and
  // into the header fields, because a failed indent fell through to the browser.
  //
  // Which is exactly why the table pair has to be chained *in front* of them (B42):
  // `tabIndent`/`tabOutdent` return true unconditionally, so nothing after them ever
  // runs. `goToCell` declines outside a table, so Tab in a list is untouched — the
  // ordering here is the whole of the mechanism, and swapping these two lines would
  // silently take cell navigation away again.
  keys.Tab = chainCommands(goToCell("next"), tabIndent);
  keys["Shift-Tab"] = chainCommands(goToCell("previous"), tabOutdent);

  // Not in the registry: nothing to look up and nothing to show. Enter and Backspace are
  // the plain keys, and what makes them worth overriding is structural — ending a list
  // from any depth, promoting an item instead of merging two of them, and breaking a
  // line inside a table cell, which cannot be split because it holds no paragraph.
  keys.Enter = chainCommands(cellBreak, enter, baseKeymap.Enter!);
  // `clearCells` first, and it declines unless a rectangle of cells is selected (B49). A
  // `TextSelection` spanning cells cannot be deleted at all — `tableCell` is `isolating`,
  // so the one replace step it would take is refused and the key does nothing, which is
  // exactly the report this answers. Delete gets it too: the two keys mean the same thing
  // when what is selected is a rectangle rather than a caret.
  keys.Backspace = chainCommands(clearCells(), backspace, baseKeymap.Backspace!);
  keys.Delete = chainCommands(clearCells(), baseKeymap.Delete!);

  // Also not in the registry, and for the same reason: plain arrow-key navigation is not
  // a "shortcut" the help sheet should list. Beside a `wikiEmbed`/`wikiLink` atom,
  // ProseMirror's own arrow handling prefers a node selection over moving the caret past
  // it, which is invisible with nothing styling `.ProseMirror-selectednode` — see
  // `moveOverAtom` in `commands.ts`. It declines everywhere else, so ordinary caret
  // movement and Shift-extended selection are unaffected.
  keys.ArrowLeft = moveOverAtom("left");
  keys.ArrowRight = moveOverAtom("right");

  // Shift+arrow inside a table selects cells once it would leave the one the caret is in
  // (B49). Each declines outside a table and, for left/right, whenever there is still text
  // in the cell to extend over — so ordinary Shift-extended selection is untouched. They
  // are not in the registry for the same reason the arrow keys above are not: extending a
  // selection is not a shortcut the help sheet should list.
  keys["Shift-ArrowLeft"] = extendCellSelection("left");
  keys["Shift-ArrowRight"] = extendCellSelection("right");
  keys["Shift-ArrowUp"] = extendCellSelection("up");
  keys["Shift-ArrowDown"] = extendCellSelection("down");

  return keys;
}
