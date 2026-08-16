import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { attachmentUrl } from "../../shared/attachment-url.js";
import { isFetchableImageSrc } from "./paste-images.js";
import { translate } from "../../shared/i18n.js";
import { checkAttachment } from "./missing-attachments.js";

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
 * A custom protocol rather than a `data:` URL — `emqnote-attachment://vault/<name>`
 * streams the file through `resolveAttachment`'s traversal guard, so a screenshot never
 * has to cross IPC as base64 just to be shown once. The URL is composed by
 * `attachmentUrl`, which is where the reason the name sits in the *path* and not in the
 * host is written down.
 */

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  // Chromium paints AVIF in an `<img>` like any of the others, so nothing but this line
  // was ever missing: the paste and drop path decides on the MIME type
  // (`insert-attachment.ts`) and already accepted one, and a vault written elsewhere is
  // increasingly full of them.
  ".avif",
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
 * Whether inserting this attachment should write `![[name]]` rather than `[[name]]` — that
 * is, whether there is anything to *show* in the note as opposed to point at.
 *
 * Both groups this covers are drawn by `attachmentNodeView` below: a picture by the
 * browser, a PDF's first page by pdf.js (B43). `insert-attachment.ts` asks this, so the
 * question "can this be drawn" is answered once, here, next to the code that draws it.
 */
