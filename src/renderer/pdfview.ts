import * as pdfjsLib from "pdfjs-dist";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";
// Same `?url` form and the same reason as `thumb.ts`: the worker needs a URL to build
// itself from, and this one lands same-origin under the page's own CSP.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { attachmentUrl } from "../shared/attachment-url.js";
import { fitScale } from "../shared/pdf-fit.js";
import type { PdfViewTarget } from "../shared/pdf-view-ipc.js";
import "./pdfview.css";

/**
 * The PDF viewer window (B40) — the answer to "a PDF in a note is only a thumbnail".
 *
 * It is a whole window rather than a paged widget inside the note for two reasons. The
 * expensive one: `pdf-thumb.ts`'s queue is a single slot serving the whole app, so an
 * in-note viewer would have had to grow a per-page render/cache pipeline through it, and
 * every page turn would have cost an IPC round trip carrying a PNG. Here the document is
 * parsed once, in this window's own process, and stays open — a page turn is a scroll.
 * The cheap one: scrolling a long document inside a ProseMirror atom is a fight with the
 * editor over the wheel, the caret and the selection, and none of that fight buys the
 * reader anything.
 *
 * Nothing about the thumbnail pipeline changes. The chip in the note is still B36's
 * first-page render; this is what clicking it now opens.
 */

declare global {
  interface Window {
    emqnotePdfView: {
      onOpen: (handler: (target: PdfViewTarget) => void) => () => void;
      openExternally: () => void;
    };
  }
}

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Zoom = "fit-width" | "fit-page" | number;

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** Space the page column leaves either side of a page, matching `.pdfview-scroll`. */
const GUTTER = 32;

interface PageBox {
  element: HTMLDivElement;
  /** Unscaled size. Page 1's, until this page has actually been measured. */
  width: number;
  height: number;
  measured: boolean;
  task: RenderTask | null;
  rendered: boolean;
}

const root = document.getElementById("root")!;

const toolbar = document.createElement("div");
toolbar.className = "pdfview-toolbar";

const previous = button("◀", "Previous page");
const next = button("▶", "Next page");

const counter = document.createElement("div");
counter.className = "pdfview-counter";
const pageInput = document.createElement("input");
pageInput.type = "text";
pageInput.inputMode = "numeric";
pageInput.value = "–";
pageInput.setAttribute("aria-label", "Page number");
const pageTotal = document.createElement("span");
pageTotal.textContent = "/ –";
counter.append(pageInput, pageTotal);

const zoomSelect = document.createElement("select");
zoomSelect.title = "Zoom";
for (const [value, label] of [
  ["fit-width", "Fit width"],
  ["fit-page", "Fit page"],
  ...ZOOM_STEPS.map((step) => [String(step), `${Math.round(step * 100)}%`]),
] as [string, string][]) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  zoomSelect.append(option);
}

const spacer = document.createElement("div");
spacer.className = "pdfview-spacer";

const externally = button("⧉", "Open in system viewer");
externally.append(document.createTextNode(" Open in system viewer"));

toolbar.append(previous, next, counter, zoomSelect, spacer, externally);

const scroller = document.createElement("div");
scroller.className = "pdfview-scroll";

root.append(toolbar, scroller);

let doc: PDFDocumentProxy | null = null;
// Held beside `doc` because `destroy()` lives on the loading task, not on the resolved
// proxy — the same pdf.js asymmetry `thumb.ts`'s own `finally` block documents. Without
// this the worker-side document of every PDF opened this session would stay alive.
let loading: PDFDocumentLoadingTask | null = null;
let boxes: PageBox[] = [];
let zoom: Zoom = "fit-width";
let currentPage = 1;
/** Bumped on every `open()`, so a fetch or a render still in flight for the previous document lands nowhere. */
let generation = 0;

function button(label: string, title: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.title = title;
  return element;
}

function message(text: string): void {
  scroller.replaceChildren();
  const element = document.createElement("p");
  element.className = "pdfview-message";
  element.textContent = text;
  scroller.append(element);
}

