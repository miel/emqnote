// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOMParser, type Node as PMNode } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { closeHistory, undo } from "prosemirror-history";
import { schema } from "../src/markdown/schema.js";
import { serializeBody } from "../src/markdown/index.js";
import { createEditorState } from "../src/renderer/editor/state.js";
import { externalImageView } from "../src/renderer/editor/attachment-view.js";
import {
  MAX_IMAGES_PER_PASTE,
  transformPastedImages,
} from "../src/renderer/editor/paste-images.js";

/**
 * Pasting a web page and its pictures.
 *
 * A real `EditorView` with the real plugin list (`createEditorState`), because the
 * whole point of the design is what happens to a *position* while a download is in the
 * air — and positions only drift once there is a document being edited around them.
 *
 * Driven without a fake `ClipboardEvent`: the slice is built from real DOM exactly as
 * `prosemirror-view` builds it, run through `transformPastedImages` (which the view
 * calls as `transformPasted`), and dispatched with the `paste` meta the view sets.
 */

interface Pending {
  url: string;
  settle: (name: string | null) => void;
  reject: (error: Error) => void;
}

let pending: Pending[] = [];
let fetchRemoteImage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  pending = [];
  fetchRemoteImage = vi.fn(
    (url: string) =>
      new Promise<string | null>((resolve, reject) => {
        pending.push({ url, settle: resolve, reject });
      }),
  );

  (window as unknown as { emqnote: unknown }).emqnote = { fetchRemoteImage };
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const doc = schema.nodes.doc!.create(null, [schema.nodes.paragraph!.create()]);
  return new EditorView(host, {
    state: createEditorState(doc, {
      openLinkPrompt: () => undefined,
      requestImage: () => undefined,
      requestFile: () => undefined,
      requestNoteLink: () => undefined,
      requestTable: () => undefined,
    }),
    // As `Editor.tsx` registers it — the chip a remote image is drawn as, and what the
    // `image-pending` decoration has to reach. `false` for B50's own setting: this file is
    // about the paste pipeline, and a NodeView that started probing `emqnote-remote://`
    // would be asking a protocol that does not exist under jsdom.
    nodeViews: { image: (node, view, getPos) => externalImageView(node, view, getPos, false) },
  });
}

/** What `prosemirror-view` does on a real paste, minus the `ClipboardEvent`. */
function paste(view: EditorView, html: string): void {
  const dom = document.createElement("div");
  dom.innerHTML = html;
  const slice = DOMParser.fromSchema(schema).parseSlice(dom);

  view.dispatch(
    view.state.tr.replaceSelection(transformPastedImages(slice)).setMeta("paste", true),
  );
}

function nodesOfType(doc: PMNode, name: string): { pos: number; node: PMNode }[] {
  const found: { pos: number; node: PMNode }[] = [];
  doc.descendants((node, pos) => {
    if (node.type === schema.nodes[name]) found.push({ pos, node });
    return true;
  });
  return found;
}

/** Lets the `fetchRemoteImage` promise's `then` run. */
const settled = (): Promise<void> => Promise.resolve().then(() => undefined);

describe("pasting an image already stored in this vault", () => {
  it("becomes a wikiEmbed synchronously, and is never downloaded", () => {
    const view = mount();
    paste(view, '<p>Zie: <img src="emqnote-attachment://2026-08-06-1412-foto.png"></p>');

    expect(serializeBody(view.state.doc)).toBe("Zie: ![[2026-08-06-1412-foto.png]]\n");
    expect(fetchRemoteImage).not.toHaveBeenCalled();
    view.destroy();
  });

  it("decodes a name the browser percent-encoded", () => {
    const view = mount();
    paste(view, '<p><img src="emqnote-attachment://2026-08-06-1412-foto%20(2).png"></p>');

    expect(nodesOfType(view.state.doc, "wikiEmbed")[0]?.node.attrs.target).toBe(
      "2026-08-06-1412-foto (2).png",
    );
    view.destroy();
  });
});

