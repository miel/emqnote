import { Schema } from "prosemirror-model";
import type { MarkSpec, Node as PMNode, NodeSpec } from "prosemirror-model";

/**
 * The ProseMirror schema of emqnote, derived one-to-one from 03-markdown-dialect.md.
 *
 * Two things set this schema apart from a stock one, and both are the reason the
 * project exists at all:
 *
 *  1. `listItem` accepts block content (`paragraph block*`), not just inline content.
 *     That is what lets a paragraph, table or nested list hang underneath a bullet.
 *  2. `underline` and `highlight` exist as marks, because markdown does not have them
 *     while everyday use in Outlook does.
 *
 * The `toDOM` and `parseDOM` specs are here because this is *also* the editor schema.
 * Keeping one schema for both the file format and the editing surface is the whole
 * point of decision B6: two definitions would drift, and the drift would show up as a
 * note that saves differently from how it was typed.
 */

/** Per column: how a GFM delimiter row spells it — `:---`, `:---:`, `---:` or plain `---`. */
export type ColumnAlign = "left" | "center" | "right" | null;

/**
 * A table's per-column alignment, read back out of `data-align`.
 *
 * The counterpart of `table`'s `toDOM`, and it exists for the same reason `readChecked`
 * below does: what `toDOM` writes and `parseDOM` reads have to be the same thing, or a
 * copy-and-paste inside the editor quietly drops it. An empty entry is "no alignment set",
 * which is a real state — `---` in the file — and not the same as `left`.
 */
function readAlign(dom: HTMLElement): ColumnAlign[] {
  const attribute = dom.getAttribute("data-align");
  if (attribute === null) return [];

  return attribute.split(",").map((value): ColumnAlign => {
    if (value === "left" || value === "center" || value === "right") return value;
    return null;
  });
}

/**
 * Whether a parsed `<li>` is a task item, and if so whether it is ticked.
 *
 * `toDOM` writes `data-checked`, so without the matching read a cut and paste *inside*
 * the editor lost the box: the item went out with its state and came back a plain
 * bullet. The `input[type=checkbox]` form is how GitHub and Obsidian write the same
 * thing, and it is what will arrive from the clipboard once pasting lands.
 */
