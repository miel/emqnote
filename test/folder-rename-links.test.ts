import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeIndex, openIndex, type IndexDb } from "../src/main/index-db.js";
import { linkTargetFor } from "../src/main/link-resolve.js";
import { linkingNotesUnder, resolveNoteLink } from "../src/main/vault-scan.js";
import { renameFolder, rewriteWikiLinks } from "../src/main/vault-io.js";
import {
  folderRenameRewrites,
  isUnder,
  movedPath,
  type Referrer,
} from "../src/main/folder-rename-links.js";

/**
 * B44: renaming a folder moves every note in it, so it moves every `[[path|Title]]` target
 * pointing into it — and before this every one of them silently broke.
 *
 * Two halves, tested at both levels. The arithmetic (`folder-rename-links.ts`) is pinned on
 * its own, and then the whole thing is run against a real vault the way
 * `IPC.libraryRenameFolder` runs it: ask the index *before* the rename, rename, rewrite —
 * because the ordering is the part that is easy to get wrong and impossible to see in a
 * unit test of either half.
 */

let vault: string;
let db: IndexDb;

function note(folder: string, name: string, body = "Tekst."): string {
  mkdirSync(join(vault, folder), { recursive: true });
  const front = [
    "---",
    `title: ${name}`,
    "type: quick",
    "created: 2026-08-12T09:00:00+02:00",
    "---",
    "",
  ].join("\n");
  const path = folder === "" ? `${name}.md` : `${folder}/${name}.md`;
  writeFileSync(join(vault, path), `${front}${body}\n`);
  return path;
}

function read(path: string): string {
  return readFileSync(join(vault, path), "utf8");
}

/**
 * Exactly what `IPC.libraryRenameFolder` does, in the same order — the handler itself
 * needs Electron, and the order is the whole point.
 */
async function renameFolderRepairingLinks(from: string, name: string, skip?: string): Promise<string> {
  const linking = await linkingNotesUnder(vault, db, from);
  const to = renameFolder(vault, from, name);

  for (const rewrite of folderRenameRewrites(from, to, linking)) {
    rewriteWikiLinks(vault, rewrite.references, rewrite.newTarget, skip ?? null);
  }

  return to;
}

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-folder-links-"));
  db = openIndex(":memory:");
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
  closeIndex(db);
});

describe("the path arithmetic", () => {
  it("knows what is inside a folder and what merely starts with its name", () => {
    expect(isUnder("Klant A/Rules.md", "Klant A")).toBe(true);
    expect(isUnder("Klant A/diep/Rules.md", "Klant A")).toBe(true);
    expect(isUnder("Klant Alpha/Rules.md", "Klant A")).toBe(false);
    expect(isUnder("Klant A", "Klant A")).toBe(false);
    // The vault root holds everything.
    expect(isUnder("Klant A/Rules.md", "")).toBe(true);
  });

  it("swaps the prefix and leaves everything below it alone", () => {
    expect(movedPath("Klant A/diep/Rules.md", "Klant A", "Klant Alpha")).toBe(
      "Klant Alpha/diep/Rules.md",
    );
    expect(movedPath("Elders/Rules.md", "Klant A", "Klant Alpha")).toBe("Elders/Rules.md");
  });

  it("moves a referrer that was itself inside the renamed folder", () => {
    const linking = new Map<string, Referrer[]>([
      [
        "Klant A/Rules.md",
        [
          { path: "00 Inbox/Buiten.md", targets: ["Klant A/Rules"] },
          { path: "Klant A/Binnen.md", targets: ["Klant A/Rules"] },
        ],
      ],
    ]);

    expect(folderRenameRewrites("Klant A", "Klant Alpha", linking)).toEqual([
      {
        references: [
          { path: "00 Inbox/Buiten.md", targets: ["Klant A/Rules"] },
          // The note doing the linking moved too, so the file to write is at its new path.
          { path: "Klant Alpha/Binnen.md", targets: ["Klant A/Rules"] },
        ],
        newTarget: "Klant Alpha/Rules",
      },
    ]);
  });

  it("has nothing to do when the name did not actually change", () => {
    const linking = new Map<string, Referrer[]>([
      ["Klant A/Rules.md", [{ path: "00 Inbox/Een.md", targets: ["Klant A/Rules"] }]],
    ]);

    expect(folderRenameRewrites("Klant A", "Klant A", linking)).toEqual([]);
  });
});

