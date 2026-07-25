import { useEffect, useRef, useState } from "react";
import type { StatusPayload } from "../shared/ipc.js";

const LATENCY_BUDGET_MS = 80;

function nu(): string {
  return new Date().toLocaleString("nl-NL", {
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
  const [tijdstip, setTijdstip] = useState(nu);

  useEffect(() => {
    const stopShow = window.emqnote.onShow(({ token }) => {
      setTijdstip(nu());
      textarea.current?.focus();

      // Twee frames wachten: het eerste wordt gepland, ná het tweede staat er echt
      // iets op het scherm. Pas dan is "hotkey tot knipperende cursor" eerlijk gemeten.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.emqnote.painted(token));
      });
    });

    const stopReset = window.emqnote.onReset(() => {
      if (textarea.current !== null) textarea.current.value = "";
      setStatus((vorige) => ({ ...vorige, savedAs: null }));
    });

    const stopStatus = window.emqnote.onStatus(setStatus);

    return () => {
      stopShow();
      stopReset();
      stopStatus();
    };
  }, []);

  const bijToets = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const sluiten =
      event.key === "Escape" || (event.key === "w" && (event.metaKey || event.ctrlKey));
    if (sluiten) {
      event.preventDefault();
      window.emqnote.close();
    }
  };

  const bovenBudget =
    status.lastLatencyMs !== null && status.lastLatencyMs > LATENCY_BUDGET_MS;

  return (
    <div className="venster">
      <div className="titelbalk">
        <span className="tijdstip">{tijdstip}</span>
        <span className="hint">Esc bewaart en sluit</span>
      </div>

      <textarea
        ref={textarea}
        className="tekst"
        placeholder="Typ maar."
        spellCheck={false}
        autoFocus
        onKeyDown={bijToets}
        onChange={(event) => window.emqnote.change(event.target.value)}
      />

      <div className="statusbalk">
        <span className="bestand">
          {status.savedAs === null
            ? "Nog niets bewaard"
            : `Bewaard als ${status.savedAs.split(/[\\/]/).pop()}`}
        </span>
        <span className="meting" data-boven-budget={bovenBudget}>
          {status.lastLatencyMs === null
            ? ""
            : `${status.lastLatencyMs.toFixed(0)} ms`}
        </span>
      </div>
    </div>
  );
}