/**
 * Tears the current document down. Cancelling the in-flight render tasks first is what
 * keeps a page from drawing into a canvas that has already been detached — pdf.js resolves
 * a cancelled task by rejecting, which `renderPage` swallows.
 */
function teardown(): void {
  for (const box of boxes) box.task?.cancel();
  boxes = [];
  scroller.replaceChildren();
  const previous = loading;
  doc = null;
  loading = null;
  void previous?.destroy();
}

function scaleFor(box: PageBox): number {
  if (typeof zoom === "number") return zoom;

  const width = scroller.clientWidth - GUTTER;
  if (zoom === "fit-width") return Math.max(0.05, width / box.width);

  // Fit page is the one place upscaling is right: a small page in a maximised window
  // should fill it rather than sit in the middle as a stamp.
  const height = scroller.clientHeight - GUTTER;
  return Math.max(0.05, fitScale(box.width, box.height, width, height, { allowUpscale: true }));
}

/** Sizes a page's placeholder so the scrollbar is right before anything has been drawn. */
function layout(box: PageBox): void {
  const scale = scaleFor(box);
  box.element.style.width = `${Math.round(box.width * scale)}px`;
  box.element.style.height = `${Math.round(box.height * scale)}px`;
}

function relayout(): void {
  for (const box of boxes) {
    box.task?.cancel();
    box.task = null;
    box.rendered = false;
    box.element.replaceChildren();
    layout(box);
  }
  renderVisible();
}

async function renderPage(index: number): Promise<void> {
  const box = boxes[index];
  if (doc === null || box === undefined || box.rendered) return;
  box.rendered = true;

  const mine = generation;
  let page: PDFPageProxy;
  try {
    page = await doc.getPage(index + 1);
  } catch {
    box.rendered = false;
    return;
  }
  if (mine !== generation) return;

  // The placeholder was sized from page 1. A document whose pages differ — a landscape
  // plan in a portrait report — corrects itself here, once, the first time the page is
  // actually drawn.
  if (!box.measured) {
    const unscaled = page.getViewport({ scale: 1 });
    box.width = unscaled.width;
    box.height = unscaled.height;
    box.measured = true;
    layout(box);
  }

  const viewport = page.getViewport({ scale: scaleFor(box) });
  const ratio = Math.min(2, window.devicePixelRatio || 1);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width * ratio));
  canvas.height = Math.max(1, Math.round(viewport.height * ratio));
  const context = canvas.getContext("2d");
  if (context === null) return;

  box.element.replaceChildren(canvas);

  const task = page.render({
    canvas,
    canvasContext: context,
    viewport,
    transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
  });
  box.task = task;

  try {
    await task.promise;
  } catch {
    // Cancelled by a zoom change or a new document — the next pass draws it.
    if (mine === generation && box.task === task) box.rendered = false;
  } finally {
    if (box.task === task) box.task = null;
    page.cleanup();
  }
}

/**
 * Draws whatever is on screen, plus one page either side so a scroll does not chase the
 * render. Called on scroll rather than from an `IntersectionObserver` because the scroll
 * handler has to run anyway to keep the page counter honest, and one pass is cheaper than
 * two mechanisms disagreeing about which page is "current".
 */
function renderVisible(): void {
  if (boxes.length === 0) return;

  const top = scroller.scrollTop;
  const bottom = top + scroller.clientHeight;

  let first = boxes.length - 1;
  let last = 0;
  for (const [index, box] of boxes.entries()) {
    const boxTop = box.element.offsetTop - scroller.offsetTop;
    const boxBottom = boxTop + box.element.offsetHeight;
    if (boxBottom < top || boxTop > bottom) continue;
    first = Math.min(first, index);
    last = Math.max(last, index);
  }

  for (let index = Math.max(0, first - 1); index <= Math.min(boxes.length - 1, last + 1); index += 1) {
    void renderPage(index);
  }
}

/** Which page the reader is actually looking at: the one under the middle of the viewport. */
function pageAtViewport(): number {
  const middle = scroller.scrollTop + scroller.clientHeight / 2;
  for (const [index, box] of boxes.entries()) {
    const boxTop = box.element.offsetTop - scroller.offsetTop;
    if (middle < boxTop + box.element.offsetHeight) return index + 1;
  }
  return boxes.length;
}

