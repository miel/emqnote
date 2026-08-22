/**
 * Getting Graph into a state where a note can be delivered.
 *
 * Two steps, and they are separate because they fail separately and the repair is
 * different: sign in, then resolve `00 Inbox`. Being signed in with an unresolvable Inbox
 * is a settings problem; not being signed in is a sign-in problem; telling the user the
 * wrong one wastes their time.
 *
 * Deliberately not part of the `Deliverer` port. Sign-in is Graph's alone — the Files
 * route has a folder picker instead, and pretending both fit one abstraction would mean
 * inventing a shared vocabulary for two genuinely different repairs.
 */

import {
  GRAPH_ERRORS,
  type AccountKind,
  type GraphBridge,
} from "../graph-bridge.js";
import { failureOf } from "../native-bridge.js";

export interface Connection {
  signedIn: boolean;
  username: string;
  accountKind: AccountKind | null;
  inboxReady: boolean;
  /** What to tell the user, when something is not ready. Null when everything is. */
  problem: string | null;
}

const DISCONNECTED: Connection = {
  signedIn: false,
  username: "",
  accountKind: null,
  inboxReady: false,
  problem: null,
};

/**
 * Signs in and resolves the Inbox.
 *
 * `interactive` is the whole difference between app launch and the user pressing a button,
 * and it is a parameter rather than a fallback on purpose. A silent attempt that quietly
 * escalated to a Microsoft sign-in sheet would put that sheet in front of someone who had
 * just opened the app to type one line — from a queue they had most likely forgotten
 * about.
 */
export async function connectGraph(
  bridge: GraphBridge,
  vaultFolder: string,
  interactive: boolean,
): Promise<Connection> {
  let account;
  try {
    account = interactive ? await bridge.signIn() : await bridge.signInSilently();
  } catch (error) {
    const { errorDomain, message } = failureOf(error);
    const expected =
      errorDomain === GRAPH_ERRORS.noAccount || errorDomain === GRAPH_ERRORS.interactionRequired;
    // Having never signed in is the ordinary state on first launch, not something to
    // report as a fault. Anything else is worth naming.
    return { ...DISCONNECTED, problem: expected ? null : message };
  }

  if (!account.signedIn) return DISCONNECTED;

  const signedIn = {
    signedIn: true,
    username: account.username,
    accountKind: account.accountKind,
  };

  try {
    await bridge.resolveInbox({ vaultFolder });
    return { ...signedIn, inboxReady: true, problem: null };
  } catch (error) {
    return {
      ...signedIn,
      inboxReady: false,
      problem: `Could not find ${vaultFolder}/00 Inbox: ${failureOf(error).message}`,
    };
  }
}

export async function disconnectGraph(bridge: GraphBridge): Promise<Connection> {
  await bridge.signOut();
  return DISCONNECTED;
}

export const NO_CONNECTION = DISCONNECTED;
