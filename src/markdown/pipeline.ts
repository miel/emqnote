import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import type { Options as StringifyOptions } from "remark-stringify";
import type { Handle, State, Info } from "mdast-util-to-markdown";

/**
 * Elke schrijfoptie staat hier expliciet, ook waar die toevallig gelijk is aan de
 * standaard. De rondgang moet bytegelijk zijn; een gewijzigde standaardwaarde in een
 * nieuwe versie van remark mag niet stilletjes het hele corpus laten mislukken.
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
  // 'one' laat de inhoud op de kolom van het opsommingsteken beginnen: 2 spaties na
  // "- ", 3 na "1. ", 4 na "10. ". Precies wat 03-markdown-dialect.md voorschrijft.
  listItemIndent: "one",
  incrementListMarker: true,
  // Altijd de [tekst](url)-vorm, ook voor e-mailadressen en kale URL's. Eén vorm voor
  // elke link is voorspelbaarder dan een mengeling van <url> en [tekst](url), en het
  // is wat een WYSIWYG-editor sowieso produceert.
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
 * Eigen tabel-handler in plaats van die van remark-gfm, om twee redenen.
 *
 * De scheidingsrij wordt `---` en niet het minimale `-`, zodat een tabel er hetzelfde
 * uitziet als wat Obsidian en zowat elk ander gereedschap schrijft — anders herschrijft
 * een bezoek aan Obsidian elke tabel in de vault.
 *
 * En cellen worden níét met spaties uitgelijnd op de breedste kolom: dan herschrijft
 * één gewijzigde cel de hele tabel en is de diff onleesbaar.
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
      // Een harde regelovergang bestaat in een GFM-cel alleen als <br>.
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
  // `Handlers` kent alleen de knooptypen van mdast zelf; onze vier uitbreidingen
  // bestaan daar per definitie niet in. De cast is precies zo breed als nodig.
  handlers: { underline, highlight, wikiEmbed, wikiLink, table } as StringifyOptions["handlers"],
};

export const readProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml"])
  .freeze();

export const writeProcessor = unified()
  .use(remarkStringify, stringifyOptions)
  // tablePipeAlign: false houdt tabellen smal — anders herschrijft één gewijzigde cel
  // de hele tabel en wordt elke diff onleesbaar.
  .use(remarkGfm, { tablePipeAlign: false, tableCellPadding: true })
  .freeze();