export function isEmbeddableAttachment(name: string): boolean {
  return isImageAttachment(name) || isPreviewableTarget(name);
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

/**
 * The warning glyph a chip wears when the file behind it is gone.
 *
 * Reuses `wiki-link-error-marker`, B36's class for an unrenderable PDF, rather than
 * inventing a second one: both say "there is something wrong with the file this names",
 * and one marker in one position is what keeps them from drifting into two dialects of
 * the same complaint.
 */
function prependMarker(element: HTMLElement): void {
  if (element.querySelector(".wiki-link-error-marker") !== null) return;

  const marker = document.createElement("span");
  marker.className = "wiki-link-error-marker";
  marker.textContent = "⚠";
  element.prepend(marker);
}

/**
 * Marks a chip as naming a file that is not there — `data-link="missing"`, the same
 * attribute B35's click handler already sets on a note link that resolves to nothing.
 *
 * Idempotent, because two independent routes can reach it for one picture: the batched
 * `checkAttachment` answer, and the `<img>` load failing. Both are the same fact arriving
 * twice, and whichever is first should win without the second undoing it.
 */
function markMissing(element: HTMLElement, target: string): void {
  element.dataset.link = "missing";
  element.title = `This vault has no attachment called "${target}".`;
  prependMarker(element);
}

/**
 * Sets a chip's text without losing a marker already on it.
 *
 * `textContent = label` is how the chip is drawn and how `revertToChip` puts it back
 * after a failed thumbnail — and it wipes every child, the marker included. A missing PDF
 * hits both paths (`checkAttachment` says it is gone, and the thumbnail fetch 404s on the
 * same file), so without this the two answers raced and the loser erased the winner.
 */
function setChipLabel(element: HTMLElement, label: string): void {
  element.textContent = label;
  if (element.dataset.link === "missing") prependMarker(element);
}

/**
 * A picture, with a chip in its place once the file turns out to be gone.
 *
 * The `<img>` sits inside a plain inline `<span>` rather than being the NodeView's own
 * DOM, because a NodeView cannot swap the element ProseMirror mounted — and the missing
 * state has to *replace* the picture, not decorate it. An inline span around an inline
 * replaced element is layout-neutral: every rule in `styles.css` still matches the `<img>`
 * itself, so nothing about how a present picture draws has changed.
 */
function imageView(target: string): NodeView {
  const box = document.createElement("span");
  box.className = "wiki-embed-image-box";

  const img = document.createElement("img");
  img.className = "wiki-embed-image";
  img.src = attachmentUrl("emqnote-attachment", target);
  img.alt = target;
  img.draggable = true;
  box.appendChild(img);

  // Two routes to the same fact, kept both on purpose. The load failing is the protocol
  // handler's own 404, decided by the very `resolveAttachment` the check below asks
  // about, and it arrives without a round trip; the check catches the case the browser
  // would draw its broken-image glyph for before the handler is even reached.
  img.addEventListener("error", () => showMissingImage(box, target));
  void checkAttachment(target).then((missing) => {
    if (missing) showMissingImage(box, target);
  });

  return { dom: box };
}

function showMissingImage(box: HTMLElement, target: string): void {
  if (box.dataset.link === "missing") return;

  box.textContent = "";
  const chip = document.createElement("span");
  chip.className = "wiki-embed";
  chip.dataset.target = target;
  chip.textContent = target;
  box.appendChild(chip);

  box.dataset.link = "missing";
  markMissing(chip, target);
}

/** The same span `toDOM` produces, for a target that is not a renderable image. */
function chipView(target: string): NodeView {
  const span = document.createElement("span");
  span.className = "wiki-embed";
  span.dataset.target = target;
  span.textContent = target;

  // An embed is always an attachment (§6.4 routes a picture through `wikiEmbed`), so
  // there is no note-link case to hold this back for the way `wikiLinkNodeView` has.
  void checkAttachment(target).then((missing) => {
    if (missing) markMissing(span, target);
  });

  return { dom: span };
}

/**
 * A PDF embedded in the note, drawn as its first page at the width of the column (B43).
 *
 * `![[offerte.pdf]]` is the inline page; `[[offerte.pdf]]` stays B36's small chip with a
 * thumbnail beside its label. The two spellings mean two different things now, which is
 * the whole of B43 — one to read from, one to point at.
 *
 * The page comes from the same `emqnote-thumb` pipeline the chip uses, asked for at
 * `?size=page`: one pdf.js render in one hidden window, cached on disk, and no pdf.js in
 * this bundle — the capture window is the one that has to appear inside 80 ms, and it
 * draws this NodeView too.
 *
 * Only the bar swallows `mousedown`. Clicking the page itself still makes an ordinary
 * `NodeSelection`, so the embed can be selected and deleted like the pictures beside it —
 * an inline atom that could not be selected would be one you cannot get rid of.
 */
function pdfPageView(target: string, t?: (key: string) => string): NodeView {
  const say = (key: string): string => (t === undefined ? translate("en-US", key) : t(key));

  const box = document.createElement("span");
  box.className = "wiki-embed-pdf";
  // Which of the two ways the page is sized. Width is the default and is what B43 shipped:
  // the page at the width of the column, the way a picture is drawn.
  box.dataset.fit = "width";

  const page = document.createElement("img");
  page.className = "wiki-embed-pdf-page";
  page.alt = target;
  page.draggable = false;

  const bar = document.createElement("span");
  bar.className = "wiki-embed-pdf-bar";
  // Not editable text, and never the caret's business — the recipe `checkbox.ts` and
  // `table-toolbar.ts` both follow. It matters more here than it did for six buttons: the
  // bar now holds a real `<input>`, and without this ProseMirror would treat typing a page
  // number as typing into the note.
  bar.contentEditable = "false";

  /** Every control on the bar: never takes the caret, never opens the atom's selection. */
  const control = (className: string, label: string, title: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.title = title;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    return button;
  };

  const previous = control("wiki-embed-pdf-nav", "◀", say("pdf.previousPage"));
  const next = control("wiki-embed-pdf-nav", "▶", say("pdf.nextPage"));

  // The counter is the viewer window's, down to the markup: a box you can type a page
  // number into and a total beside it. It was a read-only "Page 2 of 7" until the person
  // using both said outright that the window's bar is the one they wanted here.
  const counter = document.createElement("span");
  counter.className = "wiki-embed-pdf-counter";
  const pageInput = document.createElement("input");
  pageInput.type = "text";
  pageInput.inputMode = "numeric";
  pageInput.value = "1";
  pageInput.setAttribute("aria-label", say("pdf.pageNumber"));
  const pageTotal = document.createElement("span");
  counter.append(pageInput, pageTotal);

  // Where the viewer's zoom select stands, and deliberately not a zoom: the page here is
  // one `PAGE_SIZE` PNG that B36's hidden window already drew, so a percentage would only
  // magnify a fixed number of pixels. The two fits are the two that cost nothing — the
  // width of the column (B43's original), or the whole page inside 70vh. Real zoom, text
  // selection and printing stay in B40's window, which is what the ⧉ opens.
  const fit = document.createElement("select");
  fit.className = "wiki-embed-pdf-fit";
  fit.title = say("pdf.fit");
  for (const [value, key] of [
    ["width", "pdf.fitWidth"],
    ["page", "pdf.fitPage"],
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = say(key);
    fit.append(option);
  }
  fit.addEventListener("mousedown", (event) => event.stopPropagation());

  const label = document.createElement("span");
  label.className = "wiki-embed-pdf-name";
  label.textContent = target;

  const spacer = document.createElement("span");
  spacer.className = "wiki-embed-pdf-spacer";

  // Straight to the OS's own viewer, not through `openWikiLink` — which asks
  // `attachmentRoute`, whose whole job is to send a `.pdf` to B40's window, and this
  // button now deliberately goes round it. Somebody already reading the pages here wants
  // printing and annotating next, and a third reader in between is a step nobody asked
  // for. **Only the ⧉ inside a note changed**: a plain `[[file.pdf]]` chip and the file
  // list's Open button still raise B40's window, so both ways to read one survive.
  //
  // It carries its words as well as its glyph, exactly as the window's own does — a lone
  // ⧉ beside five other controls said nothing, and the visible text is also what
  // `--click-button` matches on.
  const open = control("wiki-embed-pdf-open", "⧉", say("pdf.openSystem"));
  open.append(document.createTextNode(` ${say("pdf.openSystem")}`));
  open.addEventListener("click", (event) => {
    event.preventDefault();
    void window.emqnote.openInSystemViewer(target);
  });

  bar.append(previous, next, counter, fit, label, spacer, open);
  // Above the page, not below it. A bar under a full-height page is a bar you have to
  // scroll the note to reach, which is the whole of why this moved.
  box.append(bar, page);

  /**
   * Which page is drawn, and how many there are once anything knows.
   *
   * `pages` starts null and usually stays that way for one round trip. Until it is known
   * the counter says only which page this is and Next stays available — the alternative
   * is a control that appears a moment after the page does, which reads as the app
   * changing its mind. A next past the end comes back as a 422 and marks the chip, the
   * same as any other page that could not be drawn; in practice the count arrives long
   * before anyone clicks.
   */
  let current = 1;
  let pages: number | null = null;
  /** Revoked as the next page replaces it — a note left open should not leak one blob per turn. */
  let drawnUrl: string | null = null;

  const redrawControls = (): void => {
    pageInput.value = String(current);
    // An em dash while the count is still on its way, the same placeholder the viewer
    // window shows for the same moment.
    pageTotal.textContent = `/ ${pages === null ? "–" : String(pages)}`;
    previous.disabled = current <= 1;
    next.disabled = pages !== null && current >= pages;
    // Both hidden rather than merely disabled for a one-page document: a pair of dead
    // arrows on every single-page PDF in the vault is exactly the clutter this bar is
    // meant not to be. The counter still says "1 / 1", which is the fact.
    const single = pages === 1;
    previous.hidden = single;
    next.hidden = single;
  };

  const draw = (wanted: number): void => {
    current = wanted;
    redrawControls();

    fetch(attachmentUrl("emqnote-thumb", target, "page", wanted))
      .then(async (response) => {
        if (response.status === 422) {
          const reason = await response.text().catch(() => "");
          // Remembered under the target, not the page: a document pdf.js cannot draw is
          // one it cannot draw at any page, and the note is about to be redrawn as a chip
          // anyway. See the note on `failedThumbnails` above for why only a 422 is kept.
          rememberFailedThumbnail(`page:${target}`, reason);
          showPdfProblem(box, target, reason);
          return;
        }
        if (!response.ok) throw new Error(`emqnote-thumb: HTTP ${response.status}`);

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        if (drawnUrl !== null) URL.revokeObjectURL(drawnUrl);
        drawnUrl = url;
        page.src = url;
        box.dataset.page = "ok";
      })
      .catch(() => showPdfProblem(box, target, null));
  };

  const step = (delta: number): void => {
    const wanted = current + delta;
    if (wanted < 1 || (pages !== null && wanted > pages)) return;
    draw(wanted);
  };

  previous.addEventListener("click", (event) => {
    event.preventDefault();
    step(-1);
  });
  next.addEventListener("click", (event) => {
    event.preventDefault();
    step(1);
  });

  // A page number typed in, committed on Enter and on leaving the box. Out-of-range and
  // nonsense both put the current page back rather than being refused with a message:
  // there is exactly one right answer to "what page am I on", and the box should always
  // be showing it.
  const goToTypedPage = (): void => {
    const wanted = Number.parseInt(pageInput.value, 10);
    if (!Number.isNaN(wanted) && wanted >= 1 && (pages === null || wanted <= pages)) {
      if (wanted !== current) {
        draw(wanted);
        return;
      }
    }
    redrawControls();
  };

  pageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      goToTypedPage();
      return;
    }
    if (event.key === "Escape") redrawControls();
    // Everything else is swallowed rather than passed on: this box sits inside a
    // contenteditable, and an arrow key or a Backspace that reached the view would move
    // the caret in the note behind it. `stopEvent` covers ProseMirror's own handlers; this
    // covers the keymaps bound above it.
    event.stopPropagation();
  });
  pageInput.addEventListener("blur", goToTypedPage);

  fit.addEventListener("change", () => {
    box.dataset.fit = fit.value === "page" ? "page" : "width";
  });

  // Keyed apart from the chip's own failures: the two are different renders of one file
  // and a chip that could not be drawn says nothing about the page, or the reverse.
  //
  // **Only a 422 is remembered**, and the asymmetry is B39's rather than a shortcut. A
  // render failure is a property of the bytes — a corrupt or password-protected PDF stays
  // one — and re-asking costs a real pdf.js render, so it is worth not repeating. A file
  // that is simply *not there* is a property of the moment: a OneDrive file finishing its
  // download makes it there, and a page that never came back until the app was restarted
  // is the failure B39 exists to prevent. That re-ask costs one 404 from
  // `resolveAttachment`, which never reaches the render pipeline at all.
  const remembered = failedThumbnails.get(`page:${target}`);
  if (typeof remembered === "string") {
    showPdfProblem(box, target, remembered);
  } else {
    redrawControls();
    draw(1);
    // Asked in parallel with the page itself rather than in front of it: both need the
    // same pdf.js render on a cold cache, and `ensureThumbnail` collapses the two into
    // one — so the picture is never held up waiting for a number it does not need.
    void window.emqnote.pdfPageCount(target).then((count) => {
      if (count === null) return;
      pages = count;
      redrawControls();
    });
  }

  // The same draw-time question every other embed asks (B39). A PDF that is simply gone
  // must say so rather than sit as an empty frame — and it arrives without a round trip
  // through the render pipeline, so it usually answers first.
  void checkAttachment(target).then((missing) => {
    if (missing) showPdfProblem(box, target, null);
  });

  return {
    dom: box,
    // Only the bar's own events. `checkbox.ts` and `table-toolbar.ts` both answer `true`
    // unconditionally, but their DOM *is* the widget; here the page beside it must keep
    // reaching ProseMirror, because clicking it is how the embed is selected and deleted.
    stopEvent: (event) => event.target instanceof Node && bar.contains(event.target),
    // ProseMirror drops the NodeView when the embed is deleted, the note is closed or the
    // document is replaced — the last blob URL would otherwise stay alive for the rest of
    // the session, one per PDF per note-open.
    destroy: () => {
      if (drawnUrl !== null) URL.revokeObjectURL(drawnUrl);
      drawnUrl = null;
    },
  };
}

