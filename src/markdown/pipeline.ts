import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import type { Options as StringifyOptions } from "remark-stringify";
import type { Handle, State, Info } from "mdast-util-to-markdown";

/**
 * Every write option is spelled out here, including the ones that happen to match the
 * default. The round trip has to be byte-identical; a changed default in a future
 * version of remark must not quietly break the whole corpus.
 */
const STRINGIFY_OPTIONS: StringifyOptions = {
  bullet: "-",
  bulletOther: "*",
  bulletOrdered: ".",
  emphasis: "*",
  strong: "*",
  fence: "`",
  fences: true,
  rule: "-",
  ruleRepetition: 3,
  ruleSpaces: false,
  setext: false,
  // 'one' starts continuation content at the marker's content column: 2 spaces after
  // "- ", 3 after "1. ", 4 after "10. ". Exactly what 03-markdown-dialect.md requires.
  listItemIndent: "one",
  incrementListMarker: true,
  // Always the [text](url) form, including for email addresses and bare URLs. One form
  // for every link is more predictable than a mixture of <url> and [text](url), and it
  // is what a WYSIWYG editor produces anyway.
  resourceLink: true,
  quote: '"',
};

interface ChildrenNode {
  children: unknown[];
}

function phrasing(node: unknown, state: State, info: Info, edge: string): string {
  return state.containerPhrasing(node as never, {
    ...info,
    before: edge,
    after: edge,
  });
}

const underline: Handle = (node, _parent, state, info) =>
  `<u>${phrasing(node as ChildrenNode, state, info, "<")}</u>`;

const highlight: Handle = (node, _parent, state, info) =>
  `==${phrasing(node as ChildrenNode, state, info, "=")}==`;

const wikiEmbed: Handle = (node) => `![[${(node as { target: string }).target}]]`;

const wikiLink: Handle = (node) => {
  const { target, alias } = node as { target: string; alias: string | null };
  return alias === null || alias === "" ? `[[${target}]]` : `[[${target}|${alias}]]`;
};

type Align = "left" | "right" | "center" | null;

const DELIMITER: Record<string, string> = {
  left: ":---",
  right: "---:",
  center: ":---:",
  none: "---",
};

/**
 * A custom table handler instead of remark-gfm's, for two reasons.
 *
 * The delimiter row becomes `---` rather than the minimal `-`, so a table looks like
 * what Obsidian and virtually every other tool writes — otherwise a single visit to
 * Obsidian would rewrite every table in the vault.
 *
 * And cells are not padded to align with the widest column: that way one changed cell
 * rewrites the entire table and every diff becomes unreadable.
 */
const table: Handle = (node, _parent, state, info) => {
  const rows = (node as { children: { children: { children: unknown[] }[] }[] }).children;
  const align = ((node as { align?: Align[] }).align ?? []) as Align[];

  const columns = rows.reduce((most, row) => Math.max(most, row.children.length), 0);

  const renderCell = (cell: { children: unknown[] } | undefined): string => {
    if (cell === undefined) return "";
    return state
      .containerPhrasing(cell as never, { ...info, before: "|", after: "|" })
      .replace(/\|/g, "\\|")
      // A hard line break only exists as <br> inside a GFM cell.
      .replace(/\\?\r?\n/g, "<br>");
  };

  const renderRow = (cells: string[]): string => `| ${cells.join(" | ")} |`;

  const lines = [
    renderRow(
      Array.from({ length: columns }, (_, index) => renderCell(rows[0]?.children[index])),
    ),
    renderRow(
      Array.from({ length: columns }, (_, index) => DELIMITER[align[index] ?? "none"]!),
    ),
    ...rows.slice(1).map((row) =>
      renderRow(
        Array.from({ length: columns }, (_, index) => renderCell(row.children[index])),
      ),
    ),
  ];

  return lines.join("\n");
};

export const stringifyOptions: StringifyOptions = {
  ...STRINGIFY_OPTIONS,
  // `Handlers` only knows mdast's own node types; our four extensions cannot exist
  // there by definition. The cast is exactly as wide as it needs to be.
  handlers: { underline, highlight, wikiEmbed, wikiLink, table } as StringifyOptions["handlers"],
};

export const readProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml"])
  .freeze();

export const writeProcessor = unified()
  .use(remarkStringify, stringifyOptions)
  // tablePipeAlign: false keeps tables narrow — otherwise one changed cell rewrites the
  // whole table and every diff becomes unreadable.
  .use(remarkGfm, { tablePipeAlign: false, tableCellPadding: true })
  .freeze();
