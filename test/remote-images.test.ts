import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { serveRemoteImage } from "../src/main/remote-images.js";
import { remoteImageKey } from "../src/main/remote-cache.js";

/**
 * What B50 serves and what it refuses, without a network in sight.
 *
 * The refusals are the half worth pinning: a URL in a note is attacker-shaped input in
 * exactly the way a pasted one is — a vault can be a shared OneDrive folder, and a note can
 * be written by anything — so `serveRemoteImage` asks `remote-image.ts`'s allowlist
 * *before* it so much as looks in the cache. Every check behind that lives in
 * `remote-image.test.ts` and is exercised there; what is asserted here is that this path
 * reaches them at all.
 *
 * The success path needs a real server and is a live item in `TEST-PROTOCOL.md`, alongside
 * the cache-and-go-offline check that is the whole point of keeping the bytes.
 */

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "emqnote-serve-"));
}

describe("serveRemoteImage refuses", () => {
  it("a file: URL, without reading a byte off the local disk", async () => {
    expect(await serveRemoteImage(scratch(), "file:///etc/passwd")).toBeNull();
  });

  it("a relative address, which never parses and so never passes", async () => {
    expect(await serveRemoteImage(scratch(), "/images/a.png")).toBeNull();
  });

  it("anything with no scheme this app dereferences", async () => {
    for (const url of ["blob:https://example.com/x", "javascript:alert(1)", "cid:part1"]) {
      expect(await serveRemoteImage(scratch(), url)).toBeNull();
    }
  });

  it("an empty address", async () => {
    expect(await serveRemoteImage(scratch(), "")).toBeNull();
  });
});

describe("serveRemoteImage serves", () => {
  it("a cached file without going anywhere near the network", async () => {
    const dir = scratch();
    const url = "https://example.invalid/never-reachable.png";
    const file = join(dir, `${remoteImageKey(url)}.png`);
    writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    // `example.invalid` cannot resolve, by RFC 2606 — so this answering at all is proof
    // the cache was consulted first, which is what makes a note readable offline.
    expect(await serveRemoteImage(dir, url)).toBe(file);
  });

  it("refuses a cached file whose address is not one it would fetch", async () => {
    // The scheme is checked *before* the cache, so a cache poisoned by hand cannot make
    // this path serve something the allowlist would have refused.
    const dir = scratch();
    const url = "file:///etc/passwd";
    writeFileSync(join(dir, `${remoteImageKey(url)}.png`), "x");

    expect(await serveRemoteImage(dir, url)).toBeNull();
  });
});
