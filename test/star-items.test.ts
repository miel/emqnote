import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { enter, toggleTask } from "@emqnote/core/editor";
import { schema } from "@emqnote/core/markdown/schema";
import { parseNote, serializeBody } from "@emqnote/core/markdown";
import { toggleStar, toggleOrderedList } from "../src/renderer/editor/commands.js";
import { docFromMarkdown, markdownOf, stateAt } from "./helpers/editing.js";

/**
 * B72 — a bullet can be flagged with a star instead of its marker.
 *
 * The two halves are inseparable and are tested as one: `star-items.ts` lifts a `⭐ `
 * prefix off the file into an attribute, `pipeline.ts`'s `listItem` handler writes it back,
 * and `test/corpus/29-sterretjes.md` pins the bytes. What is left for this file is the
 * question those two cannot answer on their own — that the flag is exactly as exclusive
 * with a checkbox and with a numbered list in the editor as it is on disk.
 */

const HEADER = `---
title: Sterretjes
type: quick
created: 2026-07-25T11:15:00+02:00
---

`;

/** The `starred` attribute of every list item, in document order. */
function flags(markdown: string): boolean[] {
  const found: boolean[] = [];
  docFromMarkdown(HEADER + markdown).descendants((node) => {
    if (node.type.name === "listItem") found.push(node.attrs.starred === true);
    return true;
  });
  return found;
}

/**
 * A selection covering the whole body — the only way to reach two list items at once, since
 * `stateSelecting` looks inside one text node.
 */
function stateSelectingAll(markdown: string): EditorState {
  const doc = docFromMarkdown(HEADER + markdown);
  return EditorState.create({
    schema,
    doc,
    // `between` rather than `create`: the raw ends of the document sit inside the list
    // node itself, which holds no inline content, and `create` warns about it.
    selection: TextSelection.between(doc.resolve(1), doc.resolve(doc.content.size - 1)),
  });
}

function run(state: EditorState, command: typeof toggleStar): string {
  let next = state;
  const ok = command(state, (tr) => {
    next = state.apply(tr);
  });
  expect(ok).toBe(true);
  return markdownOf(next);
}

