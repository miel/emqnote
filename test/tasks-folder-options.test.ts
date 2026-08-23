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
 * prefix, so a folder qualifies on what is under it), the tick (`open` while "open only"
 * is ticked and `total` when it is not, so the chooser offers what the list would show),
 * and the two entries that can never be dropped.
 *
 * The tick used to be ignored — always `total` — so that the list could not rebuild
 * itself under the checkbox. The default view *is* "open only", which made a folder whose
 * tasks are all finished an option leading to an empty pane, reported twice. The rebuild
 * it was avoiding is held harmless by the rule below it: the folder currently chosen is
 * never dropped.
 */

const counts = (entries: Record<string, [number, number]>): Record<string, { total: number; open: number }> =>
  Object.fromEntries(
    Object.entries(entries).map(([path, [total, open]]) => [path, { total, open }]),
  );

describe("foldersWithTasks", () => {
  const folders = ["", "01 Werk", "01 Werk/Klant X", "02 Privé", "03 Archief"];

  it("keeps a folder whose own notes carry tasks", () => {
    expect(
      foldersWithTasks(folders, counts({ "01 Werk/plan.md": [3, 1] }), "", true),
    ).toEqual(["", "01 Werk"]);
  });

  it("keeps a folder whose tasks are in a subfolder, because the scope rolls up", () => {
    // `tasksIn` filters on `path.startsWith(`${scope}/`)`, so choosing "01 Werk" shows
    // "01 Werk/Klant X"'s tasks too. A per-folder count would have said "01 Werk" has
    // none and dropped the entry that in fact has the most to show.
    expect(
      foldersWithTasks(folders, counts({ "01 Werk/Klant X/offerte.md": [2, 2] }), "", true),
    ).toEqual(["", "01 Werk", "01 Werk/Klant X"]);
  });

  it("drops a folder whose notes have no task items at all", () => {
    const kept = foldersWithTasks(folders, counts({ "01 Werk/plan.md": [1, 1] }), "", true);
    expect(kept).not.toContain("02 Privé");
    expect(kept).not.toContain("03 Archief");
  });

  it("keeps a folder whose tasks are all finished, once 'open only' is unticked", () => {
    // `total` is the right question with the tick off: a folder with four finished tasks
    // is a folder this view has something to show.
    expect(
      foldersWithTasks(folders, counts({ "02 Privé/klussen.md": [4, 0] }), "", false),
    ).toEqual(["", "02 Privé"]);
  });

  it("drops that same folder while 'open only' is ticked", () => {
    // Which is how the view opens, and is the whole reported defect: the chooser offered
    // "02 Privé", and choosing it showed nothing at all.
    expect(
      foldersWithTasks(folders, counts({ "02 Privé/klussen.md": [4, 0] }), "", true),
    ).not.toContain("02 Privé");
  });

  it("keeps the folder being stood in when the tick takes its last task away", () => {
    // The rebuild the old `total` rule was avoiding, met head-on. Standing in "02 Privé"
    // with only finished tasks in it, ticking "open only" empties the pane — but the
    // chooser must still be able to say what it is set to, or the `<select>` renders
    // blank. This is why keying off the tick is safe.
    expect(
      foldersWithTasks(folders, counts({ "02 Privé/klussen.md": [4, 0] }), "02 Privé", true),
    ).toEqual(["", "02 Privé"]);
  });

  it("keeps the folder currently chosen, even once it has nothing left", () => {
    // A `<select>` whose value is not among its options renders blank. The scope can
    // outlive its tasks — tick the last box, or delete the note — and the chooser must
    // not empty itself of the thing it is set to.
    expect(
      foldersWithTasks(folders, counts({ "01 Werk/plan.md": [1, 1] }), "03 Archief", true),
    ).toContain("03 Archief");
  });

  it("always keeps the vault root", () => {
    // `""` is "no restriction", which is never a lie about what it will show.
    expect(foldersWithTasks(folders, counts({}), "", true)).toEqual([""]);
  });

  it("offers everything while the index has not answered", () => {
    // The same call `withOpenTasks` makes for the sidebar badge: a chooser that is
    // briefly empty reads as a defect, where a chooser that briefly offers too much
    // simply settles.
    expect(foldersWithTasks(folders, null, "", true)).toEqual(folders);
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
      foldersWithTasks(deep, counts({ "01 Werk/Klant X/2026/Q3/offerte.md": [2, 2] }), "", true),
    ).toEqual(["", "01 Werk", "01 Werk/Klant X", "01 Werk/Klant X/2026", "01 Werk/Klant X/2026/Q3"]);
  });

  it("keeps a deep folder on its own tasks when its parents have none", () => {
    // The other direction: a folder four levels down whose notes carry the only tasks in
    // the vault is offered, and so is every folder above it, because choosing one of those
    // shows what is under it. Nothing beside that chain is.
    const deep = ["", "A", "A/B", "A/B/C", "A/B/C/D", "A/B/E", "F"];

    expect(foldersWithTasks(deep, counts({ "A/B/C/D/notitie.md": [1, 1] }), "", true)).toEqual([
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
        true,
      ),
    ).toEqual(["", "01 Werkoverleg"]);
  });
});
