import { useEffect, useRef, useState } from "react";

interface Props {
  /** Where the popover is anchored — the caret, or the toolbar button that opened it. */
  x: number;
  y: number;
  onPick: (rows: number, columns: number) => void;
  onCancel: () => void;
  t: (key: string) => string;
}

/**
 * Eight each way. Word offers ten columns; eight is what fits a note's width without
 * the table immediately needing a horizontal scroll, and a table wider than that is
 * better grown a column at a time from the menu than guessed at up front.
 */
const MAX = 8;

/**
 * Choosing a table's size (B42) — the Word gesture, because the whole editor is built
 * around not making someone who knows Word learn a second set of habits.
 *
 * Hover or arrow-key to a size, click or Enter to insert. Deliberately keyboard-complete
 * rather than pointer-only: `Mod+Alt+T` opens it, and a grid that then required a mouse
 * would be the one shortcut in the registry that does not finish what it starts.
 *
 * It sits in `src/renderer/` rather than `library/` because both windows have it, and its
 * CSS is in `styles.css` for the same reason — the `ContextMenu.tsx` arrangement.
 */
export function TableGrid({ x, y, onPick, onCancel, t }: Props): React.ReactElement {
  const panel = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(1);
  const [columns, setColumns] = useState(1);
  const [at, setAt] = useState({ x, y });

  useEffect(() => panel.current?.focus(), []);

  // Clamped to the window after mounting, so a grid opened from a caret near the right
  // edge does not hang off it — the same thing `ContextMenu` does, for the same reason.
  useEffect(() => {
    const element = panel.current;
    if (element === null) return;

    const box = element.getBoundingClientRect();
    setAt({
      x: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)),
    });
  }, [x, y]);

  const move = (downBy: number, rightBy: number): void => {
    setRows((value) => Math.min(MAX, Math.max(1, value + downBy)));
    setColumns((value) => Math.min(MAX, Math.max(1, value + rightBy)));
  };

  return (
    <div className="overlay overlay-bare" onMouseDown={onCancel}>
      <div
        className="table-grid"
        ref={panel}
        tabIndex={-1}
        style={{ left: at.x, top: at.y }}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            move(1, 0);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            move(-1, 0);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            move(0, 1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(0, -1);
          } else if (event.key === "Enter") {
            event.preventDefault();
            onPick(rows, columns);
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="table-grid-cells" role="presentation">
          {Array.from({ length: MAX * MAX }, (_unused, index) => {
            const row = Math.floor(index / MAX) + 1;
            const column = (index % MAX) + 1;
            const on = row <= rows && column <= columns;

            return (
              <span
                key={index}
                className={on ? "table-grid-cell table-grid-on" : "table-grid-cell"}
                onMouseEnter={() => {
                  setRows(row);
                  setColumns(column);
                }}
                onClick={() => onPick(row, column)}
              />
            );
          })}
        </div>

        <p className="table-grid-readout">
          {t("table.size").replace("{columns}", String(columns)).replace("{rows}", String(rows))}
        </p>
      </div>
    </div>
  );
}
