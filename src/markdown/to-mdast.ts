import type { Mark, Node as PMNode } from "prosemirror-model";
import type { PhrasingContent, Root, RootContent } from "mdast";
import { MARK_NESTING_ORDER } from "./schema.js";
import type { ExtPhrasing } from "./mdast-ext.js";

/**
 * ProseMirror stores marks as an unordered set per text node; markdown is a tree. This
 * module builds that tree using a fixed nesting order (`MARK_NESTING_ORDER`), so the
 * same document always produces the same markdown.
 */

function markPriority(mark: Mark): number {
  const index = MARK_NESTING_ORDER.indexOf(
    mark.type.name as (typeof MARK_NESTING_ORDER)[number],
  );
  return index === -1 ? MARK_NESTING_ORDER.length : index;
}

function sameMark(a: Mark, b: Mark): boolean {
  return a.type === b.type && a.eq(b);
}

function hasMark(node: PMNode, mark: Mark): boolean {
  return node.marks.some((candidate) => sameMark(candidate, mark));
}

/**
 * Non-breaking spaces come in uninvited.
 *
 * `contenteditable` inserts U+00A0 to stop a trailing space from collapsing, and
 * pasted Outlook HTML is full of `&nbsp;`. Neither is intentional, and both show up as
 * a stray invisible character when the file is opened in any other editor. They become
 * ordinary spaces on the way out.
 */
const NON_BREAKING_SPACE = String.fromCharCode(160);

function normaliseText(value: string): string {
  return value.split(NON_BREAKING_SPACE).join(" ");
}

function leafToMdast(node: PMNode): ExtPhrasing | null {
  switch (node.type.name) {
    case "text":
      return { type: "text", value: normaliseText(node.text ?? "") } as PhrasingContent;
    case "hardBreak":
      return { type: "break" } as PhrasingContent;
    case "image":
      return {
        type: "image",
        url: node.attrs.src as string,
        alt: (node.attrs.alt as string | null) ?? null,
        title: (node.attrs.title as string | null) ?? null,
      } as PhrasingContent;
    case "wikiEmbed":
      return { type: "wikiEmbed", target: node.attrs.target as string };
    case "wikiLink":
      return {
        type: "wikiLink",
        target: node.attrs.target as string,
        alias: (node.attrs.alias as string | null) ?? null,
      };
    default:
      return null;
  }
}

function wrap(mark: Mark, children: ExtPhrasing[]): ExtPhrasing {
  switch (mark.type.name) {
    case "strong":
      return { type: "strong", children: children as PhrasingContent[] } as PhrasingContent;
    case "em":
      return { type: "emphasis", children: children as PhrasingContent[] } as PhrasingContent;
    case "strike":
      return { type: "delete", children: children as PhrasingContent[] } as PhrasingContent;
    case "underline":
      return { type: "underline", children: children as PhrasingContent[] };
    case "highlight":
      return { type: "highlight", children: children as PhrasingContent[] };
    case "link":
      return {
        type: "link",
        url: mark.attrs.href as string,
        title: (mark.attrs.title as string | null) ?? null,
        children: children as PhrasingContent[],
      } as PhrasingContent;
    default:
      return { type: "text", value: "" } as PhrasingContent;
  }
}

function textValue(node: ExtPhrasing | undefined): string | null {
  return node !== undefined && node.type === "text"
    ? (node as { value: string }).value
    : null;
}

/**
 * Moves whitespace out from under a mark before wrapping.
 *
 * Markdown emphasis cannot start or end on a space: `**Havinga **` is not bold at all.
 * mdast-util-to-markdown works around that by writing `**Havinga&#x20;**`, and then
 * has to encode the character that follows too — which is where
 * `> **Havinga&#x20;**&#x69;s a bullet list` came from. Both are correct markdown and
 * both are unreadable.
 *
 * Selecting a word by double-clicking usually takes the trailing space with it, so
 * this is not an edge case; it is what happens when you bold a word with the mouse.
 * The space belongs outside the emphasis, where it reads as what it is.
 */
