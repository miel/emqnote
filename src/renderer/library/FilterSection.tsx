import { useEffect, useMemo, useState } from "react";
import { foldTag } from "../../markdown/tags.js";
import { selectionKey, type Facet, type Selection } from "../../shared/vault-types.js";
import { score } from "./fuzzy.js";

/** Above this many entries, scrolling stops being a way to find anything. */
const FILTER_FROM = 15;

/** Enough to scroll through; the filter box is how you reach the rest. */
const SHOWN = 50;

interface Props {
  kind: "tag" | "person";
  label: string;
  glyph: string;
  facets: Facet[];
  available: boolean;
  selected: Selection;
  onSelect: (selection: Selection) => void;
  /** Called the first time this section is unfolded. */
  onExpand: () => void;
  emptyLabel: string;
  unavailableLabel: string;
  filterLabel: string;
}

/**
 * One collapsible list in the footer of the left panel: Tags, or People.
 *
 * Not the `Branch` component even though it looks like one. `Branch` is typed on
 * `FolderNode` and on a folder path, and pushing a tag through it as a fake path is the
 * kind of shortcut that reads as a bug six months later. The markup is shared instead,
 * through the same `.branch` classes.
 *
 * Collapsed by default, and that is load-bearing: unfolding it is what triggers the
 * first scan of the vault, so opening the library costs nothing until you ask for this.
 */
export function FilterSection({
  kind,
  label,
  glyph,
  facets,
  available,
  selected,
  onSelect,
  onExpand,
  emptyLabel,
  unavailableLabel,
  filterLabel,
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  /**
   * Is this the facet the current selection names?
   *
   * Folded for tags, because `#Klantx` in a note body and `klantx` in this list are one
   * tag to `notesMatching` and two strings to `selectionKey` — so a tag clicked in a note
   * (B52) would filter the list correctly while lighting no row here, which reads as the
   * filter not having been applied at all. People are compared as they always were; the
   * facet list is where their spelling is decided.
   */
  const isSelected = (facet: Facet): boolean => {
    if (selected.kind !== kind) return false;
    if (kind === "tag") return foldTag(selected.name) === foldTag(facet.name);
    return selectionKey(selected) === selectionKey({ kind: "person", name: facet.name });
  };

  const shown = useMemo(() => {
    const matching =
      query === ""
        ? facets.slice(0, SHOWN)
        : facets
            .map((facet) => ({ facet, rank: score(facet.name, query) }))
            .filter((entry): entry is { facet: Facet; rank: number } => entry.rank !== null)
            .sort((a, b) => b.rank - a.rank)
            .slice(0, SHOWN)
            .map((entry) => entry.facet);

    // Whatever is selected is always on the list. `SHOWN` and the filter box both cut by
    // how *interesting* an entry is, and a rarely-used tag clicked in a note is exactly
    // the entry both of them cut — which would leave the note list filtered by something
    // the panel does not show, with no row to click to get back out of it.
    if (matching.some(isSelected)) return matching;
    const missing = facets.find(isSelected);
    return missing === undefined ? matching : [missing, ...matching];
  }, [facets, query, selectionKey(selected)]);

  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next) onExpand();
  };

  /**
   * Unfold when what is selected is one of these.
   *
   * Written as a property of the section rather than as something the caller does, so
   * every route to a tag selection lands the same way — a `#tag` Mod+clicked in a note
   * (B52) today, anything else later. `onExpand` is called for the same reason `toggle`
   * calls it: this is where the vault's first scan is triggered, and a section that
   * opened without asking for the facets would open on an empty list.
   */
  useEffect(() => {
    if (selected.kind !== kind || open) return;
    setOpen(true);
    onExpand();
    // `onExpand` is deliberately not a dependency: it is a fresh arrow on every render of
    // `FolderTree`, and including it would re-run this on every keystroke in the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey(selected), kind, open]);

  return (
    <div className="filter-section">
      <div className="branch" style={{ paddingLeft: "8px" }} onClick={toggle}>
        <button type="button" className="twisty" aria-label={open ? "Collapse" : "Expand"}>
          {open ? "▾" : "▸"}
        </button>
        <span className="filter-glyph">{glyph}</span>
        <span className="branch-name">{label}</span>
        {facets.length > 0 && <span className="branch-count">{facets.length}</span>}
      </div>

      {open && (
        <>
          {facets.length >= FILTER_FROM && (
            <input
              className="filter-search"
              placeholder={filterLabel}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}

          {!available && <p className="filter-note">{unavailableLabel}</p>}
          {available && facets.length === 0 && <p className="filter-note">{emptyLabel}</p>}

          <ul>
            {shown.map((facet) => {
              const target: Selection =
                kind === "tag"
                  ? { kind: "tag", name: facet.name }
                  : { kind: "person", name: facet.name };

              return (
                <li key={facet.name}>
                  <div
                    className={`branch${isSelected(facet) ? " branch-on" : ""}`}
                    // Clears the heading's own text column: 8px padding + the 16px
                    // twisty + 12px glyph + two 4px gaps put "Tags" and "People" at
                    // 44px, and an item with neither twisty nor glyph needs the same
                    // number to land under the label rather than left of it.
                    style={{ paddingLeft: "44px" }}
                    onClick={() => onSelect(target)}
                  >
                    <span className="branch-name">
                      {kind === "tag" ? `#${facet.name}` : facet.name}
                    </span>
                    <span className="branch-count">{facet.count}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
