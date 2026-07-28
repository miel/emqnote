import type { NoteSummary, Selection, SortKey } from "../../shared/vault-types.js";
import { formatListTime, type Locale } from "../../shared/i18n.js";

interface Props {
  notes: NoteSummary[];
  selected: string | null;
  /** What produced this list. A filter draws from everywhere, a folder from one place. */
  showing: Selection;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  onSelect: (path: string) => void;
  locale: Locale;
  t: (key: string) => string;
}

const SORTS: SortKey[] = ["modified", "created", "title"];

/** The folder a note sits in, for a list that is not itself one folder. */
function folderOf(notePath: string): string {
  const cut = notePath.lastIndexOf("/");
  return cut === -1 ? "" : notePath.slice(0, cut);
}

export function NoteList({
  notes,
  selected,
  showing,
  sort,
  onSort,
  onSelect,
  locale,
  t,
}: Props): React.ReactElement {
  return (
    <div className="notes">
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
      </div>

      <ul className="notes-list">
        {notes.map((note) => (
          <li
            key={note.path}
            className={`note${selected === note.path ? " note-on" : ""}`}
            onClick={() => onSelect(note.path)}
          >
            <div className="note-top">
              <span className="note-title">{note.title}</span>
              <span className="note-when">
                {formatListTime(locale, sort === "created" ? note.created : note.modified)}
              </span>
            </div>
            <div className="note-excerpt">{note.excerpt}</div>
            {/* Under a tag or a person the notes come from all over the vault, and a
                list of titles with no idea where they live is hard to read. */}
            {showing.kind !== "folder" && (
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
