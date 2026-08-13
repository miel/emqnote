import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isPreviewable,
  pruneThumbnails,
  thumbnailKey,
} from "../src/main/thumbnail-cache.js";

/**
 * The Electron-free half of B30/B36's thumbnail cache — naming, gating, pruning. The
 * Electron-touching half (`thumbnails.ts`, `pdf-thumb.ts`) is not tested directly here
 * for the same reason `vault.ts`'s platform-specific calls are not: it needs a real
 * Electron process (or a build) to exercise. `pdf-thumb-queue.test.ts` covers the one
 * piece of that half that *can* run without one — the render queue's scheduling.
 */

describe("isPreviewable", () => {
  it("accepts a PDF", () => {
    expect(isPreviewable("2026-08-04-1030-offerte.pdf")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isPreviewable("OFFERTE.PDF")).toBe(true);
  });

  it("rejects the three Office formats — B36 dropped inline preview for them", () => {
    expect(isPreviewable("verslag.docx")).toBe(false);
    expect(isPreviewable("cijfers.xlsx")).toBe(false);
    expect(isPreviewable("presentatie.pptx")).toBe(false);
  });

  it("rejects an image", () => {
    expect(isPreviewable("foto.png")).toBe(false);
  });

  it("rejects an extensionless name, the note-link case", () => {
    expect(isPreviewable("Some Note")).toBe(false);
  });
});

describe("thumbnailKey", () => {
  it("is stable across repeated calls with the same inputs", () => {
    const a = thumbnailKey("/vault/_attachments/offerte.pdf", 1000, 500);
    const b = thumbnailKey("/vault/_attachments/offerte.pdf", 1000, 500);
    expect(a).toBe(b);
  });

  it("differs when the path differs", () => {
    const a = thumbnailKey("/vault-a/_attachments/offerte.pdf", 1000, 500);
    const b = thumbnailKey("/vault-b/_attachments/offerte.pdf", 1000, 500);
    expect(a).not.toBe(b);
  });

  it("differs when mtime differs", () => {
    const a = thumbnailKey("/vault/_attachments/offerte.pdf", 1000, 500);
    const b = thumbnailKey("/vault/_attachments/offerte.pdf", 2000, 500);
    expect(a).not.toBe(b);
  });

  it("differs when size differs", () => {
    const a = thumbnailKey("/vault/_attachments/offerte.pdf", 1000, 500);
    const b = thumbnailKey("/vault/_attachments/offerte.pdf", 1000, 501);
    expect(a).not.toBe(b);
  });

  it("is filesystem-safe on every platform: hex only, 32 characters", () => {
    const key = thumbnailKey("/vault/_attachments/offerte.pdf", 1000, 500);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  // B43: the chip and the full-width page are two renders of one file, cached apart.
  it("differs per variant, and defaults to the chip", () => {
    const chip = thumbnailKey("/vault/_attachments/offerte.pdf", 1000, 500);
    const page = thumbnailKey("/vault/_attachments/offerte.pdf", 1000, 500, "page");

    expect(page).not.toBe(chip);
    expect(thumbnailKey("/vault/_attachments/offerte.pdf", 1000, 500, "chip")).toBe(chip);
  });
});

describe("pruneThumbnails", () => {
  it("does not throw on a missing directory", () => {
    const missing = join(tmpdir(), "emqnote-thumb-does-not-exist");
    expect(() => pruneThumbnails(missing, 200)).not.toThrow();
  });

  it("keeps the N newest by mtime and deletes the rest", () => {
    const dir = mkdtempSync(join(tmpdir(), "emqnote-thumb-"));
    try {
      for (let i = 0; i < 5; i += 1) {
        const path = join(dir, `${i}.png`);
        writeFileSync(path, "x");
        const when = new Date(2026, 0, 1 + i);
        utimesSync(path, when, when);
      }

      pruneThumbnails(dir, 3);

      expect(readdirSync(dir).sort()).toEqual(["2.png", "3.png", "4.png"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is a no-op when already under the cap", () => {
    const dir = mkdtempSync(join(tmpdir(), "emqnote-thumb-"));
    try {
      writeFileSync(join(dir, "0.png"), "x");
      pruneThumbnails(dir, 200);
      expect(readdirSync(dir)).toEqual(["0.png"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * The byte cap is B43's: a count alone bounded this cache fine while every entry was a
   * few-KB chip, and stopped meaning much once a full-width page render joined them.
   */
  it("evicts by total size as well as by count, newest first", () => {
    const dir = mkdtempSync(join(tmpdir(), "emqnote-thumb-"));
    try {
      for (let i = 0; i < 4; i += 1) {
        const path = join(dir, `${i}.png`);
        writeFileSync(path, "x".repeat(100));
        const when = new Date(2026, 0, 1 + i);
        utimesSync(path, when, when);
      }

      // Room for two and a bit; the two newest stay.
      pruneThumbnails(dir, 100, 250);

      expect(readdirSync(dir).sort()).toEqual(["2.png", "3.png"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps the newest file even when it alone is over the byte cap", () => {
    const dir = mkdtempSync(join(tmpdir(), "emqnote-thumb-"));
    try {
      writeFileSync(join(dir, "big.png"), "x".repeat(1000));

      // Deleting the render that was just made would only mean making it again on the
      // very next draw — forever.
      pruneThumbnails(dir, 100, 10);

      expect(readdirSync(dir)).toEqual(["big.png"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
