// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { DOMParser, Fragment, Slice } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { schema } from "../src/markdown/schema.js";
import { serializeBody } from "../src/markdown/index.js";
import { createEditorState } from "../src/renderer/editor/state.js";
import { transformPastedImages } from "../src/renderer/editor/paste-images.js";
import { handleListItemPaste } from "../src/renderer/editor/paste-list-item.js";
import { docFromMarkdown, caretAfter } from "./helpers/editing.js";

/**
 * Pasting a task into a list of tasks (B34).
 *
 * The repro first: `_replaceRange` — what `EditorState#tr.replaceSelection` uses
 * whenever a pasted slice does not fit trivially — backs up over `listItem` (it is
 * `defining: true`, `schema.ts:130`) whenever the pasted item's own `checked` differs
 * from the item the caret sits in. The rebuild it performs reuses one node identity
 * for both the untouched half of the target item and the freshly pasted one, so
 * *neither* box ends up where it belongs. `"paste unchecked at start of a checked
 * item, via the default path"` below shows this happening on a real document, asserted
 * on the serialized markdown — that is what told the document-level cause (the fitting
 * algorithm) apart from the render-level one (`checkbox.ts`'s widget key, which never
 * enters into it: nothing here touches a view).
 *
 * `handleListItemPaste` (`paste-list-item.ts`) is `Editor.tsx`'s fix: for the one
 * narrow shape the generic algorithm mishandles — a collapsed caret inside a list item,
 * a slice that is purely one or more whole list items, and at least one box that
 * disagrees — it claims the paste and does the insertion by hand instead of letting
 * `replaceSelection` reach the buggy path at all.
 */

function mount(markdown: string): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const doc = docFromMarkdown(markdown);
  return new EditorView(host, {
    state: createEditorState(doc, {
      openLinkPrompt: () => undefined,
      requestAttachment: () => undefined,
    }),
  });
}

/** The slice a real paste of this HTML would carry, `transformPastedImages` included — matches `test/paste-images.test.ts`'s `paste()` helper shape. */
function sliceFor(html: string) {
  const dom = document.createElement("div");
  dom.innerHTML = html;
  return transformPastedImages(DOMParser.fromSchema(schema).parseSlice(dom));
}

function setCaret(view: EditorView, pos: number): void {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

/** What `prosemirror-view`'s default `doPaste` does once every `handlePaste` prop has declined. */
function pasteViaDefault(view: EditorView, html: string): void {
  view.dispatch(view.state.tr.replaceSelection(sliceFor(html)).setMeta("paste", true));
}

// `handleListItemPaste` never reads the event itself (it decides purely from the
// selection and the already-parsed slice), so a stand-in is enough — jsdom does not
// implement `ClipboardEvent`.
const fakeEvent = {} as ClipboardEvent;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the bug: replaceSelection alone mis-assigns checked across the paste boundary", () => {
  it("paste unchecked at the start of a checked item corrupts both boxes", () => {
    const view = mount("- [ ] Alpha\n- [x] Bravo\n- [ ] Charlie\n");
    setCaret(view, caretAfter(view.state.doc, "Bravo") - "Bravo".length); // start of "Bravo"

    pasteViaDefault(view, '<ul><li data-checked="false">Pasted</li></ul>');

    // The pasted (unchecked) item comes out *checked*, inheriting Bravo's own box —
    // exactly the "neighbour flips" report. Alpha and Charlie are untouched either way.
    expect(serializeBody(view.state.doc)).not.toBe(
      "- [ ] Alpha\n- [ ] Pasted\n- [x] Bravo\n- [ ] Charlie\n",
    );
    view.destroy();
  });
});