/**
 * Replaces the page with the plain chip it would have been before B43, marked.
 *
 * `reason` is a 422's own message — pdf.js opened the file and could not draw it — and
 * null covers the rest: the file is gone, or the fetch itself failed. `markMissing` is only
 * right for the second, since the first is a statement about a file that is very much
 * there, so the two take different marks for the same reason B36 split 404 from 422.
 */
function showPdfProblem(box: HTMLElement, target: string, reason: string | null): void {
  if (box.dataset.page === "error" || box.dataset.page === "missing") return;

  box.textContent = "";
  box.dataset.page = reason === null ? "missing" : "error";

  const chip = document.createElement("span");
  chip.className = "wiki-embed";
  chip.dataset.target = target;
  chip.textContent = target;
  box.append(chip);

  if (reason === null) {
    markMissing(chip, target);
  } else {
    chip.dataset.thumb = "error";
    chip.title = reason.trim() !== "" ? reason : "Could not render a preview for this file.";
    prependMarker(chip);
  }
}

/**
 * `t` is the window's own translator, for the words on the PDF bar — the same arrangement
 * `table-toolbar.ts` uses and for the same reason: this is the second thing inside the
 * editor that draws words of its own, and a NodeView has no React context to read one
 * from. Absent falls back to English, which is what a test mounting this bare gets.
 */
