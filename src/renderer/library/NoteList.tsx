import type { NoteSummary, SortKey } from "../../shared/vault-types.js";

interface Props {
  notes: NoteSummary[];
  selected: string | null;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  onSelect: (path: string) => void;
}

function when(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";

  const today = new Date();
  const sameDay =
    parsed.getFullYear() === today.getFullYear() &&
    parsed.getMonth() === today.getMonth() &&
    parsed.getDate() === today.getDate();

  return parsed.toLocaleString(undefined, {
    day: sameDay ? undefined : "numeric",
    month: sameDay ? undefined : "short",
    year:
      parsed.getFullYear() === today.getFullYear() || sameDay ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "modified", label: "Modified" },
  { key: "created", label: "Created" },
  { key: "title", label: "Title" },
];

export function NoteList({
  notes,
  selected,
  sort,
  onSort,
  onSelect,
}: Props): React.ReactElement {
  return (
    <div className="notes">
      <div className="notes-header">
        <span className="notes-count">
          {notes.length === 0
            ? "No notes"
            : `${notes.length} note${notes.length === 1 ? "" : "s"}`}
        </span>
        <div className="notes-sort">
          {SORTS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={sort === option.key ? "sort-on" : ""}
              onClick={() => onSort(option.key)}
            >
              {option.label}
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
                {when(sort === "created" ? note.created : note.modified)}
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
