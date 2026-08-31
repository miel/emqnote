import { useEffect, useRef, useState } from "react";
import {
  acceleratorBinding,
  formatEntry,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type ShortcutEntry,
  type ShortcutGroup,
  type ShortcutWhere,
} from "../shared/shortcuts.js";
import { trapTab } from "./library/focus-trap.js";

/**
 * The two rows this sheet draws that no registry entry accounts for: both global hotkeys.
 *
 * They are settings rather than constants, so they are built from what is configured — but
 * built as ordinary `ShortcutEntry` values rather than as markup of their own. That is a
 * change, and it is what makes the search below honest: a filter the two global hotkeys
 * could not match would be a search that quietly refused to find the app's two most
 * important keys. Everything downstream — the balance's row count, the filter, the row
 * markup — then has one kind of thing to deal with, where before the balance carried a
 * hardcoded `+2` for a group whose extra rows were written out separately in the JSX.
 *
 * The ids are the i18n keys they were already drawn under. `newNote` is deliberately not
 * `newNoteHere`'s id — see that entry's own comment in `shortcuts.ts`.
 */
function globalHotkeyRows(hotkey: string, libraryHotkey: string): ShortcutEntry[] {
  return [
    {
      id: "newNote",
      keys: [acceleratorBinding(hotkey)],
      where: "global",
      group: "window",
    },
    {
      id: "openLibraryGlobal",
      keys: [acceleratorBinding(libraryHotkey)],
      where: "global",
      group: "window",
    },
  ];
}

interface Section {
  group: ShortcutGroup;
  entries: ShortcutEntry[];
}

/**
 * Splits the groups into the sheet's two columns.
 *
 * It exists because the grid could not do it. `.help-groups` is a two-track grid filling
 * row-major, and the groups are wildly uneven — 11, 8, 12, 4 and 13 rows in a fixed
 * order. That laid out as `[text | lists] / [structure | note] / [window | nothing]`, and
 * since each grid row is as tall as its taller member the sheet stood 32 rows high with 8
 * rows of content on the right of it: scrolling, past a column that was mostly empty.
 * Which is a content-ordering problem, and no amount of track sizing addresses it.
 *
 * **The cut is no longer contiguous, and that is the change.** It was: the groups were
 * split at one point, so the sheet read straight down the left column and on down the
 * right in `SHORTCUT_GROUPS`' order. That is the tidier rule and it was measured to cost
 * one row at the time, which was not a trade worth making — but a contiguous cut can only
 * ever put the boundary where the groups happen to allow, and the groups kept growing.
 * At five groups of 11, 8, 12, 4 and 13 the best contiguous split is 19 against 29: ten
 * rows of white space down one side of a sheet whose whole job is to be read at a glance.
 * Choosing which groups go left instead gives 24 and 24.
 *
 * So this weighs every way of dealing the groups into two columns and takes the one whose
 * taller column is shortest. That is 2^n assignments, and n is the number of groups —
 * five today, and `SHORTCUT_GROUPS` is a hand-written list that gains an entry every year
 * or two, so exhaustive is both exact and free. It runs once per opening of a sheet
 * nobody opens in a loop.
 *
 * **Each column still reads in registry order**, which is what stops this from being a
 * shuffle: the groups are dealt out, never reordered, so `text` can never appear below
 * `window` in the same column. What is given up is only that the *left* column's groups
 * all come before the right's — the sheet is two headed lists side by side, not one list
 * folded in half, and every section still announces itself with a heading.
 *
 * **Ties go to the answer that reads earliest.** Two assignments are very often exactly
 * as tall as each other — swapping the columns always is — so the walk is ordered so that
 * the first one found is the one whose groups are furthest left: group 0 on the left
 * beats group 0 on the right, then group 1, and so on. That is a plain ascending count
 * once the *first* group is the high bit rather than the low one, which is the only thing
 * the shifting below is doing.
 *
 * A heading is a line too, so it is counted. A group with nothing in it is dropped before
 * the walk rather than weighed at zero — it renders nothing, and a column that got only
 * empty groups would be a blank half of the sheet.
 */
