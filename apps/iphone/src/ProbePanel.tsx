import { useState } from "react";
import { failureOf, inboxBridge, type InboxBridge, type ProbeResult } from "./inbox-bridge.js";
import { buildProbeNote, type ProbeStrategy } from "./probe.js";

interface LogEntry {
  at: string;
  op: string;
  detail: string;
}

function summarize(result: ProbeResult): string {
  const { ok, durationMs, ...rest } = result as ProbeResult & Record<string, unknown>;
  return `${ok ? "ok" : "failed"} in ${durationMs}ms ${JSON.stringify(rest)}`;
}

/**
 * §2's "temporary native test interface" as an actual screen, so §5's matrix can be run by
 * hand on the device. Not part of the capture flow — reached from `App` by a toggle, and
 * meant to be deleted once Phase 0 has a go/no-go.
 */
export function ProbePanel({ onClose }: { onClose: () => void }) {
  const [strategy, setStrategy] = useState<ProbeStrategy>("direct");
  const [sequence, setSequence] = useState(1);
  const [lastFilename, setLastFilename] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const record = (op: string, detail: string): void => {
    setLog((current) => [{ at: new Date().toISOString(), op, detail }, ...current]);
  };

  const run = async (op: string, action: (bridge: InboxBridge) => Promise<ProbeResult>): Promise<void> => {
    const bridge = inboxBridge();
    if (bridge === null) {
      record(op, "no native bridge — this only runs inside the iOS app");
      return;
    }
    setBusy(true);
    try {
      record(op, summarize(await action(bridge)));
    } catch (error) {
      const failure = failureOf(error);
      record(
        op,
        `error: ${failure.message}` +
          (failure.errorDomain === null ? "" : ` (${failure.errorDomain} ${String(failure.errorCode)})`),
      );
    } finally {
      setBusy(false);
    }
  };

  const write = (): Promise<void> =>
    run(`write ${strategy} #${sequence}`, async (bridge) => {
      const item = buildProbeNote(strategy, sequence);
      setLastFilename(item.filename);
      const method = strategy === "direct" ? bridge.writeDirect : bridge.writeByMove;
      const result = await method({ filename: item.filename, bytes: item.bytes });
      setSequence((current) => current + 1);
      return result;
    });

  return (
    <div className="probe-panel">
      <header className="probe-header">
        <h1>Phase 0 probe</h1>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>

      <section className="probe-actions">
        <button type="button" disabled={busy} onClick={() => run("selectInbox", (bridge) => bridge.selectInbox())}>
          Select Inbox
        </button>
        <button type="button" disabled={busy} onClick={() => run("restoreInbox", (bridge) => bridge.restoreInbox())}>
          Restore Inbox
        </button>

        <label className="strategy-choice">
          <span>Write strategy</span>
          <select value={strategy} onChange={(event) => setStrategy(event.target.value as ProbeStrategy)}>
            <option value="direct">Direct create</option>
            <option value="move">Temporary-file move</option>
          </select>
        </label>
        <button type="button" disabled={busy} onClick={write}>
          Write probe #{sequence}
        </button>

        <button
          type="button"
          disabled={busy || lastFilename === ""}
          onClick={() => run(`readBack ${lastFilename}`, (bridge) => bridge.readBack({ filename: lastFilename }))}
        >
          Read Back last write
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run("showDiagnosticLog", async (bridge) => {
              const { entries } = await bridge.showDiagnosticLog();
              return { ok: true, durationMs: 0, entries: entries.join("\n") };
            })
          }
        >
          Show Diagnostic Log
        </button>
      </section>

      <section className="probe-log" aria-live="polite">
        {log.length === 0 && <p className="probe-log-empty">No operations run yet.</p>}
        {log.map((entry, index) => (
          <article key={`${entry.at}-${index}`}>
            <p className="probe-log-op">
              {entry.op} <span className="probe-log-at">{entry.at}</span>
            </p>
            <pre>{entry.detail}</pre>
          </article>
        ))}
      </section>
    </div>
  );
}
