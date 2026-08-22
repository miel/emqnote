import { describe, expect, it } from "vitest";
import { failureOf, inboxBridge } from "../src/inbox-bridge.js";

/**
 * The Swift half cannot be tested here — no SDK, no device. What can be pinned is the
 * contract's JavaScript side, so the results sheet's error columns have something to
 * receive and a browser build does not crash on a plugin that isn't there.
 */
describe("inbox bridge lookup", () => {
  it("is absent outside Capacitor rather than throwing", () => {
    expect(inboxBridge({})).toBeNull();
    expect(inboxBridge({ Capacitor: {} })).toBeNull();
    expect(inboxBridge({ Capacitor: { Plugins: {} } })).toBeNull();
  });

  it("is returned when the native plugin registered", () => {
    const plugin = { selectInbox: () => Promise.resolve() };
    expect(inboxBridge({ Capacitor: { Plugins: { InboxBridge: plugin } } })).toBe(plugin);
  });
});

describe("native failure narrowing", () => {
  it("keeps the domain and code §6 asks to be recorded", () => {
    const error = Object.assign(new Error("write refused"), {
      errorDomain: "NSCocoaErrorDomain",
      errorCode: 516,
    });
    expect(failureOf(error)).toEqual({
      message: "write refused",
      errorDomain: "NSCocoaErrorDomain",
      errorCode: 516,
    });
  });

  it("reports a plain error without inventing a domain", () => {
    expect(failureOf(new Error("cancelled"))).toEqual({
      message: "cancelled",
      errorDomain: null,
      errorCode: null,
    });
    expect(failureOf("boom")).toEqual({
      message: "boom",
      errorDomain: null,
      errorCode: null,
    });
  });
});
