import { DOMSerializer } from "prosemirror-model";
import type { Fragment } from "prosemirror-model";
import { schema } from "../../markdown/schema.js";

/**
 * The `text/html` flavour of a copy.
 *
 * `clipboard-text.ts` is the other half and explains the shared reason: copying a note
 * into a mail, a ticket or a chat box is the routine this app replaces, so what lands on
 * the far end is not a detail. That file fixed the plain-text flavour and the comment
 * above it said the HTML flavour "was always fine". It was not, and four constructions
 * are the reason — the first two of them losing information rather than looks:
 *
 * - **A task item arrived as a plain bullet.** `schema.ts`'s `toDOM` writes the state as
 *   `data-checked`, which is exactly right for a copy that comes back into this app and
 *   invisible to everything else in the world — the box the editor draws is a widget
 *   decoration (`checkbox.ts`), and a decoration is not part of the document, so no
 *   serializer of any kind can see it. Ticked and unticked read the same in the mail.
 *   That is real information lost, and it is what this file exists for.
 * - **A star came out as a plain bullet** for the same reason, `data-starred` (B72).
 * - **A highlight disappeared** — `<mark>` is HTML5 and Word's importer, which is what
 *   Outlook's message body is, unwraps what it does not recognise, taking the tag and
 *   its meaning with it.
 * - **A heading arrived at body size** wherever the destination has no style of its own
 *   for `<h1>`.
 *
 * Three rules shape the answer:
 *
 * **The schema's `toDOM` is not touched.** It is the editor's own rendering *and* the
 * in-app copy/paste round trip (`readChecked` in `schema.ts` is the other half), and it
 * is the file-format schema besides — B6. This is a `clipboardSerializer` beside it,
 * which is the one prop ProseMirror provides for exactly this difference.
 *
 * **A glyph is a picture of an attribute, never a second definition of it.** The `☑` is
 * added next to `data-checked`, not instead of it, and it carries `data-emq-clip` so
 * `schema.ts`'s ignore rule drops it on the way back in. Without that, copying a task
 * item and pasting it back into a note — same app, same document — would give a literal
 * `☑` in the text with a real box beside it.
 *
 * **Three properties are never emitted in any inline style**: `font-weight`,
 * `font-style` and `text-decoration`. `schema.ts` parses `font-weight=bold`,
 * `font-weight=700`, `font-style=italic` and `text-decoration=underline` as marks, so a
 * heading styled bold on the way out would come back out of an in-app paste as a heading
 * full of `**bold**` — a saved corruption, the same trap `link-title.ts` describes for
 * `title`, and the reason a heading's inline size carries no weight beside it.
 *
 * Everything here degrades: a destination that honours none of it still shows the glyph,
 * because it is text and not styling.
 */

/**
 * The box, typed rather than drawn — the one place this app spells it with characters.
 *
 * `checkbox.ts` draws the editor's own box as SVG, and its comment says why: `☐` and `☑`
 * come from different fallback fonts and do not match in size or weight. That argument
 * still holds and does not help here — inline SVG is stripped by every mail client worth
 * naming, and a `data:` image is blocked by Outlook — so the glyph is what the far end
 * can be given. Both states are present and distinguishable, which is the whole request.
 */
const UNCHECKED = "☐";
const CHECKED = "☑";
/** B72's star, the same character the file and the plain-text flavour carry. */
const STAR = "⭐";

/** `--highlight` from the light theme in `styles.css`; a mail is a light document. */
const HIGHLIGHT = "#fff2a8";

/**
 * Headings in points, not `em`.
 *
 * `em` is the honest unit and Word converts it badly; a point size is what its importer
 * speaks natively. The scale is against an 11 pt body, which is Outlook's default and
 * therefore the destination this is aimed at.
 */
const HEADING_SIZE: Record<number, string> = {
  1: "24pt",
  2: "18pt",
  3: "14pt",
  4: "12pt",
  5: "11pt",
  6: "11pt",
};

const MONO = "Consolas, \"SF Mono\", Menlo, monospace";

