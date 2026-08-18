import {
  Plugin,
  PluginKey,
  TextSelection,
  type Command,
  type EditorState,
} from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { translate } from "../../shared/i18n.js";
import { matches, shortcut } from "../../shared/shortcuts.js";
import type { CommandContext } from "./commands.js";

/**
 * Finding text inside the note that is open (B63).
 *
 * The one search this app did not have. `IPC.librarySearch` answers "which notes" out of
 * the index; nothing at all answered "where in this one", so a long meeting note had to be
 * read down. Ctrl+F is the chord for it in every application on both platforms, which is
 * why it needs no explaining — see `shortcuts.ts`'s `find` and `searchVault` for how one
 * spelling comes to mean the two different searches without an `if` anywhere.
 *
 * **This writes nothing.** Every match is a `Decoration`, the bar lives outside the
 * editable document, and walking the matches dispatches no transaction at all — so there
 * is no B6 question (nothing reaches the serializer) and no B10 question (opening a note
 * and searching it leaves the file untouched, bytes and mtime both). `test/find-in-note`
 * pins the pure half; the live check is that `npm run canonical` still answers
 * byte-identical after a search.
 *
 * Four decisions, none of them defaults:
 *
 * - **Plain DOM, not React**, exactly as `slash-menu.ts` is and for its second reason: the
 *   plugin goes into `createEditorState` once and both windows have the feature without
 *   either window learning anything. The capture window — the one notes are actually
 *   written in, and the one that must appear inside 80 ms — gets it for nothing.
 * - **No `prosemirror-search`.** B42 and B49 already refused a ProseMirror package whose
 *   model is richer than this schema; here the objection is smaller but the same shape —
 *   that package brings replace, regex and a keymap this app would not use, into the
 *   bundle that has a latency budget. `findMatches` below is forty lines.
 * - **Find, not find-and-replace.** Replace is a second feature, a destructive one, and it
 *   would be the only place in the app that changes many lines at once with no
 *   confirmation and no naming of what it touched (B24's argument, one level down).
 * - **Walking the matches changes no selection.** It scrolls the active decoration's own
 *   DOM node into view. A selection change would put an entry in the history — searching
 *   is not something to undo — and would fight the input for focus. The caret is moved
 *   exactly once, on the way out, because landing on what you found is what makes finding
 *   useful for editing rather than only for looking.
 */

export interface Match {
  from: number;
  to: number;
}

export interface FindState {
  query: string;
  matches: Match[];
  /** Index into `matches`; 0 when there are none. */
  active: number;
  /** Where the caret was when the bar opened, so Escape can put it back. */
  origin: number;
}

export const findKey = new PluginKey<FindState | null>("findInNote");

/** The character an inline atom (a picture, an embed, a chip) stands in for. */
const ATOM = "￼";

/**
 * Every occurrence of `query` in `doc`, in document order and never overlapping.
 *
 * Pure, so the half of this feature that can be tested is — the same split
 * `editor-keys.ts` draws between `editorKeyIntent` and the Electron event it is read from.
 *
 * The text is gathered **per textblock**, not per text node and not over the whole
 * document, and both halves of that matter. Per text node would break every match that
 * crosses a mark boundary: `**offer**te` is two text nodes and has to match `offerte`,
 * which is precisely the case a reader cannot see and so would report as a bug. Over the
 * whole document would let a match run from the end of one paragraph into the start of the
 * next, highlighting a span that is not one thing on screen. A `hardBreak` ends a run for
 * the same reason, and an inline atom becomes one character that nothing types.
 */
export function findMatches(doc: PMNode, query: string): Match[] {
  const needle = query.toLowerCase();
  if (needle === "") return [];

  const matches: Match[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;

    // `positions[k]` is the document position of `text[k]`, which is what turns an index
    // in the flattened string back into a range. An array rather than arithmetic over the
    // pieces: an atom is one character but more than one position, and getting that
    // off-by-one wrong would mark the wrong words rather than fail loudly.
    let text = "";
    const positions: number[] = [];
    let at = pos + 1;

    node.forEach((child) => {
      if (child.isText) {
        const value = child.text ?? "";
        for (let index = 0; index < value.length; index += 1) {
          text += value[index];
          positions.push(at + index);
        }
      } else {
        text += child.type.name === "hardBreak" ? "\n" : ATOM;
        positions.push(at);
      }
      at += child.nodeSize;
    });

    const haystack = text.toLowerCase();
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      const start = positions[index];
      const last = positions[index + needle.length - 1];
      if (start !== undefined && last !== undefined) {
        matches.push({ from: start, to: last + 1 });
      }
      index = haystack.indexOf(needle, index + needle.length);
    }

    // Handled here; a textblock holds only inline content, so there is nothing below it
    // this walk needs to see.
    return false;
  });

  return matches;
}

