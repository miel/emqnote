import { useRef, useState, type RefObject } from "react";
import {
  folderOf,
  TRASH_FOLDER,
  type FileSummary,
  type NoteSummary,
  type Selection,
  type SortKey,
  type TaskCount,
} from "../../shared/vault-types.js";
import { formatListTime, type Locale } from "../../shared/i18n.js";
import { ContextMenu } from "./ContextMenu.js";
import { NOTE_DRAG_TYPE } from "./drag.js";
import { isContextMenuKey, roveArrowKey } from "./roving.js";

interface Props {
  notes: NoteSummary[];
  /**
   * Open and total task items per note path, for the count under the date.
   *
   * `null` is "not counted yet" and a missing key is "this note has no task items" —
   * `FolderNode.openTasks`'s rule, for `FolderNode.openTasks`'s reason: the rows come off
   * a `readdir` and this comes from behind the index scan, so a row must never be able to
   * claim a note is clear while the answer is still on its way.
   */
  noteTasks: Record<string, TaskCount> | null;
  /**
   * The non-note files in the folder being browsed (B47) — empty for a tag, a person or a
   * search, none of which has an answer to "which files are here".
   */
  files: FileSummary[];
  /**
   * Whether that list is still being worked out, or could not be.
   *
   * Only the unlinked-attachment pane is ever anything but `"ready"`: a folder's files are
   * one `readdir` answered before the pane renders, while the unlinked ones are a search over
   * the whole index. Those two states are not decoration — the modal this pane replaced
   * had exactly one state, and a rejected `invoke` left it saying "Looking…" for the rest
   * of the session with nothing on screen to say why.
   */
  filesState: "ready" | "loading" | "failed";
  selected: string | null;
  /** The file row that is selected, if the selection is a file rather than a note. */
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  /** What produced this list. A filter draws from everywhere, a folder from one place. */
  showing: Selection;
  /** A search query is currently narrowing the list — results can come from anywhere, same as a tag or a person. */
  searching: boolean;
  searchQuery: string;
  /**
   * The search box itself, so `Library.tsx` can put the caret in it on Mod-F.
   *
   * A ref handed down, the way `Capture.tsx` hands `subjectRef` to `HeaderBlock`, rather
   * than a `querySelector` from the window root: `focusPane` reaches for a selector
   * because it is hunting for *whichever* row happens to be the tab stop, and this is not
   * that question — there is exactly one search box and this is it.
   */
  searchRef?: RefObject<HTMLInputElement | null>;
  onSearchChange: (query: string) => void;
  /**
   * Whether the search box is looking at the whole vault rather than the folder in the
   * tree (B83). Always a boolean, including where the question does not arise — a tag, a
   * person, the unlinked pane — because it is `Library.tsx`'s state either way and this
   * component does not decide it. `scopeable` below is what says whether to draw a switch.
   */
  searchAll: boolean;
  onSearchAllChange: (all: boolean) => void;
  /** True while the tree selection is a folder, which is the only time a scope switch means anything. */
  scopeable: boolean;
  /**
   * Leaves the search: empties the box, puts the folder's own list back and hands focus to
   * the note that was selected in it. Escape in the box and the × both call it; Escape on a
   * row goes through the window's own listener, which knows where the press came from.
   */
  onExitSearch: () => void;
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
   * The Tasks view — the very handler the sidebar's Tasks row is given, not a copy of
   * what it does. Two gestures that mean the same thing have to *be* the same thing, or
   * the day one of them learns about a new scope the other will not.
   */
  onOpenTasks: () => void;
  /**
   * Which note is being dragged, or null when none is. The tree needs the path to decide
   * whether a folder is a legal destination *while the drag is still in the air*, and
   * `dataTransfer.getData` deliberately answers "" during `dragover` — a page may see
   * what types are on offer, never their contents, until the drop actually happens.
   */
  onDragNote: (path: string | null) => void;
  /**
   * A right-click (or the `ContextMenu` key/Mod-Shift-M) on a row — Open, Move, Rename,
   * Reveal, Delete. The row is handed over whole rather than just its path, so the
   * caller can pre-fill Rename's initial text from `note.title` without waiting on
   * `openNote` to resolve first.
   */
  onContextMenu: (note: NoteSummary, x: number, y: number) => void;
  /**
   * The same gesture on a file row — Copy link, Reveal, and Delete in the unlinked pane
   * only. The whole `FileSummary` is handed over rather than its path, because the link
   * spelling the menu copies depends on the file's own name.
   */
  onFileContextMenu: (file: FileSummary, x: number, y: number) => void;
  /**
   * Taking the pin off a pinned row by clicking the pin itself.
   *
   * Only ever unpins: the mark is only drawn on a note that has one, so there is no state
   * this can be pressed in where "pin" is the meaning. It goes through `Library.tsx`'s own
   * `setPinned` like the context-menu item and the shortcut do — that is where main's two
   * refusals are turned into a dialog and where the list is reloaded, and a second route
   * that skipped it would be a second definition of what unpinning costs.
   */
  onUnpin: (note: NoteSummary) => void;
  /**
   * B76: whether the pinned rows stay against the top edge while the rest of the list
   * scrolls under them, rather than scrolling away with it.
   *
   * The order is not this setting's business either way — pinned notes come first because
   * `Library.tsx`'s `sortNotes` puts them there (B75), on or off. All this decides is
   * whether the rows that are already at the top are allowed to leave the screen.
   */
  keepPinnedInView: boolean;
  /**
   * Whether the pin orders this list at all (B77) — true for a folder with no search
   * running, false for a tag, a person, the tasks view and any list a query produced.
   *
   * Handed down rather than worked out from `showing` and `searching` here, so the shelf
   * and `Library.tsx`'s `sortNotes` are answering one question and cannot come to differ:
   * a shelf drawn over rows the sort did not float is rows in the wrong order.
   */
  pinsApply: boolean;
  /** Which platform's modifier spelling `isContextMenuKey` should compare the keydown against. */
  isMac: boolean;
  locale: Locale;
  t: (key: string) => string;
}

