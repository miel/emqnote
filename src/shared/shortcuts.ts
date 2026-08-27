/**
 * Every keyboard shortcut in the app, in one place.
 *
 * They used to live in five: `keymap.ts`, the window-level `keydown` handler in
 * `Capture.tsx`, the tree in the library, the global accelerator in settings, and a
 * table in `01-functioneel-ontwerp.md` that had already gone stale. A help sheet built
 * beside that would have become a sixth, and the first one to disagree with the others.
 *
 * So this is not a list *of* the shortcuts, it is the definition of them.
 * `outlookKeymap` is built by walking the `editor` entries and looking each `id` up in
 * `COMMANDS`; the window-level handlers test their events with `matches`. A key exists
 * in exactly one place, and an entry with no command behind it fails a lookup instead of
 * quietly doing nothing — see B6 and B17 for why a second definition is the thing to
 * avoid here.
 *
 * The `why` field is load-bearing. The comments in `keymap.ts` carried decisions, not
 * description — why `Mod-1..6` exists alongside Word's `Mod-Alt-1..6`, why `Mod-Shift-n`
 * is paired with `Mod-0`. Losing those to a refactor is how the bindings drift back.
 */

export type ShortcutWhere = "editor" | "capture" | "library" | "global";
export type ShortcutGroup = "text" | "lists" | "structure" | "note" | "window";

export interface ShortcutEntry {
  /** The i18n key suffix, and the lookup key into `COMMANDS`. */
  id: string;
  /** Aliases live here; the first one is the one to lead with. */
  keys: string[];
  where: ShortcutWhere;
  group: ShortcutGroup;
  /** Why this binding and not the obvious one. Kept out of the UI. */
  why?: string;
}

