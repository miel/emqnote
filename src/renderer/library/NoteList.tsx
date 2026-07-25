import type { NoteSummary, SortKey } from "../../shared/vault-types.js";
import { formatListTime, type Locale } from "../../shared/i18n.js";

interface Props {
  notes: NoteSummary[];
  selected: string | null;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  onSelect: (path: string) => void;
  locale: Locale;
  t: (key: string) => string;
}

const SORTS: SortKey[] = ["modified", "created", "title"];

export function NoteList({
  notes,
  selected,
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
            {note.kind === "meeting" && note.attendees.length > 0 && (
              <div className="note-attendees">{note.attendees.join(", ")}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
