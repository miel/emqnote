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
 *
 * PDF only since B36 — Office formats lost inline preview when the render moved from
 * the OS thumbnail provider (which could open all four) to an in-house pdf.js render
 * (which only reads PDFs). They stay attachable and draw as a plain chip.
 */
const PREVIEWABLE_EXTENSIONS = new Set([".pdf"]);

function isPreviewableTarget(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return PREVIEWABLE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

/**
 * A target whose thumbnail request has already failed once this session (a 404 or a
 * broken file) is not retried on every re-render of the same note — `setDoc` rebuilds
 * every NodeView on each note-open. Bounded so a long resident session browsing many
 * failed PDFs cannot grow this without limit.
 *
 * The value carries the *reason* when it is known (a 422 — pdf.js could not render this
 * PDF) so a re-render can redraw the error marker without asking again; `true` means
 * "just revert to the plain chip, silently", the pre-B36 behaviour for everything else
 * (a 404, or the fetch itself failing).
 */
const MAX_FAILED_THUMBNAILS = 500;
const failedThumbnails = new Map<string, string | true>();

function rememberFailedThumbnail(target: string, reason: string | true = true): void {
  if (failedThumbnails.size >= MAX_FAILED_THUMBNAILS) {
    const oldest = failedThumbnails.keys().next().value;
    if (oldest !== undefined) failedThumbnails.delete(oldest);
  }
  failedThumbnails.set(target, reason);
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
 * resolves inside `_attachments/` does, and only main can answer that. `IPC.openWikiLink`
 * (B35) is therefore one channel for both: it tries the attachment first and asks the
 * index about a note with what is left over, and answers which of the two it turned out
 * to be. Before B35 the note half simply did nothing.
 *
 * B30 adds a first-page thumbnail, purely additively: for a target `isPreviewableTarget`
 * accepts, a hidden `<img>` is appended and the outer span keeps `class="wiki-link"` plus
 * `data-target` exactly as before, so every existing CSS selector and this same click
 * handler keep working untouched — including the `.ProseMirror-selectednode` outline in
 * `styles.css`, which used to cover only `.wiki-embed`/`.wiki-embed-image` and left a
 * `.wiki-link` (a PDF/file chip) selected invisibly until that gap was closed. For
 * anything else — a note link, a `.txt` attachment — nothing is added at all: the markup
 * is byte-for-byte what it was before this package.
 *
 * B36 changed *how* the thumbnail arrives, not this shape: it now comes from `fetch()`
 * rather than the `<img>` tag's own `src`, because the two failure outcomes on
 * `emqnote-thumb://` are no longer the same thing (`index.ts`'s `registerThumbnailProtocol`)
 * — 404 for "nothing to preview" and 422 for "resolved, but pdf.js could not render it" —
 * and an `<img>`'s own `onerror` cannot see a status code, only that loading failed.
 * `fetch()` costs exactly what the `<img>` tag's implicit load already cost (one request
 * through `protocol.handle`, in-process, no IPC round trip through the preload bridge);
 * reading the status explicitly just makes that response visible before handing the
 * bytes to the image, rather than adding a second request or a round trip to main.
 */
function applyThumbnail(span: HTMLElement, img: HTMLImageElement, target: string, label: string): void {
  const url = `emqnote-thumb://${encodeURIComponent(target)}`;

  fetch(url)
    .then(async (response) => {
      if (response.status === 422) {
        const reason = await response.text().catch(() => "");
        rememberFailedThumbnail(target, reason);
        markThumbnailError(span, img, reason);
        return;
      }
      if (!response.ok) throw new Error(`emqnote-thumb: HTTP ${response.status}`);

      const blob = await response.blob();
      img.src = URL.createObjectURL(blob);
      img.onload = () => {
        span.dataset.thumb = "ok";
      };
    })
    .catch(() => {
      rememberFailedThumbnail(target);
      revertToChip(span, img, label);
    });
}

/** Falls back to exactly the pre-B30 chip — no leftover class, no leftover wrapper. */
function revertToChip(span: HTMLElement, img: HTMLImageElement, label: string): void {
  img.remove();
  span.classList.remove("wiki-link-preview");
  delete span.dataset.thumb;
  span.textContent = label;
}

/**
 * A real failure (422) must not look like a plain chip (B36) — that was the whole bug: a
 * corrupt or password-protected PDF looked identical to a `.txt` attachment with nothing
 * to preview. A small marker plus a `title` naming the reason, on the same span the chip
 * already uses, rather than a different element the CSS/click-handler story has to learn.
 */
function markThumbnailError(span: HTMLElement, img: HTMLImageElement, reason: string): void {
  img.remove();
  // Not the enlarged thumbnail box — a compact chip with a marker reads better for "here
  // is a reason", and it is what keeps this state identical whether it was just learned
  // (a fresh 422) or already known (a repeat render finding `remembered` a string).
  span.classList.remove("wiki-link-preview");
  span.dataset.thumb = "error";
  span.title = reason.trim() !== "" ? reason : "Could not render a preview for this file.";

  if (span.querySelector(".wiki-link-error-marker") === null) {
    const marker = document.createElement("span");
    marker.className = "wiki-link-error-marker";
    marker.textContent = "⚠";
    span.prepend(marker);
  }
}

export function wikiLinkNodeView(node: PMNode): NodeView {
  const target = node.attrs.target as string;
  const alias = node.attrs.alias as string | null;
  const label = alias ?? target;

  const span = document.createElement("span");
  span.className = "wiki-link";
  span.dataset.target = target;
  span.textContent = label;

  // `true` (a remembered non-422 failure — a 404, or the fetch itself failing) means
  // "stay the plain chip set two lines up, do not even try": nothing under this branch
  // runs and the function falls straight through to the click handlers below.
  const remembered = failedThumbnails.get(target);

  if (isPreviewableTarget(target) && remembered !== true) {
    span.classList.add("wiki-link-preview");
    span.textContent = "";

    const img = document.createElement("img");
    img.className = "wiki-link-thumb";
    img.alt = "";

    const labelSpan = document.createElement("span");
    labelSpan.className = "wiki-link-label";
    labelSpan.textContent = label;

    span.append(img, labelSpan);

    if (remembered === undefined) {
      applyThumbnail(span, img, target, label);
    } else {
      // A remembered string: a 422 already learned this session — redraw the marker
      // straight away, no need to ask again.
      markThumbnailError(span, img, remembered);
    }
  }

  // Held down, not clicked: a click on an atom node would otherwise also try to place
  // the caret inside it, and `mousedown` is what ProseMirror uses to decide that.
  span.addEventListener("mousedown", (event) => event.preventDefault());
  span.addEventListener("click", (event) => {
    event.preventDefault();
    void window.emqnote.openWikiLink(target).then((outcome) => {
      // A link that resolves to nothing used to do nothing at all, which is
      // indistinguishable from a click that never registered — and with note links
      // (B35) that stopped being a rare case, since a note can be renamed out from under
      // a link written by hand. Marked on the chip rather than raised as a dialog: the
      // fact belongs to the link, and it stays true for as long as the note is open.
      if (outcome === "none") {
        span.dataset.link = "missing";
        span.title = `Nothing in this vault is called "${target}".`;
      } else {
        delete span.dataset.link;
      }
    });
  });

  return { dom: span };
}
