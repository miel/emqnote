/**
 * The delivery loop, as the capture screen sees it.
 *
 * Everything it decides is in `delivery/`, tested there. What is here is the part that
 * genuinely needs React and a browser: when to run, and how not to run twice at once.
 *
 * **Save never waits for any of this.** `07-iphone.md` §6 puts Save acknowledgement at
 * under 150 ms and puts OneDrive transfer explicitly outside that budget, so `save()`
 * enqueues synchronously and then *starts* a drain it does not await.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadLastDelivered,
  loadOutbox,
  storeOutbox,
  type DeliveredRecord,
  type DraftStorage,
} from "./draft.js";
import { graphBridge } from "./graph-bridge.js";
import { connectGraph, disconnectGraph, NO_CONNECTION, type Connection } from "./delivery/connect.js";
import { activeDeliverer, loadDestination, loadVaultFolder } from "./delivery/destination.js";
import { drainOutbox } from "./delivery/drain.js";
import { unblock } from "./delivery/outbox.js";

export interface DeliveryView {
  /** Notes durable on this iPhone and not yet in the Inbox. */
  waiting: number;
  /** Notes held back for a missing Microsoft sign-in, which has its own button. */
  needsSignIn: number;
  /** Notes held back by something else, and what that was. */
  failed: number;
  problem: string | null;
  lastDelivered: DeliveredRecord | null;
  connection: Connection;
  /** False in a browser, where there is no native bridge and nothing can be delivered. */
  available: boolean;
  busy: boolean;
  drain: () => void;
  signIn: () => void;
  signOut: () => void;
  retry: () => void;
}

export function useDelivery(storage: DraftStorage): DeliveryView {
  const [waiting, setWaiting] = useState(() => loadOutbox(storage).length);
  const [needsSignIn, setNeedsSignIn] = useState(0);
  const [failed, setFailed] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [lastDelivered, setLastDelivered] = useState(() => loadLastDelivered(storage));
  const [connection, setConnection] = useState<Connection>(NO_CONNECTION);
  const [busy, setBusy] = useState(false);

  /**
   * One drain at a time.
   *
   * A ref rather than the `busy` state because two triggers can fire in the same tick —
   * returning to the foreground reliably produces both `visibilitychange` and `online` —
   * and a state update would not have been applied yet when the second one checked.
   */
  const running = useRef(false);
  const available = useRef(activeDeliverer(storage) !== null).current;

  const runDrain = useCallback(async (): Promise<void> => {
    const deliverer = activeDeliverer(storage);
    if (deliverer === null || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const report = await drainOutbox(storage, deliverer);
      setWaiting(report.waiting);
      setNeedsSignIn(report.needsSignIn);
      setFailed(report.failed);
      if (report.delivered.length > 0) setLastDelivered(loadLastDelivered(storage));
      const held = loadOutbox(storage).find(
        (item) => item.state === "blocked" && item.lastError !== "needs-signin",
      );
      setProblem(held?.lastError ?? null);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [storage]);

  /**
   * Establishes the connection, then drains whatever that unblocked.
   *
   * Answers whether delivery is now possible, so the caller knows whether a drain has
   * already happened.
   */
  const connect = useCallback(
    async (interactive: boolean): Promise<boolean> => {
      if (loadDestination(storage) !== "graph") return false;
      const bridge = graphBridge();
      if (bridge === null) return false;

      const result = await connectGraph(bridge, loadVaultFolder(storage), interactive);
      setConnection(result);
      if (result.problem !== null) setProblem(result.problem);
      if (!result.inboxReady) return false;

      // Signing in is exactly the repair the blocked items were waiting for.
      const items = loadOutbox(storage);
      const released = items.map((item) =>
        item.state === "blocked" && item.lastError === "needs-signin" ? unblock(item) : item,
      );
      storeOutbox(storage, released);
      await runDrain();
      return true;
    },
    [runDrain, storage],
  );

  // Launch: try a silent connection, then deliver whatever is waiting. Neither blocks the
  // editor, which is already interactive by the time this runs.
  //
  // `connect` drains on its own once the Inbox resolves, so this only drains when it did
  // not — no account yet, or no native bridge at all. Chaining a second drain onto every
  // successful connect would run the whole loop twice for nothing.
  useEffect(() => {
    void connect(false).then((connected) => {
      if (!connected) return runDrain();
    });
  }, [connect, runDrain]);

  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void runDrain();
    };
    const onOnline = (): void => void runDrain();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [runDrain]);

  // Every callback below is memoised because `save()` depends on `drain`, and an identity
  // that changed each render would rebuild the Cmd+Enter key handler on every keystroke.
  const drain = useCallback(() => void runDrain(), [runDrain]);
  const signIn = useCallback(() => void connect(true), [connect]);

  const signOut = useCallback(() => {
    const bridge = graphBridge();
    if (bridge === null) return;
    void disconnectGraph(bridge).then(setConnection);
  }, []);

  const retry = useCallback(() => {
    storeOutbox(storage, loadOutbox(storage).map(unblock));
    setNeedsSignIn(0);
    setFailed(0);
    setProblem(null);
    void runDrain();
  }, [runDrain, storage]);

  return {
    waiting,
    needsSignIn,
    failed,
    problem,
    lastDelivered,
    connection,
    available,
    busy,
    drain,
    signIn,
    signOut,
    retry,
  };
}
