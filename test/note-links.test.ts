import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeIndex, openIndex, type IndexDb } from "../src/main/index-db.js";
import { linkTargetFor } from "../src/main/link-resolve.js";
import { linkingNotes, resolveNoteLink } from "../src/main/vault-scan.js";
import { moveNote, renameNote, rewriteWikiLinks } from "../src/main/vault-io.js";

/**
 * Internal note links end to end (B35): what the index stores, which note a target names,
 * and what happens to a link when the note it points at moves.
 *
 * Real files in a real temp vault rather than fixtures, because the whole question is
 * whether the index, the resolver and the writer agree about a note — three modules that
 * each look right on their own and could still disagree about what `[[Rules]]` means.
 */

let vault: string;
let db: IndexDb;

function note(folder: string, name: string, body = "Tekst."): string {
  mkdirSync(join(vault, folder), { recursive: true });
  const front = [
    "---",
    `title: ${name}`,
    "type: quick",
    "created: 2026-08-07T09:00:00+02:00",
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

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "emqnote-links-"));
  db = openIndex(":memory:");
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
  closeIndex(db);
});

describe("resolveNoteLink", () => {
  it("finds a note by the path spelling this app writes", async () => {
    const target = note("01 Projecten", "2026-08-05 1030 Rules");
    note("00 Inbox", "Kickoff", `Zie [[${linkTargetFor(target)}|Rules]].`);

    expect(await resolveNoteLink(vault, db, linkTargetFor(target))).toEqual({
      kind: "unique",
      path: target,
    });
  });

  it("finds a note by its bare title, the way another editor would write the link", async () => {
    note("01 Projecten", "Rules");

    expect(await resolveNoteLink(vault, db, "rules")).toEqual({
      kind: "unique",
      path: "01 Projecten/Rules.md",
    });
  });

  it("reports two notes of the same name in different folders as ambiguous", async () => {
    note("01 Projecten", "Rules");
    note("02 Klanten", "Rules");

    expect(await resolveNoteLink(vault, db, "Rules")).toEqual({
      kind: "ambiguous",
      paths: ["01 Projecten/Rules.md", "02 Klanten/Rules.md"],
    });
  });

  it("answers none for an attachment name — that is not a note link", async () => {
    note("00 Inbox", "Kickoff");

    expect(await resolveNoteLink(vault, db, "2026-08-04-1030-offerte.pdf")).toEqual({
      kind: "none",
    });
  });
});

describe("linkingNotes", () => {
  it("names every note that links to one, and the spellings it used", async () => {
    const target = note("01 Projecten", "Rules");
    note("00 Inbox", "Een", `Zie [[Rules]].`);
    note("00 Inbox", "Twee", `Zie [[${linkTargetFor(target)}|de regels]].`);
    note("00 Inbox", "Drie", "Geen links hier.");

    const linking = await linkingNotes(vault, db, target);

    expect(linking.map((one) => one.path)).toEqual(["00 Inbox/Een.md", "00 Inbox/Twee.md"]);
    expect(linking[0]!.targets).toEqual(["Rules"]);
    expect(linking[1]!.targets).toEqual(["01 Projecten/Rules"]);
  });

  it("collects two spellings in one note without listing the note twice", async () => {
    const target = note("01 Projecten", "Rules");
    note("00 Inbox", "Een", `Zie [[Rules]] en ook [[${linkTargetFor(target)}|dit]].`);

    const linking = await linkingNotes(vault, db, target);

    expect(linking).toHaveLength(1);
    expect(linking[0]!.targets.sort()).toEqual(["01 Projecten/Rules", "Rules"]);
  });

  it("ignores a link whose target is ambiguous — nothing may be rewritten on a guess", async () => {
    const target = note("01 Projecten", "Rules");
    note("02 Klanten", "Rules");
    note("00 Inbox", "Een", "Zie [[Rules]].");

    expect(await linkingNotes(vault, db, target)).toEqual([]);
  });

  it("does not list the note itself, even when it links to its own name", async () => {
    const target = note("01 Projecten", "Rules", "Zie [[Rules]].");

    expect(await linkingNotes(vault, db, target)).toEqual([]);
  });
});

