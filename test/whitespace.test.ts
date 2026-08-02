import { describe, expect, it } from "vitest";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../src/markdown/schema.js";
import { serializeBody } from "../src/markdown/index.js";
import { readLaunchOptions } from "../src/main/launch-options.js";
import { isoWithOffset } from "../src/shared/time.js";

const NBSP = String.fromCharCode(160);

function paragraph(text: string): PMNode {
  return schema.nodes.doc!.create(null, [
    schema.nodes.paragraph!.create(null, [schema.text(text)]),
  ]);
}

/**
 * Invisible characters that arrive without being typed.
 *
 * `contenteditable` inserts U+00A0 so a trailing space does not collapse, and pasted
 * Outlook HTML is full of `&nbsp;`. Both are invisible in the editor and very visible
 * when the file is opened anywhere else.
 */
describe("non-breaking spaces", () => {
  it("become ordinary spaces", () => {
    expect(serializeBody(paragraph(`Een${NBSP}woord`))).toBe("Een woord\n");
  });

  it("do not survive at the end of a line", () => {
    expect(serializeBody(paragraph(`Regel${NBSP}`))).toBe("Regel\n");
  });

  it("are cleaned up inside a list item too", () => {
    const doc = schema.nodes.doc!.create(null, [
      schema.nodes.bulletList!.create(null, [
        schema.nodes.listItem!.create(null, [
          schema.nodes.paragraph!.create(null, [schema.text(`Punt${NBSP}een${NBSP}`)]),
        ]),
      ]),
    ]);
    expect(serializeBody(doc)).toBe("- Punt een\n");
  });
});

describe("trailing whitespace", () => {
  it("is dropped, because two spaces would silently mean a line break", () => {
    expect(serializeBody(paragraph("Regel  "))).toBe("Regel\n");
  });

  it("leaves spaces inside the line alone", () => {
    expect(serializeBody(paragraph("Twee  spaties  midden in"))).toBe(
      "Twee  spaties  midden in\n",
    );
  });

  it("does not touch a paragraph that was already clean", () => {
    expect(serializeBody(paragraph("Niets aan de hand"))).toBe("Niets aan de hand\n");
  });
});

describe("timestamps", () => {
  it("writes an offset, never a Z", () => {
    // The header block used Date.toISOString() when you changed the date by hand,
    // which produced UTC with milliseconds — a value the dialect does not allow, and
    // one that reads back an hour or two off.
    const result = isoWithOffset(new Date(2026, 6, 25, 14, 32, 0));
    expect(result).toMatch(/^2026-07-25T14:32:00[+-]\d{2}:\d{2}$/);
    expect(result).not.toContain("Z");
    expect(result).not.toContain(".");
  });

  it("keeps the wall-clock time it was given", () => {
    expect(isoWithOffset(new Date(2026, 0, 3, 9, 5, 7))).toMatch(/^2026-01-03T09:05:07/);
  });
});

/**
 * The self-test could not be started on Windows because `set EMQNOTE_SELFTEST=50` only
 * works in cmd, while PowerShell needs `$env:` and fails silently. A flag works from
 * any shell.
 */
describe("launch options", () => {
  it("reads the rounds from a flag", () => {
    expect(readLaunchOptions(["emqnote", "--selftest=50"]).selfTestRounds).toBe(50);
  });

  it("accepts the spaced form as well", () => {
    expect(readLaunchOptions(["emqnote", "--selftest", "20"]).selfTestRounds).toBe(20);
  });

  it("reads the vault from a flag", () => {
    expect(readLaunchOptions(["emqnote", "--vault=C:\\tmp\\proef"]).vaultOverride).toBe(
      "C:\\tmp\\proef",
    );
  });

  it("treats a normal launch as zero rounds", () => {
    expect(readLaunchOptions(["emqnote"]).selfTestRounds).toBe(0);
    expect(readLaunchOptions(["emqnote"]).vaultOverride).toBeNull();
  });

  it("ignores nonsense instead of half-starting a measurement", () => {
    expect(readLaunchOptions(["emqnote", "--selftest=abc"]).selfTestRounds).toBe(0);
    expect(readLaunchOptions(["emqnote", "--selftest=-3"]).selfTestRounds).toBe(0);
  });

  it("reads the clipboard dump prefix from a flag", () => {
    expect(readLaunchOptions(["emqnote", "--dump-clipboard=/tmp/paste-sample"]).dumpClipboard).toBe(
      "/tmp/paste-sample",
    );
  });

  it("treats a normal launch as no clipboard dump", () => {
    expect(readLaunchOptions(["emqnote"]).dumpClipboard).toBeNull();
  });
});
