import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { thumbnailKey } from "../src/main/thumbnail-cache.js";
import { decideThumbnailProbe } from "../src/main/thumbnail-probe.js";

/**
 * The Electron-free half of `--thumbnail-probe` — everything up to (but not including)
 * the actual `nativeImage.createThumbnailFromPath` call, which needs a real Electron
 * process and lives in `thumbnails.ts`'s `runThumbnailProbe` instead (same split as
 * `thumbnail-cache.test.ts` documents for the cache itself).
 */

let vault: string;
let cacheDir: string;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-thumb-probe-"));
  mkdirSync(join(vault, "_attachments"), { recursive: true });
  cacheDir = mkdtempSync(join(tmpdir(), "emqnote-thumb-probe-cache-"));
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
  rmSync(cacheDir, { recursive: true, force: true });
});

describe("decideThumbnailProbe", () => {
  it("stops at not-previewable for an extension nothing would ever ask a thumbnail for", () => {
    writeFileSync(join(vault, "_attachments", "foto.png"), "x");
    expect(decideThumbnailProbe(vault, "foto.png", cacheDir)).toEqual({
      step: "not-previewable",
    });
  });

  it("stops at not-previewable for an extensionless name — the note-link case", () => {
    expect(decideThumbnailProbe(vault, "Some Note", cacheDir)).toEqual({
      step: "not-previewable",
    });
  });

  it("stops at not-resolved for a file that does not exist", () => {
    expect(decideThumbnailProbe(vault, "missing.pdf", cacheDir)).toEqual({
      step: "not-resolved",
    });
  });

  it("stops at not-resolved for a traversal attempt", () => {
    writeFileSync(join(vault, "secret.pdf"), "x");
    expect(decideThumbnailProbe(vault, "../secret.pdf", cacheDir)).toEqual({
      step: "not-resolved",
    });
  });

  it("reaches ready for a real previewable file, with the same cache key ensureThumbnail would use", () => {
    const file = join(vault, "_attachments", "offerte.pdf");
    writeFileSync(file, "%PDF-1.4 fake");

    const decision = decideThumbnailProbe(vault, "offerte.pdf", cacheDir);
    expect(decision.step).toBe("ready");
    if (decision.step !== "ready") throw new Error("unreachable");

    expect(decision.resolved).toBe(file);
    expect(decision.alreadyCached).toBe(false);

    const stats = statSync(file);
    const key = thumbnailKey(file, stats.mtimeMs, stats.size);
    expect(decision.cachedFile).toBe(join(cacheDir, `${key}.png`));
  });

  it("reports alreadyCached when a thumbnail for this exact file already exists", () => {
    const file = join(vault, "_attachments", "offerte.pdf");
    writeFileSync(file, "%PDF-1.4 fake");

    const first = decideThumbnailProbe(vault, "offerte.pdf", cacheDir);
    if (first.step !== "ready") throw new Error("unreachable");
    writeFileSync(first.cachedFile, "fake png bytes");

    const second = decideThumbnailProbe(vault, "offerte.pdf", cacheDir);
    if (second.step !== "ready") throw new Error("unreachable");
    expect(second.alreadyCached).toBe(true);
  });

  it("is case-insensitive on extension, same as isPreviewable", () => {
    const file = join(vault, "_attachments", "OFFERTE.PDF");
    writeFileSync(file, "%PDF-1.4 fake");
    expect(decideThumbnailProbe(vault, "OFFERTE.PDF", cacheDir).step).toBe("ready");
  });
});