export const SHORTCUTS: ShortcutEntry[] = [
  // ---- text ----
  { id: "strong", keys: ["Mod-b"], where: "editor", group: "text" },
  { id: "em", keys: ["Mod-i"], where: "editor", group: "text" },
  { id: "underline", keys: ["Mod-u"], where: "editor", group: "text" },
  { id: "strike", keys: ["Mod-Shift-x"], where: "editor", group: "text" },
  { id: "highlight", keys: ["Mod-Alt-h"], where: "editor", group: "text" },
  { id: "code", keys: ["Mod-Shift-c"], where: "editor", group: "text" },
  { id: "link", keys: ["Mod-k"], where: "editor", group: "text" },
  {
    id: "insertImage",
    keys: ["Mod-Shift-i"],
    where: "editor",
    group: "text",
    why:
      "Was one 'attachment' binding covering both the image and file pickers; split so " +
      "each has its own chord (B32). Image keeps the original Mod-Shift-I — same family " +
      "as Mod-K for a link, the letter of what gets inserted, shifted — since it is the " +
      "more common case.",
  },
  {
    id: "insertFile",
    keys: ["Mod-Shift-a"],
    where: "editor",
    group: "text",
    why: "The other half of the attachment split above: 'a' for attachment, the general case.",
  },
  {
    id: "insertNoteLink",
    keys: ["Mod-Shift-k"],
    where: "editor",
    group: "text",
    why:
      "The shifted form of Mod-K, which is the weblink — the same letter for the same " +
      "idea, and the shift saying 'the internal one', exactly as Mod-Shift-I sits beside " +
      "Mod-K in the family above (B41). Typing `[[` reaches the same picker, which is " +
      "what anyone arriving from Obsidian will try first.",
  },
  {
    id: "insertTable",
    keys: ["Mod-Alt-t"],
    where: "editor",
    group: "structure",
    why:
      "Mod-Shift-T is already the task item, and a table is not a text-level insertion " +
      "like an image or a link — it is a block, which is why it sits in `structure` " +
      "(B42). Mod-Alt is the modifier this registry already uses for a second thing on a " +
      "taken letter, as Mod-Alt-H does for the highlight.",
  },

  // ---- lists ----
  {
    id: "bulletList",
    keys: ["Mod-Shift-l"],
    where: "editor",
    group: "lists",
    why: "Word's own binding for a bulleted list.",
  },
  {
    id: "orderedList",
    keys: ["Mod-Shift-o"],
    where: "editor",
    group: "lists",
    why: "Numbering has no built-in shortcut in Word, so 'o' for ordered fills the gap.",
  },
  {
    id: "task",
    keys: ["Mod-Shift-t", "Mod-Shift-d"],
    where: "editor",
    group: "lists",
    why:
      "Mod-Shift-t is the same family as the other two list keys, so it is guessable " +
      "from them, and it stays first. It was reported dead on Windows three times and " +
      "repaired twice before anyone measured it; `--key-probe` then found the chord " +
      "arriving as a `Ctrl+C` on one machine, and the cause turned out to be an " +
      "AutoHotkey script that machine's owner had written (B71). Nothing about Windows " +
      "and nothing here — so the order is what it always was. Mod-Shift-d stays beside " +
      "it as a second chord rather than being removed: it costs nothing, it is free in " +
      "every scope, 'D' for done, and it is the one that kept working while the cause " +
      "was unknown. Both are claimed from one place, because `editorKeyIntent` asks " +
      "`matches` about the whole entry rather than about one binding.",
  },
  {
    id: "tick",
    keys: ["Mod-Shift-Enter"],
    where: "editor",
    group: "lists",
    why:
      "Returns false on anything that is not a task, so the key stays free there. " +
      "The capture window has to check Shift before treating Mod-Enter as close, or " +
      "this saves and dismisses the note instead of ticking the box.",
  },
  {
    id: "star",
    keys: ["Mod-Shift-s"],
    where: "editor",
    group: "lists",
    why:
      "'S' for star, and free in every scope — this app has no Save, the one letter a " +
      "Mod-Shift chord on 'S' would ordinarily be spoken for by, because a note is " +
      "written 800 ms after the last keystroke and there is nothing to ask for. It sits " +
      "in the list family beside bulletList, orderedList and task because that is what " +
      "it is: a fourth thing to say about the line the caret is on. Deliberately not " +
      "claimed in main (`editor-keys.ts`) — that list exists for one unexplained report " +
      "(B71) and a claim takes the key away from the page, which is a cost with no " +
      "reason behind it here.",
  },
  { id: "indent", keys: ["Tab", "Mod-m"], where: "editor", group: "lists" },
  {
    id: "outdent",
    keys: ["Shift-Tab"],
    where: "editor",
    group: "lists",
    why:
      "Mod-Shift-m used to alias this too, but that chord now belongs to contextMenu " +
      "(B32) — one binding, one owner. Shift-Tab alone remains, still paired with " +
      "indent's own Tab.",
  },

  // ---- structure ----
  {
    id: "heading1",
    keys: ["Mod-1", "Mod-Alt-1"],
    where: "editor",
    group: "structure",
    why:
      "Word uses Ctrl+Alt+1, but on Windows Ctrl+Alt *is* AltGr, and on a Dutch layout " +
      "that combination types characters instead. Mod+1 is the reliable form; the Word " +
      "binding stays as an alias for the muscle memory.",
  },
  { id: "heading2", keys: ["Mod-2", "Mod-Alt-2"], where: "editor", group: "structure" },
  { id: "heading3", keys: ["Mod-3", "Mod-Alt-3"], where: "editor", group: "structure" },
  { id: "heading4", keys: ["Mod-4", "Mod-Alt-4"], where: "editor", group: "structure" },
  { id: "heading5", keys: ["Mod-5", "Mod-Alt-5"], where: "editor", group: "structure" },
  { id: "heading6", keys: ["Mod-6", "Mod-Alt-6"], where: "editor", group: "structure" },
  {
    id: "paragraph",
    keys: ["Mod-0", "Mod-Shift-n"],
    where: "editor",
    group: "structure",
    why:
      "Word's Ctrl+Shift+N is Chromium's 'new incognito window' and never reaches the " +
      "page, so Mod+0 — 'heading zero' — is the one that works. Both are listed because " +
      "the Word binding does arrive on some setups.",
  },
  { id: "softBreak", keys: ["Shift-Enter"], where: "editor", group: "structure" },
  { id: "undo", keys: ["Mod-z"], where: "editor", group: "structure" },
  { id: "redo", keys: ["Mod-Shift-z", "Mod-y"], where: "editor", group: "structure" },

  // ---- the note you are in ----
  {
    id: "find",
    keys: ["Mod-f"],
    where: "editor",
    group: "note",
    why:
      "The chord every application on both platforms uses for 'find in this thing', so " +
      "it is the one nobody has to be told. It shares its spelling with `searchVault` " +
      "below and that collision is deliberate — `where` is what tells them apart — but " +
      "the scopes alone do NOT resolve it, which running it is what showed: " +
      "`outlookKeymap` binds this entry and its command returns true, and that makes " +
      "ProseMirror call `preventDefault()` and nothing else, so the key still reached " +
      "the library's window listener and both fired at once. `find-in-note.ts`'s " +
      "`handleKeyDown` stops it at the editor; that one line is what makes the split " +
      "real. B64.",
  },
  {
    id: "focusTitle",
    keys: ["Mod-Shift-r"],
    where: "global",
    group: "note",
    why:
      "There was no way at all to reach a note's own title from the keyboard: in the " +
      "capture window it is the subject field, in the library it is a title you have to " +
      "click to edit, and neither had a chord. 'R' for rename, which is what the " +
      "library's Actions menu already calls the same act. `where: \"global\"` because " +
      "both windows have a title; what that title *is* differs, so each window handles " +
      "it rather than sharing a control neither of them has.",
  },

  // ---- the capture window itself ----
  {
    id: "close",
    keys: ["Mod-Enter", "Mod-w"],
    where: "capture",
    group: "note",
    why:
      "The gesture that sends a message in Outlook. Escape deliberately does not do " +
      "this: it is far too easy to hit by reflex, and a half-typed note is too easy to " +
      "lose that way.",
  },
  {
    id: "discard",
    keys: ["Mod-Shift-Backspace"],
    where: "capture",
    group: "note",
    why:
      "B68's Discard had a button and nothing else, in a window that is otherwise usable " +
      "without the mouse from the hotkey onwards. Escape is deliberately not this, for " +
      "the reason `close` above already records — it is the key most likely to be hit by " +
      "reflex, and this is the one command in the window that throws work away. Two " +
      "modifiers so it cannot be reached by accident, and Backspace because it is the " +
      "key that already means 'erase what I just did'. Free in every scope: Mod-Backspace " +
      "on its own is the platform's 'delete to start of line' inside a text field, which " +
      "is why the shifted form is the one taken. Guarded on `existing` at the call site, " +
      "the same rule the button is drawn under — a note handed over from the library is " +
      "not this window's to throw away.",
  },
  {
    id: "openLibrary",
    keys: ["Mod-o"],
    where: "capture",
    group: "window",
    why:
      "Was window-local on purpose, on the argument that a second global claim would be " +
      "taken from every other app on the machine for something used a few times a day. " +
      "B60 reverses that: from any window but this one there was no way to reach the " +
      "library at all, which is what 'no shortcut for the note browser' meant. The " +
      "global chord is a *setting* and lives with the capture hotkey (`settings.ts`'s " +
      "`libraryHotkey`), not in this table; this entry stays as the in-window form.",
  },

  // ---- both windows ----
  {
    id: "help",
    keys: ["Mod-/"],
    where: "global",
    group: "window",
    why:
      "F1 dropped: function keys need `fn` on a Mac laptop keyboard, which an everyday " +
      "chord must not require (B32). Mod-/ already worked, so it is now the only form.",
  },

  // ---- the library window's keyboard navigation (package D) ----
  {
    id: "contextMenu",
    keys: ["Mod-Shift-m", "ContextMenu"],
    where: "library",
    group: "window",
    why:
      "The keyboard route into a right-click menu, on whichever row is focused. " +
      "Shift-F10 dropped for the fn-key reason (B32); Mod-Shift-m takes its place, and " +
      "'outdent' gave up its own claim on that chord to make room. 'ContextMenu' is " +
      "its own key on a Windows keyboard and needs no function key, so it stays.",
  },
  {
    id: "cyclePanes",
    keys: ["Ctrl-Tab", "Ctrl-Shift-Tab"],
    where: "library",
    group: "window",
    why:
      "Tab already cycles tree → notes → editor, but it cannot leave the editor: " +
      "keymap.ts binds Tab there to list indent, and that binding always returns true. " +
      "F6 used to be the one key that reached every pane; dropped for the fn-key " +
      "reason (B32) and replaced with the browser's own 'switch tab' chord, which " +
      "keymap.ts has no binding for and so still reaches out of the editor.",
  },
  {
    id: "newNoteHere",
    keys: ["Mod-n"],
    where: "library",
    group: "window",
    why:
      "Starting a note from the library took the mouse: a button in the note list, a " +
      "row in the folder tree's menu, or the global hotkey — which is a *setting* and " +
      "so is not printed here at all. Deliberately not the id `newNote`: that i18n key " +
      "already labels the global hotkey's row in the help sheet, and two rows both " +
      "reading 'New note' against two different chords would be the one screen whose " +
      "job is to be looked up contradicting itself. The longer name is also the truer " +
      "one — this files where the tree is standing (B29), which the global hotkey does " +
      "not.",
  },
  {
    id: "pinNote",
    keys: ["Mod-Shift-p"],
    where: "library",
    group: "window",
    why:
      "B75's pin, and it exists for the rule rather than for the convenience: every " +
      "action in this app has to be reachable without opening a menu, because the " +
      "`--click-button` selftest harness cannot open one — and a context menu was the " +
      "pin's only other route. It acts on the note the list is standing on, the same " +
      "row the context-menu key would open a menu for, so the two gestures cannot come " +
      "to mean different notes. `Mod-Shift-p` was free in every scope.",
  },
  {
    id: "settings",
    keys: ["Mod-,"],
    where: "library",
    group: "window",
    why:
      "The Settings panel had no chord at all: it is reached by the gear in the library's " +
      "title bar and by nothing else, which makes it the one part of the app the " +
      "`--click-button` selftest can reach and the keyboard cannot.\n\n" +
      "`Mod-,` is the platform convention on both platforms at once, which is the whole " +
      "reason it can be one binding: ⌘, is Preferences on macOS in every application " +
      "since the HIG said so, and Ctrl+, is Settings in VS Code and its neighbours on " +
      "Windows and Linux. It shipped for one release as `Mod-.` — asked for as ⌘. and " +
      "taken literally — and the comma is what was meant. `Mod-.` is not kept as an " +
      "alias: it was a mis-spelling of this chord rather than a second way anyone reaches " +
      "for it, and a claim costs the key everywhere for as long as the app runs.\n\n" +
      "The one thing to know about the comma is macOS's own: ⌘, is a *menu* item in most " +
      "Mac applications, and this app has no application menu to put it in " +
      "(`installMinimalMenu`), so it is claimed in the window like every other chord " +
      "here.\n\n" +
      "`where: \"library\"` because that is the only window with a Settings panel — the " +
      "capture window has no such command, and an entry there would print a row in its " +
      "help sheet for a key that does nothing. Handled *after* the overlay guard in " +
      "`Library.tsx`, unlike `help`: while a `HotkeyRow` is armed the panel owns every " +
      "key so the chord can be recorded into a global accelerator, and a toggle placed " +
      "before the guard would close the panel out from under it instead.",
  },
  {
    id: "searchVault",
    keys: ["Mod-f"],
    where: "library",
    group: "window",
    why:
      "The search box was reachable by mouse or by Tabbing to it and by nothing else. " +
      "The shared spelling with `find` above is the whole design, and what actually " +
      "keeps the two apart is written there — it is not this table. The help sheet " +
      "prints both rows in this window on purpose, which is the clearest available " +
      "statement of a chord that means two things. B64.",
  },
];

