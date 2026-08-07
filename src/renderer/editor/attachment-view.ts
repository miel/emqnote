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

/**
 * Mirrors `thumbnail-cache.ts`'s `PREVIEWABLE_EXTENSIONS`/`isPreviewable` (B30) rather
 * than importing across the main/renderer boundary — the same choice already made for
 * `IMAGE_EXTENSIONS` above. A `wikiLink` is used for *every* wiki link, a plain
 * `[[Some Note]]` note-to-note one included, and that has no file behind it at all, so
 * this is what keeps a bare note title from ever turning into an `emqnote-thumb://`
 * request over the wire.
 */
const PREVIEWABLE_EXTENSIONS = new Set([".pdf", ".docx", ".xlsx", ".pptx"]);

function isPreviewableTarget(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return PREVIEWABLE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

/**
 * A target whose thumbnail request has already failed once this session (no OS
 * provider, a 404, a broken file) is not retried on every re-render of the same note —
 * `setDoc` rebuilds every NodeView on each note-open. Bounded so a long resident session
 * browsing many failed PDFs cannot grow this without limit.
 */
const MAX_FAILED_THUMBNAILS = 500;
const failedThumbnails = new Map<string, true>();

function rememberFailedThumbnail(target: string): void {
  if (failedThumbnails.size >= MAX_FAILED_THUMBNAILS) {
    const oldest = failedThumbnails.keys().next().value;
    if (oldest !== undefined) failedThumbnails.delete(oldest);
  }
  failedThumbnails.set(target, true);
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
 *
 * B30 adds a first-page thumbnail, purely additively: for a target `isPreviewableTarget`
 * accepts, a hidden `<img src="emqnote-thumb://…">` is appended and the outer span keeps
 * `class="wiki-link"` plus `data-target` exactly as before, so every existing CSS
 * selector and this same click handler keep working untouched — including the
 * `.ProseMirror-selectednode` outline in `styles.css`, which used to cover only
 * `.wiki-embed`/`.wiki-embed-image` and left a `.wiki-link` (a PDF/file chip) selected
 * invisibly until that gap was closed. For anything else — a note link, a `.txt`
 * attachment — nothing is added at all: the markup is byte-for-byte what it was before
 * this package, which is also what the `<img>` itself falls back to (`onerror` removes
 * it and reverts the span to plain text) on Linux, or a Windows box with no thumbnail
 * provider registered.
 */
export function wikiLinkNodeView(node: PMNode): NodeView {
  const target = node.attrs.target as string;
  const alias = node.attrs.alias as string | null;
  const label = alias ?? target;

  const span = document.createElement("span");
  span.className = "wiki-link";
  span.dataset.target = target;
  span.textContent = label;

  if (isPreviewableTarget(target) && !failedThumbnails.has(target)) {
    span.classList.add("wiki-link-preview");
    span.textContent = "";

    const img = document.createElement("img");
    img.className = "wiki-link-thumb";
    img.src = `emqnote-thumb://${encodeURIComponent(target)}`;
    img.alt = "";
    img.onload = () => {
      span.dataset.thumb = "ok";
    };
    img.onerror = () => {
      rememberFailedThumbnail(target);
      img.remove();
      // Falls back to exactly the pre-B30 chip — no leftover class, no leftover
      // wrapper — rather than a broken-image icon or an empty span.
      span.classList.remove("wiki-link-preview");
      delete span.dataset.thumb;
      span.textContent = label;
    };

    const labelSpan = document.createElement("span");
    labelSpan.className = "wiki-link-label";
    labelSpan.textContent = label;

    span.append(img, labelSpan);
  }

  // Held down, not clicked: a click on an atom node would otherwise also try to place
  // the caret inside it, and `mousedown` is what ProseMirror uses to decide that.
  span.addEventListener("mousedown", (event) => event.preventDefault());
  span.addEventListener("click", (event) => {
    event.preventDefault();
    void window.emqnote.openAttachment(target);
  });

  return { dom: span };
}
