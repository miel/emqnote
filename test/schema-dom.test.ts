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