const SORTS: SortKey[] = ["modified", "created", "title"];

/**
 * The mark on a pinned row (B75) — a drawing pin, drawn rather than typed.
 *
 * The house style `FolderTree.tsx`'s three glyphs already set: an inline SVG in
 * `currentColor`, not an emoji. 📌 comes from a different fallback font on each of the two
 * machines this runs on and would be the only colour thing in the list.
 *
 * Drawn upright — a tack seen head-on — rather than as the tilted pin the first attempt
 * aimed at. Two reasons, and the second is the one that matters. The tilted drawing was
 * wrong: its shaft stopped short of the crossbar and its needle started off the body, so it
 * read as three unconnected strokes. And it is rendered at 12px (`.note-pin svg`), where a
 * 45° body with arcs in it has no room to be anything but a smudge; an upright tack is
 * symmetric about a whole pixel column and every line in it is horizontal or nearly so, so
 * it survives the size it is actually used at.
 */
const pinGlyph = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M3.4 8h9.2M6.4 3.2 5.5 8M9.6 3.2 10.5 8M6.4 3.2h3.2M8 8v5.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The mark on the sort chooser — an arrow up beside an arrow down, the sign every file
 * manager and mail client uses for "this is what the list is ordered by".
 *
 * Same house style as `pinGlyph` above and `FolderTree.tsx`'s three: an inline SVG in
 * `currentColor` at the 12px slot this window's icon column uses, never an emoji. The two
 * arrows sit on whole pixel columns (x = 5 and x = 11 of 16) and their shafts are vertical,
 * so nothing in the drawing depends on a subpixel landing the right way at that size.
 *
 * It does *not* say which direction the sort runs: there is no direction to choose in this
 * app — the date keys are always newest first and the title always A–Z — and a glyph
 * implying a toggle that does not exist would be an invitation to click it.
 */
