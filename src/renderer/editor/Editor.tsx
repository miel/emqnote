import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { applyLink } from "./commands.js";
import { createEditorState, emptyDocument } from "./state.js";

export interface EditorHandle {
  focus: () => void;
  /** Clears the document. Called on hide, never on show — see the note below. */
  reset: () => void;
  getDoc: () => PMNode | null;
  hasSelection: () => boolean;
  applyLink: (href: string) => void;
}

interface Props {
  onChange: (doc: PMNode) => void;
  onEscape: () => void;
  onLinkRequested: () => void;
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
  { onChange, onEscape, onLinkRequested },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // Held in refs so the effect below can stay dependency-free: recreating the view on
  // a prop change would throw away undo history and the caret.
  const handlers = useRef({ onChange, onEscape, onLinkRequested });
  handlers.current = { onChange, onEscape, onLinkRequested };

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
      handleKeyDown(_editorView, event) {
        if (event.key === "Escape") {
          event.preventDefault();
          handlers.current.onEscape();
          return true;
        }
        return false;
      },
      attributes: { class: "editor-content", spellcheck: "false" },
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
    hasSelection: () => {
      const current = view.current;
      return current !== null && !current.state.selection.empty;
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
