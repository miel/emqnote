import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attachmentName,
  copyAttachment,
  resolveAttachment,
  saveAttachment,
} from "../src/main/attachments.js";
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
  it("writes the file into _attachments/ under its generated name and returns the bare name", async () => {
    const name = await saveAttachment(vault, new TextEncoder().encode("binary"), "foto.png");

    expect(name).not.toContain("/");
    expect(name).not.toContain("\\");
    expect(existsSync(join(vault, "_attachments", name))).toBe(true);
  });

  it("unique-ifies on a name collision without losing either file", async () => {
    const bytes = new TextEncoder().encode("binary");
    const first = await saveAttachment(vault, bytes, "foto.png");
    const second = await saveAttachment(vault, bytes, "foto.png");

    expect(second).not.toBe(first);
    expect(existsSync(join(vault, "_attachments", first))).toBe(true);
    expect(existsSync(join(vault, "_attachments", second))).toBe(true);
  });

  it("creates _attachments/ when the vault does not have one yet", async () => {
    expect(existsSync(join(vault, "_attachments"))).toBe(false);
    await saveAttachment(vault, new TextEncoder().encode("binary"), "foto.png");
    expect(existsSync(join(vault, "_attachments"))).toBe(true);
  });
});

/**
 * The sibling `saveAttachment` gained so the picker's IPC handler never has to load a
 * multi-megabyte file into a JS `Buffer` in this process just to hand it straight back
 * to `writeFile` — `copyFile` streams it directly to the `.tmp` path instead.
 */
describe("copyAttachment", () => {
  function writeSourceFile(name: string, contents: string): string {
    const path = join(vault, name);
    writeFileSync(path, contents);
    return path;
  }

  it("copies the source file into _attachments/ under its generated name", async () => {
    const source = writeSourceFile("offerte.pdf", "%PDF-1.4 pretend contents");

    const name = await copyAttachment(vault, source, "offerte.pdf");

    expect(name).not.toContain("/");
    expect(existsSync(join(vault, "_attachments", name))).toBe(true);
    expect(readFileSync(join(vault, "_attachments", name), "utf8")).toBe(
      "%PDF-1.4 pretend contents",
    );
    // The source file itself is untouched — this copies, it does not move.
    expect(existsSync(source)).toBe(true);
  });

  it("unique-ifies on a name collision without losing either file", async () => {
    const source = writeSourceFile("offerte.pdf", "eerste versie");

    const first = await copyAttachment(vault, source, "offerte.pdf");
    const second = await copyAttachment(vault, source, "offerte.pdf");

    expect(second).not.toBe(first);
    expect(existsSync(join(vault, "_attachments", first))).toBe(true);
    expect(existsSync(join(vault, "_attachments", second))).toBe(true);
  });

  it("creates _attachments/ when the vault does not have one yet", async () => {
    const source = writeSourceFile("offerte.pdf", "inhoud");
    expect(existsSync(join(vault, "_attachments"))).toBe(false);

    await copyAttachment(vault, source, "offerte.pdf");

    expect(existsSync(join(vault, "_attachments"))).toBe(true);
  });
});

