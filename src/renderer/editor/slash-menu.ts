import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { translate } from "../../shared/i18n.js";
import { score } from "../library/fuzzy.js";
import type { MenuItem } from "../library/ContextMenu.js";
import { slashMenuItems } from "./editor-menu.js";
import type { CommandContext } from "./commands.js";
import { findTable } from "./table-geometry.js";

/**
 * Typing `/` at the start of a line opens a menu, and going on typing filters it (B51).
 *
 * The gesture anyone arriving from Notion or Obsidian tries first, and the only route to
 * these commands that costs nothing to reach with both hands on the keys — everything here
 * otherwise lives behind a toolbar button, a right-click or a chord.
 *
 * **Plain DOM, not React.** The panel is built and positioned by this plugin, the way
 * `table-toolbar.ts` builds its bar and `attachment-view.ts` its PDF controls. Two reasons,
 * and the first is decisive: the caret has to stay in the note while the list filters, and
 * a React overlay with an input of its own is exactly what takes it away — that is the
 * shape `NotePicker` has, and it is right for a picker that searches a vault and wrong for
 * a menu that reads what you are already typing. The second is that the plugin goes into
 * `createEditorState` once and appears in *both* windows without either window learning
 * anything: everything it needs is already on `CommandContext`.
 *
 * Four things about it are load-bearing:
 *
 * - **It opens only on a `/` typed at the start of an otherwise empty textblock.** A `/`
 *   in a sentence is a slash — a date, a path, an "and/or" — and a menu that opened over
 *   those would be a menu in the way. Noticed in `apply` rather than by an input rule,
 *   which would have to reach out of ProseMirror's own dispatch to open anything (the
 *   hazard `state.ts` documents for `[[`); here the question is asked about a transaction
 *   that has already been applied.
 * - **The `/` stays in the document** while the menu is up, exactly as `[[` does (B41), so
 *   dismissing the menu leaves precisely what was typed and there is nothing to undo.
 * - **The prefix is deleted before the item runs**, never after. Four of the items open a
 *   picker of their own (image, file, note link, table) and insert when it closes; deleting
 *   afterwards would either eat the wrong characters or fight the insertion for the same
 *   position.
 * - **The panel is `position: fixed` and appended to `document.body`**, so it is never part
 *   of the editable document and no transaction can contain it. It is measured and clamped
 *   after mounting, the two-step `ContextMenu` and `TableGrid` both do.
 */

interface SlashState {
  /** Position of the `/` that opened the menu, mapped through every change since. */
  from: number;
}

export const slashMenuKey = new PluginKey<SlashState | null>("slashMenu");

/** What `/` leaves in the document while the menu is up, and what choosing swallows. */
export const SLASH_PREFIX = "/";

/**
 * Whether this transaction is a `/` typed at the start of an empty line.
 *
 * Deliberately narrow. One step, one character, the block empty but for it, and not inside
 * a table — a cell can hold no heading, no list and no divider, so a menu of things that
 * would all decline is worse than no menu.
 */
export function opensSlashMenu(tr: Transaction, state: EditorState): boolean {
  if (!tr.docChanged || tr.steps.length !== 1) return false;
  if (!state.selection.empty) return false;

  const $head = state.selection.$head;
  if (!$head.parent.isTextblock) return false;
  // The whole of the block is the slash: offset 1, and nothing after it.
  if ($head.parentOffset !== 1 || $head.parent.content.size !== 1) return false;
  if ($head.parent.textContent !== SLASH_PREFIX) return false;

  return findTable(state) === null;
}

/** The text between the `/` and the caret, or null when there is no menu to filter. */
export function slashQuery(state: EditorState): string | null {
  const open = slashMenuKey.getState(state);
  if (open === null || open === undefined) return null;

  const { from } = open;
  const head = state.selection.head;
  if (!state.selection.empty || head < from + 1) return null;
  if (from < 0 || head > state.doc.content.size) return null;

  const $from = state.doc.resolve(from);
  const $head = state.doc.resolve(head);
  // Left the block the `/` was typed in — Enter, a click elsewhere, an undo.
  if ($from.parent !== $head.parent) return null;
  if (state.doc.textBetween(from, from + 1) !== SLASH_PREFIX) return null;

  const query = state.doc.textBetween(from + 1, head, " ", " ");
  // A space ends it. `/` is common enough in prose that the menu has to give up the moment
  // what follows stops looking like the name of a command.
  return query.includes(" ") ? null : query;
}

