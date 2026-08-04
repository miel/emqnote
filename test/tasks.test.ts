import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { schema } from "../src/markdown/index.js";
import { closeIndex, openIndex, tasksIn, type IndexDb } from "../src/main/index-db.js";
import { extractTasks, fullScan } from "../src/main/index-scan.js";
import { docFromMarkdown } from "./helpers/editing.js";

/**
 * Item 6a — task state in the index.
 *
 * `extractTasks` is what fills `note_tasks` (`index-scan.ts`'s `buildRecord` calls it);
 * `tasksIn` is what the aggregated Tasks view reads back out, scoped to a folder. The
 * write path — `toggleTask` in `vault-io.ts` — is covered separately, in the commit that
 * adds it.
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