describe("resolveAttachment", () => {
  /**
   * Compared against the *real* path, not the one `mkdtemp` handed back.
   *
   * `resolveAttachment` returns what `realpathSync` says, deliberately: following the
   * symlinks is the guard, not a side effect of it. On macOS that shows up right here,
   * because `/var` is itself a symlink to `/private/var` — so a temp vault under
   * `/var/folders/…` resolves to `/private/var/folders/…` and an assertion against the
   * unresolved path fails on macOS while passing on Linux and Windows. Which is exactly
   * how this was found: the per-platform `npm test` in `build.yml` caught it on the
   * first pull request after it was added.
   */
  it("resolves a file that is really there", async () => {
    const name = await saveAttachment(vault, new TextEncoder().encode("binary"), "foto.png");
    expect(resolveAttachment(vault, name)).toBe(realpathSync(join(vault, "_attachments", name)));
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

/**
 * An attachment filed somewhere other than `_attachments/`.
 *
 * A vault is a folder of files other tools write too — the same observation B37 makes
 * about `.markdown` — and Obsidian's convention is a folder of the user's own choosing
 * with a *path* in the target: `![[99 - Attachments/foo.png]]`. Every one of those drew
 * nothing at all, because the only place resolution ever looked was `_attachments/`.
 *
 * The traversal guard is unchanged in kind, only in what it is anchored to: the vault
 * rather than one folder inside it. Every refusal above still refuses.
 */
describe("resolveAttachment, for a target carrying a path", () => {
  it("finds a picture in a folder the user chose", () => {
    mkdirSync(join(vault, "99 - Attachments"), { recursive: true });
    const file = join(vault, "99 - Attachments", "7337fdd5393e2f65959966ee448a92e8_MD5.png");
    writeFileSync(file, "binary");

    expect(
      resolveAttachment(vault, "99 - Attachments/7337fdd5393e2f65959966ee448a92e8_MD5.png"),
    ).toBe(realpathSync(file));
  });

  it("prefers _attachments/ when both hold that name", async () => {
    const name = await saveAttachment(vault, new TextEncoder().encode("ours"), "foto.png");
    mkdirSync(join(vault, "elders"), { recursive: true });
    writeFileSync(join(vault, "elders", name), "theirs");

    expect(resolveAttachment(vault, name)).toBe(realpathSync(join(vault, "_attachments", name)));
  });

  /**
   * The guard that keeps `IPC.openWikiLink`'s two halves apart. It asks this first and
   * only falls through to the index on null, so a path-form note link resolving here
   * would hand the note to the OS default viewer instead of opening it in the library.
   */
  it("never resolves a note file, so a path-form note link still reaches the index", () => {
    mkdirSync(join(vault, "01 Projecten"), { recursive: true });
    writeFileSync(join(vault, "01 Projecten", "Rules.md"), "# Rules");
    writeFileSync(join(vault, "01 Projecten", "Oud.markdown"), "# Oud");

    expect(resolveAttachment(vault, "01 Projecten/Rules.md")).toBeNull();
    expect(resolveAttachment(vault, "01 Projecten/Oud.markdown")).toBeNull();
  });

  it("cannot be talked out of the vault by a path", () => {
    const outside = mkdtempSync(join(tmpdir(), "emqnote-outside-"));
    writeFileSync(join(outside, "secret.txt"), "top secret");

    try {
      expect(resolveAttachment(vault, "../secret.txt")).toBeNull();
      expect(resolveAttachment(vault, "99 - Attachments/../../secret.txt")).toBeNull();
      expect(resolveAttachment(vault, join(outside, "secret.txt"))).toBeNull();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("refuses a symlink inside the vault pointing outside it", () => {
    const outside = mkdtempSync(join(tmpdir(), "emqnote-outside-"));
    writeFileSync(join(outside, "secret.txt"), "top secret");
    mkdirSync(join(vault, "99 - Attachments"), { recursive: true });
    symlinkSync(join(outside, "secret.txt"), join(vault, "99 - Attachments", "link.txt"));

    try {
      expect(resolveAttachment(vault, "99 - Attachments/link.txt")).toBeNull();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("refuses a folder, which is what keeps a bare note title from resolving", () => {
    mkdirSync(join(vault, "Rules"), { recursive: true });
    expect(resolveAttachment(vault, "Rules")).toBeNull();
  });
});

describe("a saved attachment nothing references yet", () => {
  it("is found by findOrphanedAttachments", async () => {
    const name = await saveAttachment(vault, new TextEncoder().encode("binary"), "foto.png");
    expect(await findOrphanedAttachments(vault)).toEqual([`_attachments/${name}`]);
  });
});
