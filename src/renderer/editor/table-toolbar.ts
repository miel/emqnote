import { Plugin } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import { translate } from "../../shared/i18n.js";
import type { CommandContext } from "./commands.js";
import {
  addColumn,
  addRow,
  deleteColumn,
  deleteRow,
  setColumnAlign,
  type ColumnAlign,
} from "./table-commands.js";
import { selectedRect } from "./table-selection.js";

/**
 * The row and column operations, in front of you rather than behind a right-click.
 *
 * Every command here already existed (B42, `table-commands.ts`) and every one of them was
 * already in the note panel's menu (`editor-menu.ts`'s `tableItems`). They were reported as
 * missing anyway, which is the honest verdict on a menu that only opens on right-click or
 * `Mod+Shift+M`: a table is edited rarely enough that nobody goes looking, and the one
 * gesture that would find it is the one nobody tries. Nothing new is written here — this is
 * a second route to the same dozen commands, which is what `CLAUDE.md`'s rule about menus
 * asks for and what the menu-only version of these quietly failed.
 *
 * A widget decoration, built exactly the way `checkbox.ts` builds its checkbox: a control
 * that lives inside the document has to be `contenteditable="false"`, has to stop its own
 * events reaching the view, and must never take the selection — `stopEvent` and
 * `ignoreSelection` are what say so, and a `preventDefault`ed `mousedown` is what keeps the
 * caret in the cell the commands are about to act on. A control that moved the selection on
 * the way to being clicked would act on a different cell than the one you were in.
 *
 * The decorations are computed in `props.decorations` rather than held in plugin state,
 * because what they depend on is the *selection* — which table the caret is in, and which
 * column of it — not the document. `table-align.ts` is built the same way for the same
 * reason, and this is deliberately a second plugin rather than a third job in that one: it
 * draws a control, not a property of the text.
 */

/** The buttons, in the order they appear. `align` marks the four that set a column's alignment. */
interface Tool {
  /** The short visible label's key, and part of the widget's reuse key. */
  id: string;
  /** i18n key for the short label written on the button. */
  short: string;
  /** i18n key for the full sentence in the tooltip — the same string the menu item uses. */
  title: string;
  command: Command;
  /** For the alignment group: which alignment this button sets, so the active one can be marked. */
  align?: ColumnAlign;
  /** Starts a new visual group. */
  divider?: boolean;
}

const TOOLS: Tool[] = [
  { id: "row-above", short: "table.rowAbove", title: "menu.tableRowAbove", command: addRow("before") },
  { id: "row-below", short: "table.rowBelow", title: "menu.tableRowBelow", command: addRow("after") },
  {
    id: "column-left",
    short: "table.columnLeft",
    title: "menu.tableColumnLeft",
    command: addColumn("before"),
  },
  {
    id: "column-right",
    short: "table.columnRight",
    title: "menu.tableColumnRight",
    command: addColumn("after"),
  },
  {
    id: "delete-row",
    short: "table.deleteRow",
    title: "menu.tableDeleteRow",
    command: deleteRow(),
    divider: true,
  },
  {
    id: "delete-column",
    short: "table.deleteColumn",
    title: "menu.tableDeleteColumn",
    command: deleteColumn(),
  },
  {
    id: "align-left",
    short: "table.alignLeft",
    title: "menu.tableAlignLeft",
    command: setColumnAlign("left"),
    align: "left",
    divider: true,
  },
  {
    id: "align-center",
    short: "table.alignCenter",
    title: "menu.tableAlignCenter",
    command: setColumnAlign("center"),
    align: "center",
  },
  {
    id: "align-right",
    short: "table.alignRight",
    title: "menu.tableAlignRight",
    command: setColumnAlign("right"),
    align: "right",
  },
  {
    id: "align-default",
    short: "table.alignDefault",
    title: "menu.tableAlignDefault",
    command: setColumnAlign(null),
    align: null,
  },
];

/**
 * Deleting the whole table is deliberately not here. It is the one destructive item of the
 * set, it already has a home in the menu, and a button that throws a table away sitting one
 * pixel from "delete column" is how a table gets thrown away by accident.
 */

function render(
  view: EditorView,
  t: (key: string) => string,
  /** `undefined` when the selection spans columns that do not agree — none of the four. */
  active: ColumnAlign | undefined,
): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "table-toolbar";
  bar.contentEditable = "false";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", t("table.toolbar"));

  for (const tool of TOOLS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = tool.divider === true ? "table-tool table-tool-grouped" : "table-tool";
    button.tabIndex = -1;
    button.title = t(tool.title);
    // The visible text is the short label and nothing else — `library-window.ts`'s
    // `--click-button` matches a button on its own `textContent`, so a glyph beside the
    // word would put these back out of reach of the one harness that can drive the app.
    button.textContent = t(tool.short);

    // The four alignment buttons say what the column currently *is*, not only what they
    // would make it. `align` is genuinely four-valued: "default" is what a plain `---`
    // means and is not a synonym for left.
    if (tool.align !== undefined) {
      button.setAttribute("aria-pressed", String(tool.align === active));
    }

    // Without this the press moves the caret out of the cell first, and the command then
    // acts on wherever the selection landed — see `checkbox.ts` for the same two lines.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      tool.command(view.state, view.dispatch);
      view.focus();
    });

    bar.append(button);
  }

  return bar;
}

export function tableToolbar(context: CommandContext): Plugin {
  // English rather than a key name when a caller built a context without a translator —
  // every window passes one, and only a test does not.
  const t = (key: string): string =>
    context.t === undefined ? translate("en-US", key) : context.t(key);

  return new Plugin({
    props: {
      decorations(state) {
        const rect = selectedRect(state);
        if (rect === null) return null;

        const align = (rect.node.attrs.align as ColumnAlign[] | undefined) ?? [];
        // What the alignment buttons report is the alignment of *every* column the
        // selection covers — a rectangle spanning a left-aligned and a centred column is
        // not "left", and lighting one of the four there would be a lie about half of it.
        const first = align[rect.left] ?? null;
        let same = true;
        for (let column = rect.left; column <= rect.right; column += 1) {
          if ((align[column] ?? null) !== first) same = false;
        }
        const active = same ? first : undefined;

        return DecorationSet.create(state.doc, [
          Decoration.widget(rect.pos, (view) => render(view, t, active), {
            side: -1,
            // A control, not content: its events are its own and the selection has no
            // business landing inside it.
            stopEvent: () => true,
            ignoreSelection: true,
            // The active column's alignment is part of the reuse key, or moving the caret
            // between two differently aligned columns would leave the old button pressed.
            key: `table-toolbar-${rect.pos}-${String(active)}`,
          }),
        ]);
      },
    },
  });
}
