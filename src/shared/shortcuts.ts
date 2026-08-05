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
    id: "attachment",
    keys: ["Mod-Shift-i"],
    where: "editor",
    group: "text",
    why: "Same family as Mod-K for a link: the letter of what gets inserted, shifted.",
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
    keys: ["Mod-Shift-t"],
    where: "editor",
    group: "lists",
    why: "Same family as the other two list keys, so it is guessable from them.",
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
  { id: "indent", keys: ["Tab", "Mod-m"], where: "editor", group: "lists" },
  { id: "outdent", keys: ["Shift-Tab", "Mod-Shift-m"], where: "editor", group: "lists" },

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
    id: "openLibrary",
    keys: ["Mod-o"],
    where: "capture",
    group: "window",
    why:
      "Window-local on purpose. A second global claim would be taken away from every " +
      "other app on the machine for something used a few times a day at most.",
  },

  // ---- both windows ----
  { id: "help", keys: ["F1", "Mod-/"], where: "global", group: "window" },
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

function keyName(key: string): string {
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
      keyName(parsed.key)
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