function setCurrentPage(page: number): void {
  if (page === currentPage) return;
  currentPage = page;
  if (document.activeElement !== pageInput) pageInput.value = String(page);
  previous.disabled = page <= 1;
  next.disabled = page >= boxes.length;
}

function goToPage(page: number): void {
  const clamped = Math.min(Math.max(1, page), boxes.length);
  const box = boxes[clamped - 1];
  if (box === undefined) return;
  scroller.scrollTo({ top: box.element.offsetTop - scroller.offsetTop - 8 });
}

async function open(target: PdfViewTarget): Promise<void> {
  generation += 1;
  const mine = generation;

  teardown();
  document.title = target.name;
  message("Loading…");

  let bytes: Uint8Array;
  try {
    const response = await fetch(attachmentUrl("emqnote-attachment", target.name));
    if (!response.ok) throw new Error(`the vault answered ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error: unknown) {
    if (mine !== generation) return;
    message(`${target.name} could not be read — ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (mine !== generation) return;

  const task = pdfjsLib.getDocument({ data: bytes });
  let loaded: PDFDocumentProxy;
  try {
    loaded = await task.promise;
  } catch (error: unknown) {
    // `destroy()` has to run even when the promise rejected — a corrupt file never
    // reaches `loaded` at all, but the worker-side document exists regardless.
    void task.destroy();
    if (mine !== generation) return;
    message(`${target.name} is not a PDF this viewer can read — ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (mine !== generation) {
    void task.destroy();
    return;
  }

  doc = loaded;
  loading = task;
  scroller.replaceChildren();

  // Page 1 sizes every placeholder. Measuring all of them up front would mean one
  // `getPage` per page before a single pixel is drawn, which on a long document is a
  // visible wait for information that only matters when a page is scrolled to anyway.
  const first = await loaded.getPage(1);
  const unscaled = first.getViewport({ scale: 1 });
  first.cleanup();
  if (mine !== generation) return;

  boxes = Array.from({ length: loaded.numPages }, () => {
    const element = document.createElement("div");
    element.className = "pdfview-page";
    scroller.append(element);
    return {
      element,
      width: unscaled.width,
      height: unscaled.height,
      measured: false,
      task: null,
      rendered: false,
    };
  });
  if (boxes[0] !== undefined) boxes[0].measured = true;

  pageTotal.textContent = `/ ${loaded.numPages}`;
  currentPage = 0;
  setCurrentPage(1);
  scroller.scrollTop = 0;

  for (const box of boxes) layout(box);
  renderVisible();
}

scroller.addEventListener("scroll", () => {
  setCurrentPage(pageAtViewport());
  renderVisible();
});

window.addEventListener("resize", () => {
  if (typeof zoom !== "number") relayout();
});

previous.addEventListener("click", () => goToPage(currentPage - 1));
next.addEventListener("click", () => goToPage(currentPage + 1));
externally.addEventListener("click", () => window.emqnotePdfView.openExternally());

zoomSelect.addEventListener("change", () => {
  const value = zoomSelect.value;
  zoom = value === "fit-width" || value === "fit-page" ? value : Number(value);
  relayout();
  goToPage(currentPage);
});

pageInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const wanted = Number(pageInput.value.trim());
  if (Number.isFinite(wanted)) goToPage(wanted);
  pageInput.value = String(currentPage);
  pageInput.blur();
});

pageInput.addEventListener("blur", () => {
  pageInput.value = String(currentPage);
});

document.addEventListener("keydown", (event) => {
  if (event.target === pageInput) return;

  const step = (delta: number): void => {
    event.preventDefault();
    goToPage(currentPage + delta);
  };

  if (event.key === "PageDown") step(1);
  else if (event.key === "PageUp") step(-1);
  else if (event.key === "Home") {
    event.preventDefault();
    goToPage(1);
  } else if (event.key === "End") {
    event.preventDefault();
    goToPage(boxes.length);
  } else if (event.key === "Escape") {
    window.close();
  }
});

window.emqnotePdfView.onOpen((target) => {
  void open(target);
});