type Meta =
  | { kind: "open"; query: string }
  | { kind: "query"; query: string }
  | { kind: "step"; by: 1 | -1 }
  | { kind: "close" };

/** What the caret sits on now, when it is a single line worth searching for. */
function seedQuery(state: EditorState): string {
  const { from, to, empty } = state.selection;
  if (empty) return "";
  const text = state.doc.textBetween(from, to, "\n");
  return text.includes("\n") || text.length > 200 ? "" : text;
}

/** Opens the bar, or re-selects it when it is already up. The `find` command's whole body. */
export const openFind: Command = (state, dispatch) => {
  if (dispatch === undefined) return true;
  const open = findKey.getState(state);
  const meta: Meta = { kind: "open", query: open?.query ?? seedQuery(state) };
  dispatch(state.tr.setMeta(findKey, meta).setMeta("addToHistory", false));
  return true;
};

function closeFind(view: EditorView): void {
  const open = findKey.getState(view.state);
  const meta: Meta = { kind: "close" };
  let tr = view.state.tr.setMeta(findKey, meta).setMeta("addToHistory", false);

  // The one selection change this feature makes, and it is the point of it: leaving the
  // bar puts the caret on what was found, so the next keystroke edits there. With nothing
  // found there is nothing to land on, so the caret goes back where it started.
  const target = open?.matches[open.active];
  const at = target?.from ?? open?.origin;
  if (at !== undefined && at <= view.state.doc.content.size) {
    tr = tr.setSelection(TextSelection.create(tr.doc, at)).scrollIntoView();
  }

  view.dispatch(tr);
  view.focus();
}

interface Bar {
  root: HTMLDivElement;
  input: HTMLInputElement;
  count: HTMLSpanElement;
  destroy: () => void;
}

function buildBar(
  view: EditorView,
  t: (key: string) => string,
  step: (by: 1 | -1) => void,
  setQuery: (value: string) => void,
): Bar {
  const root = document.createElement("div");
  root.className = "find-bar";
  root.setAttribute("role", "search");
  root.setAttribute("aria-label", t("find.label"));

  const input = document.createElement("input");
  input.type = "text";
  input.className = "find-input";
  input.placeholder = t("find.placeholder");
  input.setAttribute("aria-label", t("find.label"));

  const count = document.createElement("span");
  count.className = "find-count";

  // Each button carries a word as well as its glyph. `--click-button` matches a button on
  // its own `textContent` (`library-window.ts`), so a bar labelled only `‹ ›` would be a
  // control the self-test cannot reach — the trap `table-toolbar.ts` already documents.
  const button = (
    label: string,
    glyph: string,
    onClick: () => void,
  ): HTMLButtonElement => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "find-button";
    element.title = label;
    element.textContent = `${glyph} ${label}`;
    element.addEventListener("mousedown", (event) => event.preventDefault());
    element.addEventListener("click", onClick);
    return element;
  };

  root.append(
    input,
    count,
    button(t("find.previous"), "‹", () => step(-1)),
    button(t("find.next"), "›", () => step(1)),
    button(t("find.close"), "✕", () => closeFind(view)),
  );

  input.addEventListener("input", () => setQuery(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "Escape") {
      // Stopped as well as prevented: a modal-ish thing that has handled a key must not
      // let it reach the page behind it, or one press does two things — the bug this
      // batch fixes in `Help.tsx`, `ContextMenu.tsx` and `slash-menu.ts`.
      event.preventDefault();
      event.stopPropagation();
      closeFind(view);
      return;
    }
    // Ctrl/Cmd+F again, with focus already in here: re-select rather than toggle shut. The
    // editor's keymap cannot see this — the caret is in an `<input>`, not in the note.
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      input.select();
    }
  });

  document.body.append(root);

  // `position: fixed`, measured against the editor's own rect, which is `slash-menu.ts`'s
  // recipe and is here for a plainer reason: `.editor` is the scroll container, so a child
  // positioned inside it would scroll away with the text it is searching.
  const place = (): void => {
    const rect = view.dom.getBoundingClientRect();
    const width = root.offsetWidth;
    root.style.top = `${Math.max(8, rect.top + 8)}px`;
    root.style.left = `${Math.max(8, rect.right - width - 18)}px`;
  };

  place();
  window.addEventListener("resize", place);

  return {
    root,
    input,
    count,
    destroy: () => {
      window.removeEventListener("resize", place);
      root.remove();
    },
  };
}

