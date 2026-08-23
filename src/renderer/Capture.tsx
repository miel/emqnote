import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorState } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { bodyTagsOf } from "../markdown/note-tags.js";
import { schema } from "../markdown/schema.js";
import { buildEditorMenu, insertMenuItems } from "./editor/editor-menu.js";
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
  /**
   * The `#tag`s the note body carries, drawn beside the Tags field (B65).
   *
   * Recomputed on the same 300 ms debounce the change already waits out, never per
   * keystroke: `bodyTagsOf` serializes the body to read them, and this window has a 16 ms
   * keystroke budget. Setting it touches neither `dirtyRef` nor `send` — it is a display
   * value, and a note must never be written for having been looked at (B10).
   */
  const [bodyTags, setBodyTags] = useState<string[]>([]);
  /**
   * Bumped whenever this window starts on a different note — a hand-over from the library
   * or a reset on hide. It is `HeaderBlock`'s `key`, so the block remounts and its
   * half-typed tag and attendee buffers go with it; without that, text left in the tag
   * field of the note just dismissed is shown for the next one and committed to it on the
   * following blur. See `HeaderBlock`'s comment on `attendeeText`.
   */
  const [session, setSession] = useState(0);
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
  /**
   * The status bar's "Insert" menu — the same four items as the library reader's, from
   * `insertMenuItems`. It replaced four icon buttons (🖼 📎 🔗 ▦) sitting between the
   * filename and the "?" button, which is the clutter that was reported in the reader
   * header; leaving them here would give one app two vocabularies for one action.
   */
  const [insertMenu, setInsertMenu] = useState<{ x: number; y: number } | null>(null);
  /**
   * The Actions menu, which in this window holds one thing (B82).
   *
   * Its own state rather than a flag on `insertMenu`: the two open from different buttons
   * at different points, and one of them is `null` while the other is a rect. Named to
   * match the library's `readerMenu` in intent — same button, same position, same items
   * where the items make sense here.
   */
  const [actionsMenu, setActionsMenu] = useState<{ x: number; y: number } | null>(null);

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
  const existingRef = useRef(false);
  existingRef.current = existing;

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
      timer.current = setTimeout(() => {
        send(doc);
        setBodyTags(bodyTagsOf(doc));
      }, CHANGE_DEBOUNCE_MS);
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

      // The clock reads at the moment the note is begun, not at the moment the last one
      // was put away.
      //
      // Everything else this window clears happens on hide, in `onReset` below, and that
      // is right — clearing while nobody is waiting costs nothing. `created` is the one
      // value for which it is wrong, because a stamp is about *when*, and the window is
      // hidden for as long as it is not being used. `freshHeader()` runs at renderer
      // mount (once, at login, since this window is created at startup and never
      // destroyed) and again on every hide, so When showed app-launch time for the first
      // note of the day and the previous note's dismissal time for every one after it.
      // Discarding is what made it obvious, being the quickest way to hide and re-show,
      // but Escape, the X and Ctrl+Enter all leave the same stale stamp behind.
      //
      // Only for a note this window is composing itself: one handed over from the
      // library owns its own `created`, which `onLoad` sets from the file. `headerRef`
      // is updated in step for `send`'s sake, exactly as `onHeaderChange` does — the
      // render that would refresh it lands well inside the 300 ms change debounce, but
      // depending on that ordering is not a thing to leave implicit.
      //
      // And only for one nothing has been typed into. `reveal()` sends this on *every*
      // hotkey press, including one aimed at a window that is already open and already
      // has a note in it — the `isVisible()` check in there guards `show()`, not the
      // message — so without `dirtyRef` the hotkey would quietly move the date of the
      // note being written. `dirtyRef` over-reports by design, and here that bias is the
      // right way round: the cost of not re-stamping is a stale minute on a note the
      // user is looking at, and the cost of re-stamping is rewriting a value they may
      // have set by hand.
      if (!existingRef.current && !dirtyRef.current) {
        const next = { ...headerRef.current, created: isoWithOffset(new Date()) };
        headerRef.current = next;
        setHeader(next);
      }

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
      setBodyTags([]);
      setSession((n) => n + 1);
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
      // Handed over by main, which read them off the file's own text — the same reading
      // `summarise` does, so the chips and the note list cannot disagree about one note.
      setBodyTags(note.bodyTags);
      setSession((n) => n + 1);
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

      if (fires("discard")) {
        // The same rule the button below is drawn under, spelled here as well rather than
        // left to main: a note handed over from the library is not this window's to throw
        // away. `CaptureWriter.discard` answers `null` for such a session anyway, so this
        // is the outer of two independent locks, not the only one — but a chord that
        // silently does nothing is better than one that reaches a handler to be refused.
        if (existingRef.current) return;
        event.preventDefault();
        window.emqnote.discard();
        return;
      }

      if (fires("openLibrary")) {
        event.preventDefault();
        window.emqnote.openLibrary();
        return;
      }

      if (fires("focusTitle")) {
        // The subject field only renders for a brand-new note (`variant === "capture"`);
        // a note handed over from the library has none, and its title belongs to Rename in
        // the reader. So the chord simply declines there, the same fallback the `onShow`
        // handler above already makes.
        if (subjectInput.current === null) return;
        event.preventDefault();
        subjectInput.current.focus();
        subjectInput.current.select();
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
        key={session}
        variant={existing ? "reader" : "capture"}
        values={header}
        onChange={onHeaderChange}
        onLeave={() => editor.current?.focus()}
        locale={app.locale}
        t={app.t}
        bodyTags={bodyTags}
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
        loadRemoteImages={app.loadRemoteImages}
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

      {insertMenu !== null && (
        <ContextMenu
          x={insertMenu.x}
          y={insertMenu.y}
          onClose={() => setInsertMenu(null)}
          items={insertMenuItems(app.isMac, app.t, {
            run: (command) => editor.current?.runCommand(command),
            insertImage: () => void pickAndInsertImage(),
            insertFile: () => void pickAndInsertFile(),
            insertNoteLink: () => openNotePicker(""),
            insertTable: () =>
              setTableGrid(editor.current?.caretPoint() ?? { x: 200, y: 200 }),
          })}
        />
      )}

      {actionsMenu !== null && (
        <ContextMenu
          x={actionsMenu.x}
          y={actionsMenu.y}
          onClose={() => setActionsMenu(null)}
          items={[
            {
              label: app.t("capture.discard"),
              // The chord beside what it does, read off the registry rather than spelled
              // here — the same rule the dismiss hint in this bar follows, and the reason
              // B80's key has one spelling.
              shortcut: formatFirstKey("discard", app.isMac),
              danger: true,
              // No confirmation in front of it: the note goes to `_trash` and comes back
              // out through Restore, which is B54's own argument for why dragging a note
              // onto the trash asks nothing either.
              onSelect: () => window.emqnote.discard(),
            },
          ]}
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
        {/* The notice carries no buttons, deliberately — see the comment on
            `onVaultFileChanged` above. A window where the user may be mid-sentence must
            never offer a *choice* that could discard what is currently being typed.
            Discard below is not that: it is asked for, it is about this note rather than
            about a disk event nobody expected, and what it does is reversible. */}
        {diskNotice !== null && <span className="disk-notice">{app.t(diskNotice)}</span>}
        {/* Moved out of the header when the tag field took its place. A learn-once
            hint belongs in the ambient chrome anyway, not in a row of fields. */}
        <span className="dismiss-hint">
          {formatFirstKey("close", app.isMac)} {app.t("capture.dismiss")}
        </span>
        <button
          type="button"
          className="help-button insert-button"
          title={app.t("library.insert")}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            // Above the button, not below it: this bar is at the foot of the window, so
            // a menu opening downwards would be clamped back over the button it came
            // from. `ContextMenu` clamps to the viewport, and this hands it a point it
            // can honour.
            setInsertMenu({ x: rect.left, y: rect.top });
          }}
        >
          {app.t("library.insert")}
        </button>
        {/* **Discard used to be a button of its own here; it is the one item in this
            menu.** Insert beside Actions is the pair the library's note editor carries,
            and a window that shares this app's editor should not carry a different set of
            controls in a different order.

            One item, and the four the library offers are deliberately absent. Rename is
            what the title field above already is. Move refuses a note this window has
            claimed — `IPC.libraryMoveNote` says so — and this window has claimed it by
            definition. Duplicate makes a copy nothing here would open. Reveal wants a
            file, and for most of this window's life there is not one yet.

            The button is drawn only for a brand-new note, exactly as the Discard button
            was: a note handed over from the library is not this window's to throw away
            (`existing`), main answers `null` for such a session anyway
            (`CaptureWriter.discard`), and a menu whose only entry is missing is worse
            than no menu. */}
        {!existing && (
          <button
            type="button"
            className="help-button insert-button"
            title={app.t("library.moreActions")}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setActionsMenu({ x: rect.left, y: rect.top });
            }}
          >
            {app.t("library.actions")}
          </button>
        )}
        {/* "Help" rather than "?". A question mark is the label you can only read once
            you already know what it opens, in the one window where the sheet behind it is
            how you find out. `help.button` and not `help.title`, which is the sheet's own
            heading ("Keyboard shortcuts") and too long to stand in this bar. */}
        <button
          type="button"
          className="help-button"
          title={app.t("help.title")}
          onClick={() => setHelpOpen(true)}
        >
          {app.t("help.button")}
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
          libraryHotkey={app.libraryHotkey}
          t={app.t}
          // No `editor.focus()` here any more: the sheet puts focus back where it found
          // it, and forcing the editor would take it away from the subject field for
          // anyone who opened the sheet from there.
          onClose={() => setHelpOpen(false)}
        />
      )}
    </div>
  );
}