export function attachmentNodeView(
  node: PMNode,
  _view: EditorView,
  _getPos: () => number | undefined,
  t?: (key: string) => string,
): NodeView {
  const target = node.attrs.target as string;
  if (isImageAttachment(target)) return imageView(target);
  return isPreviewableTarget(target) ? pdfPageView(target, t) : chipView(target);
}

/**
 * `image`'s two faces: a label, and — since B50 — the picture itself once main has it.
 *
 * An `image` node in this app only ever holds a *remote* address; an attachment is a
 * `wikiEmbed` instead (`insert-attachment.ts`). The CSP allows no remote image source in
 * either window and still does not: what changed is that main will fetch the address
 * itself, through the same allowlist a pasted image goes through, cache the bytes outside
 * the vault and serve them over `emqnote-remote://`. So the renderer never reaches the
 * network, the note still reads offline once it has been read once, and the objection the
 * old comment here recorded — "a note that quietly fetches from it every time it is opened
 * is a tracking pixel with extra steps" — is answered by *where* the fetch happens and by
 * the Settings switch that turns it off, not by refusing to draw the picture.
 *
 * `img-src` was deliberately not widened to `https:`, which would have been the one-line
 * version of this and would have put the fetching back in the renderer, on every open, with
 * no cache and no way to say no.
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

/**
 * The chip opens its address, on a plain click.
 *
 * Not every `![…](…)` in a vault points at a picture. `![](https://www.youtube.com/watch?v=…)`
 * is a shape imported notes are full of — a video written with the image spelling — and
 * before this the chip drawn for it was the one thing in a note that could be seen and not
 * reached: no listener at all, so a click made an invisible `NodeSelection` and a Mod+click
 * found no link *mark* to resolve.
 *
 * A plain click, deliberately, unlike a weblink in prose (B33). The rule there is that the
 * link's own text has to stay editable, so the caret must win the plain click; a chip is an
 * atom with no text to put a caret in, and its neighbours in this file — `chipView`,
 * `wikiLinkNodeView` — have always opened on a plain click for exactly that reason.
 *
 * The scheme is decided again in main (`isOpenableUrl`, `remote-image.ts`), which refuses
 * everything but http(s) — so a `data:` src, which this node can also hold, declines
 * silently rather than being filtered twice.
 */