describe("pasting a remote image", () => {
  it("leaves the image node in place and asks main for it exactly once", () => {
    const view = mount();
    paste(view, '<p>Kop <img src="https://example.com/logo.png" alt="Logo"></p>');

    expect(nodesOfType(view.state.doc, "image")).toHaveLength(1);
    expect(fetchRemoteImage).toHaveBeenCalledTimes(1);
    expect(fetchRemoteImage).toHaveBeenCalledWith("https://example.com/logo.png");
    view.destroy();
  });

  it("swaps in the stored attachment when the download lands", async () => {
    const view = mount();
    paste(view, '<p>Kop <img src="https://example.com/logo.png"></p>');

    pending[0]!.settle("2026-08-06-1412-logo.png");
    await settled();

    expect(serializeBody(view.state.doc)).toBe("Kop ![[2026-08-06-1412-logo.png]]\n");
    view.destroy();
  });

  it("lands at the right place even after the text in front of it has moved", async () => {
    // The reason the plugin tracks a `DecorationSet` and not a position: a download
    // takes seconds, and the user goes on typing while it is in the air.
    const view = mount();
    paste(view, '<p>Kop <img src="https://example.com/logo.png"></p>');

    const before = nodesOfType(view.state.doc, "image")[0]!.pos;
    view.dispatch(view.state.tr.insertText("Nieuwe tekst — ", 1));
    expect(nodesOfType(view.state.doc, "image")[0]!.pos).toBeGreaterThan(before);

    pending[0]!.settle("2026-08-06-1412-logo.png");
    await settled();

    expect(serializeBody(view.state.doc)).toBe(
      "Nieuwe tekst — Kop ![[2026-08-06-1412-logo.png]]\n",
    );
    view.destroy();
  });

  it("leaves the remote image exactly as it was when main refuses", async () => {
    const view = mount();
    paste(view, '<p><img src="https://example.com/logo.png" alt="Logo"></p>');

    pending[0]!.settle(null);
    await settled();

    const images = nodesOfType(view.state.doc, "image");
    expect(images).toHaveLength(1);
    expect(images[0]!.node.attrs.src).toBe("https://example.com/logo.png");
    expect(serializeBody(view.state.doc)).toBe("![Logo](https://example.com/logo.png)\n");
    view.destroy();
  });

  it("does nothing at all when the image was deleted before the download landed", async () => {
    const view = mount();
    paste(view, '<p>Kop <img src="https://example.com/logo.png"></p>');

    const at = nodesOfType(view.state.doc, "image")[0]!.pos;
    view.dispatch(view.state.tr.delete(at, at + 1));
    expect(nodesOfType(view.state.doc, "image")).toHaveLength(0);

    pending[0]!.settle("2026-08-06-1412-logo.png");
    await settled();

    expect(serializeBody(view.state.doc)).toBe("Kop\n");
    expect(nodesOfType(view.state.doc, "wikiEmbed")).toHaveLength(0);
    view.destroy();
  });

  it("survives the whole document being emptied underneath it", async () => {
    const view = mount();
    paste(view, '<p>Kop <img src="https://example.com/logo.png"></p>');

    view.dispatch(view.state.tr.delete(0, view.state.doc.content.size));
    pending[0]!.settle("2026-08-06-1412-logo.png");
    await settled();

    expect(nodesOfType(view.state.doc, "wikiEmbed")).toHaveLength(0);
    view.destroy();
  });

  it("does not fall over when the request itself rejects", async () => {
    const view = mount();
    paste(view, '<p><img src="https://example.com/logo.png"></p>');

    pending[0]!.reject(new Error("offline"));
    await settled();
    await settled();

    expect(nodesOfType(view.state.doc, "image")).toHaveLength(1);
    view.destroy();
  });
});

describe("what is never requested", () => {
  it("never asks for a cid: image — that belongs to email import", () => {
    const view = mount();
    paste(view, '<p><img src="cid:image001.png@01DA6F3B"></p>');

    expect(fetchRemoteImage).not.toHaveBeenCalled();
    expect(nodesOfType(view.state.doc, "image")).toHaveLength(1);
    view.destroy();
  });

  it("never asks for file:, blob: or a relative address", () => {
    const view = mount();
    paste(
      view,
      '<p><img src="file:///etc/passwd"><img src="blob:https://x/2f"><img src="images/a.png"></p>',
    );

    expect(fetchRemoteImage).not.toHaveBeenCalled();
    view.destroy();
  });

  it("stops asking past the per-paste cap", () => {
    const view = mount();
    const images = Array.from(
      { length: MAX_IMAGES_PER_PASTE + 2 },
      (_unused, index) => `<img src="https://example.com/${index}.png">`,
    ).join("");
    paste(view, `<p>${images}</p>`);

    expect(fetchRemoteImage).toHaveBeenCalledTimes(MAX_IMAGES_PER_PASTE);
    view.destroy();
  });
});

describe("what it looks like while it is happening", () => {
  it("draws a label rather than a broken image, marked while the download is in the air", async () => {
    // No `<img>` at all: the CSP allows no remote source, so the glyph would be a
    // broken one. The `image-pending` class is the decoration, and it has to reach the
    // NodeView's own DOM or the CSS in `styles.css` marks nothing.
    const view = mount();
    paste(view, '<p><img src="https://example.com/logo.png" alt="Het logo"></p>');

    const span = view.dom.querySelector(".external-image");
    expect(span?.textContent).toBe("Het logo");
    // ProseMirror's own zero-width `img.ProseMirror-separator` is not ours.
    expect(view.dom.querySelector("img:not(.ProseMirror-separator)")).toBeNull();
    expect(span?.classList.contains("image-pending")).toBe(true);

    pending[0]!.settle(null);
    await settled();

    expect(view.dom.querySelector(".external-image")?.classList.contains("image-pending")).toBe(
      false,
    );
    view.destroy();
  });

  it("falls back to the host name when the image has no alt text", () => {
    const view = mount();
    paste(view, '<p><img src="https://cdn.example.com/a/b.png"></p>');

    expect(view.dom.querySelector(".external-image")?.textContent).toBe("cdn.example.com");
    view.destroy();
  });
});

describe("undo", () => {
  it("takes the paste away in one press, not a bookkeeping step first", async () => {
    // The marker transactions carry `addToHistory: false`, so Ctrl+Z straight after a
    // paste undoes the paste — and the download landing afterwards then finds nothing
    // and does nothing, rather than putting a picture back into a note that no longer
    // has one.
    const view = mount();
    view.dispatch(view.state.tr.insertText("Voor"));
    // The paste has to be its own undo step for this to say anything; typing and
    // pasting within half a second are one event to `prosemirror-history` otherwise.
    view.dispatch(closeHistory(view.state.tr));
    paste(view, ' <img src="https://example.com/logo.png">');
    expect(nodesOfType(view.state.doc, "image")).toHaveLength(1);

    undo(view.state, view.dispatch);
    expect(serializeBody(view.state.doc)).toBe("Voor\n");

    pending[0]!.settle("2026-08-06-1412-logo.png");
    await settled();

    expect(serializeBody(view.state.doc)).toBe("Voor\n");
    view.destroy();
  });
});