const sortGlyph = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M5 13V3M2.6 5.4 5 3l2.4 2.4M11 3v10M8.6 10.6 11 13l2.4-2.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The query language, as rows.
 *
 * It used to be the search box's placeholder — the whole of
 * `type:meeting tag:klantx attendee:"Jan de Vries" after:2026-01-01` in a field a few
 * centimetres wide, unreadable at that width and gone the moment you typed. A hint you
 * cannot read while you need it is not a hint.
 *
 * The example is the *point* rather than decoration: `attendee:"Jan de Vries"` is the one
 * that carries the quoting rule, and `after:` and `before:` are the two whose date format
 * nothing else states. Kept beside the box that uses them and read by
 * `src/main/search-query.ts`, which is where the parsing lives — a row here with no token
 * there is a promise the search will not keep.
 */
const SEARCH_HINTS: { token: string; key: string }[] = [
  { token: "type:meeting", key: "search.hint.type" },
  { token: "tag:klantx", key: "search.hint.tag" },
  { token: 'attendee:"Jan de Vries"', key: "search.hint.attendee" },
  { token: "after:2026-01-01", key: "search.hint.after" },
  { token: "before:2026-12-31", key: "search.hint.before" },
];

export function NoteList({
  notes,
  noteTasks,
  files,
  filesState,
  selected,
  selectedFile,
  onSelectFile,
  showing,
  searching,
  searchQuery,
  searchRef,
  onSearchChange,
  searchAll,
  onSearchAllChange,
  scopeable,
  onExitSearch,
  sort,
  onSort,
  onSelect,
  onOpenInCapture,
  onNewNote,
  onClearTrash,
  onOpenTasks,
  onDragNote,
  onContextMenu,
  onFileContextMenu,
  onUnpin,
  keepPinnedInView,
  pinsApply,
  isMac,
  locale,
  t,
}: Props): React.ReactElement {
  // The unlinked-attachment pane is a file list and nothing else. There are no notes in it
  // to count, sort or create — "+ New note" would file one into whatever folder the tree
  // last stood on, which is a button doing something unrelated to what it sits next to —
  // so the whole note half of this pane is left out rather than drawn empty.
  const unlinked = showing.kind === "unlinked";
  // Trash is not a folder you add notes to — Empty trash replaces + New note there, the
  // same way Rename/New folder are refused on it in the tree (`Library.tsx`'s
  // `canRenameFolder`/`canCreateFolder`).
  const inTrash = showing.kind === "folder" && showing.path === TRASH_FOLDER;
  // Which row a drag started from, so it can fade while the drag is in the air. Held here
  // rather than lifted alongside `Library`'s own `dragging`: nothing outside this list
  // needs it, and the tree already gets the path it needs through `onDragNote`.
  const [dragging, setDragging] = useState<string | null>(null);

  // The sort chooser's menu, and the button it hangs under. Held here rather than in
  // `Library.tsx` beside the row and file menus, exactly as `FolderTree.tsx` holds its
  // own: nothing outside this pane can open it and nothing outside this pane needs to
  // know it is open. The ref is what the menu is positioned against — its own rect, so
  // the panel lands under the control rather than wherever the pointer happened to be
  // (the keyboard route into a row menu already positions itself this way).
  const sortButton = useRef<HTMLButtonElement>(null);
  const [sortMenu, setSortMenu] = useState<{ x: number; y: number } | null>(null);

  /**
   * Whether the query-syntax panel is up (B84).
   *
   * Local to this component and not lifted: nothing outside the search row can open or
   * close it, and `Mod-F` reaches it the way a click does — by focusing the box.
   */
  const [hintsOpen, setHintsOpen] = useState(false);

  // The one row in this pane with `tabIndex={0}`. Recomputed against the current list
  // rather than trusted outright: switching folders can leave it pointing at a path that
  // is no longer here at all, and falling back to the first row is simpler than trying to
  // notice that happened and reset it from an effect.
  const [activePath, setActivePath] = useState<string | null>(null);
  const active =
    activePath !== null && notes.some((note) => note.path === activePath)
      ? activePath
      : (notes[0]?.path ?? null);

  /**
   * How many rows off the top of the list go on B76's shelf — 0 whenever the setting is
   * off, which leaves the markup byte for byte what it was before this existed.
   *
   * The *prefix* of pinned rows rather than every pinned row there is, and the difference
   * is not theoretical: B75 refuses to hide a fourth pin that arrived over OneDrive, so a
   * list can hold more pins than the limit allows, and `sortNotes` puts them all first
   * regardless. Taking the prefix means the shelf can only ever be the top of the list —
   * a row cannot be lifted out of the middle of it and drawn somewhere it does not
   * belong, which would break the arrow walk's one assumption, that the DOM reads in the
   * order the list does.
   *
   * Also 0 wherever the pin does not order this list (B77, `pinsApply`). It has to be
   * the same condition `Library.tsx`'s `sortNotes` is given, and for the same reason it
   * cannot be inferred from the rows: a tag's list can open with a pinned note at the top
   * by pure coincidence of the sort, and putting that one row on a sticky shelf would be
   * the app claiming an order it did not actually apply.
   */
  const firstUnpinned = notes.findIndex((note) => !note.pinned);
  const pinned =
    !keepPinnedInView || !pinsApply ? 0 : firstUnpinned === -1 ? notes.length : firstUnpinned;

  /**
   * One note row.
   *
   * Lifted out of the `map` it used to be written inside because B76 draws the same row
   * in two places — the shelf of pinned rows and the list under it — and a row that is
   * spelled out twice is a row where the drag handling, the context menu and the roving
   * tab stop come to differ between a pinned note and any other one.
   */
  const noteRow = (note: NoteSummary): React.ReactElement => (
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
        if (isContextMenuKey(event, isMac)) {
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
        {note.pinned && (
          /* A button, not a mark: the pin is what put this row at the top, so it is
             where a hand goes to send it back down. `tabIndex={-1}` because the row is
             the roving tab stop (`activePath`) and a second one inside it would put a
             stop in the middle of the list that `roveArrowKey` knows nothing about.
             Both pointer events are stopped: the row's own `onClick` selects the note
             and its `onDoubleClick` opens it in the capture window, and neither is what
             taking a pin off means. */
          <button
            type="button"
            className="note-pin"
            tabIndex={-1}
            title={t("library.unpin")}
            aria-label={t("library.unpin")}
            onClick={(event) => {
              event.stopPropagation();
              onUnpin(note);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {pinGlyph}
          </button>
        )}
        <span className="note-title">{note.title}</span>
        <span className="note-when">
          {formatListTime(locale, sort === "created" ? note.created : note.modified)}
        </span>
      </div>
      {/* The excerpt, with the task count against the right edge when there is
          nobody to put it beside. One DOM shape and not two: the row is always
          drawn, so a note with no tasks is geometrically exactly what it was.
          `.note-excerpt` keeps its own ellipsis — see `.note-middle` in
          `library.css` for why it needs `min-width: 0` to do so inside a flex
          row. */}
      <div className="note-middle">
        <span className="note-excerpt">{note.excerpt}</span>
        {note.attendees.length === 0 && taskCount(noteTasks?.[note.path], t)}
      </div>
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
      {/* People on the left, the task count right-aligned against it.
          Deliberately a row of its own rather than the count sitting up beside the
          date: the date is what the sort is on and reads as one column down the
          list, and a second number in that column would have to be told apart from
          it at a glance. People keep their line either way — the count was very
          nearly put *in* their place, and a meeting note that quietly stopped
          naming who was at it would have been a worse trade than one extra row.

          **Attendees are the whole condition now.** This row used to be drawn when
          either half had something to say, which spent a line of every note in the
          vault on a single number with nothing beside it. So the count moves up to
          the excerpt row when there is nobody here to sit next to, and this row is
          simply absent — one rule, and it is about People rather than about Tags,
          which have never shared a row with the count. */}
      {note.attendees.length > 0 && (
        <div className="note-bottom">
          <span className="note-attendees">{note.attendees.join(", ")}</span>
          {taskCount(noteTasks?.[note.path], t)}
        </div>
      )}
    </li>
  );

  return (
    <div className="notes">
      <div className="notes-search">
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          placeholder={t("library.search")}
          // The syntax panel opens on focus, which is one mechanism serving both ways in
          // (B84): clicking the box focuses it, and `Mod-F` already focuses and selects
          // it. Nothing about the shortcut had to change, and nothing takes the caret out
          // of the box to show you what to type into it.
          onFocus={() => setHintsOpen(true)}
          // Closing on blur is safe here only because the panel holds nothing to click:
          // clicking a row would blur the box, close the panel and lose the press, which
          // is the bug every completion list in this app has to design around. These are
          // examples to copy, so the worst a click on one does is dismiss the panel.
          onBlur={() => setHintsOpen(false)}
          onChange={(event) => {
            // Typing is the answer to "what do I type", so the panel gets out of the way
            // on the first keystroke rather than sitting over the results it is about.
            setHintsOpen(false);
            onSearchChange(event.target.value);
          }}
          // `stopPropagation` for the 18 August 2026 reason: `preventDefault` does not end
          // an event, and the window's Escape branch is behind this one. It would decline
          // this press anyway — the box is not a `.note[role="option"]`, so `paneOf` reads
          // `null` for it — but a handler that relies on another one's classifier agreeing
          // with it is one refactor away from firing twice.
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            // Panel first, search second. Escape closes what is on top of the box before
            // it closes the box, which is the two-press rule leaving a search from a hit
            // already follows — one press should undo one thing.
            if (hintsOpen) {
              setHintsOpen(false);
              return;
            }
            onExitSearch();
          }}
        />

        {/* Where the search is looking (B83). A word rather than a glyph, so
            `--click-button="All notes"` can reach it — the same argument the sort chooser
            and "Exit tasks" make. Only for a folder: a tag, a person and the unlinked
            pane are drawn from the whole vault already, and a switch offering to narrow
            them to a folder they do not have would be a lie. */}
        {scopeable && (
          <button
            type="button"
            className={`search-scope${searchAll ? " search-scope-all" : ""}`}
            aria-pressed={searchAll}
            title={t(searchAll ? "library.searchAllHint" : "library.searchFolderHint")}
            onClick={() => onSearchAllChange(!searchAll)}
          >
            {t(searchAll ? "library.searchAll" : "library.searchFolder")}
          </button>
        )}
        {/* The syntax, under the box that takes it, with the caret still in the box
            (B84). Deliberately not a modal — B51's argument for the `/` menu, one field
            over: a picker with its own focus takes away the thing you opened it to do.

            `.tag-suggest` verbatim, which is the header's three completion panels'
            surface. One floating list in this app, not a fourth that looks nearly like
            the others.

            Nothing in it is a control: no `tabIndex`, no click handler, no roving keys.
            These are examples to copy, and a row that could be *chosen* would owe the
            caret an insertion at a position this panel does not track. */}
        {hintsOpen && (
          <dl className="tag-suggest search-hints">
            {SEARCH_HINTS.map((hint) => (
              <div key={hint.token} className="search-hint">
                <dt>{hint.token}</dt>
                <dd>{t(hint.key)}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Only while there is something to clear: a permanent × beside an empty box is a
            control that does nothing most of the time. `tabIndex={-1}` keeps it out of the
            walk from the box to the first note row — it is the mouse's way out, Escape is
            the keyboard's. */}
        {searchQuery !== "" && (
          <button
            type="button"
            className="search-clear"
            tabIndex={-1}
            title={t("library.clearSearch")}
            aria-label={t("library.clearSearch")}
            onClick={onExitSearch}
          >
            ×
          </button>
        )}
      </div>

      {!unlinked && (
        <div className="notes-header">
          <span className="notes-count">
            {notes.length === 0
              ? t("library.noNotes")
              : `${notes.length} ${t(notes.length === 1 ? "library.note" : "library.notes")}`}
          </span>
          {/* One control rather than the three labels this used to be. The three were a
              row of words with one of them tinted, which is a state you have to already
              know how to read: nothing said they were a group, nothing said the tinted
              one was the answer rather than a link, and the two that were *not* in force
              took the same width as the one that was. A chooser says its own name — the
              glyph says "order", the text says what the order is — and the alternatives
              are somewhere you go and look rather than something permanently on screen.

              The menu is `ContextMenu`, not a list drawn here: it already carries the
              arrow/Home/End walk, Escape, focus handed back to whatever opened it, the
              clamp against the window edge, and the tick that marks the current entry.
              A second implementation of any of those is a second one to get wrong. */}
          <div className="notes-sort">
            <button
              type="button"
              ref={sortButton}
              className={`sort-choose${sortMenu !== null ? " sort-choose-open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={sortMenu !== null}
              title={t("library.sortBy")}
              onClick={() => {
                if (sortMenu !== null) {
                  setSortMenu(null);
                  return;
                }
                const rect = sortButton.current?.getBoundingClientRect();
                if (rect === undefined) return;
                setSortMenu({ x: rect.left, y: rect.bottom + 2 });
              }}
            >
              <span className="sort-glyph">{sortGlyph}</span>
              {t(`library.sort.${sort}`)}
            </button>
          </div>
          <div className="notes-actions">
            {/* The same view the sidebar's own Tasks row opens, from the same handler —
                not a second route that could come to mean something else. It sits here
                because this is the bar you are already looking at when you want it, and
                the sidebar row is three panes away. */}
            <button type="button" className="new-note" onClick={onOpenTasks}>
              {t("library.tasks")}
            </button>
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
        </div>
      )}

      {sortMenu !== null && (
        <ContextMenu
          x={sortMenu.x}
          y={sortMenu.y}
          items={SORTS.map((key) => ({
            label: t(`library.sort.${key}`),
            checked: key === sort,
            onSelect: () => onSort(key),
          }))}
          onClose={() => setSortMenu(null)}
        />
      )}

      {unlinked && filesState === "loading" && (
        <p className="unlinked-note">{t("unlinked.loading")}</p>
      )}
      {unlinked && filesState === "failed" && <p className="unlinked-note">{t("unlinked.failed")}</p>}
      {unlinked && filesState === "ready" && files.length === 0 && (
        <p className="unlinked-note">{t("unlinked.empty")}</p>
      )}

      {!unlinked && (
        <ul className="notes-list" role="listbox">
          {pinned > 0 && (
            /* B76's shelf: the pinned rows in a box of their own that sticks to the top
               of the scroller. A wrapper rather than `position: sticky` on each row —
               rows stuck at the same `top` would draw on top of one another, and giving
               each its own offset means measuring three variable-height rows and
               re-measuring them on every resize.

               `role="presentation"` on the `li` and `role="group"` on the `ul` inside
               it: an `li` with its implicit role would be a list item inside a listbox,
               which is not a thing, while a group is exactly the one wrapper ARIA lets
               a listbox put its options in. The rows themselves stay in document order
               either way, which is what `roveArrowKey`'s `querySelectorAll` walks — so
               Up and Down still cross the shelf's edge without noticing it. */
            <li className="notes-pinned" role="presentation">
              <ul role="group">{notes.slice(0, pinned).map(noteRow)}</ul>
            </li>
          )}
          {notes.slice(pinned).map(noteRow)}
        </ul>
      )}

      {files.length > 0 && (
        <>
          {/* A second section rather than rows mixed in among the notes. Everything the
              note rows carry — sort, drag to a folder, the right-click menu with Move,
              Rename, Duplicate and Delete — is about notes, and a `.png` that answered
              some of those and not others would be worse than one that plainly is not a
              note. */}
          <div className="files-header">
            <span className="notes-count">
              {`${files.length} ${t(files.length === 1 ? "library.file" : "library.files")}`}
            </span>
          </div>
          {/* `files-only` lifts the "never more than half the pane" cap, which is there to
              keep a folder of pictures from pushing the notes off the top and so means
              nothing when there are no notes — the same condition the tab stop below reads. */}
          <ul
            className={`files-list${notes.length === 0 ? " files-only" : ""}`}
            role="listbox"
          >
            {files.map((file) => (
              <li
                key={file.path}
                className={`note file-row${selectedFile === file.path ? " note-on" : ""}`}
                role="option"
                aria-selected={selectedFile === file.path}
                // A tab stop only when there are no notes above to be one — which is the
                // case this exists for: an imported vault's `99 - Attachments` folder,
                // where the file list is the whole of the pane.
                tabIndex={notes.length === 0 && files[0]?.path === file.path ? 0 : -1}
                onClick={() => onSelectFile(file.path)}
                // The row is selected first, exactly as a right-click on a note row does:
                // the reader is what says which file the menu is about, and a menu acting
                // on something other than what is on screen is the one shape to avoid.
                onContextMenu={(event) => {
                  event.preventDefault();
                  onSelectFile(file.path);
                  onFileContextMenu(file, event.clientX, event.clientY);
                }}
                onKeyDown={(event) => {
                  const container = (event.currentTarget as HTMLElement).closest(".files-list");
                  const next = roveArrowKey(event, container, ".file-row", event.currentTarget);
                  if (next !== null) {
                    event.preventDefault();
                    next.focus();
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onSelectFile(file.path);
                    return;
                  }
                  // The keyboard route to the same menu, at the row's own position — the
                  // note rows' arrangement, and the reason `roving.ts` exists.
                  if (isContextMenuKey(event, isMac)) {
                    event.preventDefault();
                    onSelectFile(file.path);
                    const rect = event.currentTarget.getBoundingClientRect();
                    onFileContextMenu(file, rect.left, rect.bottom);
                  }
                }}
              >
                <div className="note-top">
                  <span className="note-title">{file.name}</span>
                  <span className="note-when">{formatListTime(locale, file.modified)}</span>
                </div>
                <div className="note-excerpt">
                  {file.extension.slice(1).toUpperCase()} · {formatSize(file.size)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * `Tasks: 2`, or nothing at all.
 *
 * **Only what is still open, and silence when nothing is.** This used to read `2 of 5`,
 * and to say `0 of 5` in the muted colour for a note whose boxes were all ticked — B69's
 * argument being that a finished note is a fact worth stating and that only the total
 * tells "done" apart from "never had any". Daily use answered that the other way: the
 * badge is a call to action, a note with nothing owed has none, and a column of numbers
 * that mostly say nothing is owed is a column that stops being read. The total is not
 * lost, it is one hover away — the `title` still spells `2 / 5` out, which is also what
 * keeps `tree.openTasks` the one place the words "open tasks" are written.
 *
 * `undefined` is still absent rather than zero, and for B67's reason unchanged: it covers
 * both "this note has no task items" and "the index has not answered yet", and a row must
 * never claim a note is clear while the answer is still on its way. That the two now draw
 * the same thing is a coincidence of this rule, not a merging of the two states.
 *
 * The words are composed here rather than interpolated into one string: the i18n tables
 * are plain `Record<string, string>` with no placeholders in them, and `FolderTree`'s own
 * `badgeTitle` builds its tooltip the same way.
 */
function taskCount(
  count: TaskCount | undefined,
  t: (key: string) => string,
): React.ReactElement | null {
  if (count === undefined || count.open === 0) return null;

  return (
    <span className="note-tasks" title={`${t("tree.openTasks")}: ${count.open} / ${count.total}`}>
      {t("notes.tasks")}: {count.open}
    </span>
  );
}

/** Round numbers, because nobody reading a note list wants a byte count. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${Math.round(kilobytes)} kB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}
