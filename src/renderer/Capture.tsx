import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorState } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../markdown/schema.js";
import { buildEditorMenu } from "./editor/editor-menu.js";
import { Editor, type EditorHandle } from "./editor/Editor.js";
import { HeaderBlock, type HeaderValues } from "./HeaderBlock.js";
import { Help } from "./Help.js";
import { LinkPrompt } from "./LinkPrompt.js";
import { TitleBar } from "./TitleBar.js";
import { formatFirstKey, matches, shortcut } from "../shared/shortcuts.js";
import type { StatusPayload } from "../shared/ipc.js";
import type { VaultFileEvent } from "../shared/vault-types.js";
import { isoWithOffset } from "../shared/time.js";
import { useBootstrap } from "./useBootstrap.js";
import { ContextMenu } from "./library/ContextMenu.js";
// Both from `library/` but used by both windows, the arrangement `ContextMenu` above
// already established — which is also why the `.palette` surface they draw on moved
// into `styles.css`, the only stylesheet this window loads.
import { NotePicker } from "./library/NotePicker.js";
import { TableGrid } from "./TableGrid.js";

const LATENCY_BUDGET_MS = 80;
const CHANGE_DEBOUNCE_MS = 300;

function freshHeader(): HeaderValues {
  return {
    kind: "quick",
    subject: "",
    created: isoWithOffset(new Date()),
    location: "",
    attendees: [],
    tags: [],
  };
}

