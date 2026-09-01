// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { attachImageResize, type ImageResize } from "../src/renderer/editor/image-resize.js";

/**
 * How a size the *file* states is written onto the picture (B74's `|400` and `|400x300`,
 * B98's fix to the second of them).
 *
 * Its own file rather than an addition to `image-resize.test.ts`, which is deliberately
 * the arithmetic half — numbers in, a number out, no environment at all. This is about
 * what lands in `img.style`, which needs a DOM and nothing else: jsdom cannot lay a
 * picture out and so cannot answer what the browser then *draws*, and that half is
 * `drive:capture`'s (it opens a real window and measures the rectangle).
 *
 * The report behind it: `![|1282x293](data:image/png;base64,…)` — the shape Word and
 * Outlook write — scaled only sideways as the window narrowed. `.wiki-embed-image` carries
 * `max-width: 100%`, so the width came down with the column while an inline
 * `height: 293px` stood, beating the stylesheet's own `height: auto` as an inline
 * declaration always will.
 */

/** The two elements a NodeView hands `attachImageResize`, with no ProseMirror behind them. */
function picture(): { box: HTMLElement; img: HTMLImageElement; resize: ImageResize } {
  const box = document.createElement("span");
  box.className = "wiki-embed-image-box";
  const img = document.createElement("img");
  img.className = "wiki-embed-image";
  box.append(img);

  // `view` and `getPos` are only read by the drag and by `commit`; `show` touches neither,
  // which is the whole reason this can be asked without a document.
  const resize = attachImageResize({
    box,
    img,
    view: undefined as never,
    getPos: () => undefined,
  });
  return { box, img, resize };
}

describe("a picture drawn at the size the file gives it", () => {
  it("writes a width and a height as a ratio, so the column can narrow both", () => {
    const { box, img, resize } = picture();

    resize.show({ width: 1282, height: 293 });

    expect(img.style.width).toBe("1282px");
    // The fix, and the assertion the bug fails: a pixel height cannot follow a width that
    // `max-width: 100%` has pulled in, and an inline one cannot be overridden by the
    // stylesheet either. `aspect-ratio` states the shape without stating a size, so the
    // picture draws exactly 1282×293 in a wide enough column and keeps its proportions in
    // any narrower one.
    expect(img.style.getPropertyValue("aspect-ratio")).toBe("1282 / 293");
    expect(img.style.height).toBe("auto");
    // Unchanged: the box says it has been sized, which is what stands `max-height: 480px`
    // down in the stylesheet.
    expect(box.dataset.sized).toBe("true");
  });

  it("leaves the height alone entirely when the file states only a width", () => {
    const { box, img, resize } = picture();

    resize.show({ width: 400, height: null });

    expect(img.style.width).toBe("400px");
    // A bare `|400` means "this wide, its own shape" — so nothing is said about the height
    // and the stylesheet's `height: auto` carries it. Stating a ratio here would be this
    // app inventing proportions from the one number it was given.
    expect(img.style.getPropertyValue("aspect-ratio")).toBe("");
    expect(img.style.height).toBe("");
    expect(box.dataset.sized).toBe("true");
  });

  it("clears both and stops calling itself sized when the size is taken away", () => {
    const { box, img, resize } = picture();

    resize.show({ width: 1282, height: 293 });
    // Double-clicking a handle is the one way back to the picture's own size, and it must
    // leave nothing behind — a stale `aspect-ratio` would go on shaping a picture that no
    // longer has a stored size at all.
    resize.show({ width: null, height: null });

    expect(img.style.width).toBe("");
    expect(img.style.getPropertyValue("aspect-ratio")).toBe("");
    expect(img.style.height).toBe("");
    expect(box.dataset.sized).toBeUndefined();
  });
});
