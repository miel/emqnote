import type { PhrasingContent } from "mdast";
import type { ExtPhrasing } from "./mdast-ext.js";

/**
 * After remark has parsed, underline, highlight and wikilinks do not exist as nodes
 * yet: `<u>` is a loose fragment of raw HTML, and `==text==` and `[[Note]]` are plain
 * text. This pass turns them into real nodes.
 *
 * It operates on a row of children rather than on a single text node, because a
 * highlight can span several nodes: in `==a **bold** word==` the two `==` markers end
 * up in different text nodes.
 */

type Marker =
  | { type: "__markerHighlight" }
  | { type: "__markerUnderlineOpen" }
  | { type: "__markerUnderlineClose" };

type Token = ExtPhrasing | Marker;

const BREAK_HTML = /^<br\s*\/?>$/i;
const UNDERLINE_OPEN = /^<u>$/i;
const UNDERLINE_CLOSE = /^<\/u>$/i;

/** `![[file.png]]`, `[[Note]]` or `[[Note|alias]]` */
const WIKI = /(!)?\[\[([^\]|]+?)(?:\|([^\]]*?))?\]\]/;

function isWhitespace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

/**
 * Splits a text node into text, wikilinks and highlight markers.
 *
 * The flanking rule for `==` matches comparable markdown extensions: an opening `==`
 * may not be followed by whitespace, and a closing `==` may not be preceded by it.
 * That keeps `if a == b` plain text.
 */
function tokenizeText(value: string): Token[] {
  const tokens: Token[] = [];
  let buffer = "";
  let index = 0;

  const flush = () => {
    if (buffer !== "") {
      tokens.push({ type: "text", value: buffer } as PhrasingContent);
      buffer = "";
    }
  };

  while (index < value.length) {
    const rest = value.slice(index);

    const wiki = WIKI.exec(rest);
    if (wiki && wiki.index === 0) {
      flush();
      const [full, bang, target, alias] = wiki;
      if (bang) {
        tokens.push({ type: "wikiEmbed", target: target!.trim() });
      } else {
        tokens.push({
          type: "wikiLink",
          target: target!.trim(),
          alias: alias === undefined ? null : alias.trim(),
        });
      }
      index += full.length;
      continue;
    }

    if (rest.startsWith("==")) {
      const before = index === 0 ? undefined : value[index - 1];
      const after = value[index + 2];
      const canOpen = !isWhitespace(after);
      const canClose = !isWhitespace(before);
      if (canOpen || canClose) {
        flush();
        tokens.push({ type: "__markerHighlight" });
        index += 2;
        continue;
      }
    }

    buffer += value[index];
    index += 1;
  }

  flush();
  return tokens;
}

function tokenize(children: PhrasingContent[]): Token[] {
  const tokens: Token[] = [];

  for (const child of mergeText(children as ExtPhrasing[]) as PhrasingContent[]) {
    if (child.type === "text") {
      tokens.push(...tokenizeText(child.value));
      continue;
    }

    if (child.type === "html") {
      const html = child.value.trim();
      if (BREAK_HTML.test(html)) {
        tokens.push({ type: "break" } as PhrasingContent);
        continue;
      }
      if (UNDERLINE_OPEN.test(html)) {
        tokens.push({ type: "__markerUnderlineOpen" });
        continue;
      }
      if (UNDERLINE_CLOSE.test(html)) {
        tokens.push({ type: "__markerUnderlineClose" });
        continue;
      }
      tokens.push(child);
      continue;
    }

    if ("children" in child && Array.isArray(child.children)) {
      tokens.push({
        ...child,
        children: normalizePhrasing(child.children as PhrasingContent[]),
      } as PhrasingContent);
      continue;
    }

    tokens.push(child);
  }

  return tokens;
}

function isMarker(token: Token): token is Marker {
  return (
    token.type === "__markerHighlight" ||
    token.type === "__markerUnderlineOpen" ||
    token.type === "__markerUnderlineClose"
  );
}

/** A marker that never found a partner falls back to being plain text. */
function markerAsText(marker: Marker): ExtPhrasing {
  const value =
    marker.type === "__markerHighlight"
      ? "=="
      : marker.type === "__markerUnderlineOpen"
        ? "<u>"
        : "</u>";
  return { type: "text", value } as PhrasingContent;
}

function fold(tokens: Token[]): ExtPhrasing[] {
  const result: ExtPhrasing[] = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index]!;

    if (!isMarker(token)) {
      result.push(token);
      index += 1;
      continue;
    }

    const closerType =
      token.type === "__markerHighlight" ? "__markerHighlight" : "__markerUnderlineClose";

    if (token.type === "__markerUnderlineClose") {
      // A closer without an opener.
      result.push(markerAsText(token));
      index += 1;
      continue;
    }

    let close = -1;
    for (let scan = index + 1; scan < tokens.length; scan += 1) {
      if (tokens[scan]!.type === closerType) {
        close = scan;
        break;
      }
    }

    if (close === -1) {
      result.push(markerAsText(token));
      index += 1;
      continue;
    }

    const inner = fold(tokens.slice(index + 1, close));
    result.push(
      token.type === "__markerHighlight"
        ? { type: "highlight", children: inner as PhrasingContent[] }
        : { type: "underline", children: inner as PhrasingContent[] },
    );
    index = close + 1;
  }

  return result;
}

/**
 * Merges adjacent text nodes. This happens both before and after tokenising, for
 * different reasons.
 *
 * Before, because remark can split the text around an escaped character into separate
 * nodes. Scanning per node would make recognition of `[[Note]]` depend on that
 * arbitrary split.
 *
 * After, because an unpaired marker turns back into plain text and then ends up next
 * to other text.
 *
 * Copies rather than mutates: the input is the caller's mdast tree.
 */
function mergeText(nodes: ExtPhrasing[]): ExtPhrasing[] {
  const merged: ExtPhrasing[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (node.type === "text" && previous !== undefined && previous.type === "text") {
      merged[merged.length - 1] = {
        type: "text",
        value: previous.value + node.value,
      } as PhrasingContent;
      continue;
    }
    merged.push(node);
  }
  return merged;
}

export function normalizePhrasing(children: PhrasingContent[]): ExtPhrasing[] {
  return mergeText(fold(tokenize(children)));
}
