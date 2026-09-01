import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
 *
 * With one exception, and it is the useful one: a `data:` address carries its own bytes, so
 * the whole of B97's path — decode, sniff, cap, name, write, serve — runs here end to end
 * with nothing to stand up at all.
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

/**
 * B97, the whole way through, with no network anywhere near it.
 *
 * A 1×1 GIF87a: the same format Word and Outlook write into a note, and here labelled
 * `image/png` exactly as they label it. Before B97 that mismatch was a refusal — a note
 * carrying the picture in its own text drew a grey chip — and the extension it lands under
 * is the second half of the fix: the bytes decide it, so the cache never holds a file whose
 * name lies about what is in it.
 */
const OFFICE_GIF = "R0lGODdhAQABAIAAAAAAAAAAACwAAAAAAQABAAACAkQBADs=";

describe("serveRemoteImage on a data: address", () => {
  it("decodes, sniffs and caches one whose label disagrees with its bytes", async () => {
    const dir = scratch();
    const file = await serveRemoteImage(dir, `data:image/png;base64,${OFFICE_GIF}`);

    expect(file).not.toBeNull();
    // `.gif`, not `.png`: the label is ignored and the magic number names the file.
    expect(file!.endsWith(".gif")).toBe(true);
    expect(readFileSync(file!).subarray(0, 6).toString("latin1")).toBe("GIF87a");
  });

  it("takes one that names no type at all, which is the RFC's default", async () => {
    const dir = scratch();
    expect(await serveRemoteImage(dir, `data:;base64,${OFFICE_GIF}`)).not.toBeNull();
  });

  it("serves the second ask out of the cache, under the same key", async () => {
    const dir = scratch();
    const url = `data:image/png;base64,${OFFICE_GIF}`;

    const first = await serveRemoteImage(dir, url);
    const second = await serveRemoteImage(dir, url);

    expect(second).toBe(first);
    expect(first!.includes(remoteImageKey(url))).toBe(true);
  });

  it("still refuses one whose bytes are not an image", async () => {
    const dir = scratch();
    const svg = Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"/>").toString("base64");

    // Trusting the payload is not the same as trusting the label. An SVG has no magic
    // number, and `openWikiLink` hands a stored attachment to a viewer where script inside
    // one runs — the asymmetry `remote-image.ts` spells out, unchanged by B97.
    expect(await serveRemoteImage(dir, `data:image/svg+xml;base64,${svg}`)).toBeNull();
    expect(await serveRemoteImage(dir, `data:image/png;base64,${svg}`)).toBeNull();
  });

  it("refuses a payload that is not base64 at all", async () => {
    expect(await serveRemoteImage(scratch(), "data:image/png,%89PNG%0D%0A")).toBeNull();
  });
});
