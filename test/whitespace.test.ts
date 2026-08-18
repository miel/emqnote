import { describe, expect, it } from "vitest";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../src/markdown/schema.js";
import { serializeBody } from "../src/markdown/index.js";
import {
  readLaunchOptions,
  shouldOpenLibraryAtLaunch,
} from "../src/main/launch-options.js";
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

  it("reads --key-probe as a plain flag", () => {
    // A flag with no value, unlike the three probes beside it, because it is a mode of
    // the ordinary app rather than a run that reports one thing and exits.
    expect(readLaunchOptions(["emqnote", "--key-probe"]).keyProbe).toBe(true);
    expect(readLaunchOptions(["emqnote"]).keyProbe).toBe(false);
  });

  it("reads the login flag", () => {
    expect(readLaunchOptions(["emqnote", "--login"]).startedAtLogin).toBe(true);
    expect(readLaunchOptions(["emqnote"]).startedAtLogin).toBe(false);
  });
});

/**
 * B61. Starting the app from its shortcut looked like nothing happening at all: the tray
 * icon arrived, the capture window was built hidden, and no window was ever shown. A start
 * nobody asked for — the login item at sign-in — is the one case where that is right.
 */
describe("shouldOpenLibraryAtLaunch", () => {
  const at = (...argv: string[]): ReturnType<typeof readLaunchOptions> =>
    readLaunchOptions(["emqnote", ...argv]);

  it("opens the library on a plain launch", () => {
    expect(shouldOpenLibraryAtLaunch(at())).toBe(true);
  });

  it("stays silent when the login item started it", () => {
    expect(shouldOpenLibraryAtLaunch(at("--login"))).toBe(false);
  });

  it("stays silent on macOS's own answer, flag or no flag", () => {
    expect(shouldOpenLibraryAtLaunch(at(), true)).toBe(false);
  });

  // The flag is explicit and outranks the login one, so `--library` never has to be
  // reasoned about together with how the app happened to start.
  it("still opens for an explicit --library", () => {
    expect(shouldOpenLibraryAtLaunch(at("--library", "--login"), true)).toBe(true);
  });

  /**
   * A window in front of a latency measurement would land in the numbers, and the probes
   * exit as soon as they have printed. Excluded here rather than at the call site so the
   * rule is in one place.
   */
  it("shows nothing for a measurement or a probe", () => {
    expect(shouldOpenLibraryAtLaunch(at("--selftest=50"))).toBe(false);
    expect(shouldOpenLibraryAtLaunch(at("--dump-clipboard=/tmp/x"))).toBe(false);
    expect(shouldOpenLibraryAtLaunch(at("--thumbnail-probe=a.pdf"))).toBe(false);
    expect(shouldOpenLibraryAtLaunch(at("--trash-probe=_trash/Alpha"))).toBe(false);
  });
});