function readChecked(dom: HTMLElement): boolean | null {
  const attribute = dom.getAttribute("data-checked");
  if (attribute === "true") return true;
  if (attribute === "false") return false;

  const box = dom.querySelector("input[type=checkbox]");
  if (box === null) return null;

  // A checkbox inside a *nested* item is that item's marker, not this one's.
  if (box.closest("li") !== dom) return null;
  return box.hasAttribute("checked") || (box as HTMLInputElement).checked;
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },

  paragraph: {
    group: "block",
    content: "inline*",
    parseDOM: [{ tag: "p" }],
    toDOM: () => ["p", 0],
  },

  heading: {
    group: "block",
    content: "inline*",
    attrs: { level: { default: 1 } },
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: (node) => [`h${node.attrs.level as number}`, 0],
  },

  blockquote: {
    group: "block",
    content: "block+",
    defining: true,
    parseDOM: [{ tag: "blockquote" }],
    toDOM: () => ["blockquote", 0],
  },

  codeBlock: {
    group: "block",
    content: "text*",
    attrs: { language: { default: null } },
    code: true,
    marks: "",
    defining: true,
    parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
    toDOM: (node) => [
      "pre",
      node.attrs.language === null ? {} : { "data-language": node.attrs.language },
      ["code", 0],
    ],
  },

  /** Raw block-level HTML — in practice a table with merged cells. */
  htmlBlock: {
    group: "block",
    content: "text*",
    code: true,
    marks: "",
    defining: true,
    toDOM: () => ["pre", { class: "html-block" }, ["code", 0]],
  },

  horizontalRule: {
    group: "block",
    parseDOM: [{ tag: "hr" }],
    toDOM: () => ["hr"],
  },

  bulletList: {
    group: "block",
    content: "listItem+",
    parseDOM: [{ tag: "ul" }],
    toDOM: () => ["ul", 0],
  },

  orderedList: {
    group: "block",
    content: "listItem+",
    attrs: { start: { default: 1 } },
    parseDOM: [
      {
        tag: "ol",
        getAttrs: (dom) => ({
          start: Number((dom as HTMLElement).getAttribute("start") ?? 1),
        }),
      },
    ],
    toDOM: (node) => [
      "ol",
      (node.attrs.start as number) === 1 ? {} : { start: node.attrs.start as number },
      0,
    ],
  },

  listItem: {
    content: "paragraph block*",
    // null = not a task list item; true/false = checked or unchecked
    attrs: { checked: { default: null } },
    defining: true,
    parseDOM: [
      { tag: "li", getAttrs: (dom) => ({ checked: readChecked(dom as HTMLElement) }) },
    ],
    toDOM: (node) => [
      "li",
      node.attrs.checked === null ? {} : { "data-checked": String(node.attrs.checked) },
      0,
    ],
  },

  /**
   * A GFM table. The first row is always the header row; a separate header node would
   * introduce a distinction that markdown itself does not make.
   */
  table: {
    group: "block",
    content: "tableRow+",
    // per column: "left" | "right" | "center" | null
    attrs: { align: { default: [] } },
    isolating: true,
    // `data-align` is not decoration: without it the alignment is invisible to the DOM,
    // and everything that round-trips a node through the clipboard — copying a table
    // inside the editor does exactly that — would silently flatten every `:---` in it
    // back to `---`. Same reasoning as `listItem`'s `data-checked` (see `readChecked`).
    parseDOM: [
      {
        tag: "table",
        getAttrs: (dom) => ({ align: readAlign(dom as HTMLElement) }),
      },
    ],
    toDOM: (node) => {
      const align = node.attrs.align as ColumnAlign[];
      const attrs = align.some((value) => value !== null && value !== undefined)
        ? { "data-align": align.map((value) => value ?? "").join(",") }
        : {};
      return ["table", attrs, ["tbody", 0]];
    },
  },

  tableRow: {
    content: "tableCell+",
    parseDOM: [{ tag: "tr" }],
    toDOM: () => ["tr", 0],
  },

  tableCell: {
    content: "inline*",
    isolating: true,
    // `th` as well as `td`: this schema has no header node — the first row *is* the
    // header, which the `table` comment above explains — but a table arriving from
    // anywhere else in the world spells its header row with `th`, and reading those as
    // ordinary cells is what makes such a table come in as the right shape.
    parseDOM: [{ tag: "td" }, { tag: "th" }],
    toDOM: () => ["td", 0],
  },

  text: { group: "inline" },

  hardBreak: {
    group: "inline",
    inline: true,
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM: () => ["br"],
  },

  /** An external image: ![alt](url). Attachments use wikiEmbed instead. */
  image: {
    group: "inline",
    inline: true,
    draggable: true,
    attrs: {
      src: { default: "" },
      alt: { default: null },
      title: { default: null },
    },
    parseDOM: [
      {
        tag: "img[src]",
        getAttrs: (dom) => ({
          src: (dom as HTMLElement).getAttribute("src"),
          alt: (dom as HTMLElement).getAttribute("alt"),
          title: (dom as HTMLElement).getAttribute("title"),
        }),
      },
    ],
    toDOM: (node) => [
      "img",
      {
        src: node.attrs.src as string,
        alt: (node.attrs.alt as string | null) ?? undefined,
        title: (node.attrs.title as string | null) ?? undefined,
      },
    ],
  },

  /** ![[file.png]] — an attachment from _attachments/, resolved by name. */
  wikiEmbed: {
    group: "inline",
    inline: true,
    draggable: true,
    atom: true,
    attrs: { target: { default: "" } },
    toDOM: (node) => [
      "span",
      { class: "wiki-embed", "data-target": node.attrs.target as string },
      node.attrs.target as string,
    ],
  },

  /** [[Note]] or [[Note|alias]] */
  wikiLink: {
    group: "inline",
    inline: true,
    atom: true,
    attrs: { target: { default: "" }, alias: { default: null } },
    toDOM: (node) => [
      "span",
      { class: "wiki-link", "data-target": node.attrs.target as string },
      (node.attrs.alias as string | null) ?? (node.attrs.target as string),
    ],
  },
};

