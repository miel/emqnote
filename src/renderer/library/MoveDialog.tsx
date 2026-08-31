import { useEffect, useMemo, useRef, useState } from "react";
import { trapTab } from "./focus-trap.js";
import { score } from "./fuzzy.js";
import { useActiveRowVisible, useHoverGuard } from "./palette-scroll.js";

interface Props {
  folders: string[];
  /**
   * The folder the thing being moved is already in, left out of the list — there is
   * nothing to ask for there.
   *
   * `null` leaves every folder in, which is what several notes out of *different* folders
   * mean (B94): with the set split, every folder in the vault is a real destination for
   * something in it.
   */
  current: string | null;
  /**
   * One folder to offer first while nothing has been typed — Restore's Inbox, which is
   * where a note coming back out of the trash nearly always belongs.
   *
   * Only while the query is empty, and that half is the point: once something is typed
   * the ranking *is* the answer to what was typed, and a folder pinned above better
   * matches would be this dialog quietly overruling the search it just offered. It is a
   * nudge at the top of an unfiltered list, not a preference the list carries around.
   */
  preferred?: string;
  onMove: (folder: string) => void;
  onCancel: () => void;
  t: (key: string) => string;
}

export function MoveDialog({
  folders,
  current,
  preferred,
  onMove,
  onCancel,
  t,
}: Props): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => input.current?.focus(), []);

  const matches = useMemo(() => {
    const ranked = folders
      .filter((folder) => folder !== current)
      .map((folder) => ({ folder, rank: score(folder, query) }))
      .filter((entry): entry is { folder: string; rank: number } => entry.rank !== null)
      .sort((a, b) => b.rank - a.rank);

    // Lifted before the cap, not after: with nothing typed every folder scores 0, so the
    // fifty that survive are simply the first fifty in tree order — and in a vault with
    // more folders than that the one this dialog most wants to offer could be among the
    // ones cut. Same reasoning as `FilterSection` keeping the selected facet on its list.
    if (query === "" && preferred !== undefined) {
      const index = ranked.findIndex((entry) => entry.folder === preferred);
      if (index > 0) ranked.unshift(...ranked.splice(index, 1));
    }

    // Enough to scroll through when nothing is typed yet; the whole point of
    // opening this is to see where a note could go.
    return ranked.slice(0, 50);
  }, [folders, current, preferred, query]);

  useEffect(() => setActive(0), [query]);

  // Fifty folders in a list six deep: the same "the list does not scroll" the note picker
  // was reported for, one component over. See `palette-scroll.ts`.
  useActiveRowVisible(list, active, matches);
  const pointer = useHoverGuard();

  const choose = (index: number): void => {
    const picked = matches[index];
    if (picked !== undefined) onMove(picked.folder);
  };

  return (
    <div className="overlay" onMouseDown={onCancel}>
      <div
        className="palette"
        ref={panel}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={input}
          value={query}
          placeholder={t("library.moveWhere")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            trapTab(event, panel.current);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              pointer.keyboardMoved();
              setActive((index) => Math.min(index + 1, matches.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              pointer.keyboardMoved();
              setActive((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              choose(active);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
        />

        <ul className="palette-list" ref={list}>
          {matches.length === 0 && <li className="palette-empty">{t("library.noFolderMatch")}</li>}
          {matches.map((entry, index) => (
            <li
              key={entry.folder}
              className={index === active ? "palette-on" : ""}
              onMouseEnter={(event) => {
                if (pointer.hover(event)) setActive(index);
              }}
              onClick={() => choose(index)}
            >
              {entry.folder === "" ? t("library.vaultRoot") : entry.folder}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
