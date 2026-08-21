import type { Root, RootContent } from "mdast";

/**
 * Reads `- [ ]` with nothing after it back as an empty task.
 *
 * GFM does not: `micromark-extension-gfm-task-list-item` requires the checkbox to be
 * followed by whitespace *and* content, so a box on its own parses as an ordinary bullet
 * whose text happens to be `[ ]`. That is the reading half of the bug the serializer's
 * own `listItem` handler fixes — the two only work as a pair. Obsidian reads an empty box
 * the same way, so this is also what makes a task list started here and continued there
 * survive the trip (B7).
 *
 * The rule is deliberately narrow: the item's first block is a paragraph holding one text
 * node whose whole value is the box. Anything after that paragraph — a sublist, which is
 * the ordinary shape for an outline whose parent has no text of its own — is left alone,
 * exactly as GFM leaves it when it strips a box off a real task. And it is checked against
 * the *source*
 * rather than the text, because `\[ ]` — a literal pair of brackets, which is how this
 * serializer writes one — parses to the same three characters. Comparing the character at
 * the node's own start offset is what tells those apart, so a note that really does say
 * `[ ]` still round-trips byte for byte.
 */
const BOX = /^\[([ xX])\]$/;

export function restoreEmptyTasks(root: Root, source: string): void {
  visit(root.children);

  function visit(nodes: RootContent[]): void {
    for (const node of nodes) {
      if (node.type === "listItem") restore(node);
      if ("children" in node) visit(node.children as RootContent[]);
    }
  }

  function restore(item: Extract<RootContent, { type: "listItem" }>): void {
    if (item.checked !== null && item.checked !== undefined) return;

    const paragraph = item.children[0];
    if (paragraph === undefined || paragraph.type !== "paragraph") return;
    if (paragraph.children.length !== 1) return;

    const text = paragraph.children[0];
    if (text === undefined || text.type !== "text") return;

    const box = BOX.exec(text.value);
    if (box === null) return;

    // An escaped `\[ ]` starts one character earlier, on the backslash.
    const offset = text.position?.start.offset;
    if (offset === undefined || source[offset] !== "[") return;

    item.checked = box[1] !== " ";
    paragraph.children = [];
  }
}
