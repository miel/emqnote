import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { applyLink, linkAt, selectLink } from "./commands.js";
import { createEditorState, emptyDocument } from "./state.js";
import { attachmentNodeView } from "./attachment-view.js";

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
}

interface Props {
  onChange: (doc: PMNode) => void;
  onLinkRequested: () => void;
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
  { onChange, onLinkRequested, placeholder },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // Held in refs so the effect below can stay dependency-free: recreating the view on
  // a prop change would throw away undo history and the caret.
  const handlers = useRef({ onChange, onLinkRequested });
  handlers.current = { onChange, onLinkRequested };

  useEffect(() => {
    if (host.current === null) return;

    const created = new EditorView(host.current, {
      state: createEditorState(emptyDocument(), () =>
        handlers.current.onLinkRequested(),
      ),
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
      // Only `wikiEmbed` gets a NodeView: it is the node that can be a picture, and
      // `schema.ts`'s own `toDOM` already renders `wikiLink` as the chip it needs to
      // look like.
      nodeViews: {
        wikiEmbed: attachmentNodeView,
      },
    });

    view.current = created;
    created.focus();

    return () => {
      created.destroy();
      view.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    reset: () => {
      const current = view.current;
      if (current === null) return;
      current.updateState(
        createEditorState(emptyDocument(), () => handlers.current.onLinkRequested()),
      );
    },
    getDoc: () => view.current?.state.doc ?? null,
    setDoc: (doc: PMNode) => {
      const current = view.current;
      if (current === null) return;
      current.updateState(
        createEditorState(doc, () => handlers.current.onLinkRequested()),
      );
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
  }));

  return <div className="editor" ref={host} />;
});
