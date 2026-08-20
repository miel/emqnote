import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeIndex, openIndex, type IndexDb } from "../src/main/index-db.js";
import { linkTargetFor } from "../src/main/link-resolve.js";
import { linkingNotesUnder, resolveNoteLink, targetsUnder } from "../src/main/vault-scan.js";
import { renameFolder, rewriteTargetPrefix, rewriteWikiLinks } from "../src/main/vault-io.js";
import { resolveAttachment } from "../src/main/attachments.js";
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
  const carrying = await targetsUnder(vault, db, from);
  const to = renameFolder(vault, from, name);

  for (const rewrite of folderRenameRewrites(from, to, linking)) {
    rewriteWikiLinks(vault, rewrite.references, rewrite.newTarget, skip ?? null);
  }
  rewriteTargetPrefix(
    vault,
    carrying.map((one) => movedPath(one.path, from, to)),
    from,
    to,
    skip ?? null,
  );

  return to;
}

/** A file in a folder of the vault's own, the shape an Obsidian-written vault is full of. */
function attachment(folder: string, name: string): string {
  mkdirSync(join(vault, folder), { recursive: true });
  writeFileSync(join(vault, folder, name), "bytes");
  return `${folder}/${name}`;
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

/**
 * The bug this was reported for: a folder of *attachments* renamed at the vault root, and
 * every picture in the notes left pointing at the old name.
 *
 * B44's first version repaired only what resolved to a note. An attachment never does —
 * `resolveAttachment` matches a path, not the index — so `linkingNotesUnder` answered
 * nothing and the repair silently did nothing at all. Both halves are asserted here: the
 * spelling in the file, and that the file the target names can actually be found again.
 */
describe("a folder holding attachments", () => {
  it("repoints an embedded picture, and the picture resolves again", async () => {
    const foto = attachment("99 - Attachments", "foto.png");
    const notitie = note("00 Inbox", "Notitie", `Kijk: ![[${foto}]]`);

    expect(resolveAttachment(vault, foto)).not.toBeNull();

    await renameFolderRepairingLinks("99 - Attachments", "Bijlagen");

    expect(read(notitie)).toContain("![[Bijlagen/foto.png]]");
    // The point of the exercise: the marker stays off the picture because the file is
    // found again, not merely because the text changed.
    expect(resolveAttachment(vault, "Bijlagen/foto.png")).not.toBeNull();
    expect(resolveAttachment(vault, foto)).toBeNull();
  });

  it("repoints a path-form attachment link the same way", async () => {
    const pdf = attachment("99 - Attachments", "offerte.pdf");
    const notitie = note("00 Inbox", "Notitie", `Zie [[${pdf}|de offerte]].`);

    await renameFolderRepairingLinks("99 - Attachments", "Bijlagen");

    // The alias is untouched: unlike a note link rewritten from a bare title (B35), a
    // path-form target was never what the reader saw.
    expect(read(notitie)).toContain("[[Bijlagen/offerte.pdf|de offerte]]");
  });

  it("keeps a resized picture's width across the rename", async () => {
    // B74's width is an attribute beside the target and not part of it, which is exactly
    // why this works: `rewriteTargetPrefix` rebuilds the node from `{ ...attrs, target }`.
    // Asserted rather than assumed, because a rename that silently reset every picture in
    // a folder to full size is the kind of loss nobody notices until the note is reopened.
    const foto = attachment("99 - Attachments", "foto.png");
    const notitie = note("00 Inbox", "Notitie", `Kijk: ![[${foto}|360]]`);

    await renameFolderRepairingLinks("99 - Attachments", "Bijlagen");

    expect(read(notitie)).toContain("![[Bijlagen/foto.png|360]]");
    expect(resolveAttachment(vault, "Bijlagen/foto.png")).not.toBeNull();
  });

  it("repoints a file nested deeper inside the folder", async () => {
    const foto = attachment("99 - Attachments/2026/07", "foto.png");
    const notitie = note("00 Inbox", "Notitie", `Kijk: ![[${foto}]]`);

    await renameFolderRepairingLinks("99 - Attachments", "Bijlagen");

    expect(read(notitie)).toContain("![[Bijlagen/2026/07/foto.png]]");
    expect(resolveAttachment(vault, "Bijlagen/2026/07/foto.png")).not.toBeNull();
  });

  it("handles several pictures in one note, and several notes", async () => {
    const een = attachment("Bijlagen", "een.png");
    const twee = attachment("Bijlagen", "twee.png");
    const a = note("00 Inbox", "A", `![[${een}]] en ![[${twee}]]`);
    const b = note("00 Inbox", "B", `Alleen ![[${een}]]`);

    await renameFolderRepairingLinks("Bijlagen", "Attachments");

    expect(read(a)).toContain("![[Attachments/een.png]]");
    expect(read(a)).toContain("![[Attachments/twee.png]]");
    expect(read(b)).toContain("![[Attachments/een.png]]");
  });

  it("leaves a bare-name target alone — it carries no folder to rewrite", async () => {
    attachment("Bijlagen", "foto.png");
    const notitie = note("00 Inbox", "Notitie", "Kijk: ![[foto.png]]");

    await renameFolderRepairingLinks("Bijlagen", "Attachments");

    expect(read(notitie)).toContain("![[foto.png]]");
  });

  it("leaves a folder whose name merely starts the same alone", async () => {
    attachment("Bijlagen", "binnen.png");
    const buiten = attachment("Bijlagen extra", "buiten.png");
    const notitie = note("00 Inbox", "Notitie", `![[Bijlagen/binnen.png]] en ![[${buiten}]]`);

    await renameFolderRepairingLinks("Bijlagen", "Attachments");

    expect(read(notitie)).toContain("![[Attachments/binnen.png]]");
    // `Bijlagen extra` is a different folder that happens to share a prefix. Matching on
    // `Bijlagen/` rather than `Bijlagen` is the whole of the difference.
    expect(read(notitie)).toContain("![[Bijlagen extra/buiten.png]]");
  });

  it("skips a note the capture window has claimed", async () => {
    const foto = attachment("Bijlagen", "foto.png");
    const claimed = note("00 Inbox", "Bezig", `![[${foto}]]`);
    const before = read(claimed);

    await renameFolderRepairingLinks("Bijlagen", "Attachments", claimed);

    expect(read(claimed)).toBe(before);
  });

  it("rewrites a picture referenced from a note inside the renamed folder itself", async () => {
    const foto = attachment("Klant A", "foto.png");
    note("Klant A", "Binnen", `![[${foto}]]`);

    await renameFolderRepairingLinks("Klant A", "Klant Alpha");

    expect(read("Klant Alpha/Binnen.md")).toContain("![[Klant Alpha/foto.png]]");
  });

  it("writes nothing at all when no target carries that folder", async () => {
    attachment("Bijlagen", "foto.png");
    const notitie = note("00 Inbox", "Notitie", "Geen plaatjes hier.");
    const before = read(notitie);

    await renameFolderRepairingLinks("Bijlagen", "Attachments");

    expect(read(notitie)).toBe(before);
  });
});

describe("targetsUnder", () => {
  it("finds embeds and links alike, by the path in the target and nothing else", async () => {
    const foto = attachment("Bijlagen", "foto.png");
    const pdf = attachment("Bijlagen", "offerte.pdf");
    note("00 Inbox", "Een", `![[${foto}]] en [[${pdf}|offerte]] en ![[los.png]]`);
    note("00 Inbox", "Twee", "Niets.");

    const found = await targetsUnder(vault, db, "Bijlagen");

    expect(found).toHaveLength(1);
    expect(found[0]!.path).toBe("00 Inbox/Een.md");
    expect(found[0]!.targets.sort()).toEqual(["Bijlagen/foto.png", "Bijlagen/offerte.pdf"]);
  });

  it("says nothing about the vault root, which is not a folder anything can be renamed out of", async () => {
    note("00 Inbox", "Een", "![[foto.png]]");

    expect(await targetsUnder(vault, db, "")).toEqual([]);
  });
});
