import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import type { Options as StringifyOptions } from "remark-stringify";
import { defaultHandlers } from "mdast-util-to-markdown";
import type { Handle, State, Info } from "mdast-util-to-markdown";
import type { ListItem } from "mdast";
import { isStarred } from "./star-items.js";
import { startsWithTag } from "./tags.js";
import { writeEmbedField } from "./embed-field.js";

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

/**
 * `![[foto.png]]`, or `![[foto.png|400]]` / `![[foto.png|400x300]]` / `![[foto.png|een
 * foto van het kantoor]]` — the one slot with its three readings (B74).
 *
 * The field goes through `writeEmbedField` rather than being composed here, so the one
 * place that spells the syntax is the one place that reads it back — `embed-field.ts`.
 * `""` is a real answer and not the same as `null`: `![[foto.png|]]` had an empty slot in
 * the file and gets it back, which is what "nothing in that slot is discarded" means down
 * to the byte.
 *
 * Nothing is escaped: a target may not contain `]` or `|` (the parser's own regex says
 * so), a size is digits, and alt text that contained a `]` could not have been read as
 * this node in the first place.
 */
const wikiEmbed: Handle = (node) => {
  const { target, width, height, alt } = node as {
    target: string;
    width: number | null;
    height: number | null;
    alt: string | null;
  };
  const field = writeEmbedField({ width, height, alt });
  return field === null ? `![[${target}]]` : `![[${target}|${field}]]`;
};

const wikiLink: Handle = (node) => {
  const { target, alias } = node as { target: string; alias: string | null };
  return alias === null || alias === "" ? `[[${target}]]` : `[[${target}|${alias}]]`;
};

/**
 * Text, with one exception carved out of the escaping: a `#` that opens a tag.
 *
 * The stock handler is `state.safe(node.value, info)` and nothing else. `safe` escapes a
 * `#` at the start of a line, because there it could begin an ATX heading — see the
 * `{atBreak: true, character: '#'}` rule in mdast-util-to-markdown. That is right for
 * prose and wrong for `#klantx`, which comes back as `\#klantx` and is then no longer a
 * tag to Obsidian (B7). Mid-line hashes were never escaped and are untouched.
 *
 * Leaving it unescaped is safe because CommonMark only reads `#` as a heading when a
 * space, a tab or the line end follows it. `#klantx` at column 0 is a paragraph either
 * way, so it re-parses to exactly the same text. `\# Dit is geen kop` keeps its
 * backslash, because a space follows the hash and `startsWithTag` therefore says no.
 *
 * The value is cut around each such `#` and the pieces go through `state.safe`
 * separately, so the hash is never inside a string `safe` inspects. Post-processing the
 * escaped output instead would be a trap: `safe` doubles a literal backslash before
 * punctuation, so the output can contain `\\#` meaning backslash-then-hash, and
 * unescaping that with a regex would silently eat a character the user typed.
 *
 * Recorded as B19.
 */
const text: Handle = (node, _parent, state, info) => {
  const value = (node as { value: string }).value;
  if (!value.includes("#")) return state.safe(value, info);

  const pieces: string[] = [];
  let start = 0;
  let before = info.before;

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "#") continue;

    // Only a hash that begins a line can be escaped, so only there is there anything to
    // undo. Inside the value that means right after a newline from a hard break.
    const atBreak = index === 0 ? before === "" || before.endsWith("\n") : value[index - 1] === "\n";
    if (!atBreak || !startsWithTag(value.slice(index))) continue;

    pieces.push(state.safe(value.slice(start, index), { ...info, before, after: "#" }));
    pieces.push("#");
    start = index + 1;
    before = "#";
  }

  pieces.push(state.safe(value.slice(start), { ...info, before }));
  return pieces.join("");
};

/**
 * List items, including the one case remark-gfm's own handler drops on the floor: a task
 * with no text yet.
 *
 * `mdast-util-gfm-task-list-item` writes the box by putting the bullet back through
 * `/^(?:[*+-]|\d+\.)([\r\n]| {1,3})/` and inserting `[ ] ` after the space it captured.
 * An item with an empty paragraph serializes to a bare `-` — no space, no line end — so
 * that pattern finds nothing, the replacement never happens, and the checkbox vanishes
 * silently. Reloading the file then showed a plain bullet where an empty box had been,
 * which is the whole of that bug: the tick was never in the file to begin with.
 *
 * `- [ ]` with nothing after it is deliberately written *without* a trailing space, since
 * `03-markdown-dialect.md` forbids trailing whitespace and `roundtrip.test.ts` asserts
 * it. GFM does not read that back as a task — the checkbox must be followed by whitespace
 * *and content* — so `restoreEmptyTasks` in `empty-tasks.ts` is the matching half, and
 * neither half means anything without the other.
 *
 * The non-empty path reproduces the extension's logic rather than delegating to it,
 * because a handler cannot call the one it replaces. It stays honest because the corpus
 * has task lists in it: `roundtrip.test.ts` fails the moment this drifts.
 *
 * B72's star is written here too, by the same machinery: it is a prefix inside the item
 * exactly as the box is, and everything below — the tracker, the two placements, the
 * trailing space dropped on an empty line — is the same problem with a different string.
 * `star-items.ts` is its reading half, and the two are as inseparable as the other pair.
 * A star and a box never appear together (see `starPrefix`), so there is only ever one.
 */
const listItem: Handle = (node, parent, state, info) => {
  const item = node as ListItem;
  const head = item.children[0];
  const paragraph = head?.type === "paragraph";

  const box = typeof item.checked === "boolean" && paragraph;
  // Exclusive with the box by decision (B72): a task's checkbox already stands in the
  // marker's place, so a starred task could not be drawn — and writing one would put a
  // state on disk that reading it back would refuse. `liftStarMarkers` declines the same
  // pair from the other side, where a `- [ ] ⭐ …` written elsewhere keeps its star as
  // ordinary text.
  const star = !box && paragraph && isStarred(item);

  if (!box && !star) return defaultHandlers.listItem(item, parent, state, info);

  const prefix = box ? (item.checked === true ? "[x] " : "[ ] ") : "\u2b50 ";
  // The tracker keeps column positions right for anything inside the item that cares
  // (tables, wrapped links) now that the prefix takes columns ahead of them.
  const tracker = state.createTracker(info);
  tracker.move(prefix);

  const value = defaultHandlers.listItem(item, parent, state, {
    ...info,
    ...tracker.current(),
  });

  const inline = value.replace(/^(?:[*+-]|\d+\.) {1,3}/, (marker) => marker + prefix);
  if (inline !== value) return inline;

  // Nothing followed the marker on its own line, so the prefix is all the line holds: an
  // empty task or an empty starred item, either on its own or with a sublist hanging
  // under it. `prefix` carries the space that would have separated it from content there
  // is none of, so it is dropped — the dialect forbids trailing whitespace, and
  // `roundtrip.test.ts` checks.
  const marker = /^(?:[*+-]|\d+\.)/.exec(value)?.[0] ?? "";
  return `${marker} ${prefix.trimEnd()}${value.slice(marker.length)}`;
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
  handlers: {
    underline,
    highlight,
    wikiEmbed,
    wikiLink,
    table,
    text,
    listItem,
  } as StringifyOptions["handlers"],
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
