import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Node as PMNode } from "prosemirror-model";
import { baseKeymap, chainCommands } from "prosemirror-commands";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { EditorState, type Command } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  enter,
  insertTagPrefix,
  taskCheckboxes,
  toggleTask,
} from "@emqnote/core/editor";
import { emptyDoc, parseNote, serializeBody } from "@emqnote/core/markdown";

export interface MobileEditorHandle {
  focus: () => void;
  getDoc: () => PMNode;
  reset: () => void;
  task: () => void;
  tag: () => void;
}

interface Props {
  initialBody: string;
  onChange: (body: string) => void;
  onSave: () => void;
}

function editorState(body: string, onSave: () => void): EditorState {
  const doc = body === "" ? emptyDoc() : parseNote(body).doc;
  return EditorState.create({
    schema: doc.type.schema,
    doc,
    plugins: [
      history(),
      taskCheckboxes(),
      keymap({
        "Mod-Enter": () => {
          onSave();
          return true;
        },
        Enter: chainCommands(enter, baseKeymap.Enter!),
      }),
      keymap(baseKeymap),
    ],
  });
}

export const MobileEditor = forwardRef<MobileEditorHandle, Props>(function MobileEditor(
  { initialBody, onChange, onSave },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onChange, onSave });
  handlers.current = { onChange, onSave };

  const run = (command: Command): void => {
    const current = view.current;
    if (current === null) return;
    command(current.state, current.dispatch, current);
    current.focus();
  };

  useEffect(() => {
    if (host.current === null) return;

    const created = new EditorView(host.current, {
      state: editorState(initialBody, () => handlers.current.onSave()),
      dispatchTransaction(transaction) {
        const next = created.state.apply(transaction);
        created.updateState(next);
        if (transaction.docChanged) handlers.current.onChange(serializeBody(next.doc));
      },
      attributes: {
        class: "editor-content",
        role: "textbox",
        "aria-label": "Body",
        "aria-multiline": "true",
        spellcheck: "true",
        "data-placeholder": "Write a note…",
      },
    });
    view.current = created;

    return () => {
      created.destroy();
      view.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    getDoc: () => view.current?.state.doc ?? emptyDoc(),
    reset: () => {
      const current = view.current;
      if (current === null) return;
      current.updateState(editorState("", () => handlers.current.onSave()));
    },
    task: () => run(toggleTask),
    tag: () => run(insertTagPrefix),
  }));

  return <div className="editor-host" ref={host} />;
});