export function balanceColumns(sections: Section[]): [Section[], Section[]] {
  const weigh = (section: Section): number => section.entries.length + 1;

  const weights = sections.map(weigh);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  // One bit per section, the *first* section being the high bit — see the tie rule above.
  // Set means "this one goes right".
  const goesRight = (code: number, index: number): boolean =>
    (code >> (sections.length - 1 - index)) % 2 === 1;

  // 0 and the all-ones code are skipped: both leave a column empty, which is the one
  // outcome worse than an unbalanced sheet.
  let best = 1;
  let shortest = Number.POSITIVE_INFINITY;
  for (let code = 1; code < 2 ** sections.length - 1; code += 1) {
    let right = 0;
    for (let i = 0; i < sections.length; i += 1) {
      if (goesRight(code, i)) right += weights[i] ?? 0;
    }
    const tallest = Math.max(total - right, right);
    // Strictly shorter, so the first code to reach a given height keeps it.
    if (tallest < shortest) {
      shortest = tallest;
      best = code;
    }
  }

  return [
    sections.filter((_, i) => !goesRight(best, i)),
    sections.filter((_, i) => goesRight(best, i)),
  ];
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
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

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

  const shown = [...SHORTCUTS, ...globalHotkeyRows(hotkey, libraryHotkey)]
    .filter((entry) => entry.where !== "capture" || which === "capture")
    .filter((entry) => entry.where !== "library" || which === "library");

  /**
   * What the sheet is filtered to, matched against both halves of a row.
   *
   * The name *and* the keys, because both are things you arrive knowing: "what is the
   * chord for a table" and "what does Ctrl+Shift+K do" are the two questions this sheet
   * is opened with, and answering only the first would make the search useless for
   * exactly the case where you are staring at a key you pressed by accident.
   *
   * Matched against the printed form of the chord — "Ctrl+Shift+K", "⌘Enter" — rather
   * than the registry's spelling, so what you type is compared against what you can see.
   *
   * The two halves are normalised differently, and they have to be. A chord is matched
   * with every separator taken out of both sides, so "ctrl shift k", "ctrl+shift+k" and
   * "ctrlshiftk" all find the same row; a *name* keeps its spaces, or "new note" would
   * also match every id in the sheet that merely contains those letters in a row.
   */
  const needle = query.trim().toLowerCase();
  const unspaced = (text: string): string => text.replaceAll(/[\s+]/g, "");
  const matching = (entry: ShortcutEntry): boolean => {
    if (needle === "") return true;
    const name = t(`shortcut.${entry.id}`).toLowerCase();
    const keys = unspaced(formatEntry(entry, isMac, " ").toLowerCase());
    return name.includes(needle) || keys.includes(unspaced(needle));
  };

  const rows = (group: ShortcutGroup): ShortcutEntry[] =>
    shown.filter((entry) => entry.group === group && matching(entry));

  const sections = SHORTCUT_GROUPS.map((group) => ({ group, entries: rows(group) })).filter(
    (section) => section.entries.length > 0,
  );
  // A search can leave one group standing, and `balanceColumns` wants two columns to fill.
  // One section is not a balance question at all: it goes on the left and the grid, which
  // is `auto-fit`, closes up behind it.
  const columns = (sections.length > 1 ? balanceColumns(sections) : [sections]).filter(
    (column) => column.length > 0,
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
          // `/` puts the caret in the search box, which is the gesture this sheet is
          // opened by one keystroke earlier: Mod-/ opens it, / searches it. Only when the
          // caret is not already in the box, or the box could never be typed a slash into
          // — `tag:` and `after:` are not the only things anyone might want to look up by
          // punctuation, and a control that swallows one of its own characters is worse
          // than no shortcut at all.
          if (event.key === "/" && event.target !== search.current) {
            event.preventDefault();
            search.current?.focus();
            search.current?.select();
            return;
          }
          if (event.key === "Escape") {
            // One press undoes one thing, the rule the note list's own search box
            // follows: a query is cleared before the sheet is closed, so Escape out of a
            // search you are reading does not also throw away the sheet you were reading
            // it in.
            if (query !== "") {
              event.preventDefault();
              event.stopPropagation();
              setQuery("");
              search.current?.focus();
              return;
            }
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
          {/* The sheet is 24 rows of two columns, which is exactly the length at which
              reading it beats scanning it and exactly the length at which neither is what
              you wanted: you came for one key. `/` reaches this from the panel, the
              convention every reader-first screen uses for "find in this", and it is one
              keystroke on from the Mod-/ that opened the sheet.

              Not autofocused. The sheet's own job is to be read, and a caret waiting in a
              box is a screen asking a question — the same argument `openSearch` makes in
              the library for why the note list's field is focused when it is *asked* for
              and not merely when it is visible. */}
          <input
            ref={search}
            type="text"
            className="help-search"
            value={query}
            placeholder={t("help.search")}
            aria-label={t("help.search")}
            onChange={(event) => setQuery(event.target.value)}
          />
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
          {columns.length === 0 && <p className="help-empty">{t("help.noMatch")}</p>}
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
