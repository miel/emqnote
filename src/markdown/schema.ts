import { Schema } from "prosemirror-model";
import type { MarkSpec, NodeSpec } from "prosemirror-model";

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
 */

const nodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },

  paragraph: { group: "block", content: "inline*" },

  heading: {
    group: "block",
    content: "inline*",
    attrs: { level: { default: 1 } },
    defining: true,
  },

  blockquote: { group: "block", content: "block+", defining: true },

  codeBlock: {
    group: "block",
    content: "text*",
    attrs: { language: { default: null } },
    code: true,
    marks: "",
    defining: true,
  },

  /** Raw block-level HTML — in practice a table with merged cells. */
  htmlBlock: {
    group: "block",
    content: "text*",
    code: true,
    marks: "",
    defining: true,
  },

  horizontalRule: { group: "block" },

  bulletList: { group: "block", content: "listItem+" },

  orderedList: {
    group: "block",
    content: "listItem+",
    attrs: { start: { default: 1 } },
  },

  listItem: {
    content: "paragraph block*",
    // null = not a task list item; true/false = checked or unchecked
    attrs: { checked: { default: null } },
    defining: true,
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
  },

  tableRow: { content: "tableCell+" },

  tableCell: { content: "inline*", isolating: true },

  text: { group: "inline" },

  hardBreak: { group: "inline", inline: true, selectable: false },

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
  },

  /** ![[file.png]] — an attachment from _attachments/, resolved by name. */
  wikiEmbed: {
    group: "inline",
    inline: true,
    draggable: true,
    atom: true,
    attrs: { target: { default: "" } },
  },

  /** [[Note]] or [[Note|alias]] */
  wikiLink: {
    group: "inline",
    inline: true,
    atom: true,
    attrs: { target: { default: "" }, alias: { default: null } },
  },
};

const marks: Record<string, MarkSpec> = {
  link: {
    attrs: { href: { default: "" }, title: { default: null } },
    inclusive: false,
  },
  highlight: {},
  underline: {},
  strong: {},
  em: {},
  strike: {},
  code: { code: true, excludes: "_" },
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
