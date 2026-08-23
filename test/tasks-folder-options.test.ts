import { describe, expect, it } from "vitest";
import { foldersWithTasks } from "../src/renderer/library/folder-tasks.js";

/**
 * The Tasks view's scope chooser offers folders that have tasks, and nothing else.
 *
 * It used to list every folder in the vault — `flatten(tree)` minus the trash — which in
 * a vault of any size is a chooser whose commonest outcome is an empty pane.
 *
 * The three things worth pinning are the three ways this is subtly wrong if written the
 * obvious way, and each has its own test below: the roll-up (the scope filter is a path
 * prefix, so a folder qualifies on what is under it), `total` rather than `open` (or the
 * list rebuilds itself under the "open only" checkbox), and the two entries that can
 * never be dropped.
 */

const counts = (entries: Record<string, [number, number]>): Record<string, { total: number; open: number }> =>
  Object.fromEntries(
    Object.entries(entries).map(([path, [total, open]]) => [path, { total, open }]),
  );

describe("foldersWithTasks", () => {
  const folders = ["", "01 Werk", "01 Werk/Klant X", "02 Privé", "03 Archief"];

  it("keeps a folder whose own notes carry tasks", () => {
    expect(
      foldersWithTasks(folders, counts({ "01 Werk/plan.md": [3, 1] }), ""),
    ).toEqual(["", "01 Werk"]);
  });

  it("keeps a folder whose tasks are in a subfolder, because the scope rolls up", () => {
    // `tasksIn` filters on `path.startsWith(`${scope}/`)`, so choosing "01 Werk" shows
    // "01 Werk/Klant X"'s tasks too. A per-folder count would have said "01 Werk" has
    // none and dropped the entry that in fact has the most to show.
    expect(
      foldersWithTasks(folders, counts({ "01 Werk/Klant X/offerte.md": [2, 2] }), ""),
    ).toEqual(["", "01 Werk", "01 Werk/Klant X"]);
  });

  it("drops a folder whose notes have no task items at all", () => {
    const kept = foldersWithTasks(folders, counts({ "01 Werk/plan.md": [1, 1] }), "");
    expect(kept).not.toContain("02 Privé");
    expect(kept).not.toContain("03 Archief");
  });

  it("keeps a folder whose tasks are all finished", () => {
    // `total`, not `open`. Keyed off `open`, this list would rebuild itself every time
    // the "open only" checkbox was ticked — and a folder with three finished tasks is a
    // folder this view still has something to say about.
    expect(
      foldersWithTasks(folders, counts({ "02 Privé/klussen.md": [4, 0] }), ""),
    ).toEqual(["", "02 Privé"]);
  });

  it("keeps the folder currently chosen, even once it has nothing left", () => {
    // A `<select>` whose value is not among its options renders blank. The scope can
    // outlive its tasks — tick the last box, or delete the note — and the chooser must
    // not empty itself of the thing it is set to.
    expect(
      foldersWithTasks(folders, counts({ "01 Werk/plan.md": [1, 1] }), "03 Archief"),
    ).toContain("03 Archief");
  });

  it("always keeps the vault root", () => {
    // `""` is "no restriction", which is never a lie about what it will show.
    expect(foldersWithTasks(folders, counts({}), "")).toEqual([""]);
  });

  it("offers everything while the index has not answered", () => {
    // The same call `withOpenTasks` makes for the sidebar badge: a chooser that is
    // briefly empty reads as a defect, where a chooser that briefly offers too much
    // simply settles.
    expect(foldersWithTasks(folders, null, "")).toEqual(folders);
  });

  it("drops a taskless subfolder at every level, not only at the top", () => {
    // The rule has to hold at any depth, and the shape that would break it is a check
    // written against the folder's *parent* rather than against the folder itself: with
    // tasks in "01 Werk/Klant X", every sibling and every child under "01 Werk" would come
    // along for the ride. Only the chain that actually leads to the tasks survives.
    const deep = [
      "",
      "01 Werk",
      "01 Werk/Klant X",
      "01 Werk/Klant X/2026",
      "01 Werk/Klant X/2026/Q3",
      "01 Werk/Klant X/2026/Q4",
      "01 Werk/Klant Y",
      "01 Werk/Klant Y/2026",
    ];

    expect(
      foldersWithTasks(deep, counts({ "01 Werk/Klant X/2026/Q3/offerte.md": [2, 2] }), ""),
    ).toEqual(["", "01 Werk", "01 Werk/Klant X", "01 Werk/Klant X/2026", "01 Werk/Klant X/2026/Q3"]);
  });

  it("keeps a deep folder on its own tasks when its parents have none", () => {
    // The other direction: a folder four levels down whose notes carry the only tasks in
    // the vault is offered, and so is every folder above it, because choosing one of those
    // shows what is under it. Nothing beside that chain is.
    const deep = ["", "A", "A/B", "A/B/C", "A/B/C/D", "A/B/E", "F"];

    expect(foldersWithTasks(deep, counts({ "A/B/C/D/notitie.md": [1, 1] }), "")).toEqual([
      "",
      "A",
      "A/B",
      "A/B/C",
      "A/B/C/D",
    ]);
  });

  it("does not match a folder against a sibling that merely shares its prefix", () => {
    // "01 Werk" must not be kept alive by "01 Werkoverleg/…". The `/` in the comparison
    // is what stops it, the same guard `tasksIn` carries on the main side.
    expect(
      foldersWithTasks(
        ["", "01 Werk", "01 Werkoverleg"],
        counts({ "01 Werkoverleg/notulen.md": [2, 2] }),
        "",
      ),
    ).toEqual(["", "01 Werkoverleg"]);
  });
});
