import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachmentName, resolveAttachment, saveAttachment } from "../src/main/attachments.js";
import { findOrphanedAttachments } from "../src/main/orphaned-attachments.js";

/**
 * The store nothing had ever written to before this: naming, collision handling and
 * the traversal refusal the `emqnote-attachment://` protocol handler depends on.
 */

let vault: string;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-attachments-"));
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

describe("attachmentName", () => {
  it("matches the corpus form: date, time, slug, extension", () => {
    const when = new Date(2026, 6, 25, 10, 0);
    expect(attachmentName("schermafbeelding.png", when)).toBe(
      "2026-07-25-1000-schermafbeelding.png",
    );
  });

  it("pads hours and minutes to two digits", () => {
    const when = new Date(2026, 0, 3, 9, 5);
    expect(attachmentName("foto.png", when)).toBe("2026-01-03-0905-foto.png");
  });

  it("slugifies a name with spaces and mixed case, matching the corpus", () => {
    const when = new Date(2026, 6, 25, 11, 20);
    expect(attachmentName("Offerte Fase2.PDF", when)).toBe(
      "2026-07-25-1120-offerte-fase2.pdf",
    );
  });

  it("reuses filename.ts's Windows-illegal-character rule for the slug", () => {
    const when = new Date(2026, 6, 25, 9, 5);
    expect(attachmentName("Re: fase 2?.png", when)).toBe("2026-07-25-0905-re--fase-2-.png");
  });

  it("falls back the same way sanitiseTitle does when nothing usable is left", () => {
    const when = new Date(2026, 6, 25, 9, 5);
    const bell = String.fromCharCode(7);
    expect(attachmentName(`${bell}.png`, when)).toBe("2026-07-25-0905-untitled.png");
  });
});

describe("saveAttachment", () => {
  it("writes the file into _attachments/ under its generated name and returns the bare name", () => {
    const name = saveAttachment(vault, new TextEncoder().encode("binary"), "foto.png");

    expect(name).not.toContain("/");
    expect(name).not.toContain("\\");
    expect(existsSync(join(vault, "_attachments", name))).toBe(true);
  });

  it("unique-ifies on a name collision without losing either file", () => {
    const bytes = new TextEncoder().encode("binary");
    const first = saveAttachment(vault, bytes, "foto.png");
    const second = saveAttachment(vault, bytes, "foto.png");

    expect(second).not.toBe(first);
    expect(existsSync(join(vault, "_attachments", first))).toBe(true);
    expect(existsSync(join(vault, "_attachments", second))).toBe(true);
  });

  it("creates _attachments/ when the vault does not have one yet", () => {
    expect(existsSync(join(vault, "_attachments"))).toBe(false);
    saveAttachment(vault, new TextEncoder().encode("binary"), "foto.png");
    expect(existsSync(join(vault, "_attachments"))).toBe(true);
  });
});

describe("resolveAttachment", () => {
  it("resolves a file that is really there", () => {
    const name = saveAttachment(vault, new TextEncoder().encode("binary"), "foto.png");
    expect(resolveAttachment(vault, name)).toBe(join(vault, "_attachments", name));
  });

  it("refuses a name that tries to escape _attachments/", () => {
    mkdirSync(join(vault, "_attachments"), { recursive: true });
    writeFileSync(join(vault, "secret.txt"), "top secret");

    expect(resolveAttachment(vault, "../secret.txt")).toBeNull();
  });

  it("refuses a name for a file that does not exist", () => {
    mkdirSync(join(vault, "_attachments"), { recursive: true });
    expect(resolveAttachment(vault, "nope.png")).toBeNull();
  });

  it("refuses the attachments directory itself", () => {
    mkdirSync(join(vault, "_attachments"), { recursive: true });
    expect(resolveAttachment(vault, "")).toBeNull();
  });

  it("refuses a vault with no _attachments/ folder at all", () => {
    expect(resolveAttachment(vault, "foto.png")).toBeNull();
  });

  it("refuses a symlink inside _attachments/ pointing outside the vault", () => {
    mkdirSync(join(vault, "_attachments"), { recursive: true });
    const outside = mkdtempSync(join(tmpdir(), "emqnote-outside-"));
    writeFileSync(join(outside, "secret.txt"), "top secret");
    symlinkSync(join(outside, "secret.txt"), join(vault, "_attachments", "link.txt"));

    try {
      expect(resolveAttachment(vault, "link.txt")).toBeNull();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("a saved attachment nothing references yet", () => {
  it("is found by findOrphanedAttachments", () => {
    const name = saveAttachment(vault, new TextEncoder().encode("binary"), "foto.png");
    expect(findOrphanedAttachments(vault)).toEqual([`_attachments/${name}`]);
  });
});
