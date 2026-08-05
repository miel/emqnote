import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../../markdown/schema.js";

/**
 * Puts a real, clickable checkbox in front of every task item.
 *
 * A widget decoration and not a `::before`, which is what this used to be: a pseudo
 * element cannot be hit-tested, has nothing to hover and does not exist for assistive
 * technology, so the box was a picture of a control rather than a control. The widget
 * renders an actual `<button role="checkbox">` and is absolutely positioned into
 * `--marker-slot`, so no `li > *` selector has to change — the four rules carrying the
 * outline look all match on element type.
 *
 * Rejected: `handleClickOn`, which would mean rebuilding hit testing out of `clientX`
 * for something the DOM already does, and a `nodeView`, which forces a wrapper element
 * around every item — invalidating those `li > p` and `li > ul` rules — and puts a
 * JavaScript object per list item on the 16 ms keystroke path.
 *
 * Like `tag-decoration.ts` this rebuilds the whole set whenever the document changes
 * rather than mapping ranges forward. The measurement there applies unchanged: 0.027 ms
 * on the largest note in the corpus against a 16 ms budget, and there are far fewer
 * list items in a note than tags.
 */

const key = new PluginKey<DecorationSet>("taskCheckboxes");

function toggleAt(view: EditorView, itemPos: number): void {
  const item = view.state.doc.nodeAt(itemPos);
  if (item === null || item.type !== schema.nodes.listItem) return;
  if (item.attrs.checked === null) return;

  view.dispatch(
    view.state.tr.setNodeMarkup(itemPos, undefined, {
      ...item.attrs,
      checked: item.attrs.checked !== true,
    }),
  );
}

const SVG = "http://www.w3.org/2000/svg";

/**
 * The box, drawn rather than typed.
 *
 * ☐ and ☑ come from different fallback fonts — on macOS the empty box is noticeably
 * smaller and thinner than the ticked one, and a variation selector does not talk it
 * out of that. Two states of one control that change size when you tick them look
 * broken, and the font coverage differs again on Windows, which is the other machine
 * this runs on. Drawing it is a dozen lines and identical everywhere.
 *
 * `currentColor` throughout, so the muted/accent/hover colours stay in the stylesheet
 * with every other colour decision.
 *
 * Exported so `TaskList.tsx`'s aggregated view can put the same box in front of a task
 * row — one drawing, so the two places a checkbox appears cannot drift apart visually.
 */
export function drawBox(checked: boolean): SVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");

  const frame = document.createElementNS(SVG, "rect");
  frame.setAttribute("x", "2.6");
  frame.setAttribute("y", "2.6");
  frame.setAttribute("width", "10.8");
  frame.setAttribute("height", "10.8");
  frame.setAttribute("rx", "2.4");
  frame.setAttribute("fill", "none");
  frame.setAttribute("stroke", "currentColor");
  frame.setAttribute("stroke-width", "1.4");
  svg.appendChild(frame);

  if (checked) {
    const tick = document.createElementNS(SVG, "path");
    tick.setAttribute("d", "M5.2 8.1 7.2 10.2 10.9 5.9");
    tick.setAttribute("fill", "none");
    tick.setAttribute("stroke", "currentColor");
    tick.setAttribute("stroke-width", "1.8");
    tick.setAttribute("stroke-linecap", "round");
    tick.setAttribute("stroke-linejoin", "round");
    svg.appendChild(tick);
  }

  return svg;
}

function render(
  view: EditorView,
  getPos: () => number | undefined,
  checked: boolean,
): HTMLElement {
  const box = document.createElement("button");
  box.type = "button";
  box.className = "task-check";
  box.setAttribute("role", "checkbox");
  box.setAttribute("aria-checked", String(checked));
  box.contentEditable = "false";
  box.tabIndex = -1;
  box.appendChild(drawBox(checked));

  // Without this the press moves the caret into the item first and the click lands on
  // a document that has already scrolled under it.
  box.addEventListener("mousedown", (event) => event.preventDefault());
  box.addEventListener("click", (event) => {
    event.preventDefault();

    // The widget sits just inside the item, so the item itself is one back. `getPos`
    // gives up once the decoration has been removed from the document — a click
    // landing on a box that is on its way out has nothing to toggle.
    const at = getPos();
    if (at === undefined) return;

    toggleAt(view, at - 1);
    view.focus();
  });

  return box;
}

function build(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.listItem) return true;
    if (node.attrs.checked === null) return true;

    const checked = node.attrs.checked === true;
    decorations.push(
      Decoration.widget(pos + 1, (view, getPos) => render(view, getPos, checked), {
        side: -1,
        // The widget is a control, not content: its events are its own and the
        // selection has no business landing inside it.
        stopEvent: () => true,
        ignoreSelection: true,
        // Part of the reuse key, or ticking a box would leave the old glyph on screen:
        // matching keys tell ProseMirror the existing DOM is still good.
        key: `task-${String(checked)}`,
      }),
    );

    return true;
  });

  return DecorationSet.create(doc, decorations);
}

export function taskCheckboxes(): Plugin {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => build(state.doc),
      apply: (tr, set) => (tr.docChanged ? build(tr.doc) : set),
    },
    props: {
      decorations: (state) => key.getState(state),
    },
  });
}