function wrapWithoutEdgeWhitespace(mark: Mark, inner: ExtPhrasing[]): ExtPhrasing[] {
  // Inline code is literal: its content must survive exactly as typed.
  if (mark.type.name === "code" || inner.length === 0) return [wrap(mark, inner)];

  const children = [...inner];
  const before: ExtPhrasing[] = [];
  const after: ExtPhrasing[] = [];

  const first = textValue(children[0]);
  if (first !== null) {
    const leading = first.length - first.trimStart().length;
    if (leading > 0) {
      before.push({ type: "text", value: first.slice(0, leading) } as PhrasingContent);
      children[0] = {
        type: "text",
        value: first.slice(leading),
      } as PhrasingContent;
    }
  }

  const lastIndex = children.length - 1;
  const last = textValue(children[lastIndex]);
  if (last !== null) {
    const trimmed = last.trimEnd();
    if (trimmed.length < last.length) {
      after.push({ type: "text", value: last.slice(trimmed.length) } as PhrasingContent);
      children[lastIndex] = { type: "text", value: trimmed } as PhrasingContent;
    }
  }

  // The mark covered nothing but whitespace; there is no emphasis to write.
  const remaining = children.filter((child) => textValue(child) !== "");
  if (remaining.length === 0) return [...before, ...after];

  return [...before, wrap(mark, remaining), ...after];
}

function inlineToMdast(nodes: PMNode[], active: Mark[]): ExtPhrasing[] {
  const result: ExtPhrasing[] = [];
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index]!;
    const remaining = node.marks.filter(
      (mark) => !active.some((candidate) => sameMark(candidate, mark)),
    );

    if (remaining.length === 0) {
      const leaf = leafToMdast(node);
      if (leaf) result.push(leaf);
      index += 1;
      continue;
    }

    const outermost = remaining.reduce((best, mark) =>
      markPriority(mark) < markPriority(best) ? mark : best,
    );

    // Inline code cannot contain other formatting in markdown: its content is literal.
    if (outermost.type.name === "code") {
      let value = "";
      let end = index;
      while (end < nodes.length && hasMark(nodes[end]!, outermost)) {
        value += nodes[end]!.text ?? "";
        end += 1;
      }
      result.push({ type: "inlineCode", value } as PhrasingContent);
      index = end;
      continue;
    }

    let end = index;
    while (end < nodes.length && hasMark(nodes[end]!, outermost)) end += 1;

    const inner = inlineToMdast(nodes.slice(index, end), [...active, outermost]);
    result.push(...wrapWithoutEdgeWhitespace(outermost, inner));
    index = end;
  }

  return result;
}

function childrenOf(node: PMNode): PMNode[] {
  const children: PMNode[] = [];
  node.forEach((child) => children.push(child));
  return children;
}

/**
 * Drops whitespace at the very end of a block.
 *
 * A stray space there is invisible in the editor but not on disk: two of them are a
 * hard line break in markdown, and 03-markdown-dialect.md forbids trailing whitespace
 * outright. Typing a space before pressing Enter should not quietly change what the
 * file means.
 */
function trimBlockEnd(children: ExtPhrasing[]): ExtPhrasing[] {
  const trimmed = [...children];

  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1]!;
    if (last.type !== "text") break;

    const value = (last as { value: string }).value.replace(/[ \t]+$/, "");
    if (value === "") {
      trimmed.pop();
      continue;
    }

    trimmed[trimmed.length - 1] = { type: "text", value } as PhrasingContent;
    break;
  }

  return trimmed;
}

function inlineChildren(node: PMNode): PhrasingContent[] {
  return trimBlockEnd(inlineToMdast(childrenOf(node), [])) as PhrasingContent[];
}

const LIST_TYPES = new Set(["bulletList", "orderedList"]);

/**
 * Is this list item "loose" — do its blocks need blank lines between them?
 *
 * CommonMark treats looseness as a property of the source text, not of the document
 * structure, and ProseMirror does not preserve it. The serializer therefore has to
 * derive it, and that derivation is the norm: an item is loose as soon as it contains
 * anything other than a nested list after its first paragraph.
 *
 * This keeps `- point` with a sublist underneath tight — the ordinary outline shape —
 * while a second paragraph, table or code block does get blank lines, which markdown
 * genuinely needs in those positions.
 */
function isSpreadItem(item: PMNode): boolean {
  const children = childrenOf(item);
  return children.slice(1).some((child) => !LIST_TYPES.has(child.type.name));
}

