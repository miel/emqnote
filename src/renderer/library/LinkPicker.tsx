import { useEffect, useRef, useState } from "react";
import { trapTab } from "./focus-trap.js";
import { useActiveRowVisible, useHoverGuard } from "./palette-scroll.js";
import type { LinkCandidateSummary } from "../../shared/vault-types.js";

interface Props {
  target: string;
  candidates: LinkCandidateSummary[];
  onOpen: (path: string) => void;
  onCancel: () => void;
  t: (key: string) => string;
}

/**
 * Which of several notes a `[[…]]` link meant (B35).
 *
 * A vault may hold `01 Projecten/Rules` and `02 Klanten/Rules` — the user asked for that
 * explicitly, and `link-resolve.ts` refuses to guess between them. This is what asking
 * looks like: the notes that answer to the target, each shown with the folder it lives
 * in, because the folder is the only thing telling them apart.
 *
 * Modelled on `MoveDialog` rather than on `Ask`: arrow keys and Enter, an overlay that
 * cancels, and Escape. No filter box — the list is by definition short, and a target with
 * enough matches to need searching is a naming problem, not a picker problem.
 */
export function LinkPicker({
  target,
  candidates,
  onOpen,
  onCancel,
  t,
}: Props): React.ReactElement {
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  // Focus lands on the list itself, not on a row: the rows are `<li>`s, and the keyboard
  // handling below is one handler for the whole list rather than a roving tabindex, which
  // would be a second implementation of `roving.ts` for four items in a modal.
  useEffect(() => list.current?.focus(), []);

  // Short by construction, so this rarely has anything to do — but "rarely" is not
  // "never" (a common word as a filename can answer to a dozen notes), and the arrow keys
  // here work exactly as they do in the note picker. See `palette-scroll.ts`.
  useActiveRowVisible(list, active, candidates);
  const pointer = useHoverGuard();

  const choose = (index: number): void => {
    const picked = candidates[index];
    if (picked !== undefined) onOpen(picked.path);
  };

  return (
    <div className="overlay" onMouseDown={onCancel}>
      <div className="palette" ref={panel} onMouseDown={(event) => event.stopPropagation()}>
        <p className="palette-title">
          {t("link.whichNote")} <strong>{target}</strong>
        </p>

        <ul
          className="palette-list"
          ref={list}
          tabIndex={0}
          onKeyDown={(event) => {
            trapTab(event, panel.current);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              pointer.keyboardMoved();
              setActive((index) => Math.min(index + 1, candidates.length - 1));
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
        >
          {candidates.map((candidate, index) => (
            <li
              key={candidate.path}
              className={index === active ? "palette-on" : ""}
              onMouseEnter={(event) => {
                if (pointer.hover(event)) setActive(index);
              }}
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
