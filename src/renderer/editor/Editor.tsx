import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import { applyLink, linkAt, selectLink, type CommandContext } from "./commands.js";
import { createEditorState, emptyDocument } from "./state.js";
import {
  attachmentNodeView,
  externalImageView,
  wikiLinkNodeView,
} from "./attachment-view.js";
import { clipboardText } from "./clipboard-text.js";
import { transformPastedImages } from "./paste-images.js";
import { focusTaskAt } from "./focus-task.js";
import { clearTaskHighlight } from "./task-highlight.js";
import {
  handleAttachmentDrop,
  handleAttachmentPaste,
  insertAttachment,
} from "./insert-attachment.js";

/** How long a task clicked in the Tasks view stays highlighted before fading on its own. */
const TASK_HIGHLIGHT_MS = 10_000;

export interface EditorHandle {
  focus: () => void;
  /** Clears the document. Called on hide, never on show — see the note below. */
  reset: () => void;
  getDoc: () => PMNode | null;
  /**
   * Loads an existing note. Replaces the whole state, so undo history from the
   * previous note cannot leak into this one — undoing your way back into a file you
   * are no longer looking at would be a good way to corrupt it.
   */
  setDoc: (doc: PMNode) => void;
  /**
   * Prepares a link edit and reports the address already there.
   *
   * Returns null when there is nothing to link: no selection and no link at the caret.
   * When the caret sits inside a link, the whole link is selected first, so applying
   * the new address replaces all of it rather than splitting it in two.
   */
  beginLinkEdit: () => { href: string } | null;
  applyLink: (href: string) => void;
  /** Replaces the selection with a wiki reference to an already-stored attachment. */
  insertAttachment: (name: string) => void;
  /** Moves the caret to the ordinal-th task item and scrolls it into view. */
  focusTask: (ordinal: number) => void;
  /**
   * Runs a plain ProseMirror command against the live view and refocuses it — what the
   * note panel's right-click menu needs to carry out the item the caller picked, built
   * from the same `EditorState` by `editor-menu.ts`'s pure `buildEditorMenu`.
   */
  runCommand: (command: Command) => void;
}

interface Props {
  onChange: (doc: PMNode) => void;
  onLinkRequested: () => void;
  /** The toolbar button and the keyboard shortcut both funnel through this. */
  onAttachmentRequested: () => void;
  /**
   * A right-click (or the `ContextMenu` key/Shift+F10) inside the note panel, in either
   * window — `Capture.tsx` and the library reader both pass this through to build the
   * same formatting menu from `editor-menu.ts`. Absent means no custom menu at all, and
   * the browser's own falls through undisturbed.
   */
  onContextMenu?: (payload: { x: number; y: number; state: EditorState }) => void;
  /** Shown while the document is empty, via CSS. */
  placeholder?: string;
}

/**
 * The editor lives for the lifetime of the app, like the window around it.
 *
 * Everything expensive — creating the view, building the state, laying out the first
 * frame — happens once at startup. Showing the window then costs a `focus()` and
 * nothing else, and clearing the document happens on *hide*, when nobody is waiting.
 * The measurements on Windows leave no room to do that work on the way in.
 */
