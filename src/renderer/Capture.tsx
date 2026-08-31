import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorState } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { bodyTagsOf } from "../markdown/note-tags.js";
import { schema } from "../markdown/schema.js";
import { buildEditorMenu, insertMenuItems } from "./editor/editor-menu.js";
import { Editor, type EditorHandle } from "./editor/Editor.js";
import { HeaderBlock, type HeaderValues } from "./HeaderBlock.js";
import { Help } from "./Help.js";
import { Ask } from "./library/Ask.js";
import { LinkPrompt } from "./LinkPrompt.js";
import { ChromeButton } from "./ChromeButton.js";
import { PaneFooter } from "./PaneFooter.js";
import { PaneHeader } from "./PaneHeader.js";
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
    saveError: null,
  });
  const [link, setLink] = useState<{ href: string } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  /**
   * The confirmation in front of Discard (B85).
   *
   * There was none, on the argument that discarding is reversible: the draft is written
   * to `_trash` and Restore brings it back. That is still true and it is still the reason
   * dragging a note onto the trash asks nothing. What it misses is that this window's
   * Discard is bound to a chord and sits one item into a menu at the foot of a window
   * someone is typing in — and unlike the library, there is nothing on screen afterwards
   * to notice the note by. A recoverable action nobody realises they took is not a
   * recoverable action.
   *
   * Only ever raised for a note with something in it. See `discardOrAsk`.
   */
  const [confirmDiscard, setConfirmDiscard] = useState(false);
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
  // The discard confirmation belongs in here for the reason the picker and the grid do:
  // while it is up it owns the keyboard, and Escape in particular must cancel it rather
  // than reach `fires("close")` and hide the window out from under it.
  overlayOpenRef.current = notePick !== null || tableGrid !== null || confirmDiscard;
  const existingRef = useRef(false);
  existingRef.current = existing;

  /**
   * Whether this note is still exactly what the window opened as — nothing typed, no
   * field filled in.
   *
   * Deliberately **not** `dirtyRef`, which is the other candidate and the wrong one:
   * that ref over-reports by design (its own comment says so) and stays true after a
   * character is typed and deleted again, so a window that is visibly empty would still
   * ask. A confirmation raised over an empty note is exactly the kind that teaches people
   * to click through confirmations.
   *
   * The document is judged by its *structure*, never by `textContent`: a note holding
   * nothing but a pasted picture, an attachment or an empty table has no text in it at
   * all, and treating that as pristine would throw away the one thing the reader could
   * not retype. One empty textblock is what a fresh editor holds; anything else counts.
   *
   * The header is compared against a fresh one field by field rather than by a list of
   * "is this string empty" checks, so a field added to `HeaderValues` later is covered
   * without this function being remembered. `created` is exempt because nobody sets it —
   * it is stamped on open and re-stamped by `onShow`.
   */
  const isPristine = useCallback((): boolean => {
    const doc = editor.current?.getDoc();
    if (doc !== null && doc !== undefined) {
      const only = doc.childCount === 1 ? doc.firstChild : null;
      if (only === null || !only.isTextblock || only.content.size > 0) return false;
    }

    const fresh = freshHeader();
    const values = headerRef.current;
    return (Object.keys(fresh) as (keyof HeaderValues)[]).every((field) => {
      if (field === "created") return true;
      const mine = values[field];
      const blank = fresh[field];
      return Array.isArray(mine) && Array.isArray(blank)
        ? mine.length === blank.length
        : mine === blank;
    });
  }, []);

  /**
   * Discard, asking first unless there is nothing to lose.
   *
   * The one path both the chord and the menu item take, so the two cannot come to
   * disagree about when the question is asked — which is the same rule the `existing`
   * check they also share is written under.
   */
  const discardOrAsk = useCallback((): void => {
    if (isPristine()) window.emqnote.discard();
    else setConfirmDiscard(true);
  }, [isPristine]);

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

  /**
   * **The debounce is cancelled when this component goes away, and that is a CI fix
   * rather than a runtime one.**
   *
   * In the app it can never fire: the capture window is created once and only ever hidden
   * (`CONSTRAINTS.md` — destroying it is unrecoverable), so this tree is never unmounted
   * and this cleanup never runs. In jsdom it is unmounted between every test, and a timer
   * armed by the last keystroke of one test fires 300 ms later into an environment that
   * has been torn down: `window` is gone, and `send` throws `ReferenceError: window is not
   * defined` **attributed to whichever test happens to be running by then**. The reported
   * test and the broken one are two different tests — the exact shape `capture-writer`'s
   * rename race had, one file over.
   *
   * It failed the `v0.11.0` release on the Windows runner and a `main` build the day
   * before, and never once locally: a loaded runner is what widens the gap between the
   * last keystroke and teardown enough for the timer to land in it. So the rule this
   * codebase keeps relearning applies to timers too — **a component that arms a timer owns
   * cancelling it**, whether or not the window it lives in can plausibly go away.
   */
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

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
      setStatus((previous) => ({ ...previous, savedAs: null, saveError: null }));
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
      setStatus((previous) => ({ ...previous, savedAs: note.path, saveError: null }));
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
        discardOrAsk();
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

      if (fires("focusFields")) {
        // The other half of `focusTitle`, and the library window has the same pair (B94).
        // It lands on When, and Tab walks on to Tags, Where and Who — four fields, one
        // chord, because they are four inputs in DOM order and the browser already knows
        // how to walk them.
        //
        // Found by selector rather than by a ref handed down through `HeaderBlock`: that
        // component owns four fields and the props to reach each of them would be four
        // props, where the block already carries a class per cell for the stylesheet.
        // `.header-capture` and not `.header`, so this can only ever be *this* window's
        // block — the reader's wears `.header-reader`, and both spellings exist for
        // exactly this kind of question.
        const when = document.querySelector<HTMLElement>(".header-capture .created");
        if (when === null) return;
        event.preventDefault();
        when.focus();
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
      {/* **The 40px band, where the title bar used to be.**

          It was 30px of `.titlebar` carrying the word "emqnote" and, off macOS, three
          window buttons this app drew itself. Both are gone: the band is the same one the
          library's three panes wear, the note's own title stands in it, and the window
          controls are the platform's — traffic lights inset into it on macOS,
          `titleBarOverlay` on Windows 11 (`capture-window.ts`). One row instead of two,
          and the note starts ten pixels further up the window than it did.

          A brand-new note gets the subject field; a note handed over from the library gets
          its file name, read-only, because the title of a saved note belongs to Rename —
          renaming moves the file, and a second way to change it here would let the two
          drift (`HeaderBlock`'s own note on the variants). That is exactly what the
          library's reader pane does with the same two states. */}
      <PaneHeader
        trafficLights={app.isMac}
        captionButtons
        title={
          existing ? (
            // The note's *title*, not its file name — the reader pane's heading is the
            // title too, and the file name is already said in full at the other end of
            // the window (`.filename`, "Saved as …"). Read-only either way: the title of
            // a saved note belongs to Rename in the library, which moves the file with it.
            (header.subject || (status.savedAs?.split(/[\\/]/).pop() ?? "emqnote"))
          ) : (
            <input
              ref={subjectInput}
              // `.title-field` is the note editor's title, shared with the library's
              // reader; `.subject` is what says it is the elastic child of a band.
              className="title-field subject"
              placeholder={app.t("capture.title")}
              value={header.subject}
              onChange={(event) => onHeaderChange({ ...header, subject: event.target.value })}
              // Enter moves on into the note; the title should never be a place you get
              // stuck when all you want is to type. `HeaderBlock` still does this for the
              // four fields below, and this is the same rule for the one above them.
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                editor.current?.focus();
              }}
            />
          )
        }
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
              // Asks first unless the note is empty (B85). It used to ask nothing at all,
              // on the argument that the draft goes to `_trash` and comes back out
              // through Restore — see `confirmDiscard` for why that argument does not
              // carry here the way it does for B54's drag onto the trash.
              onSelect: () => discardOrAsk(),
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

      {/* **The 28px band at the foot**, matched to the library's — status left, menus
          right, the same `PaneFooter` drawing both. It was `.statusbar` at 7px of padding
          and 11px text, which is a different bar under the same editor. */}
      <PaneFooter
        className="statusbar"
        status={
          <>
          {/* **A failure wins this seat outright.** "Saved as …" was on screen all day
              on 31 August 2026 while nothing was being written, because it only ever
              named the file the app *meant* to write to. So while a write is failing this
              says so instead, rather than beside it: a 28px bar reads as one line, and
              the reassuring half of a contradiction is the half that gets believed. */}
          {status.saveError === null ? (
            <span className="filename">
              {status.savedAs === null
                ? app.t("capture.nothingSaved")
                : `${app.t("capture.savedAs")} ${status.savedAs.split(/[\\/]/).pop()}`}
            </span>
          ) : (
            <span className="save-error" title={status.saveError.message}>
              {app.t("capture.saveFailed").replace("{code}", status.saveError.code)}
              {status.saveError.recoveryPath !== null && (
                <>
                  {" "}
                  {/* The path is the message. A button that opened the folder would be
                      better still, but this window must not grow a control that can steal
                      focus from a caret someone is mid-sentence in. */}
                  <button
                    type="button"
                    className="save-error-copy"
                    title={status.saveError.recoveryPath}
                    onClick={() => {
                      void window.emqnote.copyText(status.saveError?.recoveryPath ?? "");
                    }}
                  >
                    {app.t("capture.saveRecovered")}
                  </button>
                </>
              )}
            </span>
          )}
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
          {/* In the status group, and not at the far end of the bar where it was — which
              is where it held the right-hand end away from the buttons, `space-between`
              distributing however many children it is given. Invisibly, at that: it renders
              as an *empty* span until the first measurement arrives, and an empty element
              still takes a slot and a gap. It is ambient status like the two beside it
              anyway: what the last hotkey → caret cost, in the window that budget is
              about. */}
          <span className="latency" data-over-budget={overBudget}>
            {status.lastLatencyMs === null ? "" : `${status.lastLatencyMs.toFixed(0)} ms`}
          </span>
          </>
        }
        actions={
          <>
            {/* These three used to be `.help-button`/`.insert-button`: a smaller font, a
                tighter radius, muted text, and a Help button with no border at rest beside
                two that had one. They are `ChromeButton`s now, the same component the
                library's footer uses and the same one the tree's icons use — the two
                windows edit the same note with the same editor and the same three controls
                under it, so a reader should not be able to tell which window they are in
                from the shape of the buttons. */}
            <ChromeButton
              label={app.t("library.insert")}
              small
              menu
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                // Above the button, not below it: this bar is at the foot of the window,
                // so a menu opening downwards would be clamped back over the button it
                // came from. `ContextMenu` clamps to the viewport, and this hands it a
                // point it can honour.
                setInsertMenu({ x: rect.left, y: rect.top });
              }}
            />
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
              <ChromeButton
                label={app.t("library.actions")}
                title={app.t("library.moreActions")}
                small
                menu
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setActionsMenu({ x: rect.left, y: rect.top });
                }}
              />
            )}
          {/* "Help" rather than "?". A question mark is the label you can only read once
              you already know what it opens, in the one window where the sheet behind it is
              how you find out. `help.button` and not `help.title`, which is the sheet's own
              heading ("Keyboard shortcuts") and too long to stand in this bar. */}
            <ChromeButton
              label={app.t("help.button")}
              title={app.t("help.title")}
              small
              onClick={() => setHelpOpen(true)}
            />
          </>
        }
      />

      {confirmDiscard && (
        <Ask
          title={app.t("ask.confirmDiscard")}
          // No `initial`, so this is a plain confirmation with no text field in it — the
          // shape `Ask` grew for the library's own delete questions.
          confirmLabel={app.t("capture.discard")}
          cancelLabel={app.t("ask.cancel")}
          danger
          onConfirm={() => {
            setConfirmDiscard(false);
            window.emqnote.discard();
          }}
          onCancel={() => {
            setConfirmDiscard(false);
            // Back where the question was asked from. Without this the window keeps the
            // note but loses the caret, which reads as the Escape having done something.
            editor.current?.focus();
          }}
        />
      )}

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
