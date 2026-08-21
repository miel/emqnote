import { useEffect, useRef, useState } from "react";
import type { TaskItem } from "../../shared/vault-types.js";
import { drawBox } from "../editor/checkbox.js";
import { roveArrowKey } from "./roving.js";

interface Props {
  scope: string;
  openOnly: boolean;
  /** Every folder in the vault, flattened — the same list `MoveDialog` builds from the tree, for the scope dropdown. */
  folders: string[];
  onScopeChange: (scope: string) => void;
  onOpenOnlyChange: (openOnly: boolean) => void;
  /** Back to the folder list. The button below and Escape both call it. */
  onExit: () => void;
  /** Opens the note in the reader beside this list — clicking a row's text, not its checkbox. */
  onOpenNote: (path: string, ordinal: number) => void;
  /**
   * Flips one item through the serializer, in the main process — never here. Resolves to
   * whether the flip actually landed, so this component can revert its own optimistic
   * change when it did not (a stale row, or the capture window has the note claimed).
   */
  onToggle: (path: string, ordinal: number, expectedText: string) => Promise<boolean>;
  t: (key: string) => string;
}

/** One row's identity: `ordinal` alone is only unique within its own note. */
function rowKey(item: TaskItem): string {
  return `${item.path}#${item.ordinal}`;
}

/**
 * The checkbox on one row, drawn through the same `drawBox` the editor's own task
 * checkboxes use (`checkbox.ts`), so the two places a box appears cannot drift apart.
 * `drawBox` returns a raw `SVGElement` rather than JSX — it was written for a ProseMirror
 * widget decoration — so this mounts it by hand instead of translating it into markup a
 * second time.
 */
function TaskCheckbox({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const holder = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    holder.current?.replaceChildren(drawBox(checked));
  }, [checked]);

  return (
    <button
      type="button"
      ref={holder}
      className="task-row-check"
      role="checkbox"
      aria-checked={checked}
      // Not a Tab stop of its own — the row itself carries this pane's roving
      // `tabIndex`, the same as a branch or a note row, so Tab moves between tasks
      // rather than in and out of each one's two sub-controls.
      tabIndex={-1}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    />
  );
}

/**
 * The aggregated Tasks view — item 6 of the plan. A fourth `Selection` kind rather than a
 * lens on the folder currently browsed: it reads across the whole vault by default, with
 * its own scope dropdown to narrow it, because the open items in a project are usually
 * spread across several notes in one folder tree, not sitting in whichever one happens to
 * be selected on the left.
 *
 * Loads its own data and reloads on every `library:refresh` — the same event the rest of
 * the window already reacts to, since a toggle from here, a toggle made inside the editor,
 * or an edit that added or removed a task item all funnel through that one broadcast.
 */
export function TaskList({
  scope,
  openOnly,
  folders,
  onScopeChange,
  onOpenOnlyChange,
  onExit,
  onOpenNote,
  onToggle,
  t,
}: Props): React.ReactElement {
  const [items, setItems] = useState<TaskItem[]>([]);
  // Same roving-tabIndex fallback `NoteList` uses: recomputed against the current items
  // rather than trusted, since a scope change or a toggle-driven reload can leave it
  // pointing at a row that just scrolled out of the list entirely.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active =
    activeKey !== null && items.some((item) => rowKey(item) === activeKey)
      ? activeKey
      : (items[0] !== undefined ? rowKey(items[0]) : null);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      const found = await window.emqnote.library.tasks(scope, openOnly);
      if (!cancelled) setItems(found);
    };

    void load();
    const stop = window.emqnote.library.onRefresh(() => void load());

    return () => {
      cancelled = true;
      stop();
    };
  }, [scope, openOnly]);

  const toggle = async (item: TaskItem): Promise<void> => {
    setItems((current) =>
      current.map((entry) =>
        rowKey(entry) === rowKey(item) ? { ...entry, checked: !entry.checked } : entry,
      ),
    );

    const ok = await onToggle(item.path, item.ordinal, item.text);
    if (!ok) {
      // Reverts to `item.checked` — the value from before the optimistic flip above —
      // rather than to `!item.checked`, so a second failed toggle on the same stale row
      // does not walk the displayed state further from what disk actually has.
      setItems((current) =>
        current.map((entry) =>
          rowKey(entry) === rowKey(item) ? { ...entry, checked: item.checked } : entry,
        ),
      );
    }
  };

  return (
    // No Escape handler here, deliberately. It was here first, and driven in the real app
    // it did nothing for the two commonest ways of standing in this view: arriving by the
    // sidebar row leaves focus in the tree, and clicking the empty space below the last
    // task leaves it on `<body>` — neither is inside this element, so neither reached it.
    // `Library.tsx`'s window listener owns the key instead, which sees it from anywhere.
    <div className="notes task-list">
      <div className="task-toolbar">
        {/* Named, not an ×. `--click-button="Exit tasks"` is how the packaged self-test
            reaches it, and a glyph has no label for that to match — the same reason the
            sort chooser says its own name. */}
        <button type="button" className="task-exit" onClick={onExit}>
          {t("tasks.exit")}
        </button>

        <select
          className="task-scope"
          value={scope}
          onChange={(event) => onScopeChange(event.target.value)}
        >
          <option value="">{t("library.vaultRoot")}</option>
          {folders
            .filter((folder) => folder !== "")
            .map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
        </select>

        <label className="task-open-only">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(event) => onOpenOnlyChange(event.target.checked)}
          />
          {t("tasks.openOnly")}
        </label>
      </div>

      <div className="notes-header">
        <span className="notes-count">
          {items.length === 0
            ? t("tasks.none")
            : `${items.length} ${t(items.length === 1 ? "tasks.one" : "tasks.many")}`}
        </span>
      </div>

      <ul className="task-rows" role="listbox">
        {items.map((item) => (
          <li
            key={rowKey(item)}
            className="task-row"
            role="option"
            aria-selected={active === rowKey(item)}
            tabIndex={active === rowKey(item) ? 0 : -1}
            onFocus={() => setActiveKey(rowKey(item))}
            onKeyDown={(event) => {
              const container = (event.currentTarget as HTMLElement).closest(".task-rows");
              const next = roveArrowKey(event, container, ".task-row", event.currentTarget);
              if (next !== null) {
                event.preventDefault();
                next.focus();
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                onOpenNote(item.path, item.ordinal);
                return;
              }
              if (event.key === " ") {
                event.preventDefault();
                void toggle(item);
              }
            }}
          >
            <TaskCheckbox checked={item.checked} onToggle={() => void toggle(item)} />
            <button
              type="button"
              className="task-row-text"
              tabIndex={-1}
              onClick={() => onOpenNote(item.path, item.ordinal)}
            >
              <span className="task-row-title">
                {item.text === "" ? t("tasks.empty") : item.text}
              </span>
              <span className="task-row-note">
                {item.title} · {item.path}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
