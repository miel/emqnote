import { useCallback, useEffect, useRef, useState } from "react";
import type { Node as PMNode } from "prosemirror-model";
import { Editor, type EditorHandle } from "./editor/Editor.js";
import { HeaderBlock, type HeaderValues } from "./HeaderBlock.js";
import { LinkPrompt } from "./LinkPrompt.js";
import { TitleBar } from "./TitleBar.js";
import type { StatusPayload } from "../shared/ipc.js";
import { isoWithOffset } from "../shared/time.js";

const LATENCY_BUDGET_MS = 80;
const CHANGE_DEBOUNCE_MS = 300;

function freshHeader(): HeaderValues {
  return { kind: "quick", subject: "", created: isoWithOffset(new Date()), location: "", attendees: [] };
}

export function Capture(): React.ReactElement {
  const editor = useRef<EditorHandle>(null);
  const [header, setHeader] = useState<HeaderValues>(freshHeader);
  const [status, setStatus] = useState<StatusPayload>({
    lastLatencyMs: null,
    savedAs: null,
  });
  const [link, setLink] = useState<{ href: string } | null>(null);
  const [knownAttendees, setKnownAttendees] = useState<string[]>([]);

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
    void window.emqnote.knownAttendees().then(setKnownAttendees);

    const stopShow = window.emqnote.onShow(({ token }) => {
      editor.current?.focus();

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
      setLink(null);
      setStatus((previous) => ({ ...previous, savedAs: null }));
      void window.emqnote.knownAttendees().then(setKnownAttendees);
    });

    const stopStatus = window.emqnote.onStatus(setStatus);

    return () => {
      stopShow();
      stopReset();
      stopStatus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.metaKey || event.ctrlKey;

      // While the link box is open it owns the keyboard. Otherwise Ctrl+Shift+G threw
      // focus back into the note and left the box hanging there.
      if (linkOpenRef.current) return;

      // Ctrl+Enter saves and closes, the same gesture that sends a message in
      // Outlook. Escape used to do this and should not: it is reflexive, and a note is
      // too easy to lose that way.
      if (mod && (event.key === "Enter" || event.key.toLowerCase() === "w")) {
        event.preventDefault();
        window.emqnote.close();
        return;
      }

      // Ctrl+Shift+G toggles the meeting block without reaching for the mouse.
      if (mod && event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        onHeaderChange({
          ...headerRef.current,
          kind: headerRef.current.kind === "meeting" ? "quick" : "meeting",
        });
        editor.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onHeaderChange]);

  const overBudget =
    status.lastLatencyMs !== null && status.lastLatencyMs > LATENCY_BUDGET_MS;

  return (
    <div className="window">
      <TitleBar onClose={() => window.emqnote.close()} />

      <HeaderBlock
        values={header}
        onChange={onHeaderChange}
        knownAttendees={knownAttendees}
        onLeave={() => editor.current?.focus()}
      />

      <Editor
        ref={editor}
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
            ? "Nothing saved yet"
            : `Saved as ${status.savedAs.split(/[\\/]/).pop()}`}
        </span>
        <span className="latency" data-over-budget={overBudget}>
          {status.lastLatencyMs === null ? "" : `${status.lastLatencyMs.toFixed(0)} ms`}
        </span>
      </div>
    </div>
  );
}