describe("linkingNotesUnder", () => {
  it("groups referrers by the note inside the folder that they point at", async () => {
    const rules = note("Klant A", "Rules");
    const prijzen = note("Klant A", "Prijzen");
    note("00 Inbox", "Een", `Zie [[${linkTargetFor(rules)}|Rules]].`);
    note("00 Inbox", "Twee", `Zie [[${linkTargetFor(prijzen)}|Prijzen]].`);
    note("00 Inbox", "Drie", "Geen links.");

    const linking = await linkingNotesUnder(vault, db, "Klant A");

    expect([...linking.keys()].sort()).toEqual([prijzen, rules]);
    expect(linking.get(rules)!.map((one) => one.path)).toEqual(["00 Inbox/Een.md"]);
    expect(linking.get(prijzen)!.map((one) => one.path)).toEqual(["00 Inbox/Twee.md"]);
  });

  it("includes a referrer that lives inside the folder as well", async () => {
    const rules = note("Klant A", "Rules");
    note("Klant A", "Binnen", `Zie [[${linkTargetFor(rules)}|Rules]].`);

    const linking = await linkingNotesUnder(vault, db, "Klant A");

    expect(linking.get(rules)!.map((one) => one.path)).toEqual(["Klant A/Binnen.md"]);
  });

  it("never lists a note as linking to itself", async () => {
    const rules = note("Klant A", "Rules", "Zie [[Klant A/Rules|zichzelf]].");

    expect((await linkingNotesUnder(vault, db, "Klant A")).get(rules)).toBeUndefined();
  });

  it("says nothing about a folder nothing links into", async () => {
    note("Klant A", "Rules");
    note("00 Inbox", "Een", "Geen links.");

    expect(await linkingNotesUnder(vault, db, "Klant A")).toEqual(new Map());
  });

  it("ignores a link whose target is ambiguous — nothing may be rewritten on a guess", async () => {
    note("Klant A", "Rules");
    note("02 Elders", "Rules");
    note("00 Inbox", "Een", "Zie [[Rules]].");

    expect(await linkingNotesUnder(vault, db, "Klant A")).toEqual(new Map());
  });
});

describe("renaming the folder", () => {
  it("repoints a link into it, and the link still opens the note afterwards", async () => {
    const rules = note("Klant A", "Rules");
    const een = note("00 Inbox", "Een", `Zie [[${linkTargetFor(rules)}|de regels]].`);

    await renameFolderRepairingLinks("Klant A", "Klant Alpha");

    expect(read(een)).toContain("[[Klant Alpha/Rules|de regels]]");
    // The actual point of the exercise: the target resolves again.
    expect(await resolveNoteLink(vault, db, "Klant Alpha/Rules")).toEqual({
      kind: "unique",
      path: "Klant Alpha/Rules.md",
    });
  });

  it("rewrites a link between two notes that both moved", async () => {
    const rules = note("Klant A", "Rules");
    note("Klant A", "Binnen", `Zie [[${linkTargetFor(rules)}|Rules]].`);

    await renameFolderRepairingLinks("Klant A", "Klant Alpha");

    expect(read("Klant Alpha/Binnen.md")).toContain("[[Klant Alpha/Rules|Rules]]");
  });

  it("leaves a bare title link alone — it never named the folder in the first place", async () => {
    note("Klant A", "Rules");
    const een = note("00 Inbox", "Een", "Zie [[Rules]].");

    await renameFolderRepairingLinks("Klant A", "Klant Alpha");

    // Rewritten to the new path, since a rewrite is what keeps it unambiguous — but the
    // displayed word is still "Rules": an un-aliased link gains its old target as the
    // alias rather than starting to show a path (B35).
    expect(read(een)).toContain("[[Klant Alpha/Rules|Rules]]");
  });

  it("touches nothing when no link points into the folder", async () => {
    note("Klant A", "Rules");
    const een = note("00 Inbox", "Een", "Geen links.");
    const before = read(een);

    await renameFolderRepairingLinks("Klant A", "Klant Alpha");

    expect(read(een)).toBe(before);
  });

  it("skips a note the capture window has claimed, and rewrites the rest", async () => {
    const rules = note("Klant A", "Rules");
    const een = note("00 Inbox", "Een", `Zie [[${linkTargetFor(rules)}|Rules]].`);
    const twee = note("00 Inbox", "Twee", `Ook [[${linkTargetFor(rules)}|Rules]].`);
    const before = read(twee);

    await renameFolderRepairingLinks("Klant A", "Klant Alpha", twee);

    expect(read(een)).toContain("[[Klant Alpha/Rules|Rules]]");
    // Its in-memory document would be written over anything landing here.
    expect(read(twee)).toBe(before);
  });

  it("renames a nested folder without disturbing its siblings", async () => {
    const diep = note("Klant A/Diep", "Rules");
    const naast = note("Klant A", "Naast");
    const een = note("00 Inbox", "Een", `Zie [[${linkTargetFor(diep)}|Rules]].`);
    const naastBefore = read(naast);

    await renameFolderRepairingLinks("Klant A/Diep", "Dieper");

    expect(read(een)).toContain("[[Klant A/Dieper/Rules|Rules]]");
    expect(read(naast)).toBe(naastBefore);
  });
});
