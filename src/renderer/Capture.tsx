import { useEffect, useRef, useState } from "react";
import type { StatusPayload } from "../shared/ipc.js";

const LATENCY_BUDGET_MS = 80;

function now(): string {
  return new Date().toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Capture(): React.ReactElement {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<StatusPayload>({
    lastLatencyMs: null,
    savedAs: null,
  });
  const [timestamp, setTimestamp] = useState(now);

  useEffect(() => {
    const stopShow = window.emqnote.onShow(({ token }) => {
      setTimestamp(now());
      textarea.current?.focus();

      // Wait two frames: the first is only scheduled, after the second something is
      // actually on screen. Only then is "hotkey to blinking caret" measured honestly.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.emqnote.painted(token));
      });
    });

    const stopReset = window.emqnote.onReset(() => {
      if (textarea.current !== null) textarea.current.value = "";
      setStatus((previous) => ({ ...previous, savedAs: null }));
    });

    const stopStatus = window.emqnote.onStatus(setStatus);

    return () => {
      stopShow();
      stopReset();
      stopStatus();
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const closing =
      event.key === "Escape" || (event.key === "w" && (event.metaKey || event.ctrlKey));
    if (closing) {
      event.preventDefault();
      window.emqnote.close();
    }
  };

  const overBudget =
    status.lastLatencyMs !== null && status.lastLatencyMs > LATENCY_BUDGET_MS;

  return (
    <div className="window">
      <div className="titlebar">
        <span className="timestamp">{timestamp}</span>
        <span className="hint">Esc saves and closes</span>
      </div>

      <textarea
        ref={textarea}
        className="editor"
        placeholder="Just type."
        spellCheck={false}
        autoFocus
        onKeyDown={onKeyDown}
        onChange={(event) => window.emqnote.change(event.target.value)}
      />

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
