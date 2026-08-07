import { useEffect, useMemo, useRef, useState } from "react";
import { trapTab } from "./focus-trap.js";
import { score } from "./fuzzy.js";

interface Props {
  folders: string[];
  current: string;
  onMove: (folder: string) => void;
  onCancel: () => void;
  t: (key: string) => string;
}

export function MoveDialog({
  folders,
  current,
  onMove,
  onCancel,
  t,
}: Props): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => input.current?.focus(), []);

  const matches = useMemo(() => {
    return folders
      .filter((folder) => folder !== current)
      .map((folder) => ({ folder, rank: score(folder, query) }))
      .filter((entry): entry is { folder: string; rank: number } => entry.rank !== null)
      .sort((a, b) => b.rank - a.rank)
      // Enough to scroll through when nothing is typed yet; the whole point of
      // opening this is to see where a note could go.
      .slice(0, 50);
  }, [folders, current, query]);

  useEffect(() => setActive(0), [query]);

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
              setActive((index) => Math.min(index + 1, matches.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
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

        <ul className="palette-list">
          {matches.length === 0 && <li className="palette-empty">{t("library.noFolderMatch")}</li>}
          {matches.map((entry, index) => (
            <li
              key={entry.folder}
              className={index === active ? "palette-on" : ""}
              onMouseEnter={() => setActive(index)}
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