/** The items matching `query`, best first — an empty query keeps the list's own order. */
export function filterSlashItems(items: MenuItem[], query: string): MenuItem[] {
  const selectable = items.filter((item) => item.onSelect !== undefined);
  if (query === "") return selectable;

  return selectable
    .map((item) => ({ item, rank: score(item.label, query) }))
    .filter((scored): scored is { item: MenuItem; rank: number } => scored.rank !== null)
    .sort((a, b) => b.rank - a.rank)
    .map((scored) => scored.item);
}

/**
 * Removes the `/` and whatever has been typed after it.
 *
 * Re-reads the document rather than trusting the range it was handed — the same care
 * `insertNoteLinkOverPrefix` takes, and for the same reason: eating characters out of
 * someone's sentence is worse than leaving two behind.
 */
export function removeSlashPrefix(state: EditorState, from: number): Transaction | null {
  const head = state.selection.head;
  if (from < 0 || head < from + 1 || head > state.doc.content.size) return null;
  if (state.doc.textBetween(from, from + 1) !== SLASH_PREFIX) return null;

  return state.tr.delete(from, head);
}

interface Panel {
  dom: HTMLElement;
  destroy: () => void;
}

function buildPanel(
  view: EditorView,
  items: MenuItem[],
  active: number,
  t: (key: string) => string,
  choose: (index: number) => void,
): Panel {
  const dom = document.createElement("div");
  dom.className = "context-menu slash-menu";
  dom.setAttribute("role", "menu");
  dom.setAttribute("aria-label", t("slash.label"));

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "slash-menu-empty";
    empty.textContent = t("slash.nothing");
    dom.append(empty);
  }

  items.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.tabIndex = -1;
    button.className =
      index === active ? "context-menu-item context-menu-active" : "context-menu-item";

    // The same two spans `ContextMenu.tsx` draws, in the same order and under the same
    // class names: `library-window.ts`'s `--click-button` reads `.context-menu-label`, and
    // this menu is reachable from it only for as long as that stays true.
    const label = document.createElement("span");
    label.className = "context-menu-label";
    label.textContent = item.label;
    button.append(label);

    if (item.shortcut !== undefined) {
      const shortcut = document.createElement("span");
      shortcut.className = "context-menu-shortcut";
      shortcut.textContent = item.shortcut;
      button.append(shortcut);
    }

    // The caret must not leave the note on the way to a click, or the command would act on
    // wherever the selection landed — `table-toolbar.ts` and `checkbox.ts` say the same.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      choose(index);
    });

    dom.append(button);
  });

  document.body.append(dom);

  // Measured and clamped only once it is in the document and has a size to measure.
  //
  // Guarded because `coordsAtPos` needs a laid-out document: it reaches `getClientRects`
  // on a text node, which jsdom does not implement at all and a real Chromium window
  // always does. The same reason `Editor.tsx`'s `focusTask` calls `scrollIntoView?.()`.
  // Where the panel sits is the one thing about it a test cannot check; everything else —
  // the items, the keys, what choosing one does — is exactly what the tests drive.
  let at: { left: number; top: number; bottom: number } | null = null;
  try {
    at = view.coordsAtPos(view.state.selection.head);
  } catch {
    at = null;
  }

  if (at !== null) {
    const box = dom.getBoundingClientRect();
    dom.style.left = `${Math.max(4, Math.min(at.left, window.innerWidth - box.width - 4))}px`;
    // Below the caret when there is room and above it when there is not: this panel is
    // tall enough that a `/` typed near the foot of the window would otherwise open it
    // off the bottom of the screen.
    const below = at.bottom + 4;
    const fits = below + box.height + 4 <= window.innerHeight;
    dom.style.top = `${fits ? below : Math.max(4, at.top - box.height - 4)}px`;
  }

  // The highlight has to stay visible, and this panel clips at `46vh` — so the arrow keys
  // walked it past the bottom edge invisibly, which is the same report `palette-scroll.ts`
  // answers for the note picker, the link picker and the move dialog. Its hook cannot be
  // reused: that one takes a React ref to a `<ul>` and this menu is plain DOM (see the note
  // at the top of this file). What is reused is its answer — `block: "nearest"` is the only
  // option that leaves an already-visible row exactly where it is — and its `typeof` guard,
  // for the same reason: jsdom implements no scrolling at all, so every test that opens this
  // menu would throw here.
  //
  // Its *other* half, `createHoverGuard`, is deliberately not needed. That exists because
  // those three lists take the highlight from `onMouseEnter`, so a list scrolling under a
  // stationary pointer moves the highlight back; this menu binds no `mouseenter` at all.
  // Adding one would bring that bug with it.
  //
  // Placed last because the panel has to be where it will be seen before it is scrolled, and
  // the rows are only offset from a positioned panel. `active` indexes the buttons, so it
  // means nothing when the only child is the "nothing matches" line.
  const row = dom.children[active];
  if (items.length > 0 && row instanceof HTMLElement && typeof row.scrollIntoView === "function") {
    row.scrollIntoView({ block: "nearest" });
  }

  return { dom, destroy: () => dom.remove() };
}

