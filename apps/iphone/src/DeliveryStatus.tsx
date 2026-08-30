/**
 * The two truthful states `07-iphone.md` §5 asks for, plus the ones Graph adds.
 *
 * The distinction that section insists on is between *durable* and *delivered*, and the
 * wording here keeps it: "Saved on this iPhone" never implies the note has reached
 * OneDrive, and "In OneDrive Inbox" is only ever said about a file Graph confirmed. What
 * neither claims is that the note has reached the PC — the app cannot know when another
 * machine has finished synchronising, and saying so would be a promise it cannot keep.
 */

import type { DeliveryView } from "./useDelivery.js";

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

export function DeliveryStatus({ delivery }: { delivery: DeliveryView }) {
  const { waiting, needsSignIn, failed, problem, lastDelivered, connection, busy } = delivery;
  const { expectedAccountKind } = delivery;
  const held = waiting + needsSignIn + failed;

  if (!delivery.available) {
    // A browser, or a build without the native plugin. Capture works and notes queue
    // durably; saying "waiting for OneDrive" here would be misleading, because nothing is.
    return held === 0 ? null : (
      <p className="delivery-status">{plural(held, "note", "notes")} saved on this device</p>
    );
  }

  if (needsSignIn > 0) {
    return (
      <p className="delivery-status delivery-action">
        <span>
          {plural(needsSignIn, "note is", "notes are")} saved on this iPhone, waiting for Microsoft
        </span>
        <button type="button" onClick={delivery.signIn}>
          Sign in
        </button>
      </p>
    );
  }

  if (problem !== null && failed > 0) {
    return (
      <p className="delivery-status delivery-error delivery-action">
        <span>Couldn&rsquo;t deliver: {problem}</span>
        <button type="button" onClick={delivery.retry}>
          Retry
        </button>
      </p>
    );
  }

  if (waiting > 0) {
    return (
      <p className="delivery-status">
        {plural(waiting, "note", "notes")} saved on this iPhone
        {busy ? ", delivering…" : ", waiting for OneDrive"}
      </p>
    );
  }

  if (lastDelivered !== null) {
    return (
      <p className="delivery-status delivery-done">
        In OneDrive Inbox: {lastDelivered.filename}
      </p>
    );
  }

  if (
    connection.signedIn &&
    connection.accountKind !== null &&
    connection.accountKind !== expectedAccountKind
  ) {
    // Worth saying out loud, and worth stating as a mismatch rather than as "personal".
    // The registration accepts both kinds and the two drives are different places, so
    // signing into the wrong one does not fail — it puts a real note in a real `00 Inbox`
    // that nobody is looking at. Which kind is *wrong* depends on the install (B80), so
    // hardcoding either one here would be right on one machine and backwards on the next.
    return (
      <p className="delivery-status delivery-error">
        Signed in to a {connection.accountKind} Microsoft account, but this vault is on the{" "}
        {expectedAccountKind} one
      </p>
    );
  }

  return null;
}
