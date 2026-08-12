import { useEffect, useRef, useState } from "react";
import { trapTab } from "./focus-trap.js";
import type { LinkCandidateSummary } from "../../shared/vault-types.js";

interface Props {
  /** Seeds the filter — the words that were selected when the picker opened, if any. */
  initialQuery: string;
  onPick: (candidate: LinkCandidateSummary) => void;
  onCancel: () => void;
  t: (key: string) => string;
}

/** The same 150 ms the library's own search bar waits, and for the same reason. */
const DEBOUNCE_MS = 150;

/**
 * Which note a `[[…]]` link should point at (B41).
 *
 * The sibling of `LinkPicker`, which asks the same question from the other end: that one
 * is handed a short list of notes a link already resolves to, this one searches the whole
 * vault for a link that does not exist yet. Hence the filter box, which `LinkPicker`
 * deliberately has none of — here the list is the vault.
 *
 * The filtering happens in **main**, not here. `MoveDialog` scores a folder list it was
 * handed, because there are a few dozen folders and they all arrived in one call; a vault
 * has thousands of notes, and the index already answers this question with FTS5 behind
 * `IPC.linkCandidates`. It comes free with the search bar's own filter language, so
 * `tag:klantx` narrows the picker exactly as it narrows the note list.
 *
 * This lives in `library/` beside its sibling but is used by **both** windows — the
 * `ContextMenu.tsx` arrangement, and why the `.palette` surface it draws on now lives in
 * `styles.css` rather than `library.css`.
 */
export function NotePicker({ initialQuery, onPick, onCancel, t }: Props): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [matches, setMatches] = useState<LinkCandidateSummary[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  useEffect(() => {
    // `cancelled` rather than an abort: two answers can be in flight after a fast typist
    // backspaces, and the older one must not be allowed to land last and overwrite the
    // list the newer query produced.
    let cancelled = false;

    const timer = setTimeout(() => {
      void window.emqnote.linkCandidates(query).then((found) => {
        if (cancelled) return;
        setMatches(found);
        setActive(0);
      });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const choose = (index: number): void => {
    const picked = matches[index];
    if (picked !== undefined) onPick(picked);
  };

  return (
    <div className="overlay" onMouseDown={onCancel}>
      <div className="palette" ref={panel} onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={input}
          value={query}
          placeholder={t("link.whichNoteToLink")}
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
          {matches.length === 0 && <li className="palette-empty">{t("link.noNoteMatch")}</li>}
          {matches.map((candidate, index) => (
            <li
              key={candidate.path}
              className={index === active ? "palette-on" : ""}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span className="palette-primary">{candidate.title}</span>
              <span className="palette-secondary">
                {candidate.folder === "" ? t("library.vaultRoot") : candidate.folder}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
