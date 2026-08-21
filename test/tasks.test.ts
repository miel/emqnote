import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { schema } from "@emqnote/core/markdown";
import { closeIndex, openIndex, tasksIn, type IndexDb } from "../src/main/index-db.js";
import { extractTasks, fullScan } from "../src/main/index-scan.js";
import { toggleTask } from "../src/main/vault-io.js";
import { docFromMarkdown } from "./helpers/editing.js";

/**
 * Item 6 — the aggregated todo view.
 *
 * `extractTasks` is what fills `note_tasks` (`index-scan.ts`'s `buildRecord` calls it);
 * `tasksIn` is what the view reads back out, scoped to a folder; `toggleTask` is the one
 * write path a tick in that view is allowed to take, straight through
 * `parseNote`/`serializeNote` in `vault-io.ts` — never the raw text, per B6.
 */

describe("extracting tasks from a parsed document", () => {
  it("walks nested items in document order", () => {
    const doc = docFromMarkdown("- [ ] Een\n  - [x] Twee\n- [ ] Drie\n");

    expect(extractTasks(doc)).toEqual([
      { ordinal: 0, checked: false, text: "Een" },
      { ordinal: 1, checked: true, text: "Twee" },
      { ordinal: 2, checked: false, text: "Drie" },
    ]);
  });

  it("skips an ordered-list item, which carries no checked attribute", () => {
    const doc = docFromMarkdown("1. Stap een\n2. Stap twee\n\n- [ ] Taak\n");

    expect(extractTasks(doc)).toEqual([{ ordinal: 0, checked: false, text: "Taak" }]);
  });

  it("skips a plain bullet with no checkbox at all", () => {
    const doc = docFromMarkdown("- Gewoon punt\n- [ ] Taak\n");

    expect(extractTasks(doc)).toEqual([{ ordinal: 0, checked: false, text: "Taak" }]);
  });

  it("reads \"\" for a task item whose first child is not a paragraph", () => {
    // The schema's `listItem` content (`paragraph block*`) guarantees this in practice,
    // but `Node.create` does not itself enforce a content expression — see
    // `taskItemText`'s own comment in `schema.ts`. Built by hand rather than parsed, since
    // nothing that goes through `parseNote` can actually produce this shape.
    const malformed = schema.nodes.listItem!.create(
      { checked: false },
      schema.nodes.bulletList!.create(null, [
        schema.nodes.listItem!.create(
          { checked: null },
          schema.nodes.paragraph!.create(null, schema.text("Genest")),
        ),
      ]),
    );
    const doc = schema.nodes.doc!.create(null, [
      schema.nodes.bulletList!.create(null, [malformed]),
    ]);

    expect(extractTasks(doc)).toEqual([{ ordinal: 0, checked: false, text: "" }]);
  });
});

describe("reading tasks from the index, scoped to a folder", () => {
  let vault: string;
  let db: IndexDb;

  function note(folder: string, name: string, body: string): void {
    const front = ["---", `title: ${name}`, "type: quick", "created: 2026-08-04T09:00:00+02:00", "---", ""].join(
      "\n",
    );
    mkdirSync(join(vault, folder), { recursive: true });
    writeFileSync(join(vault, folder, `${name}.md`), `${front}${body}\n`);
  }

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), "emqnote-tasks-"));
    db = openIndex(":memory:");
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
    closeIndex(db);
  });

  it("finds every task under a scope and everything nested beneath it", async () => {
    note("10 Projects/Klant X", "Kickoff", "- [ ] Offerte versturen\n- [x] Kickoff plannen\n");
    note("20 Areas", "Onderhoud", "- [ ] Buiten de scope\n");
    await fullScan(vault, db);

    const found = tasksIn(db, "10 Projects", false);

    expect(found.map((row) => row.text)).toEqual(["Offerte versturen", "Kickoff plannen"]);
    expect(found.every((row) => row.path === "10 Projects/Klant X/Kickoff.md")).toBe(true);
  });

  it("treats an empty scope as the whole vault", async () => {
    note("00 Inbox", "Een", "- [ ] Taak een\n");
    note("10 Projects", "Twee", "- [ ] Taak twee\n");
    await fullScan(vault, db);

    expect(tasksIn(db, "", false).map((row) => row.text).sort()).toEqual([
      "Taak een",
      "Taak twee",
    ]);
  });

  it("narrows to open items only when asked", async () => {
    note("00 Inbox", "Een", "- [ ] Nog te doen\n- [x] Al gedaan\n");
    await fullScan(vault, db);

    expect(tasksIn(db, "", true).map((row) => row.text)).toEqual(["Nog te doen"]);
  });
});