describe("rewriteWikiLinks", () => {
  it("points a link at the note's new path and leaves the rest of the file alone", async () => {
    const target = note("01 Projecten", "Rules");
    const source = note("00 Inbox", "Een", "Eerste regel.\n\nZie [[01 Projecten/Rules|Rules]].");
    const before = read(source);

    const references = await linkingNotes(vault, db, target);
    const moved = moveNote(vault, target, "03 Archief");
    const written = rewriteWikiLinks(vault, references, linkTargetFor(moved));

    expect(written).toBe(1);
    const after = read(source);
    expect(after).toContain("[[03 Archief/Rules|Rules]]");
    expect(after).toContain("Eerste regel.");
    expect(before).not.toBe(after);
  });

  /**
   * The one that is easy to get wrong: `[[Rules]]` *displays* the word "Rules". Rewritten
   * to a path with no alias it would display a path instead — a note the user is not even
   * looking at would silently change on screen.
   */
  it("keeps what an un-aliased link displayed, by promoting its old target to the alias", async () => {
    const target = note("01 Projecten", "Rules");
    const source = note("00 Inbox", "Een", "Zie [[Rules]].");

    const references = await linkingNotes(vault, db, target);
    const moved = moveNote(vault, target, "03 Archief");
    rewriteWikiLinks(vault, references, linkTargetFor(moved));

    expect(read(source)).toContain("[[03 Archief/Rules|Rules]]");
  });

  it("rewrites several links in one note, whichever way each was spelled", async () => {
    const target = note("01 Projecten", "Rules");
    const source = note(
      "00 Inbox",
      "Een",
      "Zie [[Rules]] en [[01 Projecten/Rules|de regels]] en nog eens [[Rules]].",
    );

    const references = await linkingNotes(vault, db, target);
    const moved = moveNote(vault, target, "03 Archief");
    rewriteWikiLinks(vault, references, linkTargetFor(moved));

    const after = read(source);
    expect(after).toContain("[[03 Archief/Rules|Rules]]");
    expect(after).toContain("[[03 Archief/Rules|de regels]]");
    expect(after).not.toContain("[[Rules]]");
    expect(after.match(/03 Archief\/Rules/g)).toHaveLength(3);
  });

  it("follows a rename too, not only a move", async () => {
    const target = note("01 Projecten", "2026-08-05 1030 Rules");
    const source = note("00 Inbox", "Een", "Zie [[01 Projecten/2026-08-05 1030 Rules|Rules]].");

    const references = await linkingNotes(vault, db, target);
    const renamed = renameNote(vault, target, "Spelregels");
    rewriteWikiLinks(vault, references, linkTargetFor(renamed));

    expect(read(source)).toContain("[[01 Projecten/2026-08-05 1030 Spelregels|Rules]]");
  });

  it("leaves a note the capture window has claimed untouched", async () => {
    const target = note("01 Projecten", "Rules");
    const source = note("00 Inbox", "Een", "Zie [[Rules]].");
    const before = read(source);

    const references = await linkingNotes(vault, db, target);
    const moved = moveNote(vault, target, "03 Archief");
    const written = rewriteWikiLinks(vault, references, linkTargetFor(moved), source);

    expect(written).toBe(0);
    expect(read(source)).toBe(before);
  });

  it("touches no file when there is nothing to rewrite", async () => {
    const target = note("01 Projecten", "Rules");
    const source = note("00 Inbox", "Een", "Geen links hier.");
    const before = read(source);

    const references = await linkingNotes(vault, db, target);
    expect(rewriteWikiLinks(vault, references, "03 Archief/Rules")).toBe(0);
    expect(read(source)).toBe(before);
  });
});
