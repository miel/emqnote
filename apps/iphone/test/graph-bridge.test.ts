import { describe, expect, it } from "vitest";
import { GRAPH_ERRORS, graphBridge } from "../src/graph-bridge.js";
import { inboxBridge } from "../src/inbox-bridge.js";
import { failureOf } from "../src/native-bridge.js";

/**
 * The Swift half cannot be tested here — no SDK, no device, and no Microsoft account. What
 * can be pinned is the contract's JavaScript side: that a browser build does not crash on
 * a plugin that isn't there, and that a Graph refusal still narrows into the columns
 * `graph-results.md` has to fill in.
 */
describe("graph bridge lookup", () => {
  it("is absent outside Capacitor rather than throwing", () => {
    expect(graphBridge({})).toBeNull();
    expect(graphBridge({ Capacitor: {} })).toBeNull();
    expect(graphBridge({ Capacitor: { Plugins: {} } })).toBeNull();
  });

  it("is returned when the native plugin registered", () => {
    const plugin = { signIn: () => Promise.resolve() };
    expect(graphBridge({ Capacitor: { Plugins: { GraphBridge: plugin } } })).toBe(plugin);
  });

  it("does not answer to the other bridge's name", () => {
    // Both plugins register on the same global. Picking up the wrong one would fail
    // somewhere much later than here, as a missing method on an object that exists.
    const scope = { Capacitor: { Plugins: { InboxBridge: { selectInbox: () => {} } } } };
    expect(graphBridge(scope)).toBeNull();
    expect(inboxBridge(scope)).not.toBeNull();
  });
});

describe("graph failure narrowing", () => {
  it("carries the named refusal through as the domain", () => {
    const error = Object.assign(new Error("a file with that name already exists"), {
      errorDomain: GRAPH_ERRORS.nameExists,
      errorCode: 409,
    });
    expect(failureOf(error)).toEqual({
      message: "a file with that name already exists",
      errorDomain: "NAME_EXISTS",
      errorCode: 409,
    });
  });

  it("reports an unnamed failure without inventing a domain", () => {
    expect(failureOf(new Error("The request timed out."))).toEqual({
      message: "The request timed out.",
      errorDomain: null,
      errorCode: null,
    });
  });
});
