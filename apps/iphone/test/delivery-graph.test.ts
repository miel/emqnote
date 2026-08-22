import { describe, expect, it } from "vitest";
import { GRAPH_ERRORS, type GraphBridge } from "../src/graph-bridge.js";
import { graphDeliverer } from "../src/delivery/graph.js";
import { sha256Hex } from "../src/delivery/hash.js";

const BYTES = "---\ntitle: Call Els\n---\n\nOne line.\n";
const NAME = "2026-08-22 1400 Call Els.md";

function refusal(domain: string, message: string, code = 0): Error {
  return Object.assign(new Error(message), { errorDomain: domain, errorCode: code });
}

/** Only the methods a given test needs; anything else throws loudly rather than silently. */
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

function uploaded(itemId = "01ABC") {
  return {
    ok: true,
    durationMs: 120,
    filename: NAME,
    byteCount: BYTES.length,
    sha256: "unused",
    itemId,
    eTag: "\"1\"",
  };
}

function probed(contentSha256: string, exists = true) {
  return { ok: true, durationMs: 40, exists, size: 0, itemId: "01ABC", eTag: "\"1\"", contentSha256 };
}

describe("uploading to Graph", () => {
  it("reports a plain success as delivered", async () => {
    const deliverer = graphDeliverer(
      bridge({ uploadNew: () => Promise.resolve(uploaded("01XYZ")) }),
    );
    expect(await deliverer.deliver(NAME, BYTES)).toEqual({ kind: "delivered", itemId: "01XYZ" });
  });

  it("never asks Graph to replace — the name is the one the outbox chose", async () => {
    let asked: { filename: string; bytes: string } | null = null;
    const deliverer = graphDeliverer(
      bridge({
        uploadNew: (options) => {
          asked = options;
          return Promise.resolve(uploaded());
        },
      }),
    );
    await deliverer.deliver("2026-08-22 1400 Call Els (2).md", BYTES);
    expect(asked).toEqual({ filename: "2026-08-22 1400 Call Els (2).md", bytes: BYTES });
  });
});

describe("a name Graph says is taken", () => {
  it("is our own note when the bytes match, so it counts as delivered", async () => {
    const ours = await sha256Hex(BYTES);
    const deliverer = graphDeliverer(
      bridge({
        uploadNew: () => Promise.reject(refusal(GRAPH_ERRORS.nameExists, "nameAlreadyExists", 409)),
        probeItem: () => Promise.resolve(probed(ours)),
      }),
    );
    expect(await deliverer.deliver(NAME, BYTES)).toEqual({
      kind: "already-delivered",
      itemId: "01ABC",
    });
  });

  it("is somebody else's note when the bytes differ, so we rename", async () => {
    const theirs = await sha256Hex("something else entirely");
    const deliverer = graphDeliverer(
      bridge({
        uploadNew: () => Promise.reject(refusal(GRAPH_ERRORS.nameExists, "nameAlreadyExists", 409)),
        probeItem: () => Promise.resolve(probed(theirs)),
      }),
    );
    expect(await deliverer.deliver(NAME, BYTES)).toEqual({ kind: "collision" });
  });

  it("is retried, not guessed at, when the check itself fails", async () => {
    // Guessing here is the one place a wrong answer either duplicates a note or overwrites
    // somebody's work. Neither is worth avoiding one more round trip.
    const deliverer = graphDeliverer(
      bridge({
        uploadNew: () => Promise.reject(refusal(GRAPH_ERRORS.nameExists, "nameAlreadyExists", 409)),
        probeItem: () => Promise.reject(refusal(GRAPH_ERRORS.transient, "The request timed out.")),
      }),
    );
    const outcome = await deliverer.deliver(NAME, BYTES);
    expect(outcome.kind).toBe("retry");
  });

  it("is retried when it has vanished between the two calls", async () => {
    const deliverer = graphDeliverer(
      bridge({
        uploadNew: () => Promise.reject(refusal(GRAPH_ERRORS.nameExists, "nameAlreadyExists", 409)),
        probeItem: () => Promise.resolve(probed("", false)),
      }),
    );
    expect((await deliverer.deliver(NAME, BYTES)).kind).toBe("retry");
  });
});

describe("mapping the named refusals", () => {
  const cases: Array<[string, string]> = [
    [GRAPH_ERRORS.noAccount, "needs-signin"],
    [GRAPH_ERRORS.interactionRequired, "needs-signin"],
    [GRAPH_ERRORS.transient, "retry"],
    [GRAPH_ERRORS.noInbox, "failed"],
  ];

  for (const [domain, expected] of cases) {
    it(`turns ${domain} into ${expected}`, async () => {
      const deliverer = graphDeliverer(
        bridge({ uploadNew: () => Promise.reject(refusal(domain, `refused: ${domain}`)) }),
      );
      expect((await deliverer.deliver(NAME, BYTES)).kind).toBe(expected);
    });
  }

  it("holds the note rather than hammering Graph over an unrecognised refusal", async () => {
    const deliverer = graphDeliverer(
      bridge({ uploadNew: () => Promise.reject(new Error("403 accessDenied")) }),
    );
    expect(await deliverer.deliver(NAME, BYTES)).toEqual({
      kind: "failed",
      reason: "403 accessDenied",
    });
  });
});

describe("the hash both sides have to agree on", () => {
  it("is sha256 over UTF-8, matching Swift's Data(text.utf8)", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashes UTF-8 bytes, so a diacritic is two of them", async () => {
    // "café" is four characters and five bytes. If this side ever hashed code units while
    // Swift hashed bytes, every note with a diacritic in it would look like a different
    // file on readback — which the delivery layer reads as somebody else's note and
    // renames around, quietly duplicating it.
    expect(new TextEncoder().encode("café")).toHaveLength(5);
    expect(await sha256Hex("café")).not.toBe(await sha256Hex("cafe"));
    expect(await sha256Hex("café")).toMatch(/^[0-9a-f]{64}$/);
  });
});