/** The order groups appear in the help sheet. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  "text",
  "lists",
  "structure",
  "note",
  "window",
];

export function shortcutsWhere(where: ShortcutWhere): ShortcutEntry[] {
  return SHORTCUTS.filter((entry) => entry.where === where);
}

export function shortcut(id: string): ShortcutEntry {
  const found = SHORTCUTS.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no shortcut called ${id}`);
  return found;
}

interface Binding {
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

/**
 * Splits a binding into its parts.
 *
 * The same spelling ProseMirror's keymap uses, so an entry can be handed to it
 * unchanged. Plain `split("-")` is safe because no binding here *is* the "-" key; a
 * shortcut on that character would need the trailing-dash handling ProseMirror does.
 */
function parse(binding: string): Binding {
  const parts = binding.split("-");
  const key = parts.pop() ?? "";
  const has = (name: string): boolean => parts.includes(name);

  return {
    mod: has("Mod"),
    ctrl: has("Ctrl") || has("Control"),
    meta: has("Cmd") || has("Meta"),
    alt: has("Alt") || has("Option"),
    shift: has("Shift"),
    key,
  };
}

/** Only the parts of a `KeyboardEvent` a comparison needs, so tests need no DOM. */
export interface KeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

function keyMatches(binding: Binding, event: KeyEvent, isMac: boolean): boolean {
  if (binding.key.toLowerCase() !== event.key.toLowerCase()) return false;

  const wantsCtrl = binding.ctrl || (binding.mod && !isMac);
  const wantsMeta = binding.meta || (binding.mod && isMac);

  // Every modifier is compared, including the ones the binding does not want. That is
  // the point: the capture window used to treat any Mod+Enter as "save and close"
  // without looking at Shift, so ticking a checkbox dismissed the note.
  return (
    event.ctrlKey === wantsCtrl &&
    event.metaKey === wantsMeta &&
    event.altKey === binding.alt &&
    event.shiftKey === binding.shift
  );
}

