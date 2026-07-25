import { baseKeymap, chainCommands } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import type { Command } from "prosemirror-state";
import {
  enter,
  indent,
  outdent,
  setHeading,
  setParagraph,
  softBreak,
  tabIndent,
  tabOutdent,
  toggleBulletList,
  toggleCode,
  toggleEm,
  toggleHighlight,
  toggleOrderedList,
  toggleStrike,
  toggleStrong,
  toggleUnderline,
} from "./commands.js";

/**
 * The shortcuts of Outlook and Word, deliberately to the letter.
 *
 * This is not a detail but the point: twenty years of muscle memory is the main thing
 * the email-to-self routine has going for it. An editor that puts Ctrl+B somewhere
 * else has already lost, however good the rest of it is.
 *
 * `Mod` is Cmd on macOS and Ctrl everywhere else; ProseMirror resolves it per platform.
 */
export function outlookKeymap(openLinkPrompt: () => void): Record<string, Command> {
  const keys: Record<string, Command> = {
    "Mod-b": toggleStrong,
    "Mod-i": toggleEm,
    "Mod-u": toggleUnderline,
    "Mod-Shift-x": toggleStrike,
    "Mod-Alt-h": toggleHighlight,
    "Mod-Shift-c": toggleCode,

    // Ctrl+Shift+L is Word's bullet list. Numbering has no built-in shortcut there, so
    // Mod+Shift+O ("ordered") fills the gap.
    "Mod-Shift-l": toggleBulletList,
    "Mod-Shift-o": toggleOrderedList,

    "Mod-Alt-1": setHeading(1),
    "Mod-Alt-2": setHeading(2),
    "Mod-Alt-3": setHeading(3),
    "Mod-Alt-4": setHeading(4),
    "Mod-Alt-5": setHeading(5),
    "Mod-Alt-6": setHeading(6),
    "Mod-Shift-n": setParagraph,

    "Mod-m": indent,
    "Mod-Shift-m": outdent,

    "Mod-k": () => {
      openLinkPrompt();
      return true;
    },

    // Tab and Shift+Tab work wherever the caret sits inside the item, not just at its
    // start — that is what makes an outline feel like an outline.
    Tab: tabIndent,
    "Shift-Tab": tabOutdent,

    Enter: chainCommands(enter, baseKeymap.Enter!),
    "Shift-Enter": softBreak,

    "Mod-z": undo,
    "Mod-Shift-z": redo,
    "Mod-y": redo,
  };

  return keys;
}
