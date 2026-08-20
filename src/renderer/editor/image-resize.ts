import type { Node as PMNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { normaliseDimension } from "../../markdown/embed-field.js";

/**
 * Dragging a picture smaller by one of its corners (B74).
 *
 * Two halves, and they are separated on purpose. `resizeWidth` is arithmetic over numbers
 * and is tested directly; `attachImageResize` is the part that genuinely is about the
 * mouse — which listeners go on, when they come off, and what reaches ProseMirror. That is
 * `table-geometry.ts` beside `table-drag.ts`, for the same reason: `getBoundingClientRect`
 * needs a laid-out document and the test environment has no layout at all.
 *
 * **The proportions are locked**, so a drag decides a *width* and the height follows.
 * This app therefore never invents a height of its own: a picture it sized reads `|400` in
 * the file, one number, because a stored height it made up could disagree with the picture
 * the moment the file behind it is replaced.
 *
 * **A height somebody else wrote is a different matter and is kept.** Obsidian's
 * `![[foto.png|250x180]]` says a box, possibly a distorted one, and that was a deliberate
 * act by whoever wrote it. So a drag on such a picture scales *both* numbers by the same
 * factor and writes `|WxH` back — undistorting somebody's picture because they happened to
 * grab a corner would be this app deciding something it cannot know. Only a picture with
 * no stored height is dragged to a bare width.
 *
 * **The transaction lands once, on release.** During the drag the width goes onto
 * `img.style` and nowhere else, so a drag is one undo step rather than one per pixel, and
 * a picture the user drags and then thinks better of costs the file nothing until the
 * button comes up.
 */

/** Which corner is being held. The letters are the compass points they sit at. */
export type ResizeCorner = "nw" | "ne" | "sw" | "se";

export const RESIZE_CORNERS: readonly ResizeCorner[] = ["nw", "ne", "sw", "se"];

/** The narrowest a drag may make a picture — below this there is nothing left to grab. */
export const MIN_DRAG_WIDTH = 40;

/**
 * The width a drag has reached, from where it started and how far the pointer has moved.
 *
 * **The dominant axis wins.** A corner handle can be pushed in two directions at once and
 * the proportions are locked, so the two disagree about the answer: `dx` says one width and
 * `dy` says another. Taking whichever moved further — in width terms, so `dy` is converted
 * through the picture's own ratio first — means a horizontal drag tracks the pointer
 * exactly, a vertical drag tracks it exactly, and a diagonal one follows the hand rather
 * than averaging the two into something that keeps up with neither. Averaging was the
 * obvious alternative and makes a straight sideways drag move at half speed.
 *
 * A west handle grows the picture when the pointer goes *left*, and a north one when it
 * goes *up*; that is all the signs are.
 */
export function resizeWidth(
  startWidth: number,
  dx: number,
  dy: number,
  corner: ResizeCorner,
  ratio: number,
  max: number,
): number {
  const horizontal = corner === "ne" || corner === "se" ? dx : -dx;
  // `ratio` is width ÷ height, so a vertical movement becomes the width that goes with it.
  const vertical = (corner === "sw" || corner === "se" ? dy : -dy) * ratio;

  const delta = Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
  const ceiling = Math.max(MIN_DRAG_WIDTH, Math.round(max));

  return Math.min(ceiling, Math.max(MIN_DRAG_WIDTH, Math.round(startWidth + delta)));
}

/** What the caller has to give this to be able to write a width back into the document. */
export interface ResizeTarget {
  /** The NodeView's own element, which the handles are positioned inside. */
  box: HTMLElement;
  /** The picture. Its rendered size starts the drag and its style shows it running. */
  img: HTMLImageElement;
  view: EditorView;
  getPos: () => number | undefined;
}

/** The two numbers a picture may carry. `height` is only ever one this app did not write. */
export interface ImageSize {
  width: number | null;
  height: number | null;
}

export interface ImageResize {
  /** Draw the stored size, on first render and whenever the attributes change. */
  show: (size: ImageSize) => void;
  /**
   * Whether an event belongs to a handle rather than to the picture.
   *
   * The NodeView's `stopEvent` answers with this rather than `true` unconditionally, unlike
   * `checkbox.ts` and `table-toolbar.ts` whose whole DOM *is* the widget: here the picture
   * beside the handles must go on reaching ProseMirror, or clicking it no longer selects
   * the node and there is no way to delete it.
   */
  owns: (event: Event) => boolean;
  destroy: () => void;
}

function applySize(target: ResizeTarget, size: ImageSize): void {
  target.img.style.width = size.width === null ? "" : `${size.width}px`;
  // Set only when the file says so. Left empty the stylesheet's `height: auto` applies and
  // the picture keeps its own proportions, which is what a bare `|400` means.
  target.img.style.height = size.height === null ? "" : `${size.height}px`;
  // The stylesheet's `max-height` would break the proportions of a picture that has been
  // given an explicit size, so a sized box says so and the rule stands down. An attribute
  // rather than a `style` sniff, so the CSS says what it means.
  if (size.width === null && size.height === null) delete target.box.dataset.sized;
  else target.box.dataset.sized = "true";
}

/**
 * The widest a picture may be dragged: the editor's own text column.
 *
 * Read off the editable element rather than the window, so a narrow note pane in the
 * library is as much of a limit as it looks. There is nothing to be gained from a picture
 * wider than the column it sits in — `max-width: 100%` would only draw it smaller again,
 * and the file would then hold a number that no longer describes what is on screen.
 */
function columnWidth(view: EditorView): number {
  const style = window.getComputedStyle(view.dom);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return Math.max(MIN_DRAG_WIDTH, view.dom.clientWidth - (Number.isFinite(padding) ? padding : 0));
}

export function attachImageResize(target: ResizeTarget): ImageResize {
  const handles = RESIZE_CORNERS.map((corner) => {
    const handle = document.createElement("span");
    handle.className = "image-resize-handle";
    handle.dataset.corner = corner;
    // A handle is furniture, not content: without this the caret can be put inside one
    // and ProseMirror reads it back as a position in the document.
    handle.contentEditable = "false";
    handle.addEventListener("mousedown", (event) => start(event, corner));
    // Back to the picture's own size. The one way out of a width that was a mistake and
    // has since been saved — Ctrl+Z reaches only as far as the session does.
    handle.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      commit({ width: null, height: null });
    });
    target.box.appendChild(handle);
    return handle;
  });

  let stop: (() => void) | null = null;

  /** The node this NodeView is drawing, or `null` if it has since gone. */
  function current(): { pos: number; node: PMNode } | null {
    const pos = target.getPos();
    if (pos === undefined) return null;

    const node = target.view.state.doc.nodeAt(pos);
    return node === null ? null : { pos, node };
  }

  function commit(size: ImageSize): void {
    applySize(target, size);

    const here = current();
    if (here === null) return;

    const width = normaliseDimension(size.width);
    const height = width === null ? null : normaliseDimension(size.height);
    if (
      (here.node.attrs.width as number | null) === width &&
      (here.node.attrs.height as number | null) === height
    ) {
      return;
    }

    // A size and Obsidian's alt text share one slot in the file, so writing one drops the
    // other. That is the format's limit and not a choice made here — see `embed-field.ts`
    // — and it is stated rather than left to be discovered: `test/limitations.test.ts`
    // pins it. Only `wikiEmbed` has an `alt` attribute at all; on an `image` the alt is
    // the head of the suffix and survives untouched.
    const attrs: Record<string, unknown> = { ...here.node.attrs, width, height };
    if (here.node.type.name === "wikiEmbed") attrs.alt = null;

    target.view.dispatch(target.view.state.tr.setNodeMarkup(here.pos, undefined, attrs));
  }

  function start(event: MouseEvent, corner: ResizeCorner): void {
    // Ahead of ProseMirror, which reads a `mousedown` on an atom as "select this node" and
    // would otherwise begin one of its own drags with the button already down.
    event.preventDefault();
    event.stopPropagation();
    if (stop !== null) return;

    const rect = target.img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const stored = current()?.node.attrs ?? {};
    const storedWidth = stored.width as number | null | undefined;
    const storedHeight = stored.height as number | null | undefined;

    // The number in the file rather than the one on screen, when there is one: the
    // rendered rectangle includes the picture's 1px border, so starting from it would move
    // a picture two pixels wider on every drag that never moved the pointer.
    const startWidth = storedWidth ?? rect.width;

    // A picture the file gave a height keeps the shape the file gave it, however distorted
    // — see the note at the top of this file. Otherwise the picture's own proportions, and
    // the rendered rectangle as the honest fallback for an `<img>` that has not loaded.
    const boxed = typeof storedWidth === "number" && typeof storedHeight === "number";
    const ratio = boxed
      ? storedWidth / storedHeight
      : target.img.naturalWidth > 0 && target.img.naturalHeight > 0
        ? target.img.naturalWidth / target.img.naturalHeight
        : rect.width / rect.height;

    const originX = event.clientX;
    const originY = event.clientY;
    const max = columnWidth(target.view);
    let size: ImageSize = { width: startWidth, height: boxed ? storedHeight : null };

    // On the window and not on the handle, the reason `table-drag.ts` gives: the button is
    // still down and the pointer leaves the element almost immediately.
    const move = (moved: MouseEvent): void => {
      const width = resizeWidth(
        startWidth,
        moved.clientX - originX,
        moved.clientY - originY,
        corner,
        ratio,
        max,
      );
      // Both numbers by the same factor, so a box the file described stays that shape.
      size = { width, height: boxed ? Math.max(1, Math.round(width / ratio)) : null };
      applySize(target, size);
    };

    const finish = (): void => {
      stop?.();
      commit(size);
    };

    stop = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", finish);
      target.box.classList.remove("image-resizing");
      stop = null;
    };

    target.box.classList.add("image-resizing");
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", finish);
  }

  return {
    show: (size) => applySize(target, size),
    owns: (event) =>
      event.target instanceof Node &&
      handles.some((handle) => handle === event.target || handle.contains(event.target as Node)),
    destroy: () => {
      stop?.();
      for (const handle of handles) handle.remove();
    },
  };
}
