import { describe, expect, it } from "vitest";
import { GRAPH_ERRORS, type AccountKind, type GraphBridge } from "../src/graph-bridge.js";
import { connectGraph } from "../src/delivery/connect.js";

function refusal(domain: string, message: string): Error {
  return Object.assign(new Error(message), { errorDomain: domain, errorCode: 0 });
}

function account(kind: AccountKind = "work", username = "someone@example.com") {
  return { ok: true, durationMs: 300, signedIn: true, username, accountKind: kind };
}

function inbox() {
  return {
    ok: true,
    durationMs: 90,
    driveId: "b!drive",
    itemId: "01INBOX",
    folderName: "00 Inbox",
  };
}

function bridge(overrides: Partial<GraphBridge>): GraphBridge {
  const unexpected = (name: string) => () => {
    throw new Error(`unexpected call to ${name}`);
  };
  return {
    signIn: unexpected("signIn"),
    signInSilently: unexpected("signInSilently"),
    signOut: unexpected("signOut"),
    accountStatus: unexpected("accountStatus"),
    resolveInbox: unexpected("resolveInbox"),
    uploadNew: unexpected("uploadNew"),
    probeItem: unexpected("probeItem"),
    showDiagnosticLog: unexpected("showDiagnosticLog"),
    ...overrides,
  } as GraphBridge;
}

describe("connecting to Graph", () => {
  it("signs in silently at launch and interactively on a button", async () => {
    const calls: string[] = [];
    const both = bridge({
      signIn: () => {
        calls.push("interactive");
        return Promise.resolve(account());
      },
      signInSilently: () => {
        calls.push("silent");
        return Promise.resolve(account());
      },
      resolveInbox: () => Promise.resolve(inbox()),
    });

    await connectGraph(both, "emqnote", false);
    await connectGraph(both, "emqnote", true);
    expect(calls).toEqual(["silent", "interactive"]);
  });

  it("never escalates a silent attempt into a sign-in sheet", async () => {
    // Someone who opened the app to type one line should not be handed a Microsoft prompt
    // from a queue they have forgotten about.
    const result = await connectGraph(
      bridge({
        signInSilently: () =>
          Promise.reject(refusal(GRAPH_ERRORS.interactionRequired, "interaction required")),
      }),
      "emqnote",
      false,
    );
    expect(result.signedIn).toBe(false);
    expect(result.problem).toBeNull();
  });

  it("treats having never signed in as ordinary, not as a fault", async () => {
    const result = await connectGraph(
      bridge({
        signInSilently: () => Promise.reject(refusal(GRAPH_ERRORS.noAccount, "no account")),
      }),
      "emqnote",
      false,
    );
    expect(result).toEqual({
      signedIn: false,
      username: "",
      accountKind: null,
      inboxReady: false,
      problem: null,
    });
  });

  it("reports an unexpected sign-in failure rather than swallowing it", async () => {
    const result = await connectGraph(
      bridge({ signIn: () => Promise.reject(new Error("AADSTS65001: consent required")) }),
      "emqnote",
      true,
    );
    expect(result.signedIn).toBe(false);
    expect(result.problem).toBe("AADSTS65001: consent required");
  });

  it("resolves the Inbox under the configured vault folder", async () => {
    let asked: { vaultFolder: string } | null = null;
    const result = await connectGraph(
      bridge({
        signIn: () => Promise.resolve(account()),
        resolveInbox: (options) => {
          asked = options;
          return Promise.resolve(inbox());
        },
      }),
      "emqnote",
      true,
    );
    expect(asked).toEqual({ vaultFolder: "emqnote" });
    expect(result).toEqual({
      signedIn: true,
      username: "someone@example.com",
      accountKind: "work",
      inboxReady: true,
      problem: null,
    });
  });

  it("keeps signed-in and inbox-missing apart, because the repair differs", async () => {
    const result = await connectGraph(
      bridge({
        signIn: () => Promise.resolve(account()),
        resolveInbox: () => Promise.reject(refusal(GRAPH_ERRORS.noInbox, "itemNotFound")),
      }),
      "emqnote",
      true,
    );
    expect(result.signedIn).toBe(true);
    expect(result.inboxReady).toBe(false);
    expect(result.problem).toBe("Could not find emqnote/00 Inbox: itemNotFound");
  });

  it("carries the account kind through, so a personal sign-in can be pointed out", async () => {
    const result = await connectGraph(
      bridge({
        signIn: () => Promise.resolve(account("personal", "someone@outlook.com")),
        resolveInbox: () => Promise.resolve(inbox()),
      }),
      "emqnote",
      true,
    );
    expect(result.accountKind).toBe("personal");
    expect(result.username).toBe("someone@outlook.com");
  });
});
