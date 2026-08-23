import { useEffect, useRef } from "react";
import {
  formatAccelerator,
  formatEntry,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type ShortcutEntry,
  type ShortcutGroup,
  type ShortcutWhere,
} from "../shared/shortcuts.js";
import { trapTab } from "./library/focus-trap.js";

/**
 * Rows this sheet renders for a group beyond the entries in `SHORTCUTS` itself.
 *
 * Both global hotkeys are settings rather than constants, so they are drawn from what is
 * configured (see the `window` branch in the markup below) instead of being written down
 * a second time. They are still two lines on the page, and the balance below has to count
 * what is *drawn* — a column measured on the registry alone is a column measured wrong by
 * exactly these two.
 */
const EXTRA_ROWS: Partial<Record<ShortcutGroup, number>> = { window: 2 };

interface Section {
  group: ShortcutGroup;
  entries: ShortcutEntry[];
}

/**
 * Splits the groups into the sheet's two columns.
 *
 * It exists because the grid could not do it. `.help-groups` is a two-track grid filling
 * row-major, and the groups are wildly uneven — 10, 7, 11, 4, 8 entries in a fixed order.
 * That laid out as `[text | lists] / [structure | note] / [window | nothing]`, and since
 * each grid row is as tall as its taller member the sheet stood 32 rows high with 8 rows
 * of content on the right of it: scrolling, past a column that was mostly empty. Which is
 * a content-ordering problem, and no amount of track sizing addresses it.
 *
 * **The cut is contiguous, and that is the point rather than a simplification.** Columns
 * are read down and then across, so a contiguous cut leaves `SHORTCUT_GROUPS`' order
 * exactly as written; picking the two best-fitting groups for the left column would
 * balance a row better and shuffle the sheet. Measured over both windows: contiguous
 * gives 19/22 in capture and 19/24 in the library, against 28 and 32 today, and the best
 * non-contiguous split saves one further row. That is not a trade.
 *
 * A heading is a line too, so it is counted. A group with nothing in it is dropped before
 * the walk rather than weighed at zero — it renders nothing, and a cut placed on it would
 * silently leave one column empty.
 */
export function balanceColumns(sections: Section[]): [Section[], Section[]] {
  const weigh = (section: Section): number =>
    section.entries.length + (EXTRA_ROWS[section.group] ?? 0) + 1;

  const total = sections.reduce((sum, section) => sum + weigh(section), 0);

  let best = 1;
  let smallest = Number.POSITIVE_INFINITY;
  for (let cut = 1; cut < sections.length; cut += 1) {
    const left = sections.slice(0, cut).reduce((sum, section) => sum + weigh(section), 0);
    const difference = Math.abs(left - (total - left));
    if (difference < smallest) {
      smallest = difference;
      best = cut;
    }
  }

  return [sections.slice(0, best), sections.slice(best)];
}

interface Props {
  /** Which window is asking, so its own keys are listed and the other's are not. */
  window: Extract<ShortcutWhere, "capture" | "library">;
  isMac: boolean;
  /** The global accelerator, which is a setting rather than a constant. */
  hotkey: string;
  /** The library's global accelerator (B60), a setting for the same reason. */
  libraryHotkey: string;
  t: (key: string) => string;
  onClose: () => void;
}

/**
 * The shortcut sheet, in both windows.
 *
 * Beside `HeaderBlock.tsx` and `LinkPrompt.tsx` rather than in `library/`, following the
 * precedent those two set for a component both windows use — and its CSS goes in
 * `styles.css` beside `.link-prompt` for the same reason. It cannot reuse `.overlay` and
 * `.settings`, which live in `library.css`; the capture window does not load that file,
 * and it is the window whose bundle has to stay small.
 *
 * Everything here is read from `src/shared/shortcuts.ts`, which is also what builds the
 * keymap. A sheet that listed the keys separately would be wrong within a month — the
 * table in the design document it replaces already was.
 */
export function Help({
  window: which,
  isMac,
  hotkey,
  libraryHotkey,
  t,
  onClose,
}: Props): React.ReactElement {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  /**
   * Focus goes to the panel and comes back to whatever opened it, exactly as
   * `ContextMenu.tsx` does — but on unmount rather than in a `close()` of its own, because
   * this sheet has four ways out and one of them is not ours: `Mod-/` a second time is
   * caught by the window-level listener in `Capture.tsx`/`Library.tsx` and never reaches
   * `onClose`. Without this the focused node is simply removed, focus collapses to
   * `document.body`, and the next Tab starts at the top of the document — which in the
   * library is the folder tree's `+ New` button, whatever pane the sheet was opened from.
   */
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => opener.current?.focus();
  }, []);

  const shown = SHORTCUTS.filter(
    (entry) => entry.where !== "capture" || which === "capture",
  ).filter((entry) => entry.where !== "library" || which === "library");

  const rows = (group: ShortcutGroup): ShortcutEntry[] =>
    shown.filter((entry) => entry.group === group);

  const columns = balanceColumns(
    SHORTCUT_GROUPS.map((group) => ({ group, entries: rows(group) })).filter(
      (section) => section.entries.length > 0,
    ),
  );

  return (
    <div className="help-backdrop" onMouseDown={onClose}>
      <div
        className="help"
        ref={panel}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          trapTab(event, panel.current);
          if (event.key === "Escape") {
            event.preventDefault();
            // Stopped as well as prevented. `preventDefault` does not end the bubble, so
            // this Escape went on to `Library.tsx`'s window listener — which by then saw
            // focus already restored to the editor by the unmount effect below, read that
            // as "leave the editor" and threw focus into the note list. One press, two
            // things. The `Mod-/`-twice route never did this, which is the report exactly.
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="help-head">
          <h2>{t("help.title")}</h2>
          <button type="button" className="help-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Two columns the component fills, not two tracks the grid fills. The grid is
            still a grid — it is what collapses the pair to one column in the narrow
            capture window — but which group lands where is a decision, and row-major flow
            over uneven groups is what left this sheet 32 rows tall beside 8 rows of
            content. See `balanceColumns`. */}
        <div className="help-groups">
          {columns.map((sections, column) => (
            <div key={column} className="help-column">
              {sections.map(({ group, entries }) => (
                <section key={group} className="help-group">
                  <h3>{t(`help.group.${group}`)}</h3>
                  <dl>
                    {entries.map((entry) => (
                      <div key={entry.id} className="help-row">
                        <dt>{t(`shortcut.${entry.id}`)}</dt>
                        <dd>{formatEntry(entry, isMac, t("help.or"))}</dd>
                      </div>
                    ))}

                    {/* The two entries that are not constants: both global hotkeys are
                        settings, so they are rendered from what is configured rather than
                        written down twice. `EXTRA_ROWS` above is how the balance knows
                        they are here; the two have to move together. */}
                    {group === "window" && (
                      <>
                        <div className="help-row">
                          <dt>{t("shortcut.newNote")}</dt>
                          <dd>{formatAccelerator(hotkey, isMac)}</dd>
                        </div>
                        <div className="help-row">
                          <dt>{t("shortcut.openLibraryGlobal")}</dt>
                          <dd>{formatAccelerator(libraryHotkey, isMac)}</dd>
                        </div>
                      </>
                    )}
                  </dl>
                </section>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
