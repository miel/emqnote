import type { Fragment, Node as PMNode, Slice } from "prosemirror-model";

/**
 * The `text/plain` flavour of a copy.
 *
 * ProseMirror's default is `slice.content.textBetween(…, "\n\n")`, which knows nothing
 * about structure: a copied checklist arrives in the destination as bare lines of text
 * with every bullet, number and box stripped off. That is fine for a paragraph and wrong
 * for the one construction this app exists to get right — pasting a list into a mail, a
 * ticket or a chat box is precisely the routine it replaces.
 *
 * The `text/html` flavour already carries the full structure, so anything that
 * understands it (Word, Outlook, the editor itself) was never affected. This is only for
 * the plain-text targets, which is also why it stays plain: no escaping, no frontmatter,
 * nothing that would make it markdown. `- [ ] Bel Jan` is what a checklist looks like
 * when written out, and it is readable whether or not the far end renders it.
 */
export function clipboardText(slice: Slice): string {
  const lines: string[] = [];
  renderFragment(slice.content, "", lines);
  return lines.join("\n");
}

function renderFragment(fragment: Fragment, indent: string, lines: string[]): void {
  fragment.forEach((node) => renderBlock(node, indent, lines));
}

function renderBlock(node: PMNode, indent: string, lines: string[]): void {
  const name = node.type.name;

  if (name === "bulletList" || name === "orderedList") {
    // A blank line before a list, but never *inside* one — that is the difference
    // between a list and a scattering of lines that happen to start with a dash.
    separate(lines);
    renderList(node, indent, lines);
    return;
  }

  if (name === "table") {
    separate(lines);
    renderTable(node, indent, lines);
    return;
  }

  if (node.isTextblock) {
    separate(lines);
    pushText(node, indent, indent, lines);
    return;
  }

  // Blockquotes and anything else that holds blocks: no marker of its own, so its
  // children are written where it stands.
  renderFragment(node.content, indent, lines);
}

/**
 * A table, as pipes.
 *
 * A table used to fall through to the branch above and come out as one line per *cell*,
 * which is a column of words with nothing left to say it was a table. That was always
 * wrong and became visible when a rectangle of cells could be copied on its own (B49) —
 * the plain-text flavour is the one a mail, a ticket or a chat box gets.
 *
 * No delimiter row: this is not markdown (see the note at the top of this file), and a row
 * of dashes in a chat window is noise. A cell's own soft breaks become spaces for the same
 * reason — a line break inside one cell would break the row it sits in.
 */
function renderTable(table: PMNode, indent: string, lines: string[]): void {
  table.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => cells.push(cell.textBetween(0, cell.content.size, " ", " ").trim()));
    lines.push(`${indent}| ${cells.join(" | ")} |`);
  });
}

function renderList(list: PMNode, indent: string, lines: string[]): void {
  const ordered = list.type.name === "orderedList";
  const start = ordered ? ((list.attrs.start as number | null) ?? 1) : 1;

  list.forEach((item, _offset, index) => {
    const bullet = ordered ? `${start + index}. ` : "- ";
    const checked = item.attrs.checked as boolean | null;
    // The same three spellings the file gets, since this is the plain-text flavour of the
    // same list: a box, B72's star, or the bare bullet. A flagged item copied out without
    // its star would be the whole reason this module exists over `textBetween`, one line
    // down. The two are exclusive, so the order of these branches decides nothing.
    const marker =
      checked !== null
        ? `${bullet}[${checked ? "x" : " "}] `
        : item.attrs.starred === true
          ? `${bullet}\u2b50 `
          : bullet;
    renderItem(item, indent, marker, lines);
  });
}

/**
 * One item: its first block sits on the marker's own line, everything after it hangs
 * under the marker rather than under the bullet — a nested list therefore steps in by
 * exactly the width of the marker above it, which is what makes the indentation read as
 * levels rather than as arbitrary spacing.
 */
function renderItem(item: PMNode, indent: string, marker: string, lines: string[]): void {
  const hanging = indent + " ".repeat(marker.length);
  let first = true;

  item.forEach((child) => {
    if (first && child.isTextblock) {
      pushText(child, indent + marker, hanging, lines);
    } else if (first) {
      // An item that opens with something other than a textblock still needs its marker
      // on a line of its own, or the box would go missing.
      lines.push((indent + marker).trimEnd());
      renderBlock(child, hanging, lines);
    } else if (child.type.name === "bulletList" || child.type.name === "orderedList") {
      renderList(child, hanging, lines);
    } else {
      renderBlock(child, hanging, lines);
    }
    first = false;
  });

  // An item with nothing in it at all — an empty task waiting to be filled in.
  if (item.childCount === 0) lines.push((indent + marker).trimEnd());
}

/**
 * A textblock's text, with soft breaks becoming real line breaks. Continuation lines get
 * the hanging indent, so a two-line bullet still reads as one bullet.
 */
function pushText(
  node: PMNode,
  firstIndent: string,
  restIndent: string,
  lines: string[],
): void {
  const text = node.textBetween(0, node.content.size, "", (leaf) =>
    leaf.type.name === "hardBreak" ? "\n" : "",
  );

  const parts = text.split("\n");
  parts.forEach((part, index) => {
    lines.push(((index === 0 ? firstIndent : restIndent) + part).trimEnd());
  });
}

/** A blank line between top-level blocks, but not before the first one. */
function separate(lines: string[]): void {
  if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
}
