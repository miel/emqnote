import { useState } from "react";
import {
  folderOf,
  TRASH_FOLDER,
  type NoteSummary,
  type Selection,
  type SortKey,
} from "../../shared/vault-types.js";
import { formatListTime, type Locale } from "../../shared/i18n.js";
import { NOTE_DRAG_TYPE } from "./drag.js";
import { isContextMenuKey, roveArrowKey } from "./roving.js";

interface Props {
  notes: NoteSummary[];
  selected: string | null;
  /** What produced this list. A filter draws from everywhere, a folder from one place. */
  showing: Selection;
  /** A search query is currently narrowing the list — results can come from anywhere, same as a tag or a person. */
  searching: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  onSelect: (path: string) => void;
  /** Double-click: hand the note to the capture window for quick editing. */
  onOpenInCapture: (path: string) => void;
  /** The only way in is otherwise the global hotkey; this opens the capture window for
   * a brand new note, the same as pressing it. */
  onNewNote: () => void;
  /** Permanently empties `_trash`. Only ever offered while Trash itself is selected. */
  onClearTrash: () => void;
  /**
   * Which note is being dragged, or null when none is. The tree needs the path to decide
   * whether a folder is a legal destination *while the drag is still in the air*, and
   * `dataTransfer.getData` deliberately answers "" during `dragover` — a page may see
   * what types are on offer, never their contents, until the drop actually happens.
   */
  onDragNote: (path: string | null) => void;
  /**
   * A right-click (or the `ContextMenu` key/Shift+F10) on a row — Open, Move, Rename,
   * Reveal, Delete. The row is handed over whole rather than just its path, so the
   * caller can pre-fill Rename's initial text from `note.title` without waiting on
   * `openNote` to resolve first.
   */
  onContextMenu: (note: NoteSummary, x: number, y: number) => void;
  locale: Locale;
  t: (key: string) => string;
}

const SORTS: SortKey[] = ["modified", "created", "title"];

export function NoteList({
  notes,
  selected,
  showing,
  searching,
  searchQuery,
  onSearchChange,
  sort,
  onSort,
  onSelect,
  onOpenInCapture,
  onNewNote,
  onClearTrash,
  onDragNote,
  onContextMenu,
  locale,
  t,
}: Props): React.ReactElement {
  // Trash is not a folder you add notes to — Clear trash replaces + New note there, the
  // same way Rename/New folder are refused on it in the tree (`Library.tsx`'s
  // `canRenameFolder`/`canCreateFolder`).
  const inTrash = showing.kind === "folder" && showing.path === TRASH_FOLDER;
  // Which row a drag started from, so it can fade while the drag is in the air. Held here
  // rather than lifted alongside `Library`'s own `dragging`: nothing outside this list
  // needs it, and the tree already gets the path it needs through `onDragNote`.
  const [dragging, setDragging] = useState<string | null>(null);

  // The one row in this pane with `tabIndex={0}`. Recomputed against the current list
  // rather than trusted outright: switching folders can leave it pointing at a path that
  // is no longer here at all, and falling back to the first row is simpler than trying to
  // notice that happened and reset it from an effect.
  const [activePath, setActivePath] = useState<string | null>(null);
  const active =
    activePath !== null && notes.some((note) => note.path === activePath)
      ? activePath
      : (notes[0]?.path ?? null);

  return (
    <div className="notes">
      <div className="notes-search">
        <input
          type="text"
          value={searchQuery}
          placeholder={t("library.search")}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      <div className="notes-header">
        <span className="notes-count">
          {notes.length === 0
            ? t("library.noNotes")
            : `${notes.length} ${t(notes.length === 1 ? "library.note" : "library.notes")}`}
        </span>
        <div className="notes-sort">
          {SORTS.map((key) => (
            <button
              key={key}
              type="button"
              className={sort === key ? "sort-on" : ""}
              onClick={() => onSort(key)}
            >
              {t(`library.sort.${key}`)}
            </button>
          ))}
        </div>
        {inTrash ? (
          <button type="button" className="new-note danger" onClick={onClearTrash}>
            {t("library.clearTrash")}
          </button>
        ) : (
          <button type="button" className="new-note" onClick={onNewNote}>
            + {t("library.newNote")}
          </button>
        )}
      </div>

      <ul className="notes-list" role="listbox">
        {notes.map((note) => (
          <li
            key={note.path}
            className={
              `note${selected === note.path ? " note-on" : ""}` +
              `${dragging === note.path ? " note-dragging" : ""}`
            }
            role="option"
            aria-selected={selected === note.path}
            tabIndex={active === note.path ? 0 : -1}
            onFocus={() => setActivePath(note.path)}
            onClick={() => onSelect(note.path)}
            onDoubleClick={() => onOpenInCapture(note.path)}
            onContextMenu={(event) => {
              event.preventDefault();
              onSelect(note.path);
              onContextMenu(note, event.clientX, event.clientY);
            }}
            onKeyDown={(event) => {
              const container = (event.currentTarget as HTMLElement).closest(".notes-list");
              const next = roveArrowKey(event, container, ".note", event.currentTarget);
              if (next !== null) {
                event.preventDefault();
                next.focus();
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                onSelect(note.path);
                return;
              }
              if (isContextMenuKey(event)) {
                event.preventDefault();
                onSelect(note.path);
                const rect = event.currentTarget.getBoundingClientRect();
                onContextMenu(note, rect.left, rect.bottom);
              }
            }}
            // Filing by hand: drag a row onto a folder in the tree. The "Move to…"
            // dialog stays the way to reach a folder four levels deep without hunting
            // for it; this is the one for a folder already in front of you.
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(NOTE_DRAG_TYPE, note.path);
              event.dataTransfer.effectAllowed = "move";
              onDragNote(note.path);
              setDragging(note.path);
            }}
            onDragEnd={() => {
              onDragNote(null);
              setDragging(null);
            }}
          >
            <div className="note-top">
              <span className="note-title">{note.title}</span>
              <span className="note-when">
                {formatListTime(locale, sort === "created" ? note.created : note.modified)}
              </span>
            </div>
            <div className="note-excerpt">{note.excerpt}</div>
            {/* Under a tag, a person or a search the notes come from all over the
                vault, and a list of titles with no idea where they live is hard to
                read. */}
            {(showing.kind !== "folder" || searching) && (
              <div className="note-folder">{folderOf(note.path)}</div>
            )}
            {note.tags.length > 0 && (
              <div className="note-tags">
                {note.tags.map((tag) => (
                  <span key={tag} className="note-tag">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            {/* No longer gated on the kind: any note can carry people now (B20), and a
                quick note with names on it that the list refused to show was the kind of
                thing that makes you doubt whether the field saved at all. */}
            {note.attendees.length > 0 && (
              <div className="note-attendees">{note.attendees.join(", ")}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
