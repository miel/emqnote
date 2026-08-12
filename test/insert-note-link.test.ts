// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { serializeBody } from "../src/markdown/index.js";
import { createEditorState } from "../src/renderer/editor/state.js";
import type { CommandContext } from "../src/renderer/editor/commands.js";
import { NOTE_LINK_PREFIX } from "../src/renderer/editor/state.js";
import {
  insertNoteLink,
  insertNoteLinkOverPrefix,
} from "../src/renderer/editor/insert-link.js";
import { docFromMarkdown } from "./helpers/editing.js";

/**
 * What the note picker writes into a document (B41) — and, just as much, what it does
 * with the `[[` the user may have typed to open it.
 *
 * A mounted view rather than a bare state, because both functions dispatch through one
 * and read the selection back off it — the same reason `task-highlight.test.ts` mounts.
 */

const context: CommandContext = {
  openLinkPrompt: () => {},
  requestImage: () => {},
  requestFile: () => {},
  requestNoteLink: () => {},
  requestTable: () => {},
};

function mount(markdown: string): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const view = new EditorView(host, {
    state: createEditorState(docFromMarkdown(markdown), context),
  });
  // At the end of the note, which is where someone is typing when they reach for a link.
  view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
  return view;
}

/**
 * A view holding `text` as if it had just been typed, caret at the end.
 *
 * Not `mount(text)`: parsing markdown drops a trailing space, because the dialect forbids
 * trailing whitespace and the serializer strips it. A note being written mid-sentence
 * genuinely does have one — that is the state a link is inserted into — so it has to be
 * typed in rather than parsed.
 */
function typing(text: string): EditorView {
  const view = mount("\n");
  view.dispatch(view.state.tr.insertText(text));
  return view;
}

const TARGET = "01 Projecten/2026-08-08 0900 Spelregels";
const TITLE = "Spelregels";

describe("insertNoteLink", () => {
  it("writes both halves: the path as target, the title as what you read", () => {
    const view = typing("Zie ook ");
    insertNoteLink(view, TARGET, TITLE);

    expect(serializeBody(view.state.doc)).toBe(`Zie ook [[${TARGET}|${TITLE}]]\n`);
  });

  it("never writes a bare [[Title]], however unambiguous the title looks", () => {
    // A title resolves in `link-resolve.ts`'s *second* stage and two notes may share one,
    // which would raise the ambiguity picker on every future click over a question the
    // user already answered here. A path cannot be ambiguous.
    const view = mount("x\n");
    insertNoteLink(view, TARGET, TITLE);

    const markdown = serializeBody(view.state.doc);
    expect(markdown).toContain("|");
    expect(markdown).not.toContain(`[[${TITLE}]]`);
  });

  it("replaces a selection rather than sitting beside it", () => {
    const view = mount("Zie de spelregels hier.\n");
    const text = view.state.doc.textBetween(0, view.state.doc.content.size);
    // +1 for the paragraph's own opening token: a top-level text offset is one past the
    // document position it starts at.
    const from = text.indexOf("hier") + 1;
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + "hier".length)),
    );
    insertNoteLink(view, TARGET, TITLE);

    expect(serializeBody(view.state.doc)).toBe(`Zie de spelregels [[${TARGET}|${TITLE}]].\n`);
  });
});

describe("insertNoteLinkOverPrefix", () => {
  it("swallows the [[ the user typed to open the picker", () => {
    const view = typing("Zie ook [[");
    insertNoteLinkOverPrefix(view, TARGET, TITLE, NOTE_LINK_PREFIX);

    expect(serializeBody(view.state.doc)).toBe(`Zie ook [[${TARGET}|${TITLE}]]\n`);
  });

  it("eats nothing when there is no prefix — the shortcut and toolbar route", () => {
    const view = typing("Zie ook ");
    insertNoteLinkOverPrefix(view, TARGET, TITLE, "");

    expect(serializeBody(view.state.doc)).toBe(`Zie ook [[${TARGET}|${TITLE}]]\n`);
  });

  it("does not eat two characters of a sentence when the brackets have gone", () => {
    // The picker is modal, so this should not happen — but it is checked rather than
    // assumed, because the failure mode is silently destroying what someone typed.
    const view = mount("Afspraak met Jan\n");
    insertNoteLinkOverPrefix(view, TARGET, TITLE, NOTE_LINK_PREFIX);

    expect(serializeBody(view.state.doc)).toBe(`Afspraak met Jan[[${TARGET}|${TITLE}]]\n`);
  });

  it("leaves the [[ alone when the picker is cancelled — nothing to undo", () => {
    // The input rule deliberately declines rather than consuming, so this is simply what
    // the document already says. The test pins that there is no cleanup transaction
    // anyone could get wrong.
    const view = typing("Zie ook [[");
    expect(serializeBody(view.state.doc)).toBe("Zie ook \\[\\[\n");
  });
});