/** Does this event fire this shortcut, under any of its aliases? */
export function matches(entry: ShortcutEntry, event: KeyEvent, isMac: boolean): boolean {
  return entry.keys.some((binding) => keyMatches(parse(binding), event, isMac));
}

const MAC_SYMBOLS = {
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  meta: "⌘",
} as const;

const NAMED_KEYS: Record<string, string> = {
  enter: "Enter",
  tab: "Tab",
  escape: "Esc",
  " ": "Space",
};

/**
 * Keys macOS draws rather than spells.
 *
 * The modifiers already have this treatment in `MAC_SYMBOLS`; a chord printed as
 * "⇧⌘Backspace" is three symbols and then a word, which reads as a sheet that gave up
 * halfway. Only the keys where the Mac glyph is the *usual* spelling belong here —
 * Enter and Tab are written out on both platforms.
 */
const MAC_KEYS: Record<string, string> = {
  backspace: "⌫",
};

function keyName(key: string, isMac = false): string {
  if (isMac) {
    const mac = MAC_KEYS[key.toLowerCase()];
    if (mac !== undefined) return mac;
  }
  return NAMED_KEYS[key.toLowerCase()] ?? (key.length === 1 ? key.toUpperCase() : key);
}

/**
 * One binding, spelled the way the platform spells it.
 *
 * macOS order is Control, Option, Shift, Command and the symbols run together; Windows
 * joins the words with a plus. Getting this wrong is small but reads as sloppiness on
 * the one screen whose whole job is to be looked up.
 */
