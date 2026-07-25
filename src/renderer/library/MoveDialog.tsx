import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  folders: string[];
  current: string;
  onMove: (folder: string) => void;
  onCancel: () => void;
}

/**
 * Scores a folder against what has been typed.
 *
 * Loose subsequence matching across the whole path, so `alph rap` finds
 * `10 Projects/Klant X/Project Alpha/Rapportage` — the point being that moving a note
 * four levels deep should cost a few keystrokes, not a walk through a tree.
 */
function score(path: string, query: string): number | null {
  if (query === "") return 0;

  const haystack = path.toLowerCase();
  let position = 0;
  let hits = 0;

  for (const term of query.toLowerCase().split(/\s+/).filter((t) => t !== "")) {
    const found = haystack.indexOf(term, position);
    if (found === -1) return null;
    // Earlier matches and matches at a word boundary rank higher.
    hits += found === 0 || /[\s/]/.test(haystack[found - 1] ?? "") ? 2 : 1;
    position = found + term.length;
  }

  // Shorter paths win ties: the more specific folder is usually the deeper one you
  // typed enough of, not the long one that happens to contain the letters.
  return hits * 1000 - path.length;
}

export function MoveDialog({
  folders,
  current,
  onMove,
  onCancel,
}: Props): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => input.current?.focus(), []);

  const matches = useMemo(() => {
    return folders
      .filter((folder) => folder !== current)
      .map((folder) => ({ folder, rank: score(folder, query) }))
      .filter((entry): entry is { folder: string; rank: number } => entry.rank !== null)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 12);
  }, [folders, current, query]);

  useEffect(() => setActive(0), [query]);

  const choose = (index: number): void => {
    const picked = matches[index];
    if (picked !== undefined) onMove(picked.folder);
  };

  return (
    <div className="overlay" onMouseDown={onCancel}>
      <div className="palette" onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={input}
          value={query}
          placeholder="Move to which folder?"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
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
          {matches.length === 0 && <li className="palette-empty">No folder matches</li>}
          {matches.map((entry, index) => (
            <li
              key={entry.folder}
              className={index === active ? "palette-on" : ""}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              {entry.folder === "" ? "Vault root" : entry.folder}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
