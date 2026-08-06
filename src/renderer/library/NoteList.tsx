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

      <ul className="notes-list">
        {notes.map((note) => (
          <li
            key={note.path}
            className={
              `note${selected === note.path ? " note-on" : ""}` +
              `${dragging === note.path ? " note-dragging" : ""}`
            }
            onClick={() => onSelect(note.path)}
            onDoubleClick={() => onOpenInCapture(note.path)}
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