export function externalImageView(node: PMNode, loadRemoteImages = true): NodeView {
  const span = document.createElement("span");
  span.className = "external-image";
  span.textContent = externalImageLabel(node);

  const src = (node.attrs.src as string | null) ?? "";
  span.title = src;

  // Held down, not clicked — the same reason `wikiLinkNodeView` does it: `mousedown` is
  // what ProseMirror uses to decide it should select the atom under the pointer.
  const hold = (event: Event): void => event.preventDefault();
  const open = (event: Event): void => {
    event.preventDefault();
    if (src !== "") void window.emqnote.openExternal(src);
  };
  span.addEventListener("mousedown", hold);
  span.addEventListener("click", open);

  // The chip is what is drawn *first*, and what stays if anything goes wrong (B50). The
  // picture takes its place only once a real load has succeeded, so a refusal in main, the
  // setting being off, or being offline on a cold cache all end in the state this NodeView
  // has always had — no flash of a broken image, and nothing to undo.
  //
  // A `data:` address goes the same way rather than straight into an `<img>`: the capture
  // window's CSP allows no `data:` in `img-src` (only the library's does), so the short cut
  // would draw in one window and not the other — and through main the bytes are sniffed and
  // capped like everything else.
  //
  // A probe `Image` rather than a `fetch`: nothing here needs a status code (B36's reason
  // for fetching a thumbnail), and staying on `<img>` is what lets `emqnote-remote` do
  // without `corsEnabled` — the privilege whose absence has silently killed a feature twice.
  //
  // The same element is reused rather than wrapped in one. A NodeView cannot swap the
  // element ProseMirror mounted, and `paste-images.ts`'s `image-pending` decoration lands
  // on exactly that element — a wrapper would have quietly moved the marker off the chip
  // it marks. So the span changes what it *is*: `.wiki-embed-image-box`, the class
  // `imageView` already uses for a picture that may have to become a chip again.
  // `loadRemoteImages` is the window's own copy of the setting, and the reason the
  // renderer holds one at all is a measurement: main refuses the request correctly when the
  // switch is off, but Chromium answers a *repeat* of a URL it has already drawn out of its
  // own image cache without going near the protocol handler, `no-store` and all. So a note
  // reopened after switching it off went on showing its pictures. Main stays the authority —
  // nothing here can talk it into serving one — and this is what stops the question being
  // asked a second time in a session where the answer is now no.
  if (loadRemoteImages && isFetchableImageSrc(src)) {
    const url = attachmentUrl("emqnote-remote", src);
    const probe = new Image();
    probe.addEventListener("load", () => {
      const picture = document.createElement("img");
      picture.className = "wiki-embed-image";
      picture.src = url;
      picture.alt = externalImageLabel(node);
      picture.title = src;
      picture.draggable = true;

      span.textContent = "";
      span.classList.remove("external-image");
      span.classList.add("wiki-embed-image-box");
      span.removeAttribute("title");
      // A picture is not a chip: clicking one should select the node so it can be deleted,
      // exactly as every other inline picture in a note does, rather than raise a browser.
      span.removeEventListener("mousedown", hold);
      span.removeEventListener("click", open);
      span.append(picture);
    });
    probe.src = url;
  }

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
  const url = attachmentUrl("emqnote-thumb", target);

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
  setChipLabel(span, label);
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
  prependMarker(span);
}

