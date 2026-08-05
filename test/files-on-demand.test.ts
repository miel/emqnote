import { describe, expect, it } from "vitest";
import { readAttribOutput } from "../src/main/vault.js";

/**
 * The Windows half of the Files On-Demand check, tested without Windows.
 *
 * Each sample is an attribute field of single letters and spaces followed by an absolute
 * path, which is the shape `attrib <dir>\* /s` prints. The exact column the path starts
 * in is deliberately *not* the same in every case here, and deliberately not asserted
 * anywhere: pinning these tests to one field width would re-introduce the assumption
 * that broke the old version, which read a fixed 21 characters as the attribute field.
 * `readAttribOutput` finds where the path begins instead, so it does not care.
 */

const NOT_FOUND = "File not found - C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\emqnote-scan-x\\*";

describe("reading attrib's output", () => {
  it("reports pinned files as hydrated", () => {
    const stdout = [
      "A         P  C:\\Users\\me\\OneDrive\\emqnote\\00 Inbox\\note.md",
      "A         P  C:\\Users\\me\\OneDrive\\emqnote\\10 Projects\\kickoff.md",
    ].join("\r\n");

    expect(readAttribOutput(stdout)).toBe("ok");
  });

  it("reports an unpinned file as on-demand, even among pinned ones", () => {
    const stdout = [
      "A         P  C:\\Users\\me\\OneDrive\\emqnote\\00 Inbox\\note.md",
      "A         U  C:\\Users\\me\\OneDrive\\emqnote\\90 Archive\\oud.md",
    ].join("\r\n");

    expect(readAttribOutput(stdout)).toBe("ondemand");
  });

  /**
   * The bug this file exists for. `C:\Users` put a `U` inside the old fixed-width slice,
   * so an empty folder — a vault on its very first run, before a single note is in it —
   * answered "your whole vault is evicted" and took tags, people and search down with it.
   */
  it("does not read attrib's own 'file not found' message as an evicted file", () => {
    expect(readAttribOutput(NOT_FOUND)).toBe("unknown");
  });

  it("does not read a localised 'file not found' message as one either", () => {
    // Same message on a Dutch Windows: still a sentence, still not an attribute field.
    const dutch = "Bestand niet gevonden - C:\\Users\\ik\\OneDrive\\emqnote\\*";

    expect(readAttribOutput(dutch)).toBe("unknown");
  });

  it("ignores a stray message sitting among real attribute lines", () => {
    const stdout = [
      NOT_FOUND,
      "A         P  C:\\Users\\me\\OneDrive\\emqnote\\00 Inbox\\note.md",
    ].join("\r\n");

    expect(readAttribOutput(stdout)).toBe("ok");
  });

  /**
   * The other half of the same mistake: a `U` anywhere in the *path* must not count.
   * Every path under a Windows user profile has one, in `C:\Users` itself.
   */
  it("reads only the attribute field, never the path", () => {
    const stdout = "A            C:\\Users\\Ursula\\OneDrive\\emqnote\\UITLEG.md";

    expect(readAttribOutput(stdout)).toBe("unknown");
  });

  it("handles a UNC path", () => {
    const stdout = "A         U  \\\\server\\share\\emqnote\\note.md";

    expect(readAttribOutput(stdout)).toBe("ondemand");
  });

  it("handles the several attribute letters a real file carries", () => {
    const stdout = [
      "A  SHR    I  C:\\Users\\me\\OneDrive\\emqnote\\00 Inbox\\note.md",
      "   R      P  C:\\Users\\me\\OneDrive\\emqnote\\_templates\\dagstart.md",
    ].join("\r\n");

    expect(readAttribOutput(stdout)).toBe("ok");
  });

  /**
   * The same two files at three different field widths. Which one Windows actually
   * prints is not something this repository can observe, and after this fix it is not
   * something it has to know.
   */
  it("does not care where the path starts", () => {
    for (const gap of ["  ", "         ", "                   "]) {
      const stdout = [
        `A${gap}P  C:\\Users\\me\\OneDrive\\emqnote\\00 Inbox\\een.md`,
        `A${gap}P  C:\\Users\\me\\OneDrive\\emqnote\\00 Inbox\\twee.md`,
      ].join("\r\n");

      expect(readAttribOutput(stdout)).toBe("ok");
    }
  });

  it("says nothing at all about empty output", () => {
    expect(readAttribOutput("")).toBe("unknown");
    expect(readAttribOutput("\r\n\r\n")).toBe("unknown");
  });

  it("says unknown when the files carry neither marker", () => {
    // A vault on a plain local disk: real files, no OneDrive attributes on them.
    const stdout = "A            C:\\notes\\emqnote\\00 Inbox\\note.md";

    expect(readAttribOutput(stdout)).toBe("unknown");
  });
});