/**
 * Wraps an element's children in a styled `<span>` *as well as* styling the element.
 *
 * The belt and the braces, and both are needed: a destination that knows the tag reads
 * the style off it, and one that unwraps the tag it does not know (Word, for `<mark>`)
 * keeps the span and the look with it. Coming back into this app the span matches no
 * parse rule, so its text is kept and it adds nothing — which is why it may hold only
 * properties `schema.ts` does not parse as a mark.
 */
function alsoOnASpan(element: Element, style: string): void {
  const span = element.ownerDocument.createElement("span");
  span.setAttribute("style", style);
  while (element.firstChild !== null) span.appendChild(element.firstChild);
  element.appendChild(span);
  element.setAttribute("style", `${element.getAttribute("style") ?? ""}${style}`);
}

/**
 * The marker in front of a list item, inside its first paragraph rather than before it.
 *
 * `listItem` is `paragraph block*`, so the first child is always the paragraph holding
 * the item's own text — and a `<span>` placed as a sibling *before* that `<p>` would sit
 * on a line of its own everywhere, the box above the text it belongs to.
 */
function prefixMarker(item: Element, glyph: string): void {
  const first = item.firstElementChild;
  const host = first !== null && first.tagName === "P" ? first : item;
  const span = item.ownerDocument.createElement("span");
  // Read by `schema.ts`'s ignore rule and by nothing else.
  span.setAttribute("data-emq-clip", "marker");
  // A non-breaking space, and it is deliberate: this is the gap between a marker and
  // the text it marks, not a space in the sentence, so nothing should be free to
  // collapse it or to wrap the line there.
  span.textContent = `${glyph}\u00a0`;
  host.insertBefore(span, host.firstChild);
}

function decorate(root: DocumentFragment | HTMLElement): void {
  for (const item of root.querySelectorAll("li")) {
    const checked = item.getAttribute("data-checked");
    if (checked === "true" || checked === "false") {
      // The box stands *in* the marker slot, as it does in the editor — a task item has
      // no bullet of its own there either. A destination that ignores the property shows
      // "• ☑ text", which is worse and still right.
      item.setAttribute("style", "list-style-type:none;");
      prefixMarker(item, checked === "true" ? CHECKED : UNCHECKED);
    } else if (item.getAttribute("data-starred") === "true") {
      // The star sits beside the bullet rather than replacing it, exactly as the file
      // spells it (`- ⭐ Bel Jan`) and as `clipboard-text.ts` writes it.
      prefixMarker(item, STAR);
    }
  }

  for (const heading of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const level = Number(heading.tagName.slice(1));
    alsoOnASpan(heading, `font-size:${HEADING_SIZE[level] ?? "11pt"};`);
  }

  for (const highlight of root.querySelectorAll("mark")) {
    alsoOnASpan(highlight, `background-color:${HIGHLIGHT};`);
  }

  for (const code of root.querySelectorAll("code")) {
    code.setAttribute("style", `font-family:${MONO};`);
  }
}

/**
 * `DOMSerializer.fromSchema` plus one pass over the result.
 *
 * A pass and not a set of replaced `toDOM` specs, because the first thing it does cannot
 * be said in a `DOMOutputSpec` at all: the glyph goes *inside* the item's first
 * paragraph, and a spec reaches its own element and one content hole, never a child.
 */
class ClipboardSerializer extends DOMSerializer {
  override serializeFragment(
    fragment: Fragment,
    options?: { document?: Document },
    target?: HTMLElement | DocumentFragment,
  ): HTMLElement | DocumentFragment {
    const dom = super.serializeFragment(fragment, options, target);
    // Recursion passes a `target` and the top-level call does not — see
    // `serializeNodeInner` in prosemirror-model. Decorating on the way out of every
    // nested fragment would prefix a nested item's marker once per level of nesting.
    if (target === undefined) decorate(dom);
    return dom;
  }
}

const base = DOMSerializer.fromSchema(schema);

export const clipboardHtml = new ClipboardSerializer(base.nodes, base.marks);
