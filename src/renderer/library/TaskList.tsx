import { useEffect, useRef, useState } from "react";
import { folderOf, type TaskItem } from "../../shared/vault-types.js";
import { drawBox } from "../editor/checkbox.js";
import { ChromeButton } from "../ChromeButton.js";
import { PaneFooter } from "../PaneFooter.js";
import { PaneHeader } from "../PaneHeader.js";
import { tasksGlyph } from "./FolderTree.js";
import { roveArrowKey } from "./roving.js";

interface Props {
  scope: string;
  openOnly: boolean;
  /** Every folder in the vault, flattened — the same list `MoveDialog` builds from the tree, for the scope dropdown. */
  folders: string[];
  /**
   * Only the tasks written in the note the reader has open beside this list.
   *
   * A third filter rather than a scope value, because it is not a place in the vault: the
   * note being read can sit anywhere, including outside the folder the view is scoped to.
   * That is why it *overrides* `scope` below rather than narrowing it — a tick that could
   * show nothing because the note is filed elsewhere would be a worse control than no
   * tick at all.
   */
  noteOnly: boolean;
  /** The note the reader has open, or null. What `noteOnly` means; also what disables it. */
  notePath: string | null;
  onScopeChange: (scope: string) => void;
  onOpenOnlyChange: (openOnly: boolean) => void;
  onNoteOnlyChange: (noteOnly: boolean) => void;
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
  noteOnly,
  notePath,
  folders,
  onScopeChange,
  onOpenOnlyChange,
  onNoteOnlyChange,
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

  // "This note only" with no note open is not a filter at all — the checkbox is disabled
  // in that state, and this is the same rule written where the list is built, so a tick
  // left over from a note that has since been closed shows the scope rather than nothing.
  const onlyNote = noteOnly && notePath !== null ? notePath : null;

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      // The note's own folder, not `scope`: the note being read can be filed anywhere,
      // and `tasksIn` scopes by path prefix, so its folder is the narrowest query that is
      // certain to contain it. The rows are then cut to the one note here — the index has
      // no per-note query and does not need one for a list this short.
      const found = await window.emqnote.library.tasks(
        onlyNote === null ? scope : folderOf(onlyNote),
        openOnly,
      );
      if (!cancelled) {
        setItems(onlyNote === null ? found : found.filter((item) => item.path === onlyNote));
      }
    };

    void load();
    const stop = window.emqnote.library.onRefresh(() => void load());

    return () => {
      cancelled = true;
      stop();
    };
  }, [scope, openOnly, onlyNote]);

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
      {/* The same 40px band the folder tree and the note list wear, so this view does not
          break the line across the top of the window when it replaces the note list.

          What is in it is the *narrowest* of the three filters, and it is here rather than
          in the toolbar below because it is the one that answers a question about the note
          you are already reading: "what is still open in this one". It is a checkbox and
          not a `ChromeButton` for the same reason "open only" is — the two are settings the
          list is showing under, not actions, and a pressed-looking button is a state you
          have to already know how to read (B78's argument, from the other side).

          Disabled with no note open, which is a real state here: the view can be reached
          from the sidebar with the reader empty. Its title says so, rather than leaving a
          greyed control with nothing explaining itself. */}
      <PaneHeader
        title={t("library.tasks")}
        actions={
          <label
            className={`task-note-only${notePath === null ? " task-note-only-off" : ""}`}
            title={notePath ?? t("tasks.noteOnlyNone")}
          >
            <input
              type="checkbox"
              checked={onlyNote !== null}
              disabled={notePath === null}
              onChange={(event) => onNoteOnlyChange(event.target.checked)}
            />
            {t("tasks.noteOnly")}
          </label>
        }
      />

      {/* Below the band rather than inside it, which is where the note's own
          When/Where/Tags/Who block sits for the same reason: these two are what the view
          is scoped *to*, they are wider than a 40px row of buttons, and the shared line
          across the three panes is what would pay for putting them up there. */}
      <div className="task-toolbar">
        {/* Disabled while "this note only" is ticked, because that tick overrides it: a
            chooser still offering to narrow a list it no longer decides would be saying
            something untrue. The value stays visible and comes straight back when the
            tick goes. */}
        <select
          className="task-scope"
          value={scope}
          disabled={onlyNote !== null}
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

      {/* The count, in the 28px band the note list keeps its own count in — and the way
          out, in the seat the note list's own Tasks button sits in.

          That is the point of it being here: the button that opens this view and the
          button that closes it are the same size, the same glyph and the same place, so
          the pair reads as one control being pressed twice rather than as two. It has
          moved three times now (the head of the toolbar, the count row, the header band)
          and what has held every time is that it is a *word*: `--click-button="Exit tasks"`
          is how the packaged self-test leaves this view, and a glyph gives it nothing to
          match on.

          `offTabOrder` for the same trade B94 made for the button it mirrors: this footer
          sits between the list and the note, so a Tab stop in it lands in the middle of
          the order the eye reads. Both of this view's other ways out are keys — Escape,
          and the `Mod+T` that opened it — so the control is not the only route. */}
      <PaneFooter
        status={
          <span className="notes-count">
            {items.length === 0
              ? t("tasks.none")
              : `${items.length} ${t(items.length === 1 ? "tasks.one" : "tasks.many")}`}
          </span>
        }
        actions={
          <ChromeButton
            label={t("tasks.exit")}
            className="task-exit"
            icon={tasksGlyph}
            small
            offTabOrder
            onClick={onExit}
          />
        }
      />
    </div>
  );
}