export function formatBinding(binding: string, isMac: boolean): string {
  const parsed = parse(binding);
  const ctrl = parsed.ctrl || (parsed.mod && !isMac);
  const meta = parsed.meta || (parsed.mod && isMac);

  if (isMac) {
    return (
      (ctrl ? MAC_SYMBOLS.ctrl : "") +
      (parsed.alt ? MAC_SYMBOLS.alt : "") +
      (parsed.shift ? MAC_SYMBOLS.shift : "") +
      (meta ? MAC_SYMBOLS.meta : "") +
      keyName(parsed.key, true)
    );
  }

  const parts: string[] = [];
  if (ctrl) parts.push("Ctrl");
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  if (meta) parts.push("Win");
  parts.push(keyName(parsed.key));
  return parts.join("+");
}

/** Every alias for one entry, as one string: "Ctrl+1 or Ctrl+Alt+1". */
export function formatEntry(entry: ShortcutEntry, isMac: boolean, or: string): string {
  return entry.keys.map((binding) => formatBinding(binding, isMac)).join(` ${or} `);
}

/**
 * Just the lead binding for one entry — "⌘Enter" rather than `formatEntry`'s full
 * "⌘Enter or ⌘W". For a spot like the status bar's dismiss hint, where the alias is not
 * worth the width.
 */
export function formatFirstKey(id: string, isMac: boolean): string {
  const [first] = shortcut(id).keys;
  if (first === undefined) throw new Error(`${id} has no keys`);
  return formatBinding(first, isMac);
}

/**
 * The global hotkey, which is a setting rather than a constant.
 *
 * It is stored as the accelerator Electron wants — `CommandOrControl+Alt+N` — so it is
 * translated here rather than being spelled twice.
 */
export function formatAccelerator(accelerator: string, isMac: boolean): string {
  const binding = accelerator
    .split("+")
    .map((part) => (part === "CommandOrControl" || part === "CmdOrCtrl" ? "Mod" : part))
    .join("-");

  return formatBinding(binding, isMac);
}
