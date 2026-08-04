import { useCallback, useEffect, useRef, useState } from "react";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../markdown/schema.js";
import { Editor, type EditorHandle } from "./editor/Editor.js";
import { HeaderBlock, type HeaderValues } from "./HeaderBlock.js";
import { Help } from "./Help.js";
import { LinkPrompt } from "./LinkPrompt.js";
import { TitleBar } from "./TitleBar.js";
import { formatFirstKey, matches, shortcut } from "../shared/shortcuts.js";
import type { StatusPayload } from "../shared/ipc.js";
import { isoWithOffset } from "../shared/time.js";
import { useBootstrap } from "./useBootstrap.js";

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

  // Held in refs so the listeners below never close over stale values.
  const headerRef = useRef(header);
  headerRef.current = header;
  const linkOpenRef = useRef(false);
  linkOpenRef.current = link !== null;

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
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => send(doc), CHANGE_DEBOUNCE_MS);
    },
    [send],
  );

  // A header change has to reach main too, otherwise a subject typed after the last
  // keystroke in the body would never be saved.
  const onHeaderChange = useCallback(
    (values: HeaderValues) => {
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
    });

    return () => {
      stopShow();
      stopReset();
      stopStatus();
      stopLoad();
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
      // While the link box is open it owns the keyboard, or a window-level shortcut
      // would throw focus back into the note and leave the box hanging there.
      if (linkOpenRef.current) return;

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
      />

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
        {/* Moved out of the header when the tag field took its place. A learn-once
            hint belongs in the ambient chrome anyway, not in a row of fields. */}
        <span className="dismiss-hint">
          {formatFirstKey("close", app.isMac)} {app.t("capture.dismiss")}
        </span>
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