describe("handleListItemPaste", () => {
  it("keeps both boxes correct when pasting unchecked at the start of a checked item", () => {
    const view = mount("- [ ] Alpha\n- [x] Bravo\n- [ ] Charlie\n");
    setCaret(view, caretAfter(view.state.doc, "Bravo") - "Bravo".length);

    const handled = handleListItemPaste(view, fakeEvent, sliceFor('<ul><li data-checked="false">Pasted</li></ul>'));

    expect(handled).toBe(true);
    expect(serializeBody(view.state.doc)).toBe(
      "- [ ] Alpha\n- [ ] Pasted\n- [x] Bravo\n- [ ] Charlie\n",
    );
    view.destroy();
  });

  it("keeps both boxes correct when pasting checked at the end of an unchecked item", () => {
    const view = mount("- [ ] One\n- [ ] Two\n- [ ] Three\n");
    setCaret(view, caretAfter(view.state.doc, "Two"));

    const handled = handleListItemPaste(view, fakeEvent, sliceFor('<ul><li data-checked="true">Pasted</li></ul>'));

    expect(handled).toBe(true);
    expect(serializeBody(view.state.doc)).toBe(
      "- [ ] One\n- [ ] Two\n- [x] Pasted\n- [ ] Three\n",
    );
    view.destroy();
  });

  it("splits mid-item text, keeping the original item's box on both halves", () => {
    const view = mount("- [ ] Alpha\n- [x] Bravo\n- [ ] Charlie\n");
    setCaret(view, caretAfter(view.state.doc, "Bra")); // between "Bra" and "vo"

    const handled = handleListItemPaste(view, fakeEvent, sliceFor('<ul><li data-checked="false">Pasted</li></ul>'));

    expect(handled).toBe(true);
    expect(serializeBody(view.state.doc)).toBe(
      "- [ ] Alpha\n- [x] Bra\n- [ ] Pasted\n- [x] vo\n- [ ] Charlie\n",
    );
    view.destroy();
  });

  it("inserts several pasted items, each keeping its own box", () => {
    const view = mount("- [ ] Alpha\n- [x] Bravo\n");
    setCaret(view, caretAfter(view.state.doc, "Bravo") - "Bravo".length);

    const handled = handleListItemPaste(
      view,
      fakeEvent,
      sliceFor(
        '<ul><li data-checked="true">Een</li><li data-checked="false">Twee</li></ul>',
      ),
    );

    expect(handled).toBe(true);
    expect(serializeBody(view.state.doc)).toBe(
      "- [ ] Alpha\n- [x] Een\n- [ ] Twee\n- [x] Bravo\n",
    );
    view.destroy();
  });

  it("declines when the pasted box already agrees with the target's — nothing to fix", () => {
    const view = mount("- [ ] Alpha\n- [ ] Bravo\n- [ ] Charlie\n");
    setCaret(view, caretAfter(view.state.doc, "Bravo") - "Bravo".length);

    const handled = handleListItemPaste(view, fakeEvent, sliceFor('<ul><li data-checked="false">Pasted</li></ul>'));

    expect(handled).toBe(false);
  });

  it("declines outside a list item — nothing to back up over", () => {
    const view = mount("Gewone tekst.\n");
    setCaret(view, caretAfter(view.state.doc, "Gewone"));

    const handled = handleListItemPaste(view, fakeEvent, sliceFor('<ul><li data-checked="true">Pasted</li></ul>'));

    expect(handled).toBe(false);
  });

  it("declines a real (non-collapsed) text selection — the default path already gets this right", () => {
    const view = mount("- [ ] One\n- [x] Two\n- [ ] Three\n");
    const from = caretAfter(view.state.doc, "Tw") - 2;
    const to = caretAfter(view.state.doc, "Two");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));

    const handled = handleListItemPaste(view, fakeEvent, sliceFor('<ul><li data-checked="false">Pasted</li></ul>'));

    expect(handled).toBe(false);

    // Confirm the default path really does handle this one correctly on its own: the
    // whole item's content — including its box — is replaced by what was pasted.
    pasteViaDefault(view, '<ul><li data-checked="false">Pasted</li></ul>');
    expect(serializeBody(view.state.doc)).toBe("- [ ] One\n- [ ] Pasted\n- [ ] Three\n");
    view.destroy();
  });

  it("declines mixed content — only a paste of whole list items is handled by hand", () => {
    const view = mount("- [ ] Alpha\n- [x] Bravo\n");
    setCaret(view, caretAfter(view.state.doc, "Bravo") - "Bravo".length);

    const handled = handleListItemPaste(view, fakeEvent, sliceFor("<p>Just a paragraph.</p>"));

    expect(handled).toBe(false);
  });

  it("an empty task item pasted at the seam still survives as `- [ ]`", () => {
    const view = mount("- [ ] Alpha\n- [x] Bravo\n");
    setCaret(view, caretAfter(view.state.doc, "Bravo") - "Bravo".length);

    const handled = handleListItemPaste(
      view,
      fakeEvent,
      new Slice(Fragment.from(schema.nodes.listItem!.create({ checked: false }, schema.nodes.paragraph!.create())), 0, 0),
    );

    expect(handled).toBe(true);
    expect(serializeBody(view.state.doc)).toBe("- [ ] Alpha\n- [ ]\n- [x] Bravo\n");
    view.destroy();
  });
});