export function findInNote(context: CommandContext): Plugin<FindState | null> {
  const t = (key: string): string =>
    context.t === undefined ? translate("en-US", key) : context.t(key);

  return new Plugin<FindState | null>({
    key: findKey,
    state: {
      init: () => null,
      apply: (tr, value, _old, newState) => {
        const meta = tr.getMeta(findKey) as Meta | undefined;

        if (meta?.kind === "close") return null;

        if (meta?.kind === "open") {
          const matches = findMatches(newState.doc, meta.query);
          return {
            query: meta.query,
            matches,
            // Start at the first match at or after the caret, so Ctrl+F in the middle of a
            // long note finds forwards from where you are rather than from the top.
            active: Math.max(
              0,
              matches.findIndex((match) => match.from >= newState.selection.from),
            ),
            origin: value?.origin ?? newState.selection.from,
          };
        }

        if (value === null) return null;

        if (meta?.kind === "query") {
          const matches = findMatches(newState.doc, meta.query);
          return { ...value, query: meta.query, matches, active: 0 };
        }

        if (meta?.kind === "step") {
          if (value.matches.length === 0) return value;
          const active =
            (value.active + meta.by + value.matches.length) % value.matches.length;
          return { ...value, active };
        }

        if (!tr.docChanged) return value;

        // Re-searched rather than mapped. A note is small enough that this costs nothing,
        // and `DecorationSet.map` would keep a range alive across an edit that destroyed
        // the word inside it — a match set that is merely plausible is worse than one that
        // is recomputed.
        const matches = findMatches(newState.doc, value.query);
        return { ...value, matches, active: Math.min(value.active, Math.max(0, matches.length - 1)) };
      },
    },
    view: (editorView) => {
      let bar: Bar | null = null;

      const send = (meta: Meta): void => {
        editorView.dispatch(
          editorView.state.tr.setMeta(findKey, meta).setMeta("addToHistory", false),
        );
      };

      const scrollToActive = (): void => {
        const open = findKey.getState(editorView.state);
        const match = open?.matches[open.active];
        if (match === undefined) return;
        const node = editorView.domAtPos(match.from).node;
        const element = node instanceof Element ? node : node.parentElement;
        // `?.` on the call as well as the reference, for jsdom's benefit — the same
        // reasoning `Editor.tsx`'s `focusTask` spells out.
        element?.scrollIntoView?.({ block: "center" });
      };

      const redraw = (): void => {
        const open = findKey.getState(editorView.state);

        if (open === null || open === undefined) {
          bar?.destroy();
          bar = null;
          return;
        }

        const opening = bar === null;
        if (bar === null) {
          bar = buildBar(
            editorView,
            t,
            (by) => {
              send({ kind: "step", by });
              scrollToActive();
            },
            (query) => send({ kind: "query", query }),
          );
        }

        if (bar.input.value !== open.query && document.activeElement !== bar.input) {
          bar.input.value = open.query;
        }

        bar.count.textContent =
          open.matches.length === 0
            ? open.query === ""
              ? ""
              : t("find.none")
            : `${open.active + 1} ${t("find.of")} ${open.matches.length}`;

        if (opening) {
          bar.input.value = open.query;
          bar.input.focus();
          bar.input.select();
          scrollToActive();
        }
      };

      return {
        update: () => redraw(),
        destroy: () => {
          bar?.destroy();
          bar = null;
        },
      };
    },
    props: {
      decorations: (state) => {
        const open = findKey.getState(state);
        if (open === null || open === undefined || open.matches.length === 0) return null;

        return DecorationSet.create(
          state.doc,
          open.matches.map((match, index) =>
            Decoration.inline(match.from, match.to, {
              class: index === open.active ? "find-match find-match-active" : "find-match",
            }),
          ),
        );
      },
      handleKeyDown: (view, event) => {
        // Mod-F belongs to the editor while the caret is in it, and this is what makes
        // that true rather than merely intended.
        //
        // `outlookKeymap` binds `find` and its command returns `true`, which makes
        // ProseMirror call `preventDefault()` — and nothing else. The key goes on bubbling
        // to `Library.tsx`'s window listener, where the very same chord is `searchVault`,
        // so **both fired**: the bar opened and the caret was immediately taken out of it
        // and put in the vault search box. Measured in the running app, not reasoned about
        // — every unit test passed, because the two live in different modules and neither
        // knows about the other. Same family as B36's trailing slash and B40's missing
        // `corsEnabled`: a property of the runtime, invisible from the source.
        //
        // Deliberately narrow: only this one chord, and only stopped — `false` is returned
        // so the keymap still runs the command, which keeps the binding defined in exactly
        // one place. Making the keymap stop *every* key it handles would be the general
        // fix and a much larger change to how every other chord in the app behaves.
        if (matches(shortcut("find"), event, window.emqnote.platform === "darwin")) {
          event.stopPropagation();
          return false;
        }

        // Escape with the caret still in the note: close the bar, and stop the key here.
        // Without the stop it would also reach `Library.tsx`'s window listener, which
        // reads Escape in the editor as "leave for the note list" — one press, two things.
        if (event.key !== "Escape") return false;
        if (findKey.getState(view.state) === null) return false;
        event.stopPropagation();
        closeFind(view);
        return true;
      },
    },
  });
}
