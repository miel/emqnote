import { baseKeymap, chainCommands } from "prosemirror-commands";
import type { Command } from "prosemirror-state";
import { shortcutsWhere } from "../../shared/shortcuts.js";
import {
  backspace,
  COMMANDS,
  enter,
  tabIndent,
  tabOutdent,
  type CommandContext,
} from "./commands.js";

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
  keys.Tab = tabIndent;
  keys["Shift-Tab"] = tabOutdent;

  // Not in the registry: nothing to look up and nothing to show. Enter and Backspace are
  // the plain keys, and what makes them worth overriding is structural — ending a list
  // from any depth, and promoting an item instead of merging two of them.
  keys.Enter = chainCommands(enter, baseKeymap.Enter!);
  keys.Backspace = chainCommands(backspace, baseKeymap.Backspace!);

  return keys;
}