function listItemToMdast(item: PMNode): RootContent {
  return {
    type: "listItem",
    checked: item.attrs.checked as boolean | null,
    spread: isSpreadItem(item),
    children: blocksToMdast(childrenOf(item)) as never,
  } as RootContent;
}

function listToMdast(node: PMNode, ordered: boolean): RootContent {
  const items = childrenOf(node).map(listItemToMdast);
  const spread = items.some((item) => (item as { spread?: boolean }).spread === true);

  // CommonMark scopes looseness to the list, not the item: if one item is loose, every
  // item gets blank lines between them. Otherwise the round trip is not stable.
  return {
    type: "list",
    ordered,
    start: ordered ? (node.attrs.start as number) : null,
    spread,
    children: items as never,
  } as RootContent;
}

function blockToMdast(node: PMNode): RootContent | null {
  switch (node.type.name) {
    case "paragraph":
      return { type: "paragraph", children: inlineChildren(node) };

    case "heading":
      return {
        type: "heading",
        depth: node.attrs.level as 1 | 2 | 3 | 4 | 5 | 6,
        children: inlineChildren(node),
      };

    case "blockquote":
      return {
        type: "blockquote",
        children: blocksToMdast(childrenOf(node)) as never,
      };

    case "codeBlock":
      return {
        type: "code",
        lang: (node.attrs.language as string | null) ?? null,
        meta: null,
        value: node.textContent,
      };

    case "htmlBlock":
      return { type: "html", value: node.textContent };

    case "horizontalRule":
      return { type: "thematicBreak" };

    case "bulletList":
      return listToMdast(node, false);

    case "orderedList":
      return listToMdast(node, true);

    case "table":
      return {
        type: "table",
        align: node.attrs.align as never,
        children: childrenOf(node).map((row) => ({
          type: "tableRow",
          children: childrenOf(row).map((cell) => ({
            type: "tableCell",
            children: inlineChildren(cell),
          })),
        })) as never,
      };

    default:
      return null;
  }
}

/**
 * Does this node hold anything worth writing?
 *
 * Text counts, and so does anything atomic — an image or an attachment has no text but
 * is certainly content.
 */
function hasContent(node: PMNode): boolean {
  if (node.textContent.trim() !== "") return true;

  let found = false;
  node.descendants((child) => {
    if (found) return false;
    if (child.isAtom && !child.isText) found = true;
    return !found;
  });
  return found;
}

/** Does anything under here carry a checkbox? */
function hasTask(node: PMNode): boolean {
  let found = false;
  node.descendants((child) => {
    if (found) return false;
    if (child.type.name === "listItem" && child.attrs.checked !== null) found = true;
    return !found;
  });
  return found;
}

/**
 * A list in which every item is empty is left over from editing, not something anyone
 * typed. Writing it out produces a lone `1)` in the file — with that marker rather than
 * `1.` because mdast alternates markers to keep two adjacent lists apart, which makes
 * the artefact look even stranger than it is.
 *
 * An empty *task* is the exception, and not a grudging one: a box waiting to be filled in
 * is the ordinary way a checklist gets written, and dropping it here is what made an
 * empty checkbox come back as a plain bullet the moment the note was saved.
 */
function isEmptyList(node: PMNode): boolean {
  return LIST_TYPES.has(node.type.name) && !hasContent(node) && !hasTask(node);
}

function blocksToMdast(nodes: PMNode[]): RootContent[] {
  return nodes
    .filter((node) => !isEmptyList(node))
    .map((node) => blockToMdast(node))
    .filter((node): node is RootContent => node !== null);
}

/**
 * Empty paragraphs at the very end are the residue of pressing Enter a few times, not
 * something anyone meant to write. Left in, they become blank lines at the end of the
 * file, which the dialect forbids.
 */
function withoutTrailingBlanks(blocks: PMNode[]): PMNode[] {
  const kept = [...blocks];
  while (kept.length > 0) {
    const last = kept[kept.length - 1]!;
    if (last.type.name !== "paragraph" || last.content.size !== 0) break;
    kept.pop();
  }
  return kept;
}

export function docToMdast(doc: PMNode): Root {
  return { type: "root", children: blocksToMdast(withoutTrailingBlanks(childrenOf(doc))) };
}
