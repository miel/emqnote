// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DOMParser, DOMSerializer } from "prosemirror-model";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../src/markdown/schema.js";

/**
 * The schema's own DOM round trip.
 *
 * `toDOM` and `parseDOM` are the halves of copy and paste *inside* the editor: what
 * `toDOM` writes onto the clipboard, `parseDOM` has to read back. They are easy to let
 * drift because nothing else in the suite exercises them — the file-format tests go
 * through the markdown pipeline, which never touches either. `data-checked` had exactly
 * that drift: written by `toDOM`, ignored on the way back, so cutting a task item and
 * pasting it produced a plain bullet.
 *
 * This is the only test that needs a DOM, hence the environment comment.
 */

const { doc, bulletList, listItem, paragraph } = schema.nodes;

function item(checked: boolean | null, text: string): PMNode {
  return listItem!.create({ checked }, paragraph!.create(null, schema.text(text)));
}

function toHtml(node: PMNode): string {
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(node.content);
  const host = document.createElement("div");
  host.appendChild(fragment);
  return host.innerHTML;
}

function fromHtml(html: string): PMNode {
  const host = document.createElement("div");
  host.innerHTML = html;
  return DOMParser.fromSchema(schema).parse(host);
}

describe("list items through the DOM", () => {
  it.each([
    ["not a task", null],
    ["unticked", false],
    ["ticked", true],
  ])("keeps %s across serialize and parse", (label, checked) => {
    const before = doc!.create(null, [bulletList!.create(null, item(checked, label))]);
    const after = fromHtml(toHtml(before));

    expect(after.toJSON()).toEqual(before.toJSON());
  });

  it("writes data-checked only for tasks", () => {
    expect(toHtml(bulletList!.create(null, item(null, "x")))).not.toContain("data-checked");
    expect(toHtml(bulletList!.create(null, item(false, "x")))).toContain('data-checked="false"');
    expect(toHtml(bulletList!.create(null, item(true, "x")))).toContain('data-checked="true"');
  });
});

describe("checkboxes pasted from elsewhere", () => {
  // How GitHub, Obsidian and every other markdown renderer writes a task list.
  it("reads a leading input[type=checkbox]", () => {
    const parsed = fromHtml(
      '<ul><li><input type="checkbox"> Open</li>' +
        '<li><input type="checkbox" checked> Klaar</li></ul>',
    );

    const list = parsed.firstChild!;
    expect(list.child(0).attrs.checked).toBe(false);
    expect(list.child(1).attrs.checked).toBe(true);
  });

  it("leaves an ordinary list ordinary", () => {
    const parsed = fromHtml("<ul><li>Gewoon</li></ul>");
    expect(parsed.firstChild!.child(0).attrs.checked).toBe(null);
  });

  it("does not let a nested item's checkbox tick its parent", () => {
    const parsed = fromHtml(
      "<ul><li>Buiten<ul><li><input type=\"checkbox\" checked> Binnen</li></ul></li></ul>",
    );

    const outer = parsed.firstChild!.child(0);
    expect(outer.attrs.checked).toBe(null);
    expect(outer.lastChild!.child(0).attrs.checked).toBe(true);
  });
});

/**
 * The table half of the same problem (B42). Before this the three table nodes had no
 * `parseDOM` at all, so copying a table inside the editor — which round-trips through the
 * clipboard DOM — read back as nothing at all, and `align` had no DOM representation to
 * survive even once they did.
 */
describe("tables through the DOM", () => {
  function table(align: (string | null)[], rows: string[][]): PMNode {
    const { table: tableType, tableRow, tableCell } = schema.nodes;
    return tableType!.create(
      { align },
      rows.map((cells) =>
        tableRow!.create(
          null,
          cells.map((text) =>
            tableCell!.create(null, text === "" ? undefined : schema.text(text)),
          ),
        ),
      ),
    );
  }

  it("comes back as a table at all, rather than as loose text", () => {
    const original = doc!.create(null, [table([null, null], [["a", "b"], ["c", "d"]])]);
    const back = fromHtml(toHtml(original));

    expect(back.firstChild?.type.name).toBe("table");
    expect(back.firstChild?.childCount).toBe(2);
    expect(back.firstChild?.child(0).childCount).toBe(2);
    expect(back.textBetween(0, back.content.size, " ")).toContain("a");
  });

  it("carries per-column alignment across, which has no other DOM representation", () => {
    const original = doc!.create(null, [
      table(["left", null, "right"], [["a", "b", "c"]]),
    ]);
    const back = fromHtml(toHtml(original));

    expect(back.firstChild?.attrs.align).toEqual(["left", null, "right"]);
  });

  it("writes no data-align at all for a table that has none", () => {
    const html = toHtml(doc!.create(null, [table([null, null], [["a", "b"]])]));
    expect(html).not.toContain("data-align");
  });

  it("reads a <th> header row as ordinary cells — this schema has no header node", () => {
    // Which is what makes a table pasted from anywhere else in the world come in as the
    // right shape rather than as one row short.
    const back = fromHtml("<table><tr><th>Naam</th><th>Bedrag</th></tr><tr><td>x</td><td>1</td></tr></table>");

    expect(back.firstChild?.type.name).toBe("table");
    expect(back.firstChild?.childCount).toBe(2);
    expect(back.firstChild?.child(0).child(0).type.name).toBe("tableCell");
  });
});