export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { onChange, onLinkRequested, onAttachmentRequested, onContextMenu, placeholder },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The pending "un-highlight" for `focusTask` below. Cleared and re-armed on every
  // call, and dropped outright by `reset`/`setDoc`/unmount, so it can never fire against
  // a note the highlight no longer belongs to — harmless either way since `apply` only
  // ever clears whatever is there, but a timer with nothing left to do is one less thing
  // running.
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHighlightTimer = (): void => {
    if (highlightTimer.current === null) return;
    clearTimeout(highlightTimer.current);
    highlightTimer.current = null;
  };

  // Held in refs so the effect below can stay dependency-free: recreating the view on
  // a prop change would throw away undo history and the caret.
  const handlers = useRef({ onChange, onLinkRequested, onAttachmentRequested, onContextMenu });
  handlers.current = { onChange, onLinkRequested, onAttachmentRequested, onContextMenu };

  // Built fresh each time rather than stored, since it only ever wraps the ref above —
  // there is nothing here `state.ts`'s `createEditorState` needs to hold onto.
  const commandContext = (): CommandContext => ({
    openLinkPrompt: () => handlers.current.onLinkRequested(),
    requestAttachment: () => handlers.current.onAttachmentRequested(),
  });

  useEffect(() => {
    if (host.current === null) return;

    const created = new EditorView(host.current, {
      state: createEditorState(emptyDocument(), commandContext()),
      dispatchTransaction(transaction) {
        const next = created.state.apply(transaction);
        created.updateState(next);
        if (transaction.docChanged) handlers.current.onChange(next.doc);
      },
      // Escape deliberately does nothing here. It is far too easy to hit by reflex,
      // and losing a half-typed note to a stray keypress is unforgivable. Dismissing
      // is Ctrl+Enter, handled at window level.
      attributes: {
        class: "editor-content",
        spellcheck: "false",
        ...(placeholder === undefined ? {} : { "data-placeholder": placeholder }),
      },
      // `wikiEmbed` can be a picture; `wikiLink` needs no different a look, only a
      // click that opens whatever it names in the system viewer.
      nodeViews: {
        wikiEmbed: attachmentNodeView,
        wikiLink: wikiLinkNodeView,
        // A remote `![alt](https://…)`, which the CSP will never draw: shown as a
        // label rather than as a broken-image glyph. See `attachment-view.ts`.
        image: externalImageView,
      },
      // Pictures inside a pasted web page. The half that needs no network runs here,
      // synchronously, before the slice lands; the download half is the `remoteImages`
      // plugin in `state.ts`. Every other node in the slice is left exactly as
      // ProseMirror parsed it — the Outlook `mso-list` work (§6.3) owns those.
      transformPasted: transformPastedImages,
      // A screenshot pasted from the clipboard or a file dropped from Explorer/Finder —
      // see `insert-attachment.ts` for why a paste is image-only while a drop also
      // takes a PDF, and why both decline (return false) on anything else so the
      // ordinary text/HTML paste path is untouched.
      handlePaste: handleAttachmentPaste,
      handleDrop: handleAttachmentDrop,
      // The `text/plain` flavour of a copy. The default flattens a list to its text and
      // drops every bullet, number and box on the way out — see `clipboard-text.ts`.
      clipboardTextSerializer: clipboardText,
    });

    view.current = created;
    created.focus();

    return () => {
      clearHighlightTimer();
      created.destroy();
      view.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    reset: () => {
      const current = view.current;
      if (current === null) return;
      clearHighlightTimer();
      current.updateState(createEditorState(emptyDocument(), commandContext()));
    },
    getDoc: () => view.current?.state.doc ?? null,
    setDoc: (doc: PMNode) => {
      const current = view.current;
      if (current === null) return;
      clearHighlightTimer();
      current.updateState(createEditorState(doc, commandContext()));
    },
    beginLinkEdit: () => {
      const current = view.current;
      if (current === null) return null;

      const existing = linkAt(current.state);
      if (existing !== null) {
        selectLink(existing)(current.state, current.dispatch);
        return { href: existing.href };
      }

      return current.state.selection.empty ? null : { href: "" };
    },
    applyLink: (href: string) => {
      const current = view.current;
      if (current === null) return;
      applyLink(href)(current.state, current.dispatch);
      current.focus();
    },
    insertAttachment: (name: string) => {
      const current = view.current;
      if (current === null) return;
      insertAttachment(current, name);
    },
    focusTask: (ordinal: number) => {
      const current = view.current;
      if (current === null) return;
      clearHighlightTimer();
      // `Library.tsx` calls `setDoc` and `focusTask` in the same tick, so the document
      // `focusTaskAt` is about to select into has not been laid out yet — the browser
      // has not run layout for it, so `tr.scrollIntoView()` computes against geometry
      // that either doesn't exist yet or still belongs to the previous note. Waiting a
      // frame lets layout catch up first; the explicit `scrollIntoView` call below,
      // against the DOM node the new selection actually resolves to, is what then
      // does the scrolling — the transaction's own `scrollIntoView()` stays (it costs
      // nothing and helps when the document was already laid out) but is not trusted
      // alone.
      requestAnimationFrame(() => {
        const deferred = view.current;
        if (deferred === null) return;
        focusTaskAt(deferred, ordinal);
        const pos = deferred.state.selection.from;
        const node = deferred.domAtPos(pos).node;
        const element = node instanceof Element ? node : node.parentElement;
        // `?.` on the call, not only the reference: jsdom (the test environment) has
        // no layout engine and does not implement `scrollIntoView` at all, and a real
        // Chromium window always does — so this stays a no-op under test rather than a
        // thrown `TypeError`, without needing a mock in every test that reaches here.
        element?.scrollIntoView?.({ block: "center" });
      });
      highlightTimer.current = setTimeout(() => {
        highlightTimer.current = null;
        if (view.current !== null) clearTaskHighlight(view.current);
      }, TASK_HIGHLIGHT_MS);
    },
    runCommand: (command: Command) => {
      const current = view.current;
      if (current === null) return;
      command(current.state, current.dispatch);
      current.focus();
    },
  }));

  return (
    <div
      className="editor"
      ref={host}
      onContextMenu={(event) => {
        if (handlers.current.onContextMenu === undefined) return;
        const current = view.current;
        if (current === null) return;
        event.preventDefault();
        handlers.current.onContextMenu({ x: event.clientX, y: event.clientY, state: current.state });
      }}
    />
  );
});