export function Capture(): React.ReactElement {
  const app = useBootstrap();
  const editor = useRef<EditorHandle>(null);
  const subjectInput = useRef<HTMLInputElement>(null);
  const [header, setHeader] = useState<HeaderValues>(freshHeader);
  // True once an existing note has been handed over from the library window. The
  // subject field disappears then, the same way it does in the reader — the title
  // belongs to Rename, and a second way to set it would let the two drift (B20).
  const [existing, setExisting] = useState(false);
  const [status, setStatus] = useState<StatusPayload>({
    lastLatencyMs: null,
    savedAs: null,
  });
  const [link, setLink] = useState<{ href: string } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  /**
   * A one-line, no-buttons notice for a disk-level change to the note currently held
   * here — see the module comment near `onVaultFileChanged` below for the shapes.
   */
  const [diskNotice, setDiskNotice] = useState<string | null>(null);

  /**
   * Whether the renderer believes it has typed something not yet reflected in what
   * main last loaded or reset this window to.
   *
   * Main's own view of the session (`CaptureWriter`'s `lastContent`) only reflects what
   * has already been *sent* over IPC, and this renderer deliberately holds keystrokes
   * locally for its own 300ms debounce before sending — so main genuinely cannot
   * honestly answer "does the capture window currently have unsaved edits" on its own.
   * This ref is the renderer's own answer instead, kept where the truth actually lives.
   *
   * It over-reports in some edge cases — it does not know whether main has already
   * durably written the exact bytes it is holding — and that is an intentional bias:
   * showing a needless notice costs nothing, silently discarding something the user
   * typed is the one failure mode worth designing against here.
   */
  const dirtyRef = useRef(false);

  /** The note panel's right-click formatting menu — `Library.tsx`'s reader has its own copy. */
  const [editorMenu, setEditorMenu] = useState<{
    x: number;
    y: number;
    state: EditorState;
  } | null>(null);

  // The one path the two toolbar buttons, the two keyboard shortcuts and the right-click
  // menu's two items all eventually reach — but only this one, the picker, is triggered
  // from outside the editor, so it is the only one that needs a handler up here. Same
  // flow, differing only in the picker's filter (`ipc.ts`'s `pickAttachment`).
  const pickAndInsertImage = useCallback(async () => {
    const name = await window.emqnote.pickAttachment("image");
    if (name !== null) editor.current?.insertAttachment(name);
  }, []);

  const pickAndInsertFile = useCallback(async () => {
    const name = await window.emqnote.pickAttachment("any");
    if (name !== null) editor.current?.insertAttachment(name);
  }, []);

  /**
   * The note picker (B41) and the table grid (B42), in the capture window as well as the
   * library — the whole point being that they are reachable in the window notes are
   * actually written in. `prefix` is what the user typed to get here (`"[["` or nothing),
   * swallowed on insertion.
   */
  const [notePick, setNotePick] = useState<{ prefix: string; query: string } | null>(null);
  const [tableGrid, setTableGrid] = useState<{ x: number; y: number } | null>(null);

  const openNotePicker = useCallback((prefix: string) => {
    setNotePick({ prefix, query: editor.current?.getSelectedText() ?? "" });
  }, []);

  // Held in refs so the listeners below never close over stale values.
  const headerRef = useRef(header);
  headerRef.current = header;
  const linkOpenRef = useRef(false);
  linkOpenRef.current = link !== null;
  const overlayOpenRef = useRef(false);
  overlayOpenRef.current = notePick !== null || tableGrid !== null;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback((doc: PMNode) => {
    const values = headerRef.current;
    window.emqnote.change({
      doc: doc.toJSON(),
      kind: values.kind,
      subject: values.subject,
      created: values.created,
      location: values.location,
      attendees: values.attendees,
      tags: values.tags,
    });
  }, []);

  const onDocChange = useCallback(
    (doc: PMNode) => {
      dirtyRef.current = true;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => send(doc), CHANGE_DEBOUNCE_MS);
    },
    [send],
  );

  // A header change has to reach main too, otherwise a subject typed after the last
  // keystroke in the body would never be saved.
  const onHeaderChange = useCallback(
    (values: HeaderValues) => {
      dirtyRef.current = true;
      setHeader(values);
      headerRef.current = values;
      const doc = editor.current?.getDoc();
      if (doc !== null && doc !== undefined) send(doc);
    },
    [send],
  );

  useEffect(() => {
    const stopShow = window.emqnote.onShow(({ token }) => {
      // The title, unless there is none to put a caret in: the subject field only
      // renders for a brand-new note (`variant === "capture"`). A note handed over from
      // the library has no subject field at all — its title belongs to Rename — so the
      // ref is simply never attached and this falls back to the editor.
      if (subjectInput.current !== null) subjectInput.current.focus();
      else editor.current?.focus();

      // Wait two frames: the first is only scheduled, after the second something is
      // actually on screen. Only then is "hotkey to blinking caret" measured honestly.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.emqnote.painted(token));
      });
    });

    // Clearing happens on hide, while nobody is waiting — never on the way in.
    const stopReset = window.emqnote.onReset(() => {
      editor.current?.reset();
      setHeader(freshHeader());
      setExisting(false);
      setLink(null);
      setStatus((previous) => ({ ...previous, savedAs: null }));
      dirtyRef.current = false;
      setDiskNotice(null);
    });

    const stopStatus = window.emqnote.onStatus(setStatus);

    // The library window handed over a note it already has on disk. Loaded straight
    // into the editor and header state rather than through `onHeaderChange`/the
    // editor's own `onChange`, so nothing is sent back to main and nothing is written
    // just for having been opened — the same rule B10 puts on the reader.
    const stopLoad = window.emqnote.onLoad((note) => {
      editor.current?.setDoc(schema.nodeFromJSON(note.doc) as PMNode);
      const fields: HeaderValues = {
        kind: note.kind,
        subject: note.title,
        created: note.created,
        location: note.location,
        attendees: note.attendees,
        tags: note.tags,
      };
      setHeader(fields);
      headerRef.current = fields;
      setExisting(true);
      setLink(null);
      setStatus((previous) => ({ ...previous, savedAs: note.path }));
      dirtyRef.current = false;
      setDiskNotice(null);
    });

    /**
     * The note held here changed or disappeared on disk from outside this app. Main
     * only ever sends this for the one note `writer.activePath()` says this window has
     * claimed (see `notifyFileEvent` in `index.ts`), so there is no path to check here —
     * every event that arrives is about the note already on screen.
     *
     *  - "changed" while `!dirtyRef.current`: nothing of the user's own to lose, so
     *    reread it — `reloadNote()` reuses the exact hand-over path a fresh
     *    `openInCapture` uses, ending in the same `onLoad` above (which clears
     *    `dirtyRef` and this notice for the freshly loaded note).
     *  - "changed" while dirty, and "removed" regardless of `dirtyRef.current`: a
     *    one-line notice with no buttons. A window where the user may be actively
     *    mid-sentence must never offer a button that could discard what they are
     *    currently typing — and for "removed" specifically, the capture session keeps
     *    writing to the same path it already has open, so the next debounced write
     *    simply recreates the file, which in this window — unlike the library reader —
     *    is the behaviour the person actively composing a note here actually wants.
     */
    const stopVaultFileChanged = window.emqnote.onVaultFileChanged((event) => {
      if (event.kind === "changed" && !dirtyRef.current) {
        setDiskNotice(null);
        void window.emqnote.reloadNote();
        return;
      }

      setDiskNotice(
        event.kind === "changed" ? "diskChange.captureChanged" : "diskChange.captureRemoved",
      );
    });

    return () => {
      stopShow();
      stopReset();
      stopStatus();
      stopLoad();
      stopVaultFileChanged();
    };
  }, []);

  /**
   * The window-level keys, tested against the same registry the editor is built from.
   *
   * Hand-rolled because they act on the window rather than on the document, but no
   * longer hand-*matched*: `matches` compares every modifier, including the ones the
   * binding does not want. The chain of `if (mod && event.key === …)` conditions it
   * replaces did not, which is how Ctrl+Shift+Enter — ticking a checkbox — reached the
   * "save and close" branch and dismissed the note.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // While the link box, the note picker or the table grid is open, it owns the
      // keyboard — a window-level shortcut would otherwise throw focus back into the note
      // and leave the overlay hanging there.
      if (linkOpenRef.current || overlayOpenRef.current) return;

      const fires = (id: string): boolean => matches(shortcut(id), event, app.isMac);

      if (fires("help")) {
        event.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }

      if (fires("close")) {
        event.preventDefault();
        window.emqnote.close();
        return;
      }

      if (fires("openLibrary")) {
        event.preventDefault();
        window.emqnote.openLibrary();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [app.isMac]);

  const overBudget =
    status.lastLatencyMs !== null && status.lastLatencyMs > LATENCY_BUDGET_MS;

  return (
    <div className="window">
      <TitleBar
        onClose={() => window.emqnote.close()}
        native={app.isMac}
        isMac={app.isMac}
        t={app.t}
      />

      <HeaderBlock
        variant={existing ? "reader" : "capture"}
        values={header}
        onChange={onHeaderChange}
        onLeave={() => editor.current?.focus()}
        locale={app.locale}
        t={app.t}
        subjectRef={subjectInput}
      />

      <Editor
        ref={editor}
        placeholder={app.t("capture.placeholder")}
        onChange={onDocChange}
        onLinkRequested={() => setLink(editor.current?.beginLinkEdit() ?? null)}
        onImageRequested={() => void pickAndInsertImage()}
        onFileRequested={() => void pickAndInsertFile()}
        onNoteLinkRequested={openNotePicker}
        onTableRequested={() => setTableGrid(editor.current?.caretPoint() ?? { x: 200, y: 200 })}
        onContextMenu={(payload) => setEditorMenu(payload)}
        t={app.t}
      />

      {editorMenu !== null && (
        <ContextMenu
          x={editorMenu.x}
          y={editorMenu.y}
          onClose={() => setEditorMenu(null)}
          items={buildEditorMenu(editorMenu.state, app.isMac, app.t, {
            run: (command) => editor.current?.runCommand(command),
            insertImage: () => void pickAndInsertImage(),
            insertFile: () => void pickAndInsertFile(),
            insertNoteLink: () => openNotePicker(""),
            // Where the menu is, not where the caret is: the pointer is already here and
            // the menu is about to close from under it.
            insertTable: () => setTableGrid({ x: editorMenu.x, y: editorMenu.y }),
          })}
        />
      )}

      {notePick !== null && (
        <NotePicker
          initialQuery={notePick.query}
          t={app.t}
          onCancel={() => {
            setNotePick(null);
            editor.current?.focus();
          }}
          onPick={(candidate) => {
            setNotePick(null);
            editor.current?.insertNoteLink(candidate.target, candidate.title, notePick.prefix);
          }}
        />
      )}

      {tableGrid !== null && (
        <TableGrid
          x={tableGrid.x}
          y={tableGrid.y}
          t={app.t}
          onCancel={() => {
            setTableGrid(null);
            editor.current?.focus();
          }}
          onPick={(rows, columns) => {
            setTableGrid(null);
            editor.current?.insertTable(rows, columns);
          }}
        />
      )}

      {link !== null && (
        <LinkPrompt
          initialHref={link.href}
          onApply={(href) => {
            editor.current?.applyLink(href);
            setLink(null);
            editor.current?.focus();
          }}
          onCancel={() => {
            setLink(null);
            editor.current?.focus();
          }}
          t={app.t}
          onApplyAndClose={(href) => {
            editor.current?.applyLink(href);
            setLink(null);
            window.emqnote.close();
          }}
        />
      )}

      <div className="statusbar">
        <span className="filename">
          {status.savedAs === null
            ? app.t("capture.nothingSaved")
            : `${app.t("capture.savedAs")} ${status.savedAs.split(/[\\/]/).pop()}`}
        </span>
        {/* No buttons here, deliberately — see the comment on `onVaultFileChanged`
            above. A window where the user may be mid-sentence must never offer a
            choice that could discard what is currently being typed. */}
        {diskNotice !== null && <span className="disk-notice">{app.t(diskNotice)}</span>}
        {/* Moved out of the header when the tag field took its place. A learn-once
            hint belongs in the ambient chrome anyway, not in a row of fields. */}
        <span className="dismiss-hint">
          {formatFirstKey("close", app.isMac)} {app.t("capture.dismiss")}
        </span>
        <button
          type="button"
          className="help-button"
          title={app.t("shortcut.insertImage")}
          onClick={() => void pickAndInsertImage()}
        >
          🖼
        </button>
        <button
          type="button"
          className="help-button"
          title={app.t("shortcut.insertFile")}
          onClick={() => void pickAndInsertFile()}
        >
          📎
        </button>
        <button
          type="button"
          className="help-button"
          title={app.t("shortcut.insertNoteLink")}
          onClick={() => openNotePicker("")}
        >
          🔗
        </button>
        <button
          type="button"
          className="help-button"
          title={app.t("shortcut.insertTable")}
          onClick={() => setTableGrid(editor.current?.caretPoint() ?? { x: 200, y: 200 })}
        >
          ▦
        </button>
        <button
          type="button"
          className="help-button"
          title={app.t("help.title")}
          onClick={() => setHelpOpen(true)}
        >
          ?
        </button>
        <span className="latency" data-over-budget={overBudget}>
          {status.lastLatencyMs === null ? "" : `${status.lastLatencyMs.toFixed(0)} ms`}
        </span>
      </div>

      {helpOpen && (
        <Help
          window="capture"
          isMac={app.isMac}
          hotkey={app.hotkey}
          t={app.t}
          onClose={() => {
            setHelpOpen(false);
            editor.current?.focus();
          }}
        />
      )}
    </div>
  );
}