/**
 * Whether a `[[…]]` target names a *file* rather than a note — the question that decides
 * whether the missing-attachment marker applies at all.
 *
 * An extension, and not a note's own extension. That is deliberately looser than
 * `isPreviewableTarget` and deliberately tighter than "everything": a `[[Some Note]]` or
 * a `[[01 Projecten/Rules]]` is a note link, whose target may perfectly reasonably not
 * exist yet (B35's own reasoning for why that case stays understated), and asking about
 * one would draw a warning on a link that is doing nothing wrong. A `.pdf`, a `.docx` or
 * a `.zip` names a file, and a file that is not there is a fact worth showing without
 * being clicked first.
 *
 * `.md`/`.markdown` are excluded for the same reason `resolveAttachment` excludes them:
 * a path-form note link is a note link, whichever way it is spelled.
 */
const NOTE_EXTENSIONS = new Set([".md", ".markdown"]);

export function namesAFile(target: string): boolean {
  const slash = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\"));
  const dot = target.lastIndexOf(".");
  if (dot <= slash + 1) return false;

  return !NOTE_EXTENSIONS.has(target.slice(dot).toLowerCase());
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

  // Only for a target that names a file. A note link keeps B35's click-time answer, for
  // the reason `styles.css`'s own note on `[data-link="missing"]` gives: resolving one
  // needs the whole index, and a note that has not been written yet is a normal thing for
  // a link to point at, not something to be told off about before it is even clicked.
  if (namesAFile(target)) {
    void checkAttachment(target).then((missing) => {
      if (missing) markMissing(span, target);
    });
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
        markMissing(span, target);
        span.title = `Nothing in this vault is called "${target}".`;
      } else {
        // The click is the better answer of the two — it just found the thing — so it
        // clears a marker the draw-time check may have drawn, glyph and all. Never the
        // B36 one: `data-thumb="error"` wears the same glyph for a different complaint
        // (a PDF that opens fine and still cannot be drawn), and that is still true.
        const wasMissing = span.dataset.link === "missing";
        delete span.dataset.link;
        if (wasMissing && span.dataset.thumb !== "error") {
          span.querySelector(".wiki-link-error-marker")?.remove();
        }
      }
    });
  });

  return { dom: span };
}
