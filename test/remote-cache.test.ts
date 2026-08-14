import { mkdtempSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findCachedImage,
  isRemoteImageFile,
  pruneRemoteImages,
  remoteImageFile,
  remoteImageKey,
} from "../src/main/remote-cache.js";
import { attachmentNameFromUrl, attachmentUrl } from "../src/shared/attachment-url.js";

/**
 * The naming and eviction half of B50's remote-image cache — Electron-free and network-free
 * by construction, the same split `thumbnail-cache.ts` keeps from `thumbnails.ts`.
 */

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "emqnote-remote-"));
}

/** A file of `size` bytes with a definite mtime, so eviction order is not a race. */
function put(dir: string, name: string, size: number, minutesAgo: number): string {
  const path = join(dir, name);
  writeFileSync(path, Buffer.alloc(size));
  const when = new Date(Date.now() - minutesAgo * 60_000);
  utimesSync(path, when, when);
  return path;
}

describe("remoteImageKey", () => {
  it("is 32 hex characters, which no filesystem objects to", () => {
    expect(remoteImageKey("https://example.com/a.png")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is stable for the same address", () => {
    expect(remoteImageKey("https://example.com/a.png")).toBe(
      remoteImageKey("https://example.com/a.png"),
    );
  });

  it("tells two addresses apart by their query string", () => {
    // Two pictures on one host differing only in `?size=` are two pictures, and a key
    // that collapsed them would draw one where the other belongs.
    expect(remoteImageKey("https://example.com/a.png?size=1")).not.toBe(
      remoteImageKey("https://example.com/a.png?size=2"),
    );
  });

  it("survives an address full of characters a filename cannot hold", () => {
    const key = remoteImageKey('https://example.com/a b/c:d*?"<>|.png#x');
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("remoteImageFile", () => {
  it("puts the extension the bytes earned on the end of the key", () => {
    const file = remoteImageFile("/cache", "https://example.com/a", ".jpg");
    expect(file.endsWith(`${remoteImageKey("https://example.com/a")}.jpg`)).toBe(true);
  });

  it("names a file this cache recognises as its own", () => {
    const file = remoteImageFile("/cache", "https://example.com/a", ".png");
    expect(isRemoteImageFile(file.split(/[\\/]/).pop()!)).toBe(true);
  });

  it("does not claim a file it did not write", () => {
    expect(isRemoteImageFile("notes.md")).toBe(false);
    expect(isRemoteImageFile("thumbnail.png")).toBe(false);
  });
});

describe("findCachedImage", () => {
  it("finds the file whatever extension it was stored under", () => {
    const dir = scratch();
    const url = "https://example.com/a";
    put(dir, `${remoteImageKey(url)}.webp`, 10, 1);

    expect(findCachedImage(dir, url)).toBe(join(dir, `${remoteImageKey(url)}.webp`));
  });

  it("answers null for an address nothing has fetched", () => {
    expect(findCachedImage(scratch(), "https://example.com/never.png")).toBeNull();
  });

  it("answers null for a cache directory that does not exist yet", () => {
    expect(findCachedImage(join(tmpdir(), "emqnote-no-such-cache"), "https://a/b.png")).toBeNull();
  });
});

describe("pruneRemoteImages", () => {
  it("keeps the newest and deletes the rest past the count cap", () => {
    const dir = scratch();
    put(dir, `${"0".repeat(31)}1.png`, 10, 30);
    put(dir, `${"0".repeat(31)}2.png`, 10, 20);
    put(dir, `${"0".repeat(31)}3.png`, 10, 10);

    pruneRemoteImages(dir, 2, Infinity);

    expect(readdirSync(dir).sort()).toEqual([`${"0".repeat(31)}2.png`, `${"0".repeat(31)}3.png`]);
  });

  it("stops at the byte cap even when the count is fine", () => {
    const dir = scratch();
    put(dir, `${"a".repeat(31)}1.png`, 4000, 30);
    put(dir, `${"a".repeat(31)}2.png`, 4000, 10);

    pruneRemoteImages(dir, 100, 5000);

    expect(readdirSync(dir)).toEqual([`${"a".repeat(31)}2.png`]);
  });

  it("keeps the newest file even when it alone exceeds the budget", () => {
    // Deleting the download that was just made means making it again on the very next
    // draw, forever — `cache-prune.ts` says so and this is what says it out loud.
    const dir = scratch();
    put(dir, `${"b".repeat(31)}1.png`, 9000, 5);

    pruneRemoteImages(dir, 100, 1000);

    expect(readdirSync(dir)).toEqual([`${"b".repeat(31)}1.png`]);
  });

  it("leaves files that are not this cache's alone", () => {
    const dir = scratch();
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "index.sqlite"), "not mine");
    put(dir, `${"c".repeat(31)}1.png`, 10, 1);

    pruneRemoteImages(dir, 0, 0);

    expect(readdirSync(dir).sort()).toEqual(["index.sqlite", "sub"]);
  });
});

describe("the URL a note's picture is asked for over", () => {
  it("round-trips a whole web address through the path form", () => {
    const src = "https://images.example.com/m/5jex_sqr256/155/lennart.jpg?v=2#top";
    expect(attachmentNameFromUrl(attachmentUrl("emqnote-remote", src), "emqnote-remote")).toBe(src);
  });

  it("keeps the address's own case, which the host form would have lowercased", () => {
    const src = "https://Example.com/A/B.PNG";
    expect(attachmentNameFromUrl(attachmentUrl("emqnote-remote", src), "emqnote-remote")).toBe(src);
  });
});