describe("reading a star off the file", () => {
  it("lifts it off a bullet and leaves the text behind", () => {
    expect(flags("- ⭐ Bel Jan\n- Gewoon\n")).toEqual([true, false]);
    expect(serializeBody(docFromMarkdown(HEADER + "- ⭐ Bel Jan\n"))).toBe("- ⭐ Bel Jan\n");
    expect(docFromMarkdown(HEADER + "- ⭐ Bel Jan\n").textContent).toBe("Bel Jan");
  });

  it("lifts it at any depth", () => {
    expect(flags("- ⭐ Bel Jan\n  - ⭐ Nummer opzoeken\n  - Gewoon\n")).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("reads a bare star as a flagged item with nothing in it yet", () => {
    // The star equivalent of `- [ ]`, and the same half-written shape: a line marked for
    // attention before anything has been typed on it.
    expect(flags("- ⭐\n")).toEqual([true]);
    expect(docFromMarkdown(HEADER + "- ⭐\n").textContent).toBe("");
  });

  it("keeps such an item rather than dropping it as editing residue", () => {
    // `isEmptyList` throws away a list whose every item is empty; a flag is not residue,
    // exactly as an empty checkbox is not.
    expect(serializeBody(docFromMarkdown(HEADER + "- ⭐\n"))).toBe("- ⭐\n");
  });

  it("refuses the pair a task already occupies", () => {
    expect(flags("- [ ] ⭐ Ook een taak\n")).toEqual([false]);
    expect(docFromMarkdown(HEADER + "- [ ] ⭐ Ook een taak\n").textContent).toBe(
      "⭐ Ook een taak",
    );
  });

  it("refuses it where the number is the marker", () => {
    expect(flags("1. ⭐ Eerste stap\n")).toEqual([false]);
    expect(docFromMarkdown(HEADER + "1. ⭐ Eerste stap\n").textContent).toBe("⭐ Eerste stap");
  });

  it("takes the star and its one space, never a character more", () => {
    expect(flags("- ⭐ster zonder spatie\n")).toEqual([false]);
    expect(docFromMarkdown(HEADER + "- ⭐  twee spaties\n").textContent).toBe(" twee spaties");
  });

  it("does not touch the file it was read from", () => {
    // B10 in miniature: parse and serialize must give the bytes back unchanged, which is
    // what `roundtrip.test.ts` asserts for the corpus and what this asserts for the shapes
    // the corpus does not carry.
    for (const body of [
      "- ⭐ Een\n- Twee\n",
      "- ⭐\n- [ ]\n",
      "- [x] ⭐ Tekst\n",
      "- ⭐ Met alinea\n\n  Tweede alinea.\n\n- Volgende\n",
    ]) {
      expect(serializeBody(parseNote(HEADER + body).doc)).toBe(body);
    }
  });
});

describe("flagging from the editor", () => {
  it("flags the bullet the caret is in", () => {
    expect(run(stateAt("- Bel Jan\n- Gewoon\n", "Bel"), toggleStar)).toBe(
      "- ⭐ Bel Jan\n- Gewoon\n",
    );
  });

  it("unflags it again", () => {
    expect(run(stateAt("- ⭐ Bel Jan\n", "Bel"), toggleStar)).toBe("- Bel Jan\n");
  });

  it("resolves a mixed selection one way for all of it", () => {
    // `toggleTask`'s rule, and `toggleMark`'s before it: half a selection flagging and the
    // other half clearing is not a gesture anyone means.
    expect(run(stateSelectingAll("- ⭐ Een\n- Twee\n"), toggleStar)).toBe(
      "- ⭐ Een\n- ⭐ Twee\n",
    );
    // And the other way: with every item already flagged, the whole selection clears.
    expect(run(stateSelectingAll("- ⭐ Een\n- ⭐ Twee\n"), toggleStar)).toBe(
      "- Een\n- Twee\n",
    );
  });

  it("takes the checkbox off, since the box stands where the star would", () => {
    expect(run(stateAt("- [x] Klaar\n", "Klaar"), toggleStar)).toBe("- ⭐ Klaar\n");
  });

  it("takes the star off when the item becomes a task", () => {
    expect(run(stateAt("- ⭐ Bel Jan\n", "Bel"), toggleTask)).toBe("- [ ] Bel Jan\n");
  });

  it("declines outside a list, where there is no marker to replace", () => {
    // Unlike `toggleTask`, which starts a list: a checkbox is a way of writing a list,
    // while a star is a remark about a bullet that already exists.
    expect(toggleStar(stateAt("Gewone zin.\n", "Gewone"), undefined)).toBe(false);
  });

  it("declines in a numbered list rather than converting it", () => {
    expect(toggleStar(stateAt("1. Eerste stap\n", "Eerste"), undefined)).toBe(false);
  });

  it("goes when the list it is in is numbered", () => {
    // The flag cannot survive there and `to-mdast.ts` would drop it on the next save
    // anyway — better it leave visibly, here, than silently, there.
    expect(run(stateAt("- ⭐ Een\n- Twee\n", "Een"), toggleOrderedList)).toBe(
      "1. Een\n2. Twee\n",
    );
  });

  it("is not inherited by the next item on Enter", () => {
    // A star says *this one*. Carrying it onto the next line would mean the flag spread by
    // pressing Enter, which is the opposite of what flagging is for.
    const state = stateAt("- ⭐ Bel Jan\n", "Jan");
    // `-` with no trailing space: the dialect forbids trailing whitespace, and an item
    // with nothing in it yet carries no star either.
    expect(run(state, enter)).toBe("- ⭐ Bel Jan\n-\n");
  });
});