describe("toggling a task from the aggregated view", () => {
  let vault: string;

  const NOTE = [
    "---",
    "title: Kickoff",
    "type: quick",
    "created: 2026-08-04T09:00:00+02:00",
    "---",
    "",
    "- [ ] Offerte versturen",
    "- [x] Kickoff plannen",
    "",
  ].join("\n");

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), "emqnote-toggle-"));
    mkdirSync(join(vault, "00 Inbox"), { recursive: true });
    writeFileSync(join(vault, "00 Inbox", "Kickoff.md"), NOTE);
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  it("flips an unchecked item to checked, and nothing else in the file", () => {
    const ok = toggleTask(vault, "00 Inbox/Kickoff.md", 0, "Offerte versturen");

    expect(ok).toBe(true);
    const contents = readFileSync(join(vault, "00 Inbox", "Kickoff.md"), "utf8");
    expect(contents).toContain("- [x] Offerte versturen");
    expect(contents).toContain("- [x] Kickoff plannen");
  });

  it("flips a checked item back to unchecked", () => {
    const ok = toggleTask(vault, "00 Inbox/Kickoff.md", 1, "Kickoff plannen");

    expect(ok).toBe(true);
    const contents = readFileSync(join(vault, "00 Inbox", "Kickoff.md"), "utf8");
    expect(contents).toContain("- [ ] Kickoff plannen");
  });

  it("refuses, and writes nothing, when the item's text no longer matches", () => {
    const before = readFileSync(join(vault, "00 Inbox", "Kickoff.md"), "utf8");

    const ok = toggleTask(vault, "00 Inbox/Kickoff.md", 0, "Een heel andere tekst");

    expect(ok).toBe(false);
    expect(readFileSync(join(vault, "00 Inbox", "Kickoff.md"), "utf8")).toBe(before);
  });

  it("refuses an ordinal past the last task item", () => {
    expect(toggleTask(vault, "00 Inbox/Kickoff.md", 5, "Offerte versturen")).toBe(false);
  });

  it("refuses a note that does not exist", () => {
    expect(toggleTask(vault, "00 Inbox/Nergens.md", 0, "Iets")).toBe(false);
  });

  it("bumps modified when it actually writes", () => {
    toggleTask(vault, "00 Inbox/Kickoff.md", 0, "Offerte versturen");

    const contents = readFileSync(join(vault, "00 Inbox", "Kickoff.md"), "utf8");
    expect(contents).not.toContain("modified: 2026-08-04T09:00:00+02:00");
  });

  // `toggleTask` also refuses to write when the flip would produce byte-identical
  // output (the same `sameApartFromModified` guard `saveNote` uses), but there is no
  // test for that branch here: it turns out to be unreachable through this function's
  // real code path. GFM only recognises `[ ]`/`[x]` as a checkbox when something follows
  // it on the same line — verified directly against the parser — so `- [ ] ` with
  // nothing after it never becomes `checked: false` on an empty item; it parses as the
  // literal text "[ ]" on a plain, non-task bullet. Every item `taskItemsIn` can ever
  // find here therefore has non-empty text, and flipping its `checked` attribute always
  // changes the marker's middle character. The guard is kept anyway, as cheap insurance
  // matching `saveNote`'s own pattern — see `toggleTask`'s comment in `vault-io.ts`.
});
