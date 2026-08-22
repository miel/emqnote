import { useState } from "react";
import { inboxBridge, type InboxBridge } from "./inbox-bridge.js";
import { graphBridge, type GraphBridge } from "./graph-bridge.js";
import { failureOf, type ProbeResult } from "./native-bridge.js";
import { loadVaultFolder, storeVaultFolder } from "./delivery/destination.js";
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
 * The on-device instrument for both delivery routes.
 *
 * It started as `08-iphone-phase-0.md` §2's "temporary native test interface" and outlived
 * its phase, because the thing it does — run one named operation and show its duration and
 * its native error domain — is exactly what filling in an evidence sheet needs, and
 * `09-iphone-graph.md` §G2 has a whole matrix of them. Not part of the capture flow;
 * reached from `App` by a toggle.
 *
 * Both sections are here on purpose. The Files section is what a future iCloud Drive or
 * Dropbox vault would be tested with, and it is also the only way to re-check the Phase 0
 * finding against a future OneDrive release.
 */
export function ProbePanel({ onClose }: { onClose: () => void }) {
  const [strategy, setStrategy] = useState<ProbeStrategy>("direct");
  const [sequence, setSequence] = useState(1);
  const [lastFilename, setLastFilename] = useState("");
  const [vaultFolder, setVaultFolder] = useState(() => loadVaultFolder(localStorage));
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const record = (op: string, detail: string): void => {
    setLog((current) => [{ at: new Date().toISOString(), op, detail }, ...current]);
  };

  /** Runs one named operation against one bridge, recording whatever comes back. */
  const run = async <T,>(
    op: string,
    bridge: T | null,
    action: (bridge: T) => Promise<ProbeResult>,
  ): Promise<void> => {
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
          (failure.errorDomain === null
            ? ""
            : ` (${failure.errorDomain} ${String(failure.errorCode)})`),
      );
    } finally {
      setBusy(false);
    }
  };

  const runFiles = (op: string, action: (bridge: InboxBridge) => Promise<ProbeResult>) =>
    run(op, inboxBridge(), action);

  const runGraph = (op: string, action: (bridge: GraphBridge) => Promise<ProbeResult>) =>
    run(op, graphBridge(), action);

  const writeThroughFiles = (): Promise<void> =>
    runFiles(`write ${strategy} #${sequence}`, async (bridge) => {
      const item = buildProbeNote(strategy, sequence);
      setLastFilename(item.filename);
      const method = strategy === "direct" ? bridge.writeDirect : bridge.writeByMove;
      const result = await method({ filename: item.filename, bytes: item.bytes });
      setSequence((current) => current + 1);
      return result;
    });

  const uploadThroughGraph = (): Promise<void> =>
    runGraph(`uploadNew #${sequence}`, async (bridge) => {
      // The same builder the app uses, so a probe cannot pass with bytes the app would
      // never have produced — and so the probe is not a second place markdown is written.
      const item = buildProbeNote("direct", sequence);
      setLastFilename(item.filename);
      const result = await bridge.uploadNew({ filename: item.filename, bytes: item.bytes });
      setSequence((current) => current + 1);
      return result;
    });

  const showLog = (op: string, entries: () => Promise<{ entries: string[] }>) => async () => {
    setBusy(true);
    try {
      const { entries: lines } = await entries();
      record(op, lines.join("\n"));
    } catch (error) {
      record(op, `error: ${failureOf(error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="probe-panel">
      <header className="probe-header">
        <h1>Delivery probe</h1>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>

      <section className="probe-actions">
        <h2>Microsoft Graph — 09-iphone-graph.md §G2</h2>

        <label className="strategy-choice">
          <span>Vault folder</span>
          <input
            value={vaultFolder}
            onChange={(event) => {
              setVaultFolder(event.target.value);
              storeVaultFolder(localStorage, event.target.value);
            }}
            placeholder="emqnote"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>

        <button type="button" disabled={busy} onClick={() => void runGraph("signIn", (b) => b.signIn())}>
          Sign in
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runGraph("signInSilently", (b) => b.signInSilently())}
        >
          Sign in silently
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runGraph("accountStatus", (b) => b.accountStatus())}
        >
          Account status
        </button>
        <button type="button" disabled={busy} onClick={() => void runGraph("signOut", (b) => b.signOut())}>
          Sign out
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runGraph("resolveInbox", (b) => b.resolveInbox({ vaultFolder }))}
        >
          Resolve 00 Inbox
        </button>
        <button type="button" disabled={busy} onClick={uploadThroughGraph}>
          Upload probe #{sequence}
        </button>
        <button
          type="button"
          disabled={busy || lastFilename === ""}
          onClick={() => void runGraph(`probeItem ${lastFilename}`, (b) => b.probeItem({ filename: lastFilename }))}
        >
          Probe last upload
        </button>
        <button
          type="button"
          disabled={busy || lastFilename === ""}
          // The §G2 row that matters most: the second upload of the same name must be
          // refused with 409, and must leave the first file exactly as it was.
          onClick={() =>
            void runGraph(`re-upload ${lastFilename}`, (b) =>
              b.uploadNew({ filename: lastFilename, bytes: buildProbeNote("direct", 0).bytes }),
            )
          }
        >
          Re-upload last name (expect 409)
        </button>
      </section>

      <section className="probe-actions">
        <h2>iOS Files — 08-iphone-phase-0.md §5</h2>
        <p className="probe-note">
          Ruled out for OneDrive on 22 August 2026: the folder picker greys it out. Kept for
          iCloud Drive and Dropbox, which do offer folder selection.
        </p>

        <button type="button" disabled={busy} onClick={() => void runFiles("selectInbox", (b) => b.selectInbox())}>
          Select Inbox
        </button>
        <button type="button" disabled={busy} onClick={() => void runFiles("restoreInbox", (b) => b.restoreInbox())}>
          Restore Inbox
        </button>

        <label className="strategy-choice">
          <span>Write strategy</span>
          <select value={strategy} onChange={(event) => setStrategy(event.target.value as ProbeStrategy)}>
            <option value="direct">Direct create</option>
            <option value="move">Temporary-file move</option>
          </select>
        </label>
        <button type="button" disabled={busy} onClick={writeThroughFiles}>
          Write probe #{sequence}
        </button>
        <button
          type="button"
          disabled={busy || lastFilename === ""}
          onClick={() => void runFiles(`readBack ${lastFilename}`, (b) => b.readBack({ filename: lastFilename }))}
        >
          Read back last write
        </button>
      </section>

      <section className="probe-actions">
        <h2>Diagnostics</h2>
        <p className="probe-note">Both bridges write to one buffer, so this is one sequence.</p>
        <button
          type="button"
          disabled={busy}
          onClick={showLog("diagnosticLog", async () => {
            const bridge = graphBridge() ?? inboxBridge();
            return bridge === null ? { entries: ["no native bridge"] } : bridge.showDiagnosticLog();
          })}
        >
          Show diagnostic log
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
