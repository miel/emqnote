import { describe, expect, it } from "vitest";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../src/markdown/schema.js";
import { serializeBody } from "../src/markdown/index.js";
import { readLaunchOptions } from "../src/main/launch-options.js";

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
});
