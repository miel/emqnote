import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { probeTrashPath } from "../src/main/trash-probe.js";

/**
 * `--trash-probe`, the flag that exists because guessing had its turn.
 *
 * "Permanently deleting a folder does not work" was diagnosed as this app's own watcher
 * holding a directory handle, fixed (B57), and reported again unchanged. So this walks the
 * tree the delete would walk and reports on every entry — and, being a probe, it deletes
 * nothing: the evidence is the point.
 */

let vault: string;
let trash: string;
let outside: string;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-probe-"));
  trash = join(vault, "_trash");
  outside = mkdtempSync(join(tmpdir(), "emqnote-outside-"));
  mkdirSync(trash, { recursive: true });
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe("probing a path in the trash", () => {
  it("walks a folder and lists everything under it", () => {
    mkdirSync(join(trash, "Alpha", "Diep"), { recursive: true });
    writeFileSync(join(trash, "Alpha", "notitie.md"), "tekst");
    writeFileSync(join(trash, "Alpha", "Diep", "foto.png"), "bytes");

    const probe = probeTrashPath(vault, "_trash/Alpha");

    expect(probe.step).toBe("walked");
    if (probe.step !== "walked") return;
    expect(probe.entries.map((entry) => entry.path).sort()).toEqual([
      "_trash/Alpha",
      "_trash/Alpha/Diep",
      "_trash/Alpha/Diep/foto.png",
      "_trash/Alpha/notitie.md",
    ]);
  });

  it("leaves every one of them exactly where it was", () => {
    // The one property that separates this from the delete it diagnoses.
    mkdirSync(join(trash, "Alpha"), { recursive: true });
    writeFileSync(join(trash, "Alpha", "notitie.md"), "tekst");

    probeTrashPath(vault, "_trash/Alpha");

    expect(probeTrashPath(vault, "_trash/Alpha").step).toBe("walked");
  });

  it("says nothing holds a file that nothing holds", () => {
    writeFileSync(join(trash, "los.md"), "tekst");

    const probe = probeTrashPath(vault, "_trash/los.md");

    expect(probe.step).toBe("walked");
    if (probe.step !== "walked") return;
    expect(probe.entries).toEqual([
      { path: "_trash/los.md", kind: "file", readOnly: false, heldBy: null },
    ]);
  });

  it("never asks whether a directory is held, since it cannot be opened for writing", () => {
    // Worth pinning: a directory answering EISDIR would read as "held" and send whoever is
    // reading the output after the wrong thing entirely.
    mkdirSync(join(trash, "Map"), { recursive: true });

    const probe = probeTrashPath(vault, "_trash/Map");

    expect(probe.step).toBe("walked");
    if (probe.step !== "walked") return;
    expect(probe.entries[0]).toEqual({
      path: "_trash/Map",
      kind: "directory",
      readOnly: false,
      heldBy: null,
    });
  });

  it("refuses a path outside the trash, the same way the delete does", () => {
    mkdirSync(join(vault, "00 Inbox"), { recursive: true });
    writeFileSync(join(vault, "00 Inbox", "leeft.md"), "tekst");

    expect(probeTrashPath(vault, "00 Inbox/leeft.md").step).toBe("not-in-trash");
  });

  it("refuses a symlink out of the trash, which is what realpathSync is for", () => {
    writeFileSync(join(outside, "geheim.txt"), "niet van de vault");
    symlinkSync(outside, join(trash, "Ontsnapping"));

    const probe = probeTrashPath(vault, "_trash/Ontsnapping/geheim.txt");

    expect(probe.step).toBe("not-in-trash");
  });

  it("says so when there is nothing there", () => {
    expect(probeTrashPath(vault, "_trash/nooit.md").step).toBe("missing");
  });

  it("says so when no vault is configured", () => {
    expect(probeTrashPath(null, "_trash/wat.md")).toEqual({ step: "no-vault" });
  });
});
