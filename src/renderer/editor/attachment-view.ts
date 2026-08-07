import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";

/**
 * `wikiEmbed`'s real face in the editor: the picture itself for an image, the
 * filename chip `schema.ts`'s own `toDOM` already draws for everything else.
 *
 * `toDOM` is deliberately left alone — it is the file-format schema and the
 * serializer's DOM tests depend on it (parsing `<span class="wiki-embed">` back into
 * the node, `schema.ts:206-217`). This is a NodeView layered on top instead, which is
 * a view concern and never touches what gets written to a `.md` file: an `<img>` here
 * is exactly as inert to `serializeBody` as the span it replaces on screen.
 *
 * A custom protocol rather than a `data:` URL — `emqnote-attachment://<name>` streams
 * the file from `_attachments/` through `resolveAttachment`'s traversal guard, so a
 * screenshot never has to cross IPC as base64 just to be shown once.
 */

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
]);

/** Whether a stored attachment's name is one the browser can paint as an `<img>`. */
export function isImageAttachment(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return IMAGE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

function imageView(target: string): NodeView {
  const img = document.createElement("img");
  img.className = "wiki-embed-image";
  img.src = `emqnote-attachment://${encodeURIComponent(target)}`;
  img.alt = target;
  img.draggable = true;

  return { dom: img };
}

/** The same span `toDOM` produces, for a target that is not a renderable image. */
function chipView(target: string): NodeView {
  const span = document.createElement("span");
  span.className = "wiki-embed";
  span.dataset.target = target;
  span.textContent = target;

  return { dom: span };
}

export function attachmentNodeView(
  node: PMNode,
  _view: EditorView,
  _getPos: () => number | undefined,
): NodeView {
  const target = node.attrs.target as string;
  return isImageAttachment(target) ? imageView(target) : chipView(target);
}

/**
 * `image`'s real face: a label, never an `<img>`.
 *
 * An `image` node in this app only ever holds a *remote* address — an attachment is a
 * `wikiEmbed` instead (`insert-attachment.ts`) — and the CSP allows no remote image
 * source in either window, so the browser drew a broken-image glyph for every one of
 * them. That looks like a bug both where it is the honest fallback for a paste whose
 * download was refused (`paste-images.ts`) and in a note written in Obsidian that
 * already carried `![alt](https://…)` before this app ever opened it.
 *
 * Deliberately no `<img>` at all rather than an `img-src` widened to `https:`: the
 * address came off a pasted page, and a note that quietly fetches from it every time it
 * is opened is a tracking pixel with extra steps.
 */
function externalImageLabel(node: PMNode): string {
  const alt = (node.attrs.alt as string | null) ?? "";
  if (alt.trim() !== "") return alt;

  const src = (node.attrs.src as string | null) ?? "";
  try {
    return new URL(src).hostname || "image";
  } catch {
    return "image";
  }
}

export function externalImageView(node: PMNode): NodeView {
  const span = document.createElement("span");
  span.className = "external-image";
  span.textContent = externalImageLabel(node);
  span.title = (node.attrs.src as string | null) ?? "";

  return { dom: span };
}

/**
 * `wikiLink`'s real face: the same chip `toDOM` already draws, plus a click that opens
 * a stored attachment (a PDF, in practice — an image is `wikiEmbed` instead) in the
 * system viewer. `toDOM` stays untouched for the same reason as above.
 *
 * This NodeView applies to *every* `wikiLink`, note-to-note links included, since the
 * node carries nothing that tells the two apart on its own — only whether the target
 * resolves inside `_attachments/` does, and only main can answer that. `IPC.openAttachment`
 * refuses silently on a name it cannot resolve (`resolveAttachment` returning `null`),
 * which is exactly what a note-to-note link needs to do until note navigation exists:
 * nothing, not an error.
 */
export function wikiLinkNodeView(node: PMNode): NodeView {
  const target = node.attrs.target as string;
  const alias = node.attrs.alias as string | null;

  const span = document.createElement("span");
  span.className = "wiki-link";
  span.dataset.target = target;
  span.textContent = alias ?? target;

  // Held down, not clicked: a click on an atom node would otherwise also try to place
  // the caret inside it, and `mousedown` is what ProseMirror uses to decide that.
  span.addEventListener("mousedown", (event) => event.preventDefault());
  span.addEventListener("click", (event) => {
    event.preventDefault();
    void window.emqnote.openAttachment(target);
  });

  return { dom: span };
}
