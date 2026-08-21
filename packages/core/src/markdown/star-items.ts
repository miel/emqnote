import type { Root, RootContent } from "mdast";

/**
 * Reads `- ⭐ Bel Jan` back as a bullet flagged for attention (B72).
 *
 * The star is a marker, not a word: it stands where the bullet would, it means "this one
 * needs looking at", and everything else about the item is an ordinary bullet. So it is an
 * attribute in memory — which is what keeps Backspace, Home, select-all, the plain-text
 * clipboard, `plainText()`, the excerpt and the Tasks view from ever seeing it — and a
 * `⭐ ` prefix on disk, which is what keeps the file plain markdown. This is the reading
 * half; `pipeline.ts`'s own `listItem` handler is the writing half, and neither means
 * anything without the other, exactly as with `empty-tasks.ts`.
 *
 * Obsidian shows `• ⭐ Bel Jan`. That is the escape hatch working as B7 intends: a note
 * written here reads there, a note written there reads here, and a star typed by hand in
 * Obsidian arrives as a flag rather than as two characters nobody meant.
 *
 * **Never on a task item, and never in a numbered list.** Both are the same rule: a star
 * stands where the marker would, and in those two the marker is already taken — by the box,
 * which is positioned into the marker slot, and by the number, which is the item's meaning.
 * The command declines both at the editor's end and this declines them at the file's, so a
 * `- [ ] ⭐ Iets` or a `1. ⭐ Iets` written elsewhere keeps its star as literal text and
 * round-trips byte for byte rather than arriving as a state this app can neither draw nor
 * write back.
 *
 * **Nothing is checked against the source**, unlike the escaped `\\[ ]` that
 * `restoreEmptyTasks` has to tell apart from a real box. There is no escaped spelling of a
 * star: `⭐` is not punctuation, so `mdast-util-to-markdown` never escapes it in any
 * position and no backslash form exists to confuse it with. The cost is the other way
 * round and is deliberate — a bullet whose text genuinely begins `⭐ ` cannot be expressed,
 * because that spelling *is* the flag. `test/limitations.test.ts` pins it.
 */
const STAR = "⭐";

export function liftStarMarkers(root: Root): void {
  visit(root.children, false);

  function visit(nodes: RootContent[], ordered: boolean): void {
    for (const node of nodes) {
      if (node.type === "listItem" && !ordered) lift(node);
      if (!("children" in node)) continue;
      // A list says what its own items are; anything else passes the question through, so
      // an item's blocks are still judged by the list that holds them.
      visit(node.children as RootContent[], node.type === "list" ? node.ordered === true : ordered);
    }
  }

  function lift(item: Extract<RootContent, { type: "listItem" }>): void {
    if (item.checked !== null && item.checked !== undefined) return;

    const paragraph = item.children[0];
    if (paragraph === undefined || paragraph.type !== "paragraph") return;

    const text = paragraph.children[0];
    if (text === undefined || text.type !== "text") return;

    // `⭐` on its own is the empty flagged item — the star equivalent of `- [ ]`, and the
    // same half-written shape: a line marked for attention before anything has been typed
    // on it. Anything else must be the star followed by a space, or `⭐️`-something and
    // `⭐ster` would both silently lose their first character.
    if (text.value === STAR) text.value = "";
    else if (text.value.startsWith(`${STAR} `)) text.value = text.value.slice(STAR.length + 1);
    else return;

    starred(item, true);

    // A paragraph left holding one empty text node is not the same as an empty paragraph:
    // `from-mdast.ts` builds a text node per child, and ProseMirror refuses an empty one.
    if (text.value === "") paragraph.children.shift();
  }
}

/** The flag, kept in one place because mdast's `ListItem` has no field for it. */
export function starred(item: RootContent, value: boolean): void {
  (item as unknown as { starred?: boolean }).starred = value;
}

export function isStarred(item: RootContent): boolean {
  return (item as unknown as { starred?: boolean }).starred === true;
}