export function slashMenu(context: CommandContext): Plugin<SlashState | null> {
  const t = (key: string): string =>
    context.t === undefined ? translate("en-US", key) : context.t(key);

  /**
   * The live menu, set by `view()` and read by `handleKeyDown` — which is defined out here
   * and so cannot see that closure otherwise. One per plugin instance, and a plugin
   * instance is built per `createEditorState`, so there is never more than one editor
   * behind it.
   */
  let controller: { move: (by: number) => void; pick: () => void; close: () => void } | null =
    null;

  return new Plugin<SlashState | null>({
    key: slashMenuKey,
    state: {
      init: () => null,
      apply: (tr, value, _old, newState) => {
        const meta = tr.getMeta(slashMenuKey) as { close?: true } | undefined;
        if (meta?.close === true) return null;

        if (value === null) {
          return opensSlashMenu(tr, newState) ? { from: newState.selection.head - 1 } : null;
        }

        return { from: tr.mapping.map(value.from, -1) };
      },
    },
    view: (editorView) => {
      let panel: Panel | null = null;
      let active = 0;
      let items: MenuItem[] = [];

      const close = (): void => {
        panel?.destroy();
        panel = null;
        items = [];
        active = 0;
        if (slashMenuKey.getState(editorView.state) !== null) {
          editorView.dispatch(
            editorView.state.tr
              .setMeta(slashMenuKey, { close: true })
              .setMeta("addToHistory", false),
          );
        }
      };

      const choose = (index: number): void => {
        const item = items[index];
        const open = slashMenuKey.getState(editorView.state);
        if (item === undefined || open === null || open === undefined) return;

        // Order matters: the prefix goes first, so the four items that open a picker of
        // their own insert into a line the `/` has already left.
        const tr = removeSlashPrefix(editorView.state, open.from);
        close();
        if (tr !== null) editorView.dispatch(tr);
        editorView.focus();
        item.onSelect?.();
      };

      const draw = (): void => {
        panel?.destroy();
        panel = buildPanel(editorView, items, active, t, choose);
      };

      const redraw = (): void => {
        const query = slashQuery(editorView.state);
        if (query === null) {
          if (panel !== null) close();
          return;
        }

        const all = slashMenuItems(window.emqnote.platform === "darwin", t, {
          run: (command) => {
            command(editorView.state, editorView.dispatch);
            editorView.focus();
          },
          insertImage: () => context.requestImage(),
          insertFile: () => context.requestFile(),
          // No prefix: this menu has already removed its own, and handing `"/"` on would
          // make `insertNoteLinkOverPrefix` look for characters that are no longer there.
          insertNoteLink: () => context.requestNoteLink(""),
          insertTable: () => context.requestTable(),
        });

        items = filterSlashItems(all, query);
        active = Math.min(active, Math.max(0, items.length - 1));
        draw();
      };

      controller = {
        move: (by) => {
          if (panel === null || items.length === 0) return;
          active = (active + by + items.length) % items.length;
          draw();
        },
        pick: () => choose(active),
        close,
      };

      return {
        update: () => redraw(),
        destroy: () => {
          controller = null;
          panel?.destroy();
          panel = null;
        },
      };
    },
    props: {
      /**
       * Only while the menu is up, and only the four keys it owns. Everything else falls
       * through untouched, which is what keeps typing — and so the filtering — working.
       */
      handleKeyDown(view, event) {
        if (controller === null) return false;
        if (slashQuery(view.state) === null) return false;

        switch (event.key) {
          case "ArrowDown":
            controller.move(1);
            return true;
          case "ArrowUp":
            controller.move(-1);
            return true;
          case "Enter":
            controller.pick();
            return true;
          case "Escape":
            // Escape closes the menu and leaves the `/` exactly where it was typed. It
            // does *not* reach the window, where it does nothing in the capture window by
            // design (`Editor.tsx`) — but a key that closed a menu and dismissed something
            // else behind it would be one keystroke doing two things.
            controller.close();
            return true;
          default:
            return false;
        }
      },
    },
  });
}