const marks: Record<string, MarkSpec> = {
  link: {
    attrs: { href: { default: "" }, title: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs: (dom) => ({
          href: (dom as HTMLElement).getAttribute("href"),
          title: (dom as HTMLElement).getAttribute("title"),
        }),
      },
    ],
    toDOM: (mark) => [
      "a",
      {
        href: mark.attrs.href as string,
        title: (mark.attrs.title as string | null) ?? undefined,
      },
      0,
    ],
  },
  highlight: {
    parseDOM: [{ tag: "mark" }],
    toDOM: () => ["mark", 0],
  },
  underline: {
    parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }],
    toDOM: () => ["u", 0],
  },
  strong: {
    parseDOM: [
      { tag: "strong" },
      { tag: "b" },
      { style: "font-weight=bold" },
      { style: "font-weight=700" },
    ],
    toDOM: () => ["strong", 0],
  },
  em: {
    parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
    toDOM: () => ["em", 0],
  },
  strike: {
    parseDOM: [{ tag: "s" }, { tag: "del" }, { tag: "strike" }],
    toDOM: () => ["s", 0],
  },
  code: {
    code: true,
    excludes: "_",
    parseDOM: [{ tag: "code" }],
    toDOM: () => ["code", 0],
  },
};

export const schema = new Schema({ nodes, marks });

/**
 * Nesting order when writing markdown, from outermost to innermost.
 *
 * The order itself is arbitrary but it is *fixed*: in ProseMirror marks are an
 * unordered set, while markdown is a tree. Without a fixed order the same document
 * could produce both `**<u>x</u>**` and `<u>**x**</u>`, and the round trip would not
 * be byte-identical.
 */
export const MARK_NESTING_ORDER = [
  "link",
  "highlight",
  "underline",
  "strong",
  "em",
  "strike",
  "code",
] as const;

/** One task item — a `listItem` with a non-null `checked` — and where it sits in the document. */
export interface TaskItemAt {
  pos: number;
  node: PMNode;
}

/**
 * Every task item in a document, in document order.
 *
 * Shared by two callers that must agree on what "item 3" means without ever talking to
 * each other directly: `index-scan.ts`'s `buildRecord` walks a freshly parsed doc to fill
 * `note_tasks`, and `vault-io.ts`'s `toggleTask` walks a freshly re-parsed doc to flip
 * one. Two separate walks with the same rule (`listItem` nodes with `attrs.checked !==
 * null`, depth-first, same as `descendants` always visits) stay in step with each other
 * for free; two *different* rules would not, and the mismatch would only show up as the
 * wrong checkbox flipping.
 */
export function taskItemsIn(doc: PMNode): TaskItemAt[] {
  const items: TaskItemAt[] = [];
  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.listItem || node.attrs.checked === null) return true;
    items.push({ pos, node });
    return true;
  });
  return items;
}

/**
 * A task item's own text — its first paragraph's plain text.
 *
 * The schema's `listItem` content (`paragraph block*`) guarantees a task item's first
 * child is a paragraph, but this stays defensive rather than asserting it: `Node.create`
 * does not itself enforce a content expression, so a node built by hand (a test, or a
 * future caller) can violate it without either party finding out until something reads
 * the result. Anything that is not a paragraph reads as "" rather than throwing.
 */
export function taskItemText(item: PMNode): string {
  const first = item.firstChild;
  return first !== null && first.type === schema.nodes.paragraph ? first.textContent : "";
}
