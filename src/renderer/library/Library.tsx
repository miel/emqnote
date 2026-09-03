import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorState } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { bodyTagsOf } from "../../markdown/note-tags.js";
import { schema } from "../../markdown/schema.js";
import {
  canCreateFolderIn,
  canDeleteFolder as canDeleteFolderAt,
  canRenameFolder as canRenameFolderAt,
  folderErrorOf,
  folderOf,
  INBOX,
  isInTrash,
  NATURAL_SORT_DIRECTION,
  selectionKey,
  TRASH_FOLDER,
  type ConflictChoice,
  type ConflictPair,
  type Facets,
  type FolderNode,
  type LinkCandidateSummary,
  type FileSummary,
  type NoteSummary,
  type OpenedNote,
  type ScanProgress,
  type Selection,
  type SortDirection,
  type SortKey,
  type TaskCount,
  type VaultFileEvent,
} from "../../shared/vault-types.js";
import type { SaveError } from "../../shared/ipc.js";
import { buildEditorMenu, insertMenuItems } from "../editor/editor-menu.js";
import { Editor, type EditorHandle } from "../editor/Editor.js";
import { HeaderBlock, type HeaderValues } from "../HeaderBlock.js";
import { Help } from "../Help.js";
import { LinkPrompt } from "../LinkPrompt.js";
import { TableGrid } from "../TableGrid.js";
import { matches, shortcut } from "../../shared/shortcuts.js";
import { useBootstrap } from "../useBootstrap.js";
import { Ask } from "./Ask.js";
import { ConflictBanner } from "./ConflictBanner.js";
import { ChromeButton } from "../ChromeButton.js";
import { PaneFooter } from "../PaneFooter.js";
import { PaneHeader } from "../PaneHeader.js";
import { ContextMenu } from "./ContextMenu.js";
import { DiskChangeBar } from "./DiskChangeBar.js";
import { canDropNote } from "./drag.js";
import { dragWindowFrom } from "../window-drag.js";
import { sharedFolder } from "./multi-select.js";
import { SIDEBAR_ROWS } from "./roving.js";
import { FolderTree } from "./FolderTree.js";
import { LinkPicker } from "./LinkPicker.js";
import { NotePicker } from "./NotePicker.js";
import { MoveDialog } from "./MoveDialog.js";
import { NoteList } from "./NoteList.js";
import { FilePreview } from "./FilePreview.js";
// The one question "how is a link to this file spelled" is answered — the same function
// `insert-attachment.ts` asks before writing one, so the file list's Copy link and the
// editor's own insertion cannot drift into two spellings of one thing.
import { isEmbeddableAttachment } from "../editor/attachment-view.js";
import { clampPaneWidths, DEFAULT_PANE_WIDTHS, type PaneWidths } from "./panes.js";
import { foldersWithTasks, withOpenTasks } from "./folder-tasks.js";
import { Settings } from "./Settings.js";
import { Splitter } from "./Splitter.js";
import { TaskList } from "./TaskList.js";

const SAVE_DEBOUNCE_MS = 800;

const EMPTY_TREE: FolderNode = { path: "", name: "Vault", children: [], noteCount: 0 };
const EMPTY_FACETS: Facets = { tags: [], people: [], available: true };

function flatten(node: FolderNode): string[] {
  return [node.path, ...node.children.flatMap(flatten)];
}

/**
 * The note list's order: pinned notes first (B75), then the chosen sort within each group.
 *
 * One comparator, wrapped rather than replaced, so all three sort keys inherit the pin for
 * free and a fourth would too. Pinned notes keep the sort *among themselves* rather than a
 * pin order of their own: three rows is few enough that a hand-kept order would be more to
 * maintain than to read, and it means the top of the list still answers the same question
 * the rest of it does — including when that question has been turned round.
 *
 * **`pins` says whether the pin means anything to this list at all** (B77). It used to
 * mean something to every list — the comment here said in so many words that a pinned note
 * goes to the top of a tag's notes and a search's results as well as its own folder's,
 * because the pin is a property of the note. That reading stopped holding when the limit
 * became per folder: three pins in each of eight folders is one tag away from a list whose
 * top two dozen rows are pinned, which is not a shortcut to anything. A pin orders a
 * folder, so it is honoured where the list *is* a folder and disregarded where the rows
 * come from everywhere.
 */
function sortNotes(
  notes: NoteSummary[],
  key: SortKey,
  direction: SortDirection,
  pins: boolean,
): NoteSummary[] {
  const sorted = [...notes];
  // **The direction is applied to the comparator, not to the sorted array** (B94). A
  // `reverse()` afterwards would also reverse the order *within* every tie — two notes
  // saved in the same second, which is not rare when a paste writes several — and the pin
  // pass below leans on this sort being stable. Flipping the sign leaves ties exactly
  // where they were.
  const flip = direction === "asc" ? -1 : 1;
  if (key === "title") {
    sorted.sort(
      (a, b) => -flip * a.title.localeCompare(b.title, undefined, { numeric: true }),
    );
  } else {
    sorted.sort((a, b) => flip * (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : 0));
  }
  // A stable sort, so this keeps the order above within each of the two groups — which is
  // why it is a second pass rather than a first clause in the comparators.
  if (pins) sorted.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return sorted;
}

/**
 * Which of the three panes an element belongs to, or `null` for anything this does not
 * recognise.
 *
 * Three, still, even though the pane ring stops at four places since B98: the fourth is
 * the note's own title, and it is recognised by `inNoteFields` below rather than here,
 * for the reason the last paragraph of this comment gives.
 *
 * At module scope because more than one thing asks it now: the pane-cycle listener, its
 * Escape branch, and — since leaving a search is a thing you can do from a note row — the
 * exits that run from the render body. It lived inside that effect until then, and a
 * second copy is how the two would come to disagree about what counts as being in a pane.
 *
 * Deliberately narrower than "anywhere inside the pane": a roving row is where a jump into
 * the pane lands (`focusPane`), and the only place Tab should treat as "leaving" it. The
 * tree/notes panes hold ordinary controls too — the search box, the sort buttons, a
 * folder's twisty — and those already have a sensible Tab order of their own that this
 * must not steamroll.
 *
 * **The note's own fields are on that list too, and stay off this function on purpose.**
 * The title, then When / Tags / Where / Who: five controls in DOM order, so a plain Tab
 * and Shift-Tab already walk them the way anyone expects — and the moment this function
 * claims them, the Tab branch below stops seeing `null` for one of them and cycles the
 * *pane* instead of moving to the next field. `inNoteFields` is the separate question the
 * ring asks, and only the ring asks it.
 */
function paneOf(element: Element | null): "tree" | "notes" | "editor" | null {
  if (element === null) return null;
  // `SIDEBAR_ROWS`, and it has to be that same set: the footer's rows — Tags, People,
  // each facet, Tasks, Settings, Help, Unlinked — are part of the sidebar's arrow walk
  // now, and a row the walk can reach but this cannot classify is a row where Tab and
  // Ctrl+Tab stop knowing which pane they are in.
  if (element.closest(SIDEBAR_ROWS) !== null) return "tree";
  if (element.closest('.note[role="option"]') !== null) return "notes";
  if (element.closest('.task-row[role="option"]') !== null) return "notes";
  if (element.closest(".editor-content") !== null) return "editor";
  return null;
}

/**
 * Is focus on one of the note's own fields — its title, or When / Tags / Where / Who?
 *
 * A separate question from `paneOf`, which deliberately answers `null` for all of them so
 * that a plain Tab keeps walking them (see its own comment). Only the pane ring asks this,
 * and only to know where a press made from here should go: on to the note going forward,
 * back to the list going back, rather than falling into the "focus is on nothing" branch
 * and jumping to the far end of the window.
 *
 * **The title is now a place the ring lands as well as passes through** (B98) — Ctrl+Tab
 * out of the note list is what puts you there — and that needs nothing added here,
 * because the answer for a press made *from* the title is the same either way: forward to
 * the note, backward to the list. The four fields underneath it are still passed through
 * only, and `focusFields` (Mod+Shift+W) is still the one press that reaches them.
 *
 * `.header-reader` rather than `.header`: the capture window wears the same block under
 * `.header-capture` and has no pane cycle at all. `.reader-header` beside it is the 40px
 * band above it, which holds the note's title in both of its states — the `<h1>` and the
 * rename input — and which is a Tab stop of its own since B94 put the title in the order.
 */
function inNoteFields(element: Element | null): boolean {
  if (element === null) return false;
  return element.closest(".header-reader") !== null || element.closest(".reader-header") !== null;
}

/**
 * Whether pins order this list (B77).
 *
 * A folder, and no search running. The query matters because a search wins over the tree
 * selection entirely (`loadNotes`) — the tree still says "folder" while the rows on screen
 * came from the whole vault, and that is exactly the list a pin must not reorder.
 */
function pinsApplyTo(selection: Selection, searchQuery: string): boolean {
  return selection.kind === "folder" && searchQuery.trim() === "";
}

/**
 * A move or a rename waiting on the one question it raises: the notes that link to this
 * one — should they follow it? (B35)
 *
 * Held as data rather than as a closure so the dialog stays the same shape as its
 * siblings, and so the action is still legible from the state alone.
 */
type Relinkable =
  /** A set, always — one note is a set of one (B95). The link question is asked once for
   *  the whole of it, because a dialog can only hold one question and a loop that raised
   *  one per note simply overwrote the previous one and silently dropped its move. */
  | { kind: "move"; paths: string[]; folder: string }
  | { kind: "rename"; path: string; title: string };

/**
 * The note a `[[…]]` click came from — enough of it to name a button and open it again.
 *
 * The title comes along rather than being looked up later: for a click in the *capture*
 * window this side has never seen the note at all, and main already has its title in the
 * index at the moment it sends the event.
 */
type NoteOrigin = { path: string; title: string };

/**
 * How far back the reader can walk. Long enough that no real chain of links reaches it,
 * short enough that a resident window cannot accumulate an unbounded list.
 */
const BACK_STACK_LIMIT = 20;

/** Which small dialog is open, if any. Only ever one at a time. */
type Dialog =
  | { kind: "newFolder"; parent: string }
  | { kind: "renameFolder"; path: string; initial: string }
  /**
   * A note, to `_trash`. `openTasks` is counted when the dialog opens, exactly as the two
   * permanent deletes below count theirs and for the same reason: what is still to be
   * *done* in a note is the thing least visible from its title, and trashing it takes it
   * out of the Tasks view and out of every folder badge at once. Restore is the way back,
   * which is why this question is a question and not a warning — but it should still say
   * what it is about to take off the list.
   */
  | { kind: "delete"; title: string; paths: string[]; openTasks: number }
  /** A folder, to `_trash`, with what is inside it — notes, subfolders, and open tasks. */
  | { kind: "deleteFolder"; path: string; notes: number; folders: number; openTasks: number }
  // Five numbers, not one, and all five are counted when the dialog opens: this is
  // the confirmation in front of the one thing in this app with no way back, so what
  // it names has to be what is about to go. See `trashContents`.
  //
  // The last two are not counts of things in the trash and that is the point of them:
  // `openTasks` is what is still to be *done* in the notes about to go, and `linkedFiles`
  // counts attachments that are **not** deleted and are not in the trash at all — they
  // stop being reachable from any note and turn up in the Unlinked attachments pane. See
  // `attachmentsOrphanedByTrash`.
  | {
      kind: "clearTrash";
      notes: number;
      folders: number;
      files: number;
      openTasks: number;
      linkedFiles: number;
    }
  /**
   * The one dialog whose *cancel* still carries the action out. Dismissing it — Escape,
   * the overlay, "Leave them" — means "move it without touching the links", never "forget
   * I asked to move it": the move is what was clicked, and a question about a side effect
   * must not be able to silently undo the thing it is a side effect of.
   */
  | { kind: "relink"; count: number; action: Relinkable }
  | { kind: "duplicateTitle"; title: string; path: string; folder: string }
  /**
   * One thing out of `_trash`, for good. `label` is what to call it in the question — a
   * note's title, a folder's name — and `path` is what actually goes, because the two are
   * not the same string and naming a path at someone is not asking them anything.
   */
  | { kind: "deletePermanently"; path: string; label: string; openTasks: number }
  | { kind: "problem"; message: string };

/** What Restore is currently asking for a destination for — a trashed note, or a trashed folder. */
type Restorable = { kind: "note" | "folder"; path: string };

export function Library(): React.ReactElement {
  const app = useBootstrap();
  const editor = useRef<EditorHandle>(null);
  /**
   * Set by `openNote` when it is called from the Tasks view, and applied by the
   * `docToken` effect right after `setDoc` — `focusTask` must run against the document
   * that was just loaded, not the one still in the editor at the moment `openNote` is
   * called. Cleared immediately after, so an ordinary click on a note elsewhere never
   * inherits a stale ordinal from the last task clicked.
   */
  const pendingTaskOrdinal = useRef<number | null>(null);
  /**
   * Where the caret was in each note this window has had open, so leaving a note and
   * coming back does not start at the top of it again (B70).
   *
   * In memory and nowhere else. Not the note file — opening a note writes nothing, and
   * a caret offset is not something the vault should be carrying to the other machine
   * (B10). Not `index.sqlite` either: that is a derived cache and `migrate()` drops it
   * on a schema bump, so it is the wrong shelf for something that cannot be derived.
   * Which leaves "for as long as this window is open", and that is the whole of what was
   * asked for — a relaunch starting each note at the top is what it has always done.
   *
   * Unbounded on purpose: one small object per note actually opened in one sitting is
   * not a number worth pruning, and a bound would only make it possible to lose an
   * entry for a note still on screen.
   */
  const carets = useRef(new Map<string, { anchor: number; head: number }>());

  /**
   * Notes where the caret is in the note currently on screen, if there is one.
   *
   * Called at the two points a note stops being the one being read — opening another, and
   * selecting a file instead — rather than on every keystroke: a caret moves constantly
   * and this only ever has to be right at the moment it is about to be thrown away.
   * Deliberately *not* called on the paths that trash or delete the open note: there is
   * nothing to come back to, and remembering an offset into a note in `_trash` would only
   * mean restoring it into whatever gets restored over it.
   */
  const rememberCaret = useCallback(() => {
    const leaving = openRef.current;
    if (leaving === null) return;
    const caret = editor.current?.getSelection() ?? null;
    if (caret !== null) carets.current.set(leaving.path, caret);
  }, []);
  /**
   * Guards `openNote` against two calls finishing out of order — two tasks in the same
   * note sit right next to each other in the Tasks list and are the easy way to click
   * one, then the other, before the first's IPC round trip has actually returned. Each
   * call claims the next number before awaiting anything; a call whose number no longer
   * matches when it wakes up knows a newer one has already landed, and defers to it
   * rather than clobbering its selection (or its task ordinal) with stale data.
   */
  const openNoteRequest = useRef(0);

  const [tree, setTree] = useState<FolderNode>(EMPTY_TREE);
  /**
   * Open tasks per folder, for the second half of the tree's badge.
   *
   * Kept beside the tree rather than folded into it, because the two arrive at different
   * speeds: the tree is a `readdir` and this waits on the index. `null` is "not counted
   * yet", which is what keeps a folder from briefly claiming zero open tasks before the
   * scan has answered — `treeWithTasks` below is where the two are put together.
   */
  const [taskCounts, setTaskCounts] = useState<Record<string, number> | null>(null);
  /**
   * The same answer per note, for the count the note list draws under the date. Out of
   * the very same query in main (`openTaskCountsByPath`, which the folder fold now reads
   * too), so a folder badge and the rows inside that folder cannot disagree about the
   * notes they are both counting. Loaded and refreshed alongside `taskCounts` for the
   * same reason: one call site, one set of refresh points.
   */
  const [noteTasks, setNoteTasks] = useState<Record<string, TaskCount> | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "folder", path: "00 Inbox" });
  /**
   * The last folder that was selected, which is not always the current selection.
   *
   * "New folder" needs a parent, and a tag is not one. Remembering where you last were
   * in the tree keeps that button working from a filter view instead of guessing.
   */
  const [lastFolder, setLastFolder] = useState("00 Inbox");
  // Mirrored, because the window-level shortcut listener below is installed once and must
  // not be torn down and rebuilt every time the tree selection moves.
  const lastFolderRef = useRef(lastFolder);
  lastFolderRef.current = lastFolder;
  /** The vault search box, so `searchVault` (Mod-F) can put the caret in it. */
  const searchInput = useRef<HTMLInputElement>(null);
  /**
   * A search overrides the current selection rather than combining with it — clicking
   * the tree while searching clears the box (see `FolderTree`'s `onSelect` below), so
   * the two never need to agree on what should be showing at once.
   */
  const [searchQuery, setSearchQuery] = useState("");
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  /**
   * Whether the note list's search field is unfolded in its heading.
   *
   * Here rather than in `NoteList`, because `Mod-F` is this component's shortcut and it
   * has to mount the field before it can put the caret in `searchInput` — held one level
   * down, the shortcut would focus a box that does not exist yet. `openSearch` below is
   * the pair of steps that has to happen in that order.
   */
  const [searchOpen, setSearchOpen] = useState(false);
  /**
   * Set when the field is being opened *in order to type in it*, so the effect below
   * knows the difference between "unfold this" and "unfold this and take the caret".
   * A ref rather than state: it is read once, in the render the flip causes, and a second
   * piece of state would re-render for something nothing draws.
   */
  const focusSearchOnOpen = useRef(false);

  /**
   * Whether the search box is looking at the whole vault rather than the folder you are
   * standing in (B83).
   *
   * `false` is the default and it stays the default: it is reset when a search is left
   * and whenever the tree selection moves, so widening is a thing you ask for each time
   * rather than a mode you can find yourself in. A ref beside the state for `loadNotes`'
   * own reason — the reload happens in the same tick as the flip, and the state has not
   * caught up.
   */
  const [searchAll, setSearchAll] = useState(false);
  const searchAllRef = useRef(searchAll);
  searchAllRef.current = searchAll;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  /** The non-note files in the folder being browsed, and which one the reader is showing (B47). */
  const [files, setFiles] = useState<FileSummary[]>([]);
  /**
   * Whether that list is settled. Only the unlinked-attachment pane is ever anything but
   * `"ready"`: a folder's files come back from one `readdir`, while the unlinked ones are a
   * question put to the whole index.
   */
  const [filesState, setFilesState] = useState<"ready" | "loading" | "failed">("ready");
  /**
   * The last answer that pane got, kept so a refresh does not blank it.
   *
   * `library:refresh` arrives twice for every debounced autosave — once from the writer,
   * once from the watcher observing that same write ~300 ms later — and every one of them
   * re-runs this scan. That is right: a note that just started naming an attachment
   * changes the answer. Clearing the rows and re-drawing "Looking…" each time was not,
   * which is what "the list flickers while typing in the new-note window" was.
   */
  const unlinkedFiles = useRef<FileSummary[] | null>(null);
  /** Only the newest scan may apply its answer; two can be in the air at once. */
  const unlinkedScan = useRef(0);
  /**
   * How many unlinked attachments there are, or `null` for "not counted yet".
   *
   * The sidebar row is hidden at `0`, so this cannot be a plain number: a vault whose
   * count has not landed yet would read as a vault with nothing unlinked, and the row
   * would appear a moment after the window did. Absent is not zero — the same rule
   * `FolderNode.openTasks` (B67) and the note list's task counts (B69) already carry,
   * for the same reason: the answer comes from behind the index scan while the thing it
   * decorates is already on screen.
   *
   * A failed refresh keeps the last count rather than dropping to `null`, which is
   * `unlinkedFiles`' own rule one line up.
   */
  const [unlinkedCount, setUnlinkedCount] = useState<number | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS);
  /**
   * Persisted through `IPC.setSort`, following the pane-widths precedent exactly — starts
   * on the same hardcoded default `defaults()` in `settings.ts` does, since `app.librarySort`
   * is only real once the `bootstrap()` round trip resolves. `sortLoaded` below guards the
   * effect that applies it, the same way `paneWidthsLoaded` stops a later `app.reload()`
   * from clobbering a drag in progress — here, from clobbering a sort the user just picked.
   */
  const [sort, setSort] = useState<SortKey>("modified");
  /**
   * Which way round that sort runs (B94) — the arrows in the note list's footer, beside
   * the key's own name.
   *
   * Seeded from the bootstrap alongside `sort` and by the same guard, and reset to the
   * key's own `NATURAL_SORT_DIRECTION` whenever the key changes: "newest first" and "A–Z"
   * are what those words mean, and a Title sort opening at Z–A because the dates were
   * reversed an hour ago is a list disagreeing with its own label.
   */
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const sortLoaded = useRef(false);
  const [open, setOpen] = useState<OpenedNote | null>(null);
  const [dirty, setDirty] = useState(false);
  /**
   * The last save that would not land, or null. Cleared by the next one that does, and
   * by opening another note — a failure belongs to the note it happened to.
   *
   * The reader used to have no way to show one at all: `save()` did not catch, so main
   * throwing meant an unhandled rejection in this window, `setDirty(false)` never
   * running, and the foot of the pane reading "Saving…" for ever. Which is the *better*
   * of the two ways it could go wrong — with the failure answered rather than thrown, the
   * same code would say "Saved". See `atomic-write.ts`.
   */
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  /**
   * A note changed or disappeared on disk while it was open here, for a reason this app
   * did not cause itself — see `own-writes.ts` for how the app's own debounced autosave
   * is told apart from that. Null the rest of the time, which is the normal state.
   */
  const [diskEvent, setDiskEvent] = useState<VaultFileEvent | null>(null);
  /**
   * The notes the "Move to…" dialog is open for, or null when it is not.
   *
   * A list rather than a flag since B94: it used to be `boolean` and the dialog read
   * `open.path` when it was answered, which cannot say "these three". Holding the paths
   * also fixes a smaller thing the flag had — the question is now about the notes it was
   * *opened* for, not about whatever happens to be in the reader when it is answered.
   */
  const [moving, setMoving] = useState<string[] | null>(null);
  /**
   * The trashed note or folder waiting to be told where to go back to. A separate piece
   * of state from `moving` and not a fourth `Dialog`, because it opens `MoveDialog`
   * rather than `Ask` — the same split `moving` already is.
   */
  const [restoring, setRestoring] = useState<Restorable | null>(null);
  // The note being dragged over the tree. Held here rather than in either component,
  // because the row that knows which note it is and the branch that has to decide
  // whether it will take it are on opposite sides of the window.
  const [dragging, setDragging] = useState<string[] | null>(null);
  /**
   * The rows marked for a bulk Move or Delete (B94) — see `multi-select.ts`.
   *
   * Here rather than in `NoteList` because this is where both actions live: the Move
   * dialog, the delete confirmation and the two IPC calls behind them. The list decides
   * *which* rows are marked and hands the answer up; nothing else in the window reads it
   * but the note list itself and the two menu items.
   *
   * Emptied whenever the list underneath it is replaced — a different folder, a search, a
   * move that took some of the marked notes out of it — because a mark is about rows on
   * screen. `selectionKey` is what says the list changed.
   */
  const [marked, setMarked] = useState<string[]>([]);
  // Read from the window's `keydown` listener, which is installed once — the `openRef` /
  // `notesRef` pattern this file already uses for exactly that.
  const markedRef = useRef(marked);
  markedRef.current = marked;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  /** An ambiguous `[[…]]` link waiting for the user to say which note it meant (B35). */
  const [linkPick, setLinkPick] = useState<{
    target: string;
    candidates: LinkCandidateSummary[];
    origin: NoteOrigin | null;
  } | null>(null);
  /**
   * The trail of `[[…]]` links followed to get to the note now open, so the reader can
   * offer a way back to the one the click came from.
   *
   * A stack rather than one slot: following three links and walking back out is the same
   * gesture three times, and anything less makes the third click a dead end.
   *
   * Nothing here is ever *cleared*. Each entry records which note it leads *to*, and the
   * button only appears when that matches what is currently open — so opening a note any
   * other way (a list row, a search hit, a task) simply does not match, and a push whose
   * origin is not the current top starts a fresh chain rather than piling onto a stale
   * one. That is what keeps this honest without every other navigation path having to
   * remember to reset it.
   */
  const [backStack, setBackStack] = useState<{ from: NoteOrigin; to: string }[]>([]);
  // Both read from the window's `keydown` listener, which is declared long before either
  // `goBack` or this state's current value is in scope — the `openRef`/`notesRef` pattern
  // this file already uses to keep that listener off the rebuild-every-render path.
  const backStackRef = useRef(backStack);
  backStackRef.current = backStack;
  const goBackRef = useRef<() => void>(() => {});
  // The Tasks view's chord, for `goBackRef`'s reason exactly: `openTasks` is written far
  // below the window's `keydown` listener and reads state the listener cannot close over.
  const openTasksRef = useRef<() => void>(() => {});
  /**
   * The title being edited in place, or null when the `<h1>` is showing instead.
   *
   * A separate piece of state rather than a dialog: the title sits right where it is
   * read, so editing it should look like clicking into a field, not opening something
   * on top of the note. Holds the in-progress text — `rename()` below is not called
   * until Enter or blur commits it.
   */
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  /**
   * Set when a press on the title turned out to be a window drag, and read by the click
   * that follows it — see the `<h1>`'s own two handlers, and `window-drag.ts`.
   */
  const dragged = useRef(false);
  // Set by Escape just before it blurs the input on purpose, so the blur handler can
  // tell "cancelled" apart from "committed" — see the input's own `onBlur` below.
  const cancelingTitle = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [link, setLink] = useState<{ href: string } | null>(null);
  /**
   * The note picker (B41). `prefix` is what the user typed to open it — `"[["` from the
   * input rule, `""` from everywhere else — and is handed straight back on insertion so
   * those characters are swallowed rather than left in the sentence.
   */
  const [notePick, setNotePick] = useState<{ prefix: string; query: string } | null>(null);
  const [tableGrid, setTableGrid] = useState<{ x: number; y: number } | null>(null);
  /** The note-list row context menu — Open/Move/Rename/Reveal/Delete on whatever row was right-clicked. */
  const [noteMenu, setNoteMenu] = useState<{ note: NoteSummary; x: number; y: number } | null>(
    null,
  );
  /**
   * The same for a file row (B47's list) — Copy link, Reveal, and Delete in the unlinked
   * pane only. Its own state beside `noteMenu` rather than a widened one: the two act on
   * different types and share only three of nine items, and folding them together is how
   * a file row ends up offering half a note's menu — precisely what B47 refuses.
   */
  const [fileMenu, setFileMenu] = useState<{ file: FileSummary; x: number; y: number } | null>(
    null,
  );
  /**
   * The reader toolbar's "Actions" overflow menu — Rename/Move/Duplicate/Reveal/Delete on the
   * open note, opened at the button's own rect rather than a click point. Always acts on
   * `open`, so unlike `noteMenu` it carries no note of its own to act on.
   */
  const [readerMenu, setReaderMenu] = useState<{ x: number; y: number } | null>(null);
  /**
   * The reader toolbar's "Insert" menu — image, file, note link, table, from
   * `insertMenuItems`. Its own state rather than a flag on `readerMenu`: the two open
   * from different buttons at different rects and hold different things, and the only
   * thing they share is being menus.
   */
  const [insertMenu, setInsertMenu] = useState<{ x: number; y: number } | null>(null);
  /** The note panel's right-click formatting menu, in the reader — `Capture.tsx` has its own copy. */
  const [editorMenu, setEditorMenu] = useState<{
    x: number;
    y: number;
    state: EditorState;
  } | null>(null);
  /**
   * OneDrive conflict pairs, loaded eagerly on mount and on every `library:refresh` —
   * unlike `facets`, which stays behind the collapsed Tags/People sections specifically
   * so opening the library never pays for a scan nobody asked for. A conflict banner is
   * meant to be seen without having to ask, which is the whole point of it, so this one
   * pays that cost up front instead.
   */
  const [conflicts, setConflicts] = useState<ConflictPair[]>([]);
  // Null when nothing is scanning, which is the normal state — the bar only appears on a
  // cold start with a vault big enough for the walk to be worth mentioning.
  const [scan, setScan] = useState<ScanProgress | null>(null);

  /**
   * The tree/notes pane widths, dragged live by `Splitter.tsx` and persisted through
   * `IPC.setPaneWidths` only once a drag ends — see `onPaneDragEnd` below.
   *
   * Starts on the hardcoded default, same as `useBootstrap`'s `FALLBACK`, because
   * `app.libraryPaneWidths` is only real once the `bootstrap()` round trip resolves.
   * `paneWidthsLoaded` guards the effect that applies it so a later `app.reload()` (the
   * settings panel calls it after a locale change) cannot overwrite a width mid-drag.
   */
  const [paneWidths, setPaneWidths] = useState<PaneWidths>(DEFAULT_PANE_WIDTHS);
  const paneWidthsRef = useRef(paneWidths);
  paneWidthsRef.current = paneWidths;
  const paneWidthsLoaded = useRef(false);
  const libraryRef = useRef<HTMLDivElement>(null);

  /**
   * Puts focus into a pane, at its roving row. `true` when something took it.
   *
   * Hoisted out of the pane-cycle effect below, where it lived until the two exits needed
   * it: leaving the Tasks view and leaving a search both end by handing focus back to the
   * note list, which is the gesture Ctrl+Tab already makes. Over two refs only, so it is
   * stable and naming it in that effect's dependency list changes nothing.
   *
   * The notes selector covers both lists that can occupy that pane, and it looks for
   * `[tabindex="0"]` rather than for whatever is selected: that is the roving row each
   * list maintains, so this lands on the note that was last there.
   *
   * **`header` is the note's own When / Tags / Where / Who block**, and `atEnd` says which
   * end of it to enter — `Who` at the end, `When` at the start. The two are named fields
   * rather than "the first and last focusable thing in the block": the Tags cell can carry
   * a `+2 more` chip, which *is* a button, and a last-focusable query would land the caret
   * on it instead of on Who. `focusFields` (Mod-Shift-W) is what asks for it now; the pane
   * ring stopped here for one release and does not any more (B94).
   *
   * **`title` is the note's own title in the band above that block**, in whichever of its
   * two states it is in: the `<h1>` most of the time, the rename input while it is being
   * edited. One selector for both, because a press landing on the title should not care
   * which, and the `<h1>` is a tab stop in its own right since B94 put it in the order.
   * B98 made it the pane ring's fourth stop as well — Ctrl+Tab out of the note list —
   * while plain Tab now goes straight to the note.
   *
   * **The answer matters for every one of them, `editor` included** (B98). With no note
   * open there is no title, no header block and no editor either, so this returns `false`
   * and the caller — the Tab walk, or the chord — leaves the press alone rather than
   * swallowing it. That is the whole of "do nothing when there is no note".
   */
  const focusPane = useCallback(
    (pane: "tree" | "notes" | "editor" | "header" | "title", atEnd = false): boolean => {
      const root = libraryRef.current;
      if (pane === "editor") {
        // The answer, not `true` (B98). With no note open there is no `Editor` mounted at
        // all — the reader draws its empty state — so this used to report a move it had
        // not made, and both callers read that answer to decide whether to take the press
        // off the browser. It did not show while the note was the *third* Tab stop; it
        // does the moment Tab and the backward ring aim straight at it.
        const view = editor.current;
        if (view === null) return false;
        view.focus();
        return true;
      }
      if (root === null) return false;
      const selector =
        pane === "tree"
          ? '.tree [tabindex="0"]'
          : pane === "header"
            ? `.header-reader .${atEnd ? "attendees" : "created"}`
            : pane === "title"
              ? ".reader-header .pane-title, .reader-header .reader-title-input"
              : '.notes [tabindex="0"], .task-list [tabindex="0"]';
      const target = root.querySelector<HTMLElement>(selector);
      if (target === null) return false;
      target.focus();
      return true;
    },
    [],
  );

  /**
   * Set by an exit that has just asked for a different list, and consumed once that list
   * is on screen.
   *
   * Neither exit can focus anything on the spot: `loadNotes` is a round trip, so the rows
   * `focusPane` would find at that moment still belong to the list being replaced —
   * focusing one lands on a row that is about to be unmounted and focus falls to `<body>`.
   * A frame later is not a fix either, being a guess about how long an IPC call takes.
   */
  const focusNotesOnNextList = useRef(false);

  useEffect(() => {
    if (!focusNotesOnNextList.current) return;
    focusNotesOnNextList.current = false;
    focusPane("notes");
  }, [notes, focusPane]);

  useEffect(() => {
    if (paneWidthsLoaded.current || app.libraryPaneWidths === null) return;
    paneWidthsLoaded.current = true;
    setPaneWidths(app.libraryPaneWidths);
  }, [app.libraryPaneWidths]);

  // `app.bootstrapped` rather than `app.librarySort === "modified"`, the pane-widths
  // guard's trick: every `SortKey` is a real sort, so there is no spare value here to
  // mean "not loaded yet" the way `null` does for pane widths.
  useEffect(() => {
    if (sortLoaded.current || !app.bootstrapped) return;
    sortLoaded.current = true;
    setSort(app.librarySort);
    setSortDirection(app.librarySortDirection);
  }, [app.bootstrapped, app.librarySort, app.librarySortDirection]);

  /**
   * Changes which key the list is sorted on and persists it — the note list's `onSort`.
   *
   * Picking a key puts the direction back to that key's own, which is what every file
   * manager's column headings do and what keeps "Title" meaning A–Z. Picking the key that
   * is already in force leaves the direction alone: choosing "Created" from a menu that
   * already says Created is not a request to undo the arrows you just pressed.
   */
  const onSort = useCallback(
    (next: SortKey) => {
      const direction = next === sort ? sortDirection : NATURAL_SORT_DIRECTION[next];
      setSort(next);
      setSortDirection(direction);
      window.emqnote.setSort(next, direction);
    },
    [sort, sortDirection],
  );

  /** Turns the current sort round — the arrows beside the key's name (B94). */
  const onSortDirection = useCallback(
    (next: SortDirection) => {
      setSortDirection(next);
      window.emqnote.setSort(sort, next);
    },
    [sort],
  );

  /**
   * Applies one splitter's pointer/keyboard movement, clamped so the reader can never be
   * squeezed away — see `clampPaneWidths`'s own comment for why the pane being dragged is
   * the one that gives way instead.
   */
  const onPaneDrag = useCallback((pane: "tree" | "notes", deltaX: number) => {
    const available = libraryRef.current?.clientWidth ?? 0;
    setPaneWidths((current) => {
      const proposed: PaneWidths =
        pane === "tree"
          ? { tree: current.tree + deltaX, notes: current.notes }
          : { tree: current.tree, notes: current.notes + deltaX };
      return clampPaneWidths(proposed, pane, available);
    });
  }, []);

  /** Persisted on drag end only — not on every pointer move, which would be one write per pixel. */
  const onPaneDragEnd = useCallback(() => {
    window.emqnote.setPaneWidths(paneWidthsRef.current);
  }, []);

  /**
   * The editable frontmatter of the open note, held apart from `open`.
   *
   * Deliberately not folded into `open`: the effect below reloads the document into the
   * editor whenever `open` changes, so putting header values there would rebuild the
   * document on every keystroke in the attendee field and throw the caret away.
   */
  const [header, setHeader] = useState<HeaderValues | null>(null);
  const headerRef = useRef<HeaderValues | null>(null);
  headerRef.current = header;
  /**
   * The `#tag`s the open note's body carries, drawn beside the Tags field (B65).
   *
   * Set from what main read off the file when the note was opened, and recomputed on the
   * same save debounce a keystroke already waits out — never per keystroke, since
   * `bodyTagsOf` serializes the body to read them. It is a display value: setting it
   * neither marks the note dirty nor schedules a write.
   */
  const [bodyTags, setBodyTags] = useState<string[]>([]);

  const openRef = useRef<OpenedNote | null>(null);
  openRef.current = open;

  /**
   * The list as it currently stands, for the window key handler to look a row up in.
   *
   * That handler is registered once (`[app.isMac]`) so it cannot close over `notes`, and
   * B75's chord needs to know whether the note it is acting on is *already* pinned — which
   * `OpenedNote` does not say, being what the reader shows rather than what the list does.
   */
  const notesRef = useRef<NoteSummary[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * **Both debounces are cancelled when this tree goes away**, for the reason
   * `Capture.tsx` carries at length and this window shares exactly: nothing here can fire
   * in the app — the library window's tree is not unmounted while the app is running —
   * but in jsdom it is unmounted between every test, and a timer armed by the last
   * keystroke of one test fires into an environment that has been torn down. `window` is
   * gone by then, so the throw lands on whichever test is running, not on the one that
   * armed it.
   *
   * `Capture.tsx`'s copy of this bug failed the `v0.11.0` release on the Windows runner.
   * This one had not been reported yet, which is not the same as being safe: it is the
   * identical construction, in a component `library-*.test.ts` mounts and unmounts a
   * dozen times a run, and both of its timers reach `window.emqnote` when they fire.
   */
  useEffect(
    () => () => {
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    },
    [],
  );

  const loadTree = useCallback(async () => {
    setTree(await window.emqnote.library.tree());
  }, []);

  /**
   * The badge's task half. Its own call, and deliberately not awaited alongside the tree:
   * this one sits behind `ensureScanned`, and making the folder list wait on it would put
   * browsing behind the scan for the sake of a number.
   *
   * A failure leaves the last counts in place rather than blanking them — the same rule
   * the unlinked pane learned (a refresh that fails over rows that are already right is
   * not worth throwing them away for), and here the fallback is simply a badge that goes
   * on showing the note count alone.
   */
  const loadTaskCounts = useCallback(async () => {
    try {
      const [folders, notes] = await Promise.all([
        window.emqnote.library.folderTaskCounts(),
        window.emqnote.library.noteTaskCounts(),
      ]);
      setTaskCounts(folders);
      setNoteTasks(notes);
    } catch {
      /* keep whatever was already counted */
    }
  }, []);

  const loadConflicts = useCallback(async () => {
    setConflicts(await window.emqnote.library.conflicts());
  }, []);

  /**
   * Counts the unlinked attachments so the sidebar row can be left out when there are
   * none.
   *
   * The existing channel, not a count-only one beside it: the row and the pane would then
   * be two answers to one question, which is how a row promising three files opens onto a
   * list of two. The whole answer is kept in `unlinkedFiles` as well, so opening the pane
   * afterwards draws its rows at once instead of showing "Looking…" for a scan that has
   * already been run.
   *
   * Not called while that pane is the selection: `loadNotes` fetches it there and sets the
   * count from the same reply. Running both would scan twice per refresh, and
   * `library:refresh` already arrives twice per debounced autosave.
   *
   * Cost is one `_attachments` walk per refresh. `referencedTargets` is answered from the
   * index and the walk itself is `readdir` + `stat` — metadata, which stays local even on
   * a Files On-Demand vault; the expensive fallback in `unlinked-attachments.ts` only runs
   * when the index cannot answer at all.
   */
  const loadUnlinkedCount = useCallback(async () => {
    const generation = (unlinkedScan.current += 1);
    try {
      const found = await window.emqnote.library.unlinkedAttachments();
      if (unlinkedScan.current !== generation) return;
      unlinkedFiles.current = found;
      setUnlinkedCount(found.length);
    } catch {
      /* keep the last count — a failed refresh is not evidence of an empty vault */
    }
  }, []);

  /**
   * A search query, when there is one, wins over the tree selection entirely — reading
   * `searchQueryRef` rather than taking a parameter keeps every existing call site
   * (after a save, after a folder rename, on `library:refresh`) correct for free: they
   * already all mean "show whatever the list should be showing right now."
   */
  const loadNotes = useCallback(async (target: Selection) => {
    const query = searchQueryRef.current;
    const searching = query.trim() !== "";

    // The unlinked-attachment pane is files and nothing else, and it is the one file list
    // that is a *search* rather than a `readdir` — over the whole index, so it can take
    // long enough to need saying so, and it can fail. Both states are the bug this pane's
    // predecessor shipped with: there was no `.catch` at all, so a rejected `invoke` left
    // "Looking…" on screen for the rest of the session with nothing to explain it.
    if (!searching && target.kind === "unlinked") {
      setNotes([]);
      const generation = (unlinkedScan.current += 1);

      // "Looking…" is for the first answer, which really can take a while — not for every
      // repaint. Once there is an answer it stays on screen while the next one is fetched:
      // the rows are the same rows, and blanking them said otherwise twice a second.
      const previous = unlinkedFiles.current;
      if (previous === null) {
        setFiles([]);
        setFilesState("loading");
      } else {
        setFiles(previous);
        setFilesState("ready");
      }

      try {
        const found = await window.emqnote.library.unlinkedAttachments();
        // Only the newest scan, and only if the pane is still the one that asked. A slow
        // scan finishing after the tree has moved on would otherwise drop a folder's own
        // list on the floor.
        if (unlinkedScan.current !== generation) return;
        if (selectionRef.current.kind !== "unlinked") return;
        unlinkedFiles.current = found;
        setUnlinkedCount(found.length);
        setFiles(found);
        setFilesState("ready");
      } catch {
        if (unlinkedScan.current !== generation) return;
        if (selectionRef.current.kind !== "unlinked") return;
        // A refresh that failed over rows that are already right is not worth throwing
        // those rows away for — the next refresh is 800 ms of typing away. A *first*
        // answer that fails has nothing to fall back on and must say so, which is the
        // state this pane's predecessor shipped without and hung on.
        if (unlinkedFiles.current !== null) return;
        setFilesState("failed");
      }
      return;
    }

    setFilesState("ready");
    setNotes(
      searching
        ? // The folder you are standing in, and everything under it (B83) — `searchNotes`
          // scopes by path prefix, so this is a subtree rather than one directory. A tag,
          // a person, the unlinked pane and the Tasks view are not folders and have no
          // honest answer to "which folder", so they search the vault, as does the switch
          // when it is on.
          await window.emqnote.library.search(
            query,
            searchAllRef.current || target.kind !== "folder" ? "" : target.path,
          )
        : await window.emqnote.library.notes(target),
    );

    // Only a folder has files (B47). A tag, a person, the Tasks view and a search all
    // draw from everywhere, and "which files are here" has no answer for any of them —
    // so the section simply is not there rather than being there and empty.
    setFiles(
      !searching && target.kind === "folder"
        ? await window.emqnote.library.folderFiles(target.path)
        : [],
    );
  }, []);

  /**
   * Debounced the same way `onDocChange`/`onHeaderChange` debounce a save: search runs
   * against the index on every call, and firing it on every keystroke of a multi-word
   * query would mean typing "kickoff" costs seven round trips instead of one.
   */
  const onSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => void loadNotes(selectionRef.current), 150);
    },
    [loadNotes],
  );

  /**
   * Leaves a search: the box is emptied, the list goes back to what the tree is pointing
   * at, and focus lands on the note that was selected in it.
   *
   * One function for all three ways out — Escape in the box, Escape on a note row, the ×
   * — because they are one gesture and a second copy of the ref/timer/reload dance is how
   * they would come to differ. Every existing implicit clear (`openTasks`, `openUnlinked`,
   * picking something in the tree) stays as it is: those are a *different* thing, a search
   * being dropped because something else was asked for, and they end somewhere else.
   *
   * `searchQueryRef` is written by hand as well as through `setSearchQuery`, exactly as
   * `openUnlinked` does and for the same reason: the reload happens in this same tick, and
   * `loadNotes` reads the ref — the state has not caught up yet, and reading it there would
   * run the search again over the list that is meant to replace it.
   *
   * Declared here rather than beside `exitTasks` below because the window's key listener
   * names it in its dependency array, which is evaluated during render: from further down
   * the component it would still be in the temporal dead zone.
   */
  const exitSearch = useCallback(() => {
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    searchQueryRef.current = "";
    setSearchQuery("");
    // The field folds away with the query, and the folder's name comes back into the
    // heading it was sitting in. Leaving it open and empty would leave the pane unable to
    // say what it is showing.
    setSearchOpen(false);
    // Back to the folder, so the next search starts where the default says it does. Same
    // hand-written ref as the query above, for the same reason.
    searchAllRef.current = false;
    setSearchAll(false);
    focusNotesOnNextList.current = true;
    void loadNotes(selectionRef.current);
  }, [loadNotes]);

  /**
   * Into the search: unfolds the field in the note list's heading and takes the caret.
   *
   * Two steps that cannot happen in one tick — the field has to be mounted before it can
   * be focused — so this either focuses a box that is already there or asks for one and
   * lets the effect below finish the job. `searchInput.current` is exactly the question
   * "is it mounted": React nulls a ref when the element it points at goes away, so there
   * is no second flag to keep in step with the first.
   *
   * `Mod-F` and the magnifier both come through here, which is what keeps the keyboard
   * route and the mouse route landing in the same state (B64's rule, one control over).
   */
  const openSearch = useCallback(() => {
    if (searchInput.current !== null) {
      searchInput.current.focus();
      searchInput.current.select();
      return;
    }
    focusSearchOnOpen.current = true;
    setSearchOpen(true);
  }, []);

  // The other half of `openSearch`: the field exists by now. Deliberately not "focus
  // whenever the field opens" — clicking the magnifier does that, but so would any future
  // route that merely wants the field visible, and a caret that moves on its own is the
  // thing `focusNotesOnNextList` exists to keep deliberate elsewhere in this file.
  useEffect(() => {
    if (!searchOpen || !focusSearchOnOpen.current) return;
    focusSearchOnOpen.current = false;
    searchInput.current?.focus();
    searchInput.current?.select();
  }, [searchOpen]);

  /**
   * And out of the Tasks view, back to the folder list.
   *
   * `lastFolder` is the destination for the reason `openTasks` scopes to it and "+ New
   * folder" files into it: it is where the tree was standing when the view was opened, and
   * a tag or the Tasks view is not a place to come back to. Until this existed the only
   * way out was to click something else in the tree — a way of going somewhere, not a way
   * of coming back.
   *
   * Read off `lastFolderRef` rather than the state, and declared up here beside
   * `exitSearch`, for that function's reason: the window's key listener names it in a
   * dependency array evaluated during render, and it must not be rebuilt on every one.
   *
   * The selection change is what reloads the list, so the focus hand-off goes through the
   * same flag `exitSearch` uses rather than being fired here.
   */
  const exitTasks = useCallback(() => {
    focusNotesOnNextList.current = true;
    setSelection({ kind: "folder", path: lastFolderRef.current });
  }, []);

  /**
   * True once a filter list has been unfolded.
   *
   * Keeps the lazy scan lazy. Without it, saving any note would rebuild the facets and
   * so scan the whole vault, even for someone who never opens Tags or People at all.
   */
  const facetsWanted = useRef(false);

  const loadFacets = useCallback(async () => {
    facetsWanted.current = true;
    setFacets(await window.emqnote.library.facets());
  }, []);

  /** Refreshes the lists only if they are being shown. */
  const refreshFacets = useCallback(() => {
    if (facetsWanted.current) void loadFacets();
  }, [loadFacets]);

  // The selection is an object, so it cannot be a dependency directly: a new one is
  // built on every render and the effect would loop. Its key is stable.
  const key = selectionKey(selection);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  /**
   * Re-checks whether the open note is still claimed by the capture window, without
   * touching the document itself: a full `openNote()` would bump `docToken` and throw
   * away the caret and undo history for a change that altered no bytes at all.
   */
  const refreshEditable = useCallback(async () => {
    const current = openRef.current;
    if (current === null) return;
    const editable = await window.emqnote.library.noteEditable(current.path);
    // Stale by the time it resolves: a different note, or none, is open now.
    if (openRef.current === null || openRef.current.path !== current.path) return;
    if (openRef.current.editable === editable) return;
    const updated = { ...openRef.current, editable };
    setOpen(updated);
    openRef.current = updated;
  }, []);

  useEffect(() => {
    void loadTree();
    void loadTaskCounts();
    void loadConflicts();
    void loadUnlinkedCount();

    const reload = (): void => {
      void loadTree();
      // Ticking a box is a save, and a save is what raises `library:refresh` — so the
      // badge follows a checkbox without needing to know anything about one.
      void loadTaskCounts();
      void loadNotes(selectionRef.current);
      refreshFacets();
      void refreshEditable();
      void loadConflicts();
      // `loadNotes` above already ran this scan when the pane is the selection, and set
      // the count from the same reply.
      if (selectionRef.current.kind !== "unlinked") void loadUnlinkedCount();
    };

    /**
     * Seven reloads is what one of these costs, and most of them go through
     * `ensureScanned` in main, which walks the vault (B95). One broadcast is fine; a burst
     * of them is not, and a burst is the normal case rather than the exceptional one — the
     * watcher raises one for the `unlink` and one for the `add` of every file that moves,
     * on top of the one the operation itself sends.
     *
     * **Leading edge, then a trailing coalesce.** The first broadcast still reloads
     * immediately, which is what keeps this responsive for the single events that make up
     * ordinary use — and what keeps every test that fires `onRefresh` and looks straight
     * after it honest. Anything arriving inside the window collapses into exactly one more
     * reload at the end of it, so a batch of any size costs two rounds rather than 3n.
     *
     * Deliberately not a plain trailing debounce: that would delay every single refresh by
     * the window, and this window is on the path between ticking a checkbox and seeing the
     * badge move.
     */
    const COALESCE_MS = 60;
    let last = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;

    const stop = window.emqnote.library.onRefresh(() => {
      const now = Date.now();
      if (now - last >= COALESCE_MS) {
        last = now;
        reload();
        return;
      }
      if (pending !== null) return;
      pending = setTimeout(() => {
        pending = null;
        last = Date.now();
        reload();
      }, COALESCE_MS - (now - last));
    });

    return () => {
      if (pending !== null) clearTimeout(pending);
      stop();
    };
  }, [
    loadTree,
    loadTaskCounts,
    loadNotes,
    refreshFacets,
    refreshEditable,
    loadConflicts,
    loadUnlinkedCount,
  ]);

  /**
   * The startup index scan, which usually ran long before this window existed — the app
   * starts at login and gets opened hours later. So it is asked for once here as well as
   * subscribed to: on a vault that scans in under a second there may never be an event
   * to receive, and on a slow one this window opened partway through and missed the rest.
   *
   * When the scan finishes, everything that reads the index is reloaded. Tags, People and
   * search were answering out of a half-built index up to that moment, which is honest —
   * a partial answer beats a spinner — but it should not stay the last word.
   */
  useEffect(() => {
    void window.emqnote.library.scanState().then(setScan);
    return window.emqnote.library.onScanProgress((progress) => {
      setScan(progress);
      if (progress === null) {
        refreshFacets();
        void loadNotes(selectionRef.current);
        void loadTaskCounts();
        void loadConflicts();
      }
    });
  }, [refreshFacets, loadNotes, loadTaskCounts, loadConflicts]);

  useEffect(() => {
    void loadNotes(selectionRef.current);
    // A mark is about rows on screen (B94), and these are about to be different rows.
    // Left standing, a set marked in the Inbox would light up whichever notes happened to
    // land in those positions in the next folder — and the next Delete would mean them.
    setMarked([]);
  }, [key, loadNotes]);

  /**
   * This window's own shortcuts: the help sheet, a new note, the search box, Settings,
   * the title.
   *
   * Tested against the same registry the editor is built from, and installed once — every
   * changing value it reads comes through a ref, so a tree selection or an open note never
   * tears the listener down and rebuilds it.
   *
   * **`Mod-F` reaches here only from outside a note.** It is two registry entries, `find`
   * (`where: "editor"`) and `searchVault` (`where: "library"`), and what keeps them apart
   * is not the scopes but `find-in-note.ts`'s `handleKeyDown`, which stops the key at the
   * editor. Without that stop both fire — a ProseMirror keymap command returning `true`
   * only calls `preventDefault()`, so the chord went on bubbling to this listener and the
   * caret was taken straight back out of the find bar and put in the search box. B64.
   *
   * `help` is deliberately outside the overlay guard, exactly as in `Capture.tsx`: the
   * second `Mod-/` press is what closes the sheet, and a guard that included it would trap
   * the sheet open. Everything else declines while a modal owns the keyboard — a context
   * menu stops its own keys at its panel (`ContextMenu.tsx`), so only this window's React
   * dialogs need naming here.
   */
  const overlayOpen =
    settingsOpen ||
    helpOpen ||
    dialog !== null ||
    moving !== null ||
    restoring !== null ||
    linkPick !== null ||
    notePick !== null ||
    tableGrid !== null ||
    link !== null;
  const overlayOpenRef = useRef(overlayOpen);
  overlayOpenRef.current = overlayOpen;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const fires = (id: string): boolean => matches(shortcut(id), event, app.isMac);

      if (fires("help")) {
        event.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }

      if (overlayOpenRef.current) return;

      if (fires("newNoteHere")) {
        event.preventDefault();
        // The very expression the note list's "+ New note" button calls, so the chord and
        // the button cannot come to file a note in two different places (B29).
        window.emqnote.library.newNote(lastFolderRef.current);
        return;
      }

      if (fires("searchVault")) {
        event.preventDefault();
        openSearch();
        return;
      }

      // The gear in the title bar was the only way in, which made Settings the one part
      // of this app that could not be reached without the mouse — the same rule `pinNote`
      // above exists for.
      //
      // Below the overlay guard rather than beside `help` at the top, and that placement
      // is the whole of the thought: a `HotkeyRow` inside the panel owns every key while
      // it is armed, because the chord being recorded is a *global* accelerator and may
      // legitimately be this one. A toggle above the guard would close the panel out from
      // under the row that was recording. Escape and the Close button are the ways out,
      // as they are for every other overlay this window opens.
      if (fires("settings")) {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }

      if (fires("pinNote")) {
        // The note the reader is on, which is the row the list is standing on — the same
        // note `focusTitle` below renames, so the two chords cannot come to mean two
        // different rows. The pin itself lives in the list's own summary, not in the
        // reader's `OpenedNote`, so it is read back out of the list.
        const note = openRef.current;
        if (note === null) return;
        const row = notesRef.current.find((entry) => entry.path === note.path);
        if (row === undefined) return;
        event.preventDefault();
        void setPinned(row, !row.pinned);
        return;
      }

      if (fires("goBack")) {
        // Guarded on there actually being somewhere to go, and on it being where the ←
        // button would take you: `backTo` is derived the same way in the render body —
        // the top entry counts only while the note it leads *to* is the one on screen.
        // Without that the chord would fire on a trail belonging to a note nobody is
        // standing on any more, which is the state that derivation exists to answer.
        const note = openRef.current;
        const top = backStackRef.current.at(-1);
        if (note === null || top === undefined || top.to !== note.path) return;
        event.preventDefault();
        goBackRef.current();
        return;
      }

      if (fires("focusFields")) {
        // The note's own When / Tags / Where / Who, landing on When — and Tab walks on
        // from there, which is what makes one chord enough for four fields. This is what
        // the pane ring's fourth stop was for (B94): the ring paid for it on every press
        // that was not about the fields, and a chord does not.
        //
        // Guarded by `focusPane` answering for itself: with no note open there is no block
        // and the key stays unclaimed, the same rule `goBack` above follows.
        if (focusPane("header")) event.preventDefault();
        return;
      }

      if (fires("tasksView")) {
        // The way in is the same handler the sidebar's Tasks row and the note list's
        // footer button call — never a second route that could come to mean something
        // else. The footer button is out of the tab order now, and this is the other half
        // of that trade.
        //
        // The way *out* has to be spelled here rather than in that shared handler, and
        // that is not an inconsistency: the note list is unmounted while the Tasks view is
        // showing (`selection.kind === "tasks"` swaps `NoteList` for `TaskList`), so its
        // footer button is not on screen to be pressed a second time. The chord is the
        // only route that can be both, which is what makes it the one that toggles.
        // `exitTasks` is the same function Escape and TaskList's own button use, so
        // leaving still happens in exactly one place.
        event.preventDefault();
        if (selectionRef.current.kind === "tasks") exitTasks();
        else openTasksRef.current();
        return;
      }

      if (fires("sortNotes")) {
        // **The chord presses the button**, rather than owning a copy of what the button
        // does. The sort chooser's menu is the note list's own state and it is positioned
        // against that button's rectangle; reaching it from here would mean lifting both
        // into this component, or opening a second menu somewhere near it. Finding the
        // control and clicking it is what `--click-button` already does from main, and it
        // cannot come to disagree with the button because it *is* the button.
        const button = libraryRef.current?.querySelector<HTMLElement>(".sort-choose");
        if (button === null || button === undefined) return;
        event.preventDefault();
        button.click();
        return;
      }

      if (fires("focusTitle")) {
        // Only when there is a title to edit and this window is allowed to edit it: a note
        // the capture window has claimed must not be renamed from here, the same guard
        // `IPC.libraryRenameNote` carries. The `<h1>`'s own click asks exactly this.
        const note = openRef.current;
        if (note === null || !note.editable) return;
        event.preventDefault();
        setEditingTitle(note.title);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // `focusPane` is a `useCallback` over two refs, so it is stable and naming it here
    // does not put this listener on the rebuild-every-render path the comment above warns
    // about — the same argument the pane-cycle effect below makes for the same function.
  }, [app.isMac, focusPane]);

  /**
   * The macro keyboard cycle around the window:
   *
   *     forward   tree → notes → title → editor → tree
   *     backward  tree → editor → notes → tree
   *
   * **Four stops forward and three back, and the asymmetry is the point** (B98). The
   * title is a destination you ask for; the note is where you were going anyway. So
   * Ctrl+Tab out of the note list stops on the title — the fourth stop — while
   * Ctrl+Shift+Tab out of the note goes straight back to the list, and Ctrl+Shift+Tab out
   * of the tree reaches the note's text, which it declined to do at all before.
   *
   * This is not the fourth stop B94 removed. That one was the *header block*, entered at
   * whichever end you arrived at, and it was paid for by every press that had nothing to
   * do with the fields: getting from the list to the note went through four inputs on the
   * way. `focusFields` (Mod-Shift-W) replaced it and still does. The title costs one press
   * on one route, and it is the route that was asked for.
   *
   * The block is still *passed through*, and so is the title when a press is made from
   * inside it: on to the note going forward, back to the list going back, which is where
   * the ring would have put you. That is `inNoteFields`, which answers a different
   * question from `paneOf` — see both.
   *
   * **A step with nowhere to land does nothing.** `focusPane` answers whether it moved,
   * and `cycle` returns that answer rather than `true`. With no note open there is no
   * title and no editor, so Ctrl+Shift+Tab in the tree stays in the tree instead of
   * skipping on to a stop the press was not about.
   *
   * **Plain Tab is a different walk from this one, and `tabStep` is where it lives.** It
   * is tree → notes → the note, of which the browser already does everything but the two
   * ends: a dialog's own trap handles a modal, the note's title and its four fields are
   * five focusable controls in DOM order once you are on the first of them, and inside the
   * editor `keymap.ts` binds Tab to list indent and always returns `true`, so it never
   * reaches here at all (nothing to special-case: the event simply never bubbles up to
   * `window`). What the browser cannot do is skip the two panes' own chrome — the sort
   * chooser, Tasks, the splitters, all of which B94 took out of the tab order for exactly
   * this reason — and it cannot get back out of the editor, which is why `cyclePanes`
   * (Ctrl-Tab/Ctrl-Shift-Tab, `shortcuts.ts`) exists as well: `keymap.ts` has no binding
   * for it, so it is the one key that can always complete the loop.
   *
   * Escape is the editor's own way out, for the same reason Tab cannot be: nothing in
   * `outlookKeymap` binds it (see `Editor.tsx`'s own comment on why), so a plain
   * `keydown` listener sees it here.
   *
   * **Ctrl-Tab does not arrive as a `keydown` at all any more: main claims it** in
   * `library-window.ts`'s `before-input-event` and forwards it over
   * `IPC.libraryCyclePanes`, which is why the ring below is a function rather than a
   * branch of the key handler. That is a fix for a Windows report — the chord does nothing
   * there — whose cause was never found: it was measured arriving perfectly well on Linux,
   * and `keyMatches` spells `Ctrl` literally so it cannot be reading the platform wrong.
   * `before-input-event` is simply the earliest point in the window that anything can be
   * claimed from, ahead of every native accelerator and of the renderer both, so it is the
   * one place a fix can stand without knowing what it is standing against. It is
   * deliberately *not* a second route beside the keyboard one: main calls
   * `preventDefault()`, so the `keydown` never fires, and a branch here that could only
   * run when the forward had already failed would be a second answer to one gesture.
   */
  useEffect(() => {
    /**
     * One step around the ring, from wherever focus is now. `true` when it moved.
     *
     * Answers for the plain-Tab case and for the forwarded chord alike, which is the
     * whole reason it is a function: the two differ only in where the intent came from,
     * and a second copy of this ternary is how they would come to differ in more.
     */
    const cycle = (backward: boolean): boolean => {
      const forward = !backward;

      // Asked before `paneOf`, which answers `null` for the title and the four fields on
      // purpose — so without this branch a press made from one of them would fall into the
      // "focus is on nothing" case below and jump to the far end of the ring. They are not
      // a stop; this is where the ring would have put you had you been in the pane on
      // either side of them.
      if (inNoteFields(document.activeElement)) {
        return focusPane(forward ? "editor" : "notes");
      }

      const current = paneOf(document.activeElement);

      if (current === null) {
        // Focus sits on `document.body` (or some other control `paneOf` does not
        // recognise) after an ordinary click that lands nowhere in particular — the
        // usual state, not an edge case. There is no pane to "complete the loop" from,
        // so enter the first one instead of doing nothing.
        return focusPane(backward ? "editor" : "tree");
      }

      const next: "tree" | "notes" | "editor" | "title" =
        current === "tree"
          ? forward
            ? "notes"
            : "editor"
          : current === "notes"
            ? forward
              ? "title"
              : "tree"
            : forward
              ? "tree"
              : "notes";

      // The answer is `focusPane`'s, and that is the rule (B98): **a step with nowhere to
      // land does nothing.** Backward out of the tree with no note open is the case that
      // asked for it — there is no note text to reach, and skipping on to the next stop
      // in the ring would be answering a different question from the one pressed.
      return focusPane(next);
    };

    /**
     * One step of the *plain* Tab order — tree → notes → **the note itself** — from
     * wherever focus is now. `true` when this handler moved it, which is also when the
     * press is taken off the browser.
     *
     * **B98 swapped this with the chord, and the swap is the whole of the report.** B94's
     * order was the one the eye reads — folders, notes, title, When, Tags, Where, Who,
     * note — and daily use answered it: the note is where you were going, five presses
     * away, every time. So plain Tab lands in the note and Ctrl+Tab lands on the title,
     * which is the press you make when the title is what you came for.
     *
     * What that costs is real and worth naming: the four fields no longer have a route
     * from the list that is not a chord. They keep three others — Tab on from the title,
     * `focusFields` (Mod+Shift+W) from anywhere, and the mouse — and the ring still passes
     * through them rather than landing (`inNoteFields`).
     *
     * Only the steps the browser cannot make on its own are here, and there are still two.
     * Between the tree and the note list sit the note pane's own search button and
     * "+ New note", which are controls in that pane rather than the pane itself; and the
     * note has to be asked for by name, because with no note open there is nothing there
     * at all and the press belongs to the browser again — which is `focusPane` answering
     * `false`, not a check written here.
     *
     * Everything past the title is still the browser's: the title, When, Tags, Where, Who
     * and the note are six focusable things in DOM order, and Shift-Tab walks them
     * backwards for free. That is why this is not a table of stops — a table would be a
     * second definition of an order the DOM already states, and the first thing to
     * disagree with it after a pane is reordered.
     */
    const tabStep = (backward: boolean): boolean => {
      const current = paneOf(document.activeElement);

      if (current === "tree") {
        if (backward) return false;
        focusPane("notes");
        return true;
      }

      if (current === "notes") {
        if (backward) {
          focusPane("tree");
          return true;
        }
        // The note itself, not its title (B98) — see this function's own comment above.
        // Still answers `false` with no note open, exactly as `focusPane("title")` did,
        // so the press goes back to the browser rather than being swallowed.
        return focusPane("editor");
      }

      return false;
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      // Escape asks the *event* where it happened; Tab below asks where focus is. That
      // difference is the whole of a reported bug. An overlay — the help sheet, a context
      // menu, the slash menu — handles its own Escape and, on the way out, restores focus
      // to whatever opened it. When that was the note panel, `document.activeElement`
      // reads "editor" by the time the still-bubbling event arrives here, and this branch
      // fired as well: one press closed the overlay *and* threw focus into the note list.
      // The event's target is the overlay's own panel, which is not inside
      // `.editor-content`, so asking it declines whatever focus restoration has already
      // run. The overlays stop the event too (`Help.tsx`, `ContextMenu.tsx`,
      // `slash-menu.ts`, `find-in-note.ts`); either fix alone is correct, and both are
      // kept because this listener cannot know every overlay that will ever exist.
      //
      // Tab is genuinely a question about where focus *is* — nothing has moved it, and the
      // key is about to move it — so it keeps `document.activeElement`.
      if (event.key === "Escape") {
        const pane = paneOf(event.target instanceof Element ? event.target : null);

        // The editor keeps the meaning it has always had, and keeps it first: Escape there
        // is the way back to the note list, whatever else is on screen.
        if (pane === "editor") {
          event.preventDefault();
          focusPane("notes");
          return;
        }

        // A press on a note row clears a marked set before it does anything else — one
        // press undoes one thing, the rule the search box and the help sheet's own query
        // both follow. Marking rows and then wanting out of the search is rare; marking
        // rows and changing your mind is not.
        if (pane === "notes" && markedRef.current.length > 0) {
          event.preventDefault();
          setMarked([]);
          return;
        }

        // A press on a note row while a search is live means "leave this search". That is
        // a state worth one key: the rows came from the whole vault while the tree is lit
        // on a folder whose notes are not the ones being shown. The search box itself is
        // not a `.note[role="option"]`, so `paneOf` answers `null` for it and it carries
        // its own handler — this branch is the rows.
        if (pane === "notes" && searchQueryRef.current.trim() !== "") {
          event.preventDefault();
          exitSearch();
          return;
        }

        // Leaving the Tasks view is asked of the *window*, not of the pane, and that is a
        // correction rather than a flourish. It was a handler on the task pane first, and
        // driven in the real app it did nothing at all for the two commonest ways of being
        // in that view: arriving by the sidebar row leaves focus in the tree, and a click
        // on the empty space below the last task leaves it on `<body>` — neither is inside
        // the pane, so neither reached it. A keydown bubbles to the window from anywhere,
        // which is the only position that answers for all of them. The editor is asked
        // about before this, so a note open beside the list keeps its own Escape.
        if (selectionRef.current.kind === "tasks") {
          event.preventDefault();
          exitTasks();
          return;
        }

        return;
      }

      const current = paneOf(document.activeElement);

      // Plain Tab only: main claims Ctrl-Tab before this listener can see it (see the
      // comment above the effect), so anything arriving here with Control held is not
      // the pane cycle and is none of this handler's business.
      if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey) return;
      // ProseMirror's own keymap consumes a plain Tab inside the editor, so a bare Tab
      // never reaches here from that pane — which is precisely why the chord exists and
      // why it has to be claimed somewhere the editor's keymap is not.
      if (current === "editor") return;
      // Focus on nothing this recognises — after a click on the background, say. A plain
      // Tab has a sensible browser default there and keeps it; only the chord enters a
      // pane from nowhere, because it has no default worth preserving.
      if (current === null) return;

      // `tabStep`, not `cycle`: the two used to be one function and they are two orders.
      // The ring stops on the title on its way past; plain Tab goes straight to the note
      // and leaves the title to the chord (B98). Reading either one out of the other is
      // how they would come to disagree.
      if (tabStep(event.shiftKey)) event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    const stopForward = window.emqnote.library.onCyclePanes(({ backward }) => {
      cycle(backward);
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      stopForward();
    };
    // `focusPane` and `exitSearch` are both stable — refs, and a `useCallback` over
    // `loadNotes`, whose own dependency list is empty — so naming them here does not put
    // this listener on the rebuild-every-render path the comment above warns about.
  }, [app.isMac, focusPane, exitSearch, exitTasks]);

  /**
   * Writes the note being edited.
   *
   * The main process compares against what is on disk and writes nothing when they
   * match, so calling this more often than strictly needed is cheap and safe — which
   * is what makes it reasonable to flush before switching notes.
   */
  const save = useCallback(async () => {
    const current = openRef.current;
    const fields = headerRef.current;
    const doc = editor.current?.getDoc();
    if (current === null || fields === null || doc === null || doc === undefined) return;
    // The capture window has this exact note claimed — see `editable` on `OpenedNote`.
    // Saving here would race its own debounced write with no conflict copy either side,
    // which is exactly the failure B10 exists to prevent.
    if (!current.editable) return;

    const result = await window.emqnote.library.saveNote({
      path: current.path,
      // The title belongs to Rename, which renames the file with it. The header block
      // in the reader deliberately has no subject field for that reason.
      title: current.title,
      kind: fields.kind,
      created: fields.created,
      location: fields.location,
      attendees: fields.attendees,
      tags: fields.tags,
      doc: doc.toJSON(),
    });

    // Not cleared when the write failed: the note still differs from the file, and
    // saying otherwise is what put "Saved" under a note that was not.
    if (result.error === undefined) setDirty(false);
    setSaveError(result.error ?? null);
    // Editing the header — or an inline #tag in the body — changes what the list and the
    // filters show, so both reload.
    if (result.written) {
      void loadNotes(selectionRef.current);
      refreshFacets();
    }
    // The local `editable` flag was stale: the capture window claimed this exact note
    // between our last refresh and this save landing. Catch up immediately rather than
    // let further keystrokes queue up saves that will never land.
    if (result.locked) void refreshEditable();
  }, [loadNotes, refreshFacets, refreshEditable]);

  /**
   * Cancels the debounce and writes now — what every operation that moves a file out from
   * under the editor does first, and what main asks for before it restarts into another
   * vault (`IPC.libraryFlushSaves`).
   */
  const flushPendingSave = useCallback(async () => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (dirty) await save();
  }, [dirty, save]);

  // Main is waiting on the reply before it restarts the app into another vault (B21), so
  // this must be registered for as long as the window is open — the tray can ask at any
  // moment, unlike Settings, which flushes on its own way out.
  useEffect(() => window.emqnote.library.onFlushSaves(flushPendingSave), [flushPendingSave]);

  const openNote = useCallback(
    async (path: string, taskOrdinal?: number) => {
      const request = ++openNoteRequest.current;

      // Whatever the disk-change bar was showing belongs to the note being left, not
      // the one about to be loaded — cleared here rather than left to the effect keyed
      // on `open` transitioning to `null`, since a switch between two open notes never
      // passes through `null` at all. A failed save is the same kind of thing and is
      // cleared beside it: it names a file this pane is about to stop showing.
      setDiskEvent(null);
      setSaveError(null);

      // Where the caret was in the note being left, before anything replaces it (B70).
      // Beside the outgoing note's pending save, which is flushed a few lines down: the
      // same seam, for the same reason.
      rememberCaret();

      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (dirty) await save();

      const loaded = await window.emqnote.library.openNote(path);
      if (loaded === null) return;
      // A newer call already landed while this one was in flight — applying this one
      // now would clobber it, exactly the "most recently clicked" bug this guards.
      if (request !== openNoteRequest.current) return;

      pendingTaskOrdinal.current = taskOrdinal ?? null;
      setOpen(loaded);
      openRef.current = loaded;
      setDocToken((token) => token + 1);

      /**
       * A search result can name a note from anywhere in the vault, and until now
       * clicking one left the tree pointing at whatever was selected before — the note
       * and the highlighted folder disagreeing about where it lived. Deliberately not
       * routed through the tree's own `onSelect`: that clears `searchQuery` and cancels
       * the pending debounce, which would drop the result list out from under the click
       * that just landed on it. Guarded on `searching`: outside a search a note in a
       * folder listing is always already in the selected folder, and re-selecting the
       * folder under a tag or person filter would silently discard the filter instead.
       */
      if (searchQueryRef.current.trim() !== "") {
        const folder = folderOf(loaded.path);
        const target: Selection = { kind: "folder", path: folder };
        setSelection(target);
        setLastFolder(folder);
        selectionRef.current = target;
      }

      const fields: HeaderValues = {
        kind: loaded.kind,
        subject: loaded.title,
        created: loaded.created,
        location: loaded.location,
        attendees: loaded.attendees,
        tags: loaded.tags,
      };
      setHeader(fields);
      headerRef.current = fields;
      setBodyTags(loaded.bodyTags);

      setDirty(false);
    },
    [dirty, save, rememberCaret],
  );

  /**
   * A note changed or disappeared on disk. Filtered against `open` here, in the
   * renderer, rather than in main: main has no reliable way to know what the reader
   * currently has open, and building one would mean a second source of truth for
   * something this side already holds authoritatively.
   *
   * `dirty` decides "changed": reload only when there is nothing of the user's own to
   * lose. One race is left deliberately unresolved here — a save that is in flight (the
   * IPC call sent, not yet resolved) when this event arrives still reads `dirty` as
   * `true` at that instant, so the note would not auto-reload even though the write
   * that will make `dirty` false again is already on its way. The content-hash approach
   * in `own-writes.ts` is what actually closes that gap in practice: the in-flight
   * save's own bytes land on disk a moment later, the watcher recognises them as this
   * app's own write, and no further event ever arrives to race against — so the exact
   * timing of this check does not have to be perfect for the outcome to be correct.
   *
   * "removed" never auto-closes, even when `!dirty`: reloading a *changed* note loses
   * nothing by definition, but closing yanks away a window the user may be actively
   * reading, and a transient OneDrive hiccup (a conflict-copy dance that briefly removes
   * then restores a file) must never be able to do that without the user choosing it.
   */
  const onFileChanged = useCallback(
    (event: VaultFileEvent) => {
      const current = openRef.current;
      if (current === null || current.path !== event.path) return;

      if (event.kind === "changed" && !dirty) {
        void openNote(current.path);
        return;
      }

      setDiskEvent(event);
    },
    [dirty, openNote],
  );

  useEffect(() => window.emqnote.onVaultFileChanged(onFileChanged), [onFileChanged]);

  /**
   * Records that `to` was reached by following a link out of `origin`.
   *
   * A push whose origin is not what the top entry already leads to starts a fresh chain:
   * the old trail belongs to a note nobody is standing on any more, and keeping it would
   * let the stack grow through a session of unrelated hops. A link to the note already
   * open records nothing — there is nowhere to go back to.
   */
  const rememberOrigin = useCallback((origin: NoteOrigin | null, to: string) => {
    if (origin === null || origin.path === to) return;

    setBackStack((stack) => {
      const top = stack[stack.length - 1];
      const chain = top !== undefined && top.to === origin.path ? stack : [];
      return [...chain, { from: origin, to }].slice(-BACK_STACK_LIMIT);
    });
  }, []);

  /**
   * The way back out of a followed `[[…]]` link: pop the trail, open what it names.
   *
   * A `useCallback` beside `rememberOrigin`, rather than a plain function in the render
   * body where it began, because the footer's ← button is no longer its only caller — the
   * `goBack` chord fires it from the window listener, which is declared above `openNote`
   * and reaches this through `goBackRef`. One function, so a key and a button cannot come
   * to mean two different steps back.
   */
  const goBack = useCallback(() => {
    const top = backStackRef.current.at(-1);
    if (top === undefined) return;
    setBackStack((stack) => stack.slice(0, -1));
    void openNote(top.from.path);
  }, [openNote]);
  goBackRef.current = goBack;

  /**
   * A `[[…]]` link was clicked, here or in the capture window, and names a note (B35).
   *
   * One candidate opens straight away; several raise the picker, because
   * `link-resolve.ts` deliberately refuses to choose between two notes of the same name
   * in different folders. Main sends the candidates rather than the renderer asking for
   * them: main is where the target was resolved, and resolving it a second time on this
   * side would be a second implementation of the same three rules.
   *
   * `event.origin` is where the click came from. Main fills it in for the capture window,
   * whose open note it genuinely knows; `null` means the click was in this window's own
   * reader, and the note this window has open *is* the origin.
   */
  useEffect(
    () =>
      window.emqnote.library.onOpenLink((event) => {
        const current = openRef.current;
        const origin =
          event.origin ??
          (current === null ? null : { path: current.path, title: current.title });

        if (event.candidates.length === 1) {
          const candidate = event.candidates[0]!;
          rememberOrigin(origin, candidate.path);
          void openNote(candidate.path);
          return;
        }
        if (event.candidates.length > 1) setLinkPick({ ...event, origin });
      }),
    [openNote, rememberOrigin],
  );

  /**
   * A `#tag` in a note body was Mod+clicked, here or in the capture window (B52).
   *
   * Only a selection change: the effect keyed on `selectionKey` reloads the note list,
   * `notesMatching` already folds tag case, and `FilterSection` unfolds itself when its
   * own kind is what is selected — so the Tags list ends up open with the row lit
   * whichever route the selection arrived by, not just this one. `loadFacets` is what
   * gives that list something to show: nothing has necessarily asked for the facets yet,
   * since the sections are collapsed and lazy on purpose.
   *
   * The search box is cleared for the reason `openTasks` clears it: a live query wins
   * over the selection outright in `loadNotes`, so leaving one there would swallow the
   * filter and leave the tree lit on a tag whose notes are not the ones on screen. Read
   * off the ref rather than the state, since this callback is registered once.
   */
  useEffect(
    () =>
      window.emqnote.library.onOpenTag(({ name }) => {
        setSelection({ kind: "tag", name });
        if (searchQueryRef.current !== "") {
          if (searchTimer.current !== null) clearTimeout(searchTimer.current);
          setSearchQuery("");
        }
        void loadFacets();
      }),
    [loadFacets],
  );

  // Whatever the bar was showing no longer applies once the reader is empty — cleared
  // here rather than only inside `openNote`, since `open` can also become `null` from
  // `trash()`, `clearTrash()` and `deleteFolderAt()`, none of which call `openNote`.
  useEffect(() => {
    if (open === null) setDiskEvent(null);
  }, [open]);

  /**
   * The picker path, for the reader's two toolbar buttons and their keyboard shortcuts.
   *
   * Nothing guards `open === null` or `!open.editable` here beyond the buttons being
   * disabled for those states: `editor.current?.insertAttachment` dispatches a
   * transaction that reaches `onDocChange` like any other edit, and that is where the
   * `editable` refusal already lives — the same belt-and-braces reasoning `onDocChange`
   * itself documents for a keystroke that slips through while the overlay is up. Same
   * flow for both, differing only in the picker's filter (`ipc.ts`'s `pickAttachment`) —
   * the note panel's right-click menu's two attachment items reach the same two.
   */
  const pickAndInsertImage = useCallback(async () => {
    const name = await window.emqnote.pickAttachment("image");
    if (name !== null) editor.current?.insertAttachment(name);
  }, []);

  const pickAndInsertFile = useCallback(async () => {
    const name = await window.emqnote.pickAttachment("any");
    if (name !== null) editor.current?.insertAttachment(name);
  }, []);

  /**
   * Opens the note picker, seeded with whatever words were selected — the common case
   * being "write the sentence, notice it names a note, select it and link it", where
   * retyping the title into the filter is work the selection already did.
   */
  const openNotePicker = useCallback((prefix: string) => {
    const state = editor.current?.getSelectedText() ?? "";
    setNotePick({ prefix, query: state });
  }, []);

  const onDocChange = useCallback(
    (doc: PMNode) => {
      // Belt and braces alongside the `pointer-events: none` overlay: a note can go
      // read-only while the editor already has focus from before, and a keystroke that
      // slips through must not schedule a save that `save()` would refuse anyway.
      if (openRef.current === null || !openRef.current.editable) return;
      setDirty(true);
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        // Beside the save rather than in front of it: the chips follow what was typed,
        // and paying a body serialization per keystroke to draw them is exactly the
        // trade `bodyTagsOf`'s own comment refuses.
        setBodyTags(bodyTagsOf(doc));
        void save();
      }, SAVE_DEBOUNCE_MS);
    },
    [save],
  );

  /**
   * A header edit saves on the same debounce as the body.
   *
   * The ref is set alongside the state because the timer below fires before React has
   * re-rendered, and `save` reads the ref — without it the first keystroke after a
   * change would write the previous value.
   */
  const onHeaderChange = useCallback(
    (values: HeaderValues) => {
      if (openRef.current === null || !openRef.current.editable) return;
      setHeader(values);
      headerRef.current = values;
      setDirty(true);
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        void save();
      }, SAVE_DEBOUNCE_MS);
    },
    [save],
  );

  /**
   * Loads the document into the editor once React has mounted it.
   *
   * Not straight after `setOpen`: the editor is rendered conditionally, so on the
   * first note the ref is still null at that point and the note came up blank.
   *
   * Keyed on a counter rather than on `open`, because `setDoc` replaces the whole
   * editor state and throws away the caret and the undo history. That is right when a
   * *different* note is opened and wrong for every other reason `open` changes — such
   * as rebasing its path after a folder rename, which alters no bytes at all. The
   * counter is bumped in `openNote` and nowhere else, so the reload happens exactly
   * when a document actually arrives.
   */
  const [docToken, setDocToken] = useState(0);


  useEffect(() => {
    const current = openRef.current;
    if (current === null) return;
    editor.current?.setDoc(schema.nodeFromJSON(current.doc) as PMNode);

    // A task ordinal wins over a remembered caret, and the order of these two branches is
    // the whole of that rule: clicking a row in the Tasks view names a destination, and a
    // caret left behind on a previous visit must not be able to overrule it.
    if (pendingTaskOrdinal.current !== null) {
      editor.current?.focusTask(pendingTaskOrdinal.current);
      pendingTaskOrdinal.current = null;
      return;
    }

    // Silently — `setSelection` does not focus. Opening a note leaves focus on the note
    // list row that was clicked, and it goes on doing so; what this changes is where the
    // caret is waiting once you Tab or click into the note.
    const caret = carets.current.get(current.path);
    if (caret !== undefined) editor.current?.setSelection(caret);
  }, [docToken]);

  // Focuses and selects the title input the moment it replaces the `<h1>` — keyed on
  // whether an edit is in progress at all, not on the text itself, so retyping the
  // title does not re-select it out from under the caret on every keystroke.
  useEffect(() => {
    if (editingTitle !== null) {
      titleInput.current?.focus();
      titleInput.current?.select();
    }
  }, [editingTitle !== null]);

  // The trash is not somewhere you move a note to on purpose — Delete is what puts a
  // note there. Offering it in the move list made it look like an ordinary folder.
  const folders = useMemo(
    () =>
      flatten(tree).filter(
        (path) => path !== TRASH_FOLDER && !path.startsWith(`${TRASH_FOLDER}/`),
      ),
    [tree],
  );
  const pinsApply = pinsApplyTo(selection, searchQuery);
  const sorted = useMemo(
    () => sortNotes(notes, sort, sortDirection, pinsApply),
    [notes, sort, sortDirection, pinsApply],
  );
  notesRef.current = notes;

  // The badge's two halves, joined. Only the tree pane gets this — everything else that
  // reads `tree` (the move list, the folder lookups) is about where folders are, and a
  // task count would be noise in it.
  const treeWithTasks = useMemo(() => withOpenTasks(tree, taskCounts), [tree, taskCounts]);

  // The Tasks view's scope chooser, narrowed to the folders that have something to show.
  // `noteTasks` and not `taskCounts`: the scope filter is a path prefix, so a folder
  // qualifies on what is *under* it, and the per-folder counts deliberately do not roll
  // up. The tick travels with it, so the chooser offers what the list under it would
  // actually show — see `foldersWithTasks` for the other two decisions in it.
  const taskFolders = useMemo(
    () =>
      foldersWithTasks(
        folders,
        noteTasks,
        selection.kind === "tasks" ? selection.scope : "",
        selection.kind === "tasks" ? selection.openOnly : true,
      ),
    [folders, noteTasks, selection],
  );

  /**
   * What each dialog says. Lifted out of the JSX when the chain of ternaries there grew
   * past the point of being readable — every branch is one sentence, and a `switch` says
   * so where a nine-deep conditional expression did not.
   */
  const dialogTitle = (open: Dialog): string => {
    const plural = (count: number, one: string, many: string): string =>
      `${count} ${app.t(count === 1 ? one : many)}`;

    switch (open.kind) {
      case "renameFolder":
        return `${app.t("ask.renameFolderTitle")} "${open.path}"`;
      case "newFolder":
        return `${app.t("ask.newFolderIn")} "${open.parent === "" ? app.t("library.vaultRoot") : open.parent}"`;
      case "problem":
        return open.message;
      case "clearTrash": {
        // Only the kinds that are actually there. A trash holding six notes and nothing
        // else should say "6 notes", not "6 notes, 0 folders, 0 files" — the zeroes are
        // noise in the common case and the counts only earn their place when they have
        // something to add. Same `plural` and the same comma list as `deleteFolder`
        // below, which is the phrasing this window already uses for "and what is inside".
        const parts = [
          plural(open.notes, "library.note", "library.notes"),
          ...(open.folders === 0
            ? []
            : [plural(open.folders, "library.folder", "library.folders")]),
          ...(open.files === 0 ? [] : [plural(open.files, "library.file", "library.files")]),
          // Last in the list because it is a different kind of thing from the three in
          // front of it: those count what is in the trash, this counts what is written
          // in it and still to be done. It earns its place by the same rule they do.
          ...(open.openTasks === 0
            ? []
            : [plural(open.openTasks, "library.openTask", "library.openTasks")]),
        ];

        // A second sentence rather than a fourth item in the list, because it is about
        // files that are *not* in the trash and are *not* deleted: emptying the trash
        // takes away the last note that named them, so they become unlinked attachments
        // (§6.5). Left out entirely when there are none — which is the usual case, and a
        // "0 linked files" would read as a warning about nothing.
        const unlinks =
          open.linkedFiles === 0
            ? ""
            : ` ${plural(open.linkedFiles, "library.linkedFile", "library.linkedFiles")} ${app.t("ask.clearTrashUnlinks")}`;

        return `${parts.join(", ")} — ${app.t("ask.confirmClearTrash")}${unlinks}`;
      }
      case "deleteFolder": {
        // The open tasks join the parenthetical rather than starting a sentence of their
        // own, because they are one more thing that is inside this folder — and they are
        // left out at zero for the reason the whole list is: a "0 open tasks" is a
        // warning about nothing. An empty folder still shows nothing at all in brackets.
        const inside = [
          ...(open.notes === 0 && open.folders === 0
            ? []
            : [
                plural(open.notes, "library.note", "library.notes"),
                plural(open.folders, "library.folder", "library.folders"),
              ]),
          ...(open.openTasks === 0
            ? []
            : [plural(open.openTasks, "library.openTask", "library.openTasks")]),
        ];
        const contents = inside.length === 0 ? "" : ` (${inside.join(", ")})`;
        return `"${open.path}"${contents} — ${app.t("ask.confirmDeleteFolder")}`;
      }
      case "relink":
        return `${plural(open.count, "link.noteLinksHere", "link.notesLinkHere")} — ${app.t("link.updateThem")}`;
      case "duplicateTitle":
        return `${app.t("link.duplicateTitle")} "${open.folder === "" ? app.t("library.vaultRoot") : open.folder}" — ${app.t("link.renameAnyway")}`;
      case "delete": {
        // The same parenthetical the permanent delete below writes, in the same words:
        // the two questions differ in what they do, not in what a note holds. Silent at
        // zero, which is the common case.
        const tasks =
          open.openTasks === 0
            ? ""
            : ` (${plural(open.openTasks, "library.openTask", "library.openTasks")})`;
        // A set says how many rather than naming them (B94). Two titles in quotes would
        // read as the whole answer where there are six, and a list of six is a paragraph
        // in a dialog whose job is one sentence — the rows are lit up on the list behind
        // it, which is where a set is read.
        const what =
          open.paths.length === 1
            ? `"${open.title}"`
            : plural(open.paths.length, "library.note", "library.notes");
        return `${what}${tasks} — ${app.t("ask.confirmDelete")}`;
      }
      case "deletePermanently": {
        // The open tasks in this one thing, counted when the dialog opens exactly as the
        // whole trash's are. Silent when there are none, for the reason the zeroes are
        // left out of the list above.
        const tasks =
          open.openTasks === 0
            ? ""
            : ` (${plural(open.openTasks, "library.openTask", "library.openTasks")})`;
        return `"${open.label}"${tasks} — ${app.t("ask.confirmDeletePermanently")}`;
      }
    }
  };

  const performRename = async (
    notePath: string,
    title: string,
    rewriteLinks: boolean,
  ): Promise<void> => {
    await save();
    const result = await window.emqnote.library.renameNote(notePath, title, rewriteLinks);
    if (result.locked === true) {
      setDialog({ kind: "problem", message: app.t("library.renameLocked") });
      return;
    }
    await openNote(result.path);
  };

  /**
   * Carries out a move or a rename, having settled the link question one way or the other.
   *
   * Returns the promise rather than `void`ing it, which is not a tidy-up: `moveNotesTo`
   * used to `await` its way down to here and then let go, so its loop serialised the
   * question and nothing else, and every move in a set ran on top of the last one. That is
   * what left the reader standing on a path another move had already vacated (B95).
   */
  const runRelinkable = async (action: Relinkable, rewriteLinks: boolean): Promise<void> => {
    if (action.kind === "move") await performMove(action.paths, action.folder, rewriteLinks);
    else await performRename(action.path, action.title, rewriteLinks);
  };

  /**
   * Asks about the links first, if there are any, and otherwise gets straight on with it.
   *
   * The question is asked *before* the move rather than after, because that is the only
   * moment the answer can still be acted on: a link target resolves against where the note
   * is now, so once the file has moved there is nothing left for main to find. See the
   * `relink` case in `Dialog` for what dismissing it means.
   *
   * One question for the whole set, counted over the notes that would be *rewritten* —
   * main dedupes by the linking note, so one note pointing at three of the six being moved
   * is one answer and not three.
   */
  const askRelinkThen = async (action: Relinkable): Promise<void> => {
    const linking = await window.emqnote.library.linkingNotes(
      action.kind === "move" ? action.paths : [action.path],
    );
    if (linking.length === 0) {
      await runRelinkable(action, false);
      return;
    }
    setDialog({ kind: "relink", count: linking.length, action });
  };

  /**
   * Renaming the open note, from the click-to-edit title.
   *
   * Two notes in one folder *can* share a title — the filename carries a timestamp
   * prefix, so nothing on disk collides — and that is exactly why it is worth a word: a
   * bare `[[Title]]` link written afterwards would be ambiguous between them for good,
   * and the ambiguity would only ever show up as a picker appearing where none is wanted.
   * Deliberately a warning and not a refusal: the vault is the user's, and two notes
   * genuinely called "Weekly" in one folder is their business.
   *
   * Deliberately not wired into the capture window's commit-time rename either: a modal
   * appearing on Ctrl+Enter is what the resident architecture exists to avoid.
   */
  const rename = async (title: string): Promise<void> => {
    const current = openRef.current;
    if (current === null) return;

    const folder = folderOf(current.path);
    const siblings = await window.emqnote.library.notes({ kind: "folder", path: folder });
    const clash = siblings.some(
      (note) =>
        note.path !== current.path &&
        note.title.trim().toLowerCase() === title.trim().toLowerCase(),
    );

    if (clash) {
      setDialog({ kind: "duplicateTitle", title, path: current.path, folder });
      return;
    }

    await askRelinkThen({ kind: "rename", path: current.path, title });
  };

  /**
   * Duplicates the open note beside itself, `-copy` appended to the title. Reached from
   * the note-list context menu — which selects the row first (`NoteList.tsx`'s
   * `onContextMenu`), so it is always the note currently open by the time this runs —
   * and from the reader toolbar, which always means the open note too.
   *
   * Flushes a pending save first, the same reason `rename` does: the source has to
   * reflect what is on screen, not what is still sitting in the 800 ms debounce, or the
   * copy would silently be a stale version of it.
   */
  const duplicate = async (): Promise<void> => {
    const current = openRef.current;
    if (current === null) return;

    await save();
    const result = await window.emqnote.library.duplicateNote(current.path);
    if (result.locked === true) {
      setDialog({ kind: "problem", message: app.t("library.duplicateLocked") });
      return;
    }
    await openNote(result.path);
  };

  /**
   * Renames a folder and moves everything that pointed into it.
   *
   * The order of the first two steps is the whole trick. `save()` posts the note's path
   * as it was, and `writeAtomic` calls `mkdirSync(dirname(file), { recursive: true })` —
   * so a debounced save landing after the rename would *recreate the old folder* and
   * write the note back into it, leaving two folders where the user asked for one. The
   * pending save is cancelled and flushed first, the same order Rename and Move use.
   *
   * The reloads at the end are not redundant with the `library:refresh` broadcast: that
   * fires inside the main-process handler, before the invoke resolves, so it reloads
   * against the path this side has not rebased yet.
   */
  const renameFolderAt = async (path: string, name: string): Promise<void> => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (dirty) await save();

    let next: string;
    try {
      next = await window.emqnote.library.renameFolder(path, name);
    } catch (error) {
      const code = folderErrorOf(error);
      setDialog({
        kind: "problem",
        message: app.t(code === null ? "folder.failed" : `folder.${code}`),
      });
      return;
    }

    rebaseOntoMovedFolder(path, next);

    await loadTree();
    await loadNotes(selectionRef.current);
    refreshFacets();
  };

  /**
   * Follows a folder that changed place — renamed (B44), or restored out of the trash —
   * with everything in this window that was pointing inside it.
   *
   * Shared by both callers rather than written out twice: the two operations differ in
   * which main-side call they make and in nothing else this side can see, and a second
   * copy is how one of the three things below gets forgotten on whichever path nobody
   * exercised. The open note keeps its caret and its undo history — only its path moved,
   * and the document reload is keyed on `docToken`, which nothing here touches.
   */
  const rebaseOntoMovedFolder = (from: string, to: string): void => {
    if (from === to) return;

    const rebase = (candidate: string): string =>
      candidate === from || candidate.startsWith(`${from}/`)
        ? to + candidate.slice(from.length)
        : candidate;

    const current = openRef.current;
    if (current !== null) {
      const moved = { ...current, path: rebase(current.path) };
      setOpen(moved);
      openRef.current = moved;
    }

    if (selectionRef.current.kind === "folder") {
      const target: Selection = { kind: "folder", path: rebase(selectionRef.current.path) };
      setSelection(target);
      selectionRef.current = target;
    }

    setLastFolder(rebase(lastFolder));
  };

  /**
   * Moves a folder — and everything inside it — into `_trash`, the same trash discipline
   * a single note follows (B24). There is nothing to rebase a path onto afterwards, the
   * way a rename rebases: the selection and the open note (if it was somewhere inside)
   * simply move up to the parent, the one place guaranteed to still exist.
   *
   * The pending save is flushed first, for the same reason `renameFolderAt` flushes one:
   * a debounced write landing after the folder is already gone would recreate it with
   * `writeAtomic`'s `mkdirSync`, leaving one note behind in a folder everyone else
   * believes was just deleted.
   */
  const deleteFolderAt = async (path: string): Promise<void> => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (dirty) await save();

    let result: { trashed: boolean; locked?: boolean };
    try {
      result = await window.emqnote.library.trashFolder(path);
    } catch (error) {
      const code = folderErrorOf(error);
      setDialog({
        kind: "problem",
        message: app.t(code === null ? "folder.deleteFailed" : `folder.${code}`),
      });
      return;
    }

    if (result.locked === true) {
      setDialog({ kind: "problem", message: app.t("library.deleteFolderLocked") });
      return;
    }

    const parent = folderOf(path);

    // The reader may be showing a note that just went into `_trash` along with the rest
    // of the folder — put it away rather than leave it pointing at a path that is gone.
    const current = openRef.current;
    if (current !== null && current.path.startsWith(`${path}/`)) {
      setOpen(null);
      openRef.current = null;
    }

    const target: Selection = { kind: "folder", path: parent };
    setSelection(target);
    selectionRef.current = target;
    setLastFolder(parent);

    await loadTree();
    await loadNotes(target);
    refreshFacets();
  };

  /**
   * Files notes into a folder. Every way of asking for that — the "Move to…" dialog, a
   * dragged row, a dragged marked set, Restore out of the trash — comes through here, so
   * they cannot drift apart.
   *
   * **One note is a set of one** (B95), rather than a single-note function beside a
   * plural one. There were two, and the plural one was the singular one in a loop: it cost
   * a walk of the index, a round trip, a broadcast and a three-part reload per note, and
   * it did not actually serialise, because the singular one let go of its own promise
   * halfway down. Both of the reported faults came out of that one seam.
   *
   * Only a note that is actually open needs saving first; a dragged row is usually not it,
   * and flushing an unrelated pending save would write one note because another one moved.
   * The reopen at the end is likewise conditional: following the note into its new folder
   * is right when you moved the note you were reading, and wrong when you flicked a
   * different row out of the Inbox and are still reading what you had.
   *
   * The *tree* never follows, and that is the point of filing: emptying an Inbox means
   * moving notes out of the same folder one after another, and jumping to each destination
   * meant clicking back to the source between every one of them. The note stays open in
   * the reader under its new path, so the move is still visibly confirmed — it is simply
   * no longer in the list on the left, which is what moving it means.
   *
   * The marks go first, not last: they name rows in a list that is about to be rebuilt
   * without them, and a set left standing would light up whatever moved into those
   * positions.
   */
  const moveNotesTo = async (notePaths: string[], target: string): Promise<void> => {
    if (notePaths.length === 0) return;
    setMarked([]);
    await askRelinkThen({ kind: "move", paths: notePaths, folder: target });
  };

  const moveNoteTo = async (notePath: string, target: string): Promise<void> => {
    await moveNotesTo([notePath], target);
  };

  const performMove = async (
    notePaths: string[],
    target: string,
    rewriteLinks: boolean,
  ): Promise<void> => {
    const moving = new Set(notePaths);
    const current = openRef.current;
    const wasOpen = current !== null && moving.has(current.path);
    if (wasOpen && dirty) await save();

    /**
     * The row to stand on afterwards, worked out *before* anything leaves.
     *
     * A move takes notes out of the list they were selected in, so the `<li>` holding
     * focus is unmounted and focus falls to `<body>` — from where Tab walks the whole
     * window before it reaches the tree again, which is the report. `NoteList` already
     * recovers its *roving row* on its own (`active` falls back to the first note when
     * `activePath` no longer exists); what it cannot recover is focus, because nothing
     * told it to take any.
     *
     * The row above rather than the row below, and the row below only when the note was
     * the first one: after taking something out of a list, the eye is where the thing
     * above it is. `sorted` and not `notes`, because it has to be the order actually on
     * screen — this is a question about which row the reader was looking at.
     *
     * **And never a row that is itself moving** (B95). The open note is normally *in* a
     * marked set — `toggleMarked` seeds the set with it — and a marked set is usually
     * contiguous, so the note directly above it was another note on its way out. The
     * reader was parked on a path the very next move vacated, and when the watcher's
     * `unlink` for it arrived the window said "This note was deleted outside emqnote"
     * about a move it had just made itself.
     */
    const row = current === null ? -1 : sorted.findIndex((note) => note.path === current.path);
    const stays = (index: number): string | null => {
      const note = sorted[index];
      return note === undefined || moving.has(note.path) ? null : note.path;
    };
    let neighbour: string | null = null;
    for (let above = row - 1; above >= 0 && neighbour === null; above -= 1) neighbour = stays(above);
    for (let below = row + 1; below < sorted.length && neighbour === null; below += 1) {
      neighbour = stays(below);
    }

    // One call for the whole set, and one `library:refresh` broadcast at the end of it.
    const result = await window.emqnote.library.moveNotes(notePaths, target, rewriteLinks);
    if (result.locked.length > 0) {
      // Said once, however many were refused, and *after* the rest have gone: a batch is
      // refused per note, so the honest report is that some of them did not move rather
      // than that the gesture failed.
      setDialog({ kind: "problem", message: app.t("library.moveLocked") });
    }
    if (result.moved.length === 0) return;

    await loadTree();

    // Only when the note that moved is the one being read, which is every move made from
    // the list or the reader — `NoteList`'s `onContextMenu` selects the row before the
    // menu opens. A note dragged out of the list while something else is open is the
    // other case, and it deliberately changes neither the reader nor where focus is: the
    // caret may be in the editor, and a drag of some other note must not take it away.
    const openMoved =
      current === null ? undefined : result.moved.find((one) => one.from === current.path);
    if (openMoved !== undefined && row !== -1) {
      // Through the same flag the Tasks and search exits use, and for its reason: the
      // rows `focusPane` would find right now belong to the list about to be replaced.
      focusNotesOnNextList.current = true;
      if (neighbour !== null) await openNote(neighbour);
      else {
        // Nothing left to stand on. The reader is put away rather than left showing a
        // note that is no longer in this folder, which is what the empty list is saying.
        setOpen(null);
        openRef.current = null;
      }
    } else if (openMoved !== undefined) {
      // The reader follows the file it is showing: the note was open but not in the list
      // on screen — read out of a tag, a search or a `[[…]]` link — so there is no row to
      // step back onto and nothing to hand focus to.
      await openNote(openMoved.to);
    }

    await loadNotes(selectionRef.current);
    refreshFacets();
  };

  /**
   * Moves one note into `_trash` — the one route there, whether the ask came from the
   * Delete menu item or from dragging a row onto the Trash row (`drag.ts`).
   *
   * Two ways to reach the trash would be two places for the lock check, the reload and
   * the reader's own bookkeeping to disagree, which is the same argument `moveNoteTo`
   * makes for the dialog and the drag being one function.
   *
   * The reader is only put away if it was showing *this* note: a row dragged out of the
   * list is usually not the one being read, and closing what you are reading because
   * something else was deleted is the reverse of what the gesture asked for. The tree
   * reloads because the very first delete in a fresh vault is what creates `_trash` —
   * without it the Trash row would not appear until something else refreshed the tree.
   */
  const trashNoteAt = async (notePath: string): Promise<void> => {
    await trashNotesAt([notePath]);
  };

  /**
   * Several at once (B94): a marked set dropped on the Trash row, or "Delete n notes".
   *
   * One reload for the whole batch rather than one per note — which `moveNotesTo` next
   * door does too now (B95), the link question having become one question for the set
   * rather than one per note. This was the shape that was already right when that one was
   * not.
   *
   * The IPC is still a call per note, which is the remaining difference and a small one:
   * `trashNote` asks main nothing that needs the index, so it costs a `renameSync` each
   * where a move cost a walk of the whole vault each.
   */
  const trashNotesAt = async (notePaths: string[]): Promise<void> => {
    setMarked([]);
    for (const path of notePaths) {
      // eslint-disable-next-line no-await-in-loop
      await window.emqnote.library.trashNote(path);
    }

    const current = openRef.current;
    if (current !== null && notePaths.includes(current.path)) {
      setOpen(null);
      openRef.current = null;
    }

    await loadTree();
    void loadNotes(selectionRef.current);
  };

  /**
   * Carries out a conflict choice, and then makes the reader agree with the disk (B101).
   *
   * The reopen is the whole of this function's reason to exist. `resolveConflict` answers
   * with `notifyLibrary()`, and that refresh reloads the tree, the list, the facets and
   * the conflict list — everything except the note actually on screen, which for
   * "keep that one" is precisely the file whose bytes just changed. So the reader went on
   * showing the losing version until something else happened to reopen it.
   *
   * Not left to the watcher, deliberately. An `unlink`/`add` pair does arrive — the
   * resolve trashes one file and renames the other over its path — and `onFileChanged`
   * would reload a clean note off the back of it. But whether it arrives as one event or
   * two, and in which order, is chokidar's business and the filesystem's; the reader
   * agreeing with the disk after a button press the user just made is not a thing to
   * leave to a race. This is B31's rule read the other way round: the app knows what it
   * did, so it should not have to be told.
   *
   * Both paths are asked about, because either can be the one being read. "Keep that one"
   * renames the conflict copy over the original, so a reader standing on *either* path
   * wants the original's new bytes; "keep this one" trashes the conflict copy, so a reader
   * standing on that copy has nothing left to show and is put away — the same handling
   * `trashNotesAt` gives a note it deletes.
   */
  const resolveConflictAt = async (pair: ConflictPair, choice: ConflictChoice): Promise<void> => {
    await window.emqnote.library.resolveConflict(pair, choice);

    const current = openRef.current;
    if (current === null) return;

    if (choice === "keepOriginal" && current.path === pair.conflict) {
      setOpen(null);
      openRef.current = null;
      return;
    }
    if (current.path === pair.original || current.path === pair.conflict) {
      await openNote(pair.original);
    }
  };

  /**
   * Puts a trashed note or folder back somewhere real.
   *
   * Deliberately the ordinary move on both halves — `IPC.libraryMoveNotes` never had a
   * trash restriction, and `IPC.libraryMoveFolder` is the rename handler with one line
   * swapped — rather than a "restore" that would have to know where things came from. The
   * trash records nothing about that: `trashNote` flattens every note into one folder, so
   * "put it back where it was" is a question with no answer on disk. Asking is both the
   * honest thing and the more useful one, since a note is usually being fished out to be
   * filed somewhere better than where it was.
   */
  const restoreTo = async (item: Restorable, target: string): Promise<void> => {
    if (item.kind === "note") {
      // Through `moveNoteTo`, so the link question is asked in exactly one place. It
      // never actually asks here: `index-scan.ts` leaves the trash out on purpose, so
      // nothing in the index resolves to a trashed note and `linkingNotes` comes back
      // empty — which is the right answer rather than a coincidence worth routing around.
      await moveNoteTo(item.path, target);
      return;
    }

    // Same flush, same order, same reason as `renameFolderAt`: `writeAtomic` calls
    // `mkdirSync` on the way, so a debounced save landing after the folder has moved
    // would recreate it where it used to be — here, back inside `_trash`.
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (dirty) await save();

    let next: string;
    try {
      next = await window.emqnote.library.moveFolder(item.path, target);
    } catch (error) {
      const code = folderErrorOf(error);
      setDialog({
        kind: "problem",
        message: app.t(code === null ? "folder.moveFailed" : `folder.${code}`),
      });
      return;
    }

    rebaseOntoMovedFolder(item.path, next);

    await loadTree();
    await loadNotes(selectionRef.current);
    refreshFacets();
  };

  /**
   * Deletes one thing out of the trash for good — the second permanent delete in the app
   * and the first that names one thing (B24), which is why it only ever runs behind the
   * confirmation `dialogTitle`'s `deletePermanently` case writes.
   *
   * The reader is put away whether or not it was showing exactly this path: a folder went
   * with everything under it, and there is no way left to check against a path that no
   * longer exists — the same unconditional close `clearTrash` makes, for the same reason.
   */
  const deletePermanently = async (path: string): Promise<void> => {
    // Let go *before* asking main to delete, not after. This window may be showing a file
    // from inside the folder about to go — B47 put a preview in the reader and the trash is
    // browsable — and on Windows a handle open inside a folder is what stops the folder
    // being removed. A finished `<img>` load holds nothing, so this is not claimed as the
    // cause of anything; an in-flight one does, and the state change is free.
    //
    // Deliberately *not* waited on with `requestAnimationFrame`: an occluded or minimised
    // window is throttled and may not paint for as long as it stays that way, which turned
    // Delete permanently into a button that hung and did nothing at all — the very bug this
    // is in the middle of fixing, reintroduced from the other end. Found by running it.
    // These calls sit in the click's own task, so React commits them before the `invoke`
    // below can resolve, which is all this needs.
    const current = openRef.current;
    if (current !== null && (current.path === path || current.path.startsWith(`${path}/`))) {
      setOpen(null);
      openRef.current = null;
    }
    setOpenFile(null);

    const result = await window.emqnote.library.deleteFromTrash(path);
    if (result.locked === true) {
      setDialog({ kind: "problem", message: app.t("library.deletePermanentlyLocked") });
      return;
    }
    // Not a lock this app holds but one the operating system reports. Main answers rather
    // than rejecting, because a rejection here went nowhere: this is called as `void …`,
    // so the dialog closed and the folder stayed, which is what "does not work" meant.
    //
    // The message carries `reason` verbatim — an error code and a path, in a dialog, which
    // is not how this app talks. It earns it: B57 removed the app's own handle from the
    // picture and the report came back word for word the same, so the next one has to
    // arrive naming what the filesystem said and which entry said it.
    if (result.failed === true) {
      setDialog({
        kind: "problem",
        message:
          app.t("library.deletePermanentlyFailed") +
          (result.reason === undefined
            ? ""
            : `\n\n${result.reason.code} — ${result.reason.path}`),
      });
      await loadTree();
      await loadNotes(selectionRef.current);
      return;
    }

    await loadTree();
    await loadNotes(selectionRef.current);
  };

  /**
   * Permanently empties `_trash`. The open note may be one of the files just deleted —
   * there is no way to tell without re-checking against a path that no longer exists —
   * so it is put away unconditionally, the same as `trash()` does with the one note it
   * removes.
   */
  const clearTrash = async (): Promise<void> => {
    const emptied = await window.emqnote.library.emptyTrash();
    if (emptied.locked === true) {
      setDialog({ kind: "problem", message: app.t("library.clearTrashLocked") });
      return;
    }

    setOpen(null);
    openRef.current = null;
    await loadTree();
    void loadNotes(selectionRef.current);

    // Whatever went, went — one folder the operating system would not remove does not
    // hold up the rest (`emptyTrash` counts it instead of throwing), but it does have to
    // be said, or the trash quietly still has something in it after a confirmation that
    // named a count.
    if (emptied.failed > 0) {
      setDialog({
        kind: "problem",
        message:
          app.t("library.clearTrashFailed") +
          (emptied.firstFailure === undefined
            ? ""
            : `\n\n${emptied.firstFailure.code} — ${emptied.firstFailure.path}`),
      });
    }
  };

  /**
   * Hands a note to the capture window for quick editing.
   *
   * If this same note is open here, the reader locks itself immediately rather than
   * waiting on a round trip through main — this side already knows the claim is about
   * to move, and a keystroke landing in the gap is exactly the race B10 exists to avoid.
   */
  const openInCapture = async (path: string): Promise<void> => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    const current = openRef.current;
    if (current !== null && current.path === path) {
      if (dirty) await save();
      const locked = { ...current, editable: false };
      setOpen(locked);
      openRef.current = locked;
      setDirty(false);
    }

    await window.emqnote.library.openInCapture(path);
  };

  /**
   * Selects the Tasks view, scoped to wherever the tree was standing — `tasksIn`
   * (`index-db.ts`) already matches the whole subtree with `startsWith`, so a folder
   * scope is never narrower than "this folder and everything under it". Vault-wide was
   * the wrong default for the common case: browsing a project folder and clicking Tasks
   * to see what's left in it, not the whole vault's. Open items only stays the default
   * every other footer entry resets to. Clears a pending search the same way the tree's
   * own `onSelect` does below, so a half-typed query does not sit there disagreeing with
   * what is now showing.
   */
  const openTasks = (): void => {
    setSelection({ kind: "tasks", scope: lastFolder, openOnly: true, noteOnly: false });
    if (searchQuery !== "") {
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
      setSearchQuery("");
    }
  };
  // Three routes in now — the sidebar row, the note list's footer button and B94's chord —
  // and one function behind all of them.
  openTasksRef.current = openTasks;

  /**
   * The unlinked-attachment pane. Clears the search box for exactly `openTasks`' reason:
   * a live query wins over the selection outright in `loadNotes`, so a half-typed one
   * would leave the footer row lit with search results beside it. Carries no scope of its
   * own — the question is about `_attachments/`, which is the one folder the tree cannot
   * browse, so there is nothing to scope it to.
   */
  const openUnlinked = (): void => {
    if (searchQuery !== "") {
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
      // Written through the ref as well as the state, because the reload below runs in
      // this same tick and `loadNotes` reads the ref to decide whether a query wins.
      searchQueryRef.current = "";
      setSearchQuery("");
    }

    // Picking the row while its pane is already showing is the retry route for the
    // failure state, and it needs saying out loud: `selectionKey` answers `"unlinked"`
    // whatever object is set, so the effect that loads a selection never fires for it.
    // Nothing else in the sidebar needs this — every other row either carries state that
    // changes the key or is a folder you can only be standing on one of.
    if (selectionRef.current.kind === "unlinked") void loadNotes({ kind: "unlinked" });
    else setSelection({ kind: "unlinked" });
  };

  /**
   * Flips one task item. The actual write happens in the main process, through
   * `toggleTask` in `vault-io.ts` — this only relays the call and turns `locked` into the
   * same kind of message `moveNoteTo` shows for the same reason: the capture window has
   * the note claimed, so the toggle was refused rather than raced against its own
   * debounced write.
   */
  const toggleTask = async (
    path: string,
    ordinal: number,
    expectedText: string,
  ): Promise<boolean> => {
    const result = await window.emqnote.library.toggleTask(path, ordinal, expectedText);
    if (result.locked === true) {
      setDialog({ kind: "problem", message: app.t("library.taskLocked") });
      return false;
    }
    return result.toggled;
  };

  /**
   * Pins a note to the top of the list, or takes the pin off (B75).
   *
   * The limit and the lock are both answered by main — the renderer knows only the list
   * currently on screen, and a note pinned in a folder nobody is looking at still counts
   * towards three. Both refusals become the same dismiss-only dialog every other refusal
   * in this file uses, and the number in the message is the one main actually enforced
   * rather than a constant repeated here.
   */
  const setPinned = async (note: NoteSummary, pinned: boolean): Promise<void> => {
    const result = await window.emqnote.library.setPinned(note.path, pinned);

    if (result.locked === true) {
      setDialog({ kind: "problem", message: app.t("library.pinLocked") });
      return;
    }
    if (result.limit !== undefined) {
      setDialog({ kind: "problem", message: `${app.t("library.pinLimit")} ${result.limit}.` });
      return;
    }
    await loadNotes(selectionRef.current);
  };

  /**
   * The note to walk back to, or null when the open note was not reached by a link.
   *
   * Derived rather than stored: the top entry names which note it leads *to*, and it only
   * applies while that note is the one on screen. Opening something else makes the button
   * disappear without anything having to clear the trail, and coming back to the note by
   * a link again makes it reappear.
   */
  const backTo =
    open === null ? null : (backStack.at(-1)?.to === open.path ? backStack.at(-1)!.from : null);

  return (
    <div className="library-shell">
      {/* Above the conflict banner, and thinner: this one says "not everything is here
          yet", the banner says "something needs deciding". The scan is also the only one
          of the two that goes away on its own. */}
      {scan !== null && (
        <div className="scan-bar" role="status">
          <div
            className="scan-fill"
            style={{ width: `${Math.round((scan.done / Math.max(scan.total, 1)) * 100)}%` }}
          />
          <span className="scan-label">
            {app.t("library.indexing")} {scan.done} / {scan.total}
          </span>
        </div>
      )}

      <ConflictBanner
        pairs={conflicts}
        t={app.t}
        onMerge={(path) => void openNote(path)}
        onResolve={(pair, choice) => void resolveConflictAt(pair, choice)}
      />

      <DiskChangeBar
        event={diskEvent}
        t={app.t}
        onReload={() => {
          const current = openRef.current;
          setDiskEvent(null);
          if (current !== null) void openNote(current.path);
        }}
        onClose={() => {
          setDiskEvent(null);
          setOpen(null);
          openRef.current = null;
        }}
        onDismiss={() => setDiskEvent(null)}
        /**
         * Writes the note back to the path it was deleted from (B101).
         *
         * Through `save()` rather than a write of its own: it already posts exactly what
         * the reader holds — the header fields and the editor's document — and
         * `saveNote` reads the file first only to keep the frontmatter it cannot see, so
         * a missing file simply means there is nothing to keep. `writeAtomic`'s
         * `mkdirSync` recreates the folder on the way, which matters because the usual
         * way a note disappears is that the folder around it did.
         *
         * The bar goes first. `save()` is a round trip, and leaving "this note was
         * deleted" on screen while the note is being written back reads as the press
         * having done nothing — which is the report this whole button comes from.
         */
        onRestore={() => {
          setDiskEvent(null);
          void save();
        }}
      />

      <div
        className="library"
        ref={libraryRef}
        style={
          {
            "--tree-width": `${paneWidths.tree}px`,
            "--notes-width": `${paneWidths.notes}px`,
          } as React.CSSProperties
        }
      >
        <FolderTree
          root={treeWithTasks}
          selected={selection}
          facets={facets}
          dragging={dragging}
          onDropNote={(notePaths, folder) => {
            setDragging(null);
            setMarked([]);
            // A drop on the Trash row is Delete, not a move to a folder that happens to
            // be called `_trash`: it goes through the same `trashNoteAt` the menu item
            // calls, so the two cannot answer differently about the lock or about what
            // the reader does next. No confirmation, deliberately — trashing is a rename
            // (B24), and Restore is the named way back.
            //
            // Several notes since B94, and the *ones this folder will take*: a marked set
            // can be dragged out of two folders at once and one of them may be this one,
            // which `canDropNotes` lets through on the strength of the others. Filtering
            // here rather than there keeps the highlight generous and the action exact.
            const moving = notePaths.filter((path) => canDropNote(path, folder));
            if (folder === TRASH_FOLDER) void trashNotesAt(moving);
            else void moveNotesTo(moving, folder);
          }}
          onSelect={(target) => {
            setSelection(target);
            if (target.kind === "folder") setLastFolder(target.path);
            // Moving in the tree puts the scope back to the folder, whether or not there
            // was a query to clear (B83). Widening is asked for per search, so carrying
            // it to the next folder would be carrying a mode nobody set for that folder.
            searchAllRef.current = false;
            setSearchAll(false);
            // Picking something in the tree is a stronger signal than a half-typed
            // query — clear it rather than leave the list disagreeing with what looks
            // selected. Cancel a pending debounce too, or a stale search fired 150ms
            // ago would overwrite the folder this click just asked for.
            if (searchQuery !== "") {
              if (searchTimer.current !== null) clearTimeout(searchTimer.current);
              setSearchQuery("");
            }
          }}
          onExpandFilters={() => void loadFacets()}
          onCreateFolder={(parent) => setDialog({ kind: "newFolder", parent })}
          onNewFolder={() => setDialog({ kind: "newFolder", parent: lastFolder })}
          onRenameFolder={(path) =>
            setDialog({
              kind: "renameFolder",
              path,
              initial: path.split("/").pop() ?? "",
            })
          }
          onDeleteFolder={(path) => {
            // Both counts before the question, not one: `folderContents` walks for notes
            // and subfolders and `openTasksAt` reads the notes themselves, and a dialog
            // that appeared on the first answer and grew a clause on the second would be
            // a question that changes while it is being read.
            void Promise.all([
              window.emqnote.library.folderContents(path),
              window.emqnote.library.openTasksAt(path),
            ]).then(([contents, openTasks]) => {
              setDialog({
                kind: "deleteFolder",
                path,
                notes: contents.notes,
                folders: contents.folders,
                openTasks,
              });
            });
          }}
          onRevealFolder={(path) => window.emqnote.library.revealNote(path)}
          onRestoreFolder={(path) => setRestoring({ kind: "folder", path })}
          onDeleteFolderPermanently={(path) => {
            void window.emqnote.library.openTasksAt(path).then((openTasks) => {
              setDialog({
                kind: "deletePermanently",
                path,
                // The folder's own name, not its `_trash/...` path: the question is about
                // a thing, and a path read back at someone is not a question.
                label: path.split("/").pop() ?? path,
                openTasks,
              });
            });
          }}
          onNewNoteIn={(folder) => window.emqnote.library.newNote(folder)}
          lastFolder={lastFolder}
          canRenameFolder={canRenameFolderAt(lastFolder)}
          canDeleteFolder={canDeleteFolderAt(lastFolder)}
          canCreateFolder={canCreateFolderIn(lastFolder)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenTasks={openTasks}
          tasksSelected={selection.kind === "tasks"}
          onOpenUnlinked={openUnlinked}
          unlinkedSelected={selection.kind === "unlinked"}
          unlinkedCount={unlinkedCount}
          isMac={app.isMac}
          newFolderLabel={app.t("library.newFolder")}
          renameFolderLabel={app.t("library.renameFolder")}
          deleteFolderLabel={app.t("library.deleteFolder")}
          revealLabel={app.t("library.reveal")}
          restoreLabel={app.t("library.restore")}
          deletePermanentlyLabel={app.t("library.deletePermanently")}
          newLabel={app.t("library.new")}
          renameLabel={app.t("library.rename")}
          deleteLabel={app.t("library.delete")}
          allFoldersLabel={app.t("library.allFolders")}
          newNoteLabel={app.t("library.newNote")}
          helpLabel={app.t("help.title")}
          settingsLabel={app.t("settings.title")}
          tasksLabel={app.t("library.tasks")}
          unlinkedLabel={app.t("unlinked.title")}
          trashLabel={app.t("library.trash")}
          tagsLabel={app.t("library.tags")}
          peopleLabel={app.t("library.people")}
          emptyLabel={app.t("library.filterEmpty")}
          unavailableLabel={app.t("library.filterUnavailable")}
          filterLabel={app.t("library.filterSearch")}
          notesHereLabel={app.t("tree.notesHere")}
          openTasksLabel={app.t("tree.openTasks")}
        />

        <Splitter
          left="var(--tree-width)"
          label={app.t("library.resizeTree")}
          onDrag={(deltaX) => onPaneDrag("tree", deltaX)}
          onDragEnd={onPaneDragEnd}
        />

        {selection.kind === "tasks" ? (
          <TaskList
            scope={selection.scope}
            openOnly={selection.openOnly}
            // The reader's own note is what "this note only" means, so the filter follows
            // it: open another note from a task row and the list narrows to that one,
            // which is the same thing the tick already said.
            noteOnly={selection.noteOnly}
            notePath={open?.path ?? null}
            folders={taskFolders}
            onExit={exitTasks}
            onScopeChange={(scope) => setSelection({ ...selection, scope })}
            onOpenOnlyChange={(openOnly) => setSelection({ ...selection, openOnly })}
            onNoteOnlyChange={(noteOnly) => setSelection({ ...selection, noteOnly })}
            onOpenNote={(path, ordinal) => void openNote(path, ordinal)}
            onToggle={toggleTask}
            t={app.t}
          />
        ) : (
          <NoteList
            notes={sorted}
            noteTasks={noteTasks}
            files={files}
            filesState={filesState}
            selected={open?.path ?? null}
            selectedFile={openFile}
            // A file and a note are one selection between them: the reader shows one
            // thing, so picking either has to put the other down.
            onSelectFile={(path) => {
              setOpenFile(path);
              rememberCaret();
              // Whatever is half-typed in the editor goes to disk before the editor stops
              // being on screen — the same order every operation that puts a note away
              // uses. The reader shows one thing, so a file selection puts the note down.
              void flushPendingSave().then(() => {
                setOpen(null);
                openRef.current = null;
              });
            }}
            showing={selection}
            searching={searchQuery.trim() !== ""}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            searchAll={searchAll}
            // Runs the search again at once rather than through the 150 ms debounce: that
            // delay is about not searching on every keystroke of a word, and this is one
            // deliberate press with the query already typed.
            onSearchAllChange={(all) => {
              searchAllRef.current = all;
              setSearchAll(all);
              if (searchTimer.current !== null) clearTimeout(searchTimer.current);
              void loadNotes(selectionRef.current);
            }}
            scopeable={selection.kind === "folder"}
            onExitSearch={exitSearch}
            sort={sort}
            marked={marked}
            onMark={setMarked}
            onSort={onSort}
            sortDirection={sortDirection}
            onSortDirection={onSortDirection}
            onSelect={(path) => {
              setOpenFile(null);
              void openNote(path);
            }}
            onOpenInCapture={(path) => void openInCapture(path)}
            // Filed where you are standing, which includes the vault root — before this
            // every capture went to the Inbox and the root was browsable but unwritable.
            // `lastFolder` rather than the selection, for the same reason "+ New folder"
            // uses it: a tag or the Tasks view is not a place to put a note.
            onNewNote={() => window.emqnote.library.newNote(lastFolder)}
            searchRef={searchInput}
            searchOpen={searchOpen}
            onSearchOpen={openSearch}
            onCloseSearch={() => setSearchOpen(false)}
            // Counted now rather than read off the rows on screen. Those come from one
            // non-recursive `readdir` of `.md` files, so a folder dragged in here with
            // forty notes in it counted as nothing — in the sentence that asks whether to
            // destroy them. Async, the same shape the delete-folder confirmation uses.
            onClearTrash={() => {
              void window.emqnote.library.trashContents().then((contents) => {
                setDialog({ kind: "clearTrash", ...contents });
              });
            }}
            onOpenTasks={openTasks}
            onDragNote={setDragging}
            onContextMenu={(note, x, y) => setNoteMenu({ note, x, y })}
            onFileContextMenu={(file, x, y) => setFileMenu({ file, x, y })}
            onUnpin={(note) => void setPinned(note, false)}
            // B76. Read straight from the bootstrap rather than mirrored into state here:
            // the settings panel refreshes it (`onChanged` → `app.reload()`), so the list
            // redraws with the new answer the moment the checkbox lands.
            keepPinnedInView={app.keepPinnedInView}
            pinsApply={pinsApply}
            isMac={app.isMac}
            locale={app.locale}
            t={app.t}
          />
        )}

        <Splitter
          left="calc(var(--tree-width) + var(--notes-width))"
          label={app.t("library.resizeNotes")}
          onDrag={(deltaX) => onPaneDrag("notes", deltaX)}
          onDragEnd={onPaneDragEnd}
        />

        <section className="reader">
          {open === null && openFile !== null ? (
            <FilePreview path={openFile} t={app.t} />
          ) : open === null ? (
            /* Empty, and still wearing both bands (B95). The three panes' headers and
               footers are one 40px and one 28px rule precisely so there is a line across
               the top and the bottom of the window (B92) — and a reader with no note in it
               was breaking both of them a third of the way along, which reads as a header
               and a footer that have been cut off rather than as a pane with nothing in
               it. There is nothing to put in either band: no title, because no note, and
               no state, because nothing is being saved. `.reader-empty` keeps `margin:
               auto`, so its two lines still centre in what is left between them. */
            <>
              {/* `null`, not `""`: a string title makes `PaneHeader` draw an `<h2
                  class="pane-title">`, and an empty one of those is a real element that
                  `focusPane("title")` finds — so Tab out of the note list would land on a
                  heading with nothing in it, in a pane with no note. A node title draws
                  exactly what it is given, which here is nothing. */}
              <PaneHeader captionButtons className="reader-header" title={null} />
              <div className="reader-empty">
                <p>{app.t("library.pick")}</p>
                <p className="reader-hint">{app.t("library.pickHint")}</p>
              </div>
              <PaneFooter className="reader-footer" status={null} />
            </>
          ) : (
            <>
              {/* Title and nothing else. The path moved to the footer — a note's location
                  is a fact about the file, not the heading of the pane — and with it gone
                  this band is the same 40px the two panes beside it wear, which is the
                  line across the top of the window Finding 7 was asking for.

                  It is also where Windows draws its caption buttons, over on the right;
                  `.pane-header-reader` is what keeps the title clear of them. */}
              <PaneHeader
                captionButtons
                className="reader-header"
                title={
                  editingTitle !== null ? (
                    <input
                      ref={titleInput}
                      className="title-field reader-title-input"
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onBlur={() => {
                        // Escape already decided this is a cancel — a blur can still
                        // follow it (removing the focused input from the DOM tends to
                        // fire one), and without the flag it would rename right after
                        // being told not to.
                        if (cancelingTitle.current) {
                          cancelingTitle.current = false;
                          setEditingTitle(null);
                          return;
                        }
                        const value = editingTitle ?? "";
                        setEditingTitle(null);
                        if (value.trim() !== "") void rename(value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelingTitle.current = true;
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  ) : (
                    <h1
                      className="pane-title"
                      // **Press and travel moves the window; press and release renames**
                      // (B94). The band this sits in is the frameless window's grab area,
                      // and this heading is `no-drag` inside it — which is what lets it be
                      // clicked at all, and what took the window's own title bar away from
                      // the one part of it that looks like a title bar. `window-drag.ts`
                      // carries the whole of why that cannot be expressed in CSS.
                      onMouseDown={(event) => {
                        dragWindowFrom(event.nativeEvent, (moved) => {
                          dragged.current = moved;
                        });
                      }}
                      // **A Tab stop, and the third one in the window's order** (B94):
                      // folders, notes, *this*, then the four fields and the note itself.
                      // It was reachable by click and by Mod-Shift-R and by nothing else,
                      // which made the one control between the list and the fields the one
                      // the keyboard walked straight past.
                      //
                      // `tabIndex` whether or not the note is editable, so the order does
                      // not change shape depending on whether the capture window happens
                      // to have claimed the note — the key does nothing there, exactly as
                      // the click does nothing there.
                      tabIndex={0}
                      title={app.t("library.rename")}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        // Space would otherwise scroll the reader under it.
                        event.preventDefault();
                        if (open.editable) setEditingTitle(open.title);
                      }}
                      onClick={() => {
                        // A click *does* arrive after a drag: the window moved with the
                        // pointer, so the press and the release landed on this same
                        // heading and Chromium fires one exactly as if nothing had
                        // happened. Without this, letting go of a dragged title would open
                        // the rename every time.
                        if (dragged.current) {
                          dragged.current = false;
                          return;
                        }
                        if (open.editable) setEditingTitle(open.title);
                      }}
                    >
                      {open.title}
                    </h1>
                  )
                }
              />
  
              {/* `pointer-events: none` when a note is claimed by the capture window: the
                  content stays visible — reading it while it is being typed into
                  elsewhere is the point — but nothing here can be clicked into, so no
                  keystroke can slip past the `editable` guards in `onDocChange` and
                  `onHeaderChange`. */}
              <div className={open.editable ? "reader-body" : "reader-body reader-locked"}>
                {/* The same block as the capture window, minus the subject and the kind
                    toggle. Fixing an attendee list or a date used to mean editing the
                    file by hand outside the app. */}
                {header !== null && (
                  <HeaderBlock
                    // Keyed on the note, so opening another one remounts the block and
                    // takes its half-typed tag and attendee buffers with it. Without this
                    // the leftovers are shown for the new note and committed to it on the
                    // next blur — see `HeaderBlock`'s own comment on `attendeeText`.
                    key={open.path}
                    variant="reader"
                    values={header}
                    onChange={onHeaderChange}
                    onLeave={() => editor.current?.focus()}
                    locale={app.locale}
                    t={app.t}
                    bodyTags={bodyTags}
                  />
                )}
  
                <Editor
                  ref={editor}
                  onChange={onDocChange}
                  onLinkRequested={() => setLink(editor.current?.beginLinkEdit() ?? null)}
                  onImageRequested={() => void pickAndInsertImage()}
                  onFileRequested={() => void pickAndInsertFile()}
                  onNoteLinkRequested={openNotePicker}
                  onTableRequested={() => setTableGrid(editor.current?.caretPoint() ?? { x: 200, y: 200 })}
                  loadRemoteImages={app.loadRemoteImages}
                  onContextMenu={(payload) => setEditorMenu(payload)}
                  t={app.t}
                />
              </div>

              {/* **The bar at the foot, which is where this window's chrome lives now.**
                  Status, the way back out of a followed `[[…]]` link, and the two menus
                  used to be split between here and the header: the menus and the save
                  state sat beside the title in a `nowrap` row they were squeezing, and
                  the back link sat down here on its own. The capture window has always
                  put exactly these things at the bottom, and having the two windows
                  disagree about where a note's controls are is the thing being fixed.

                  Status on the left and menus on the right, which is `space-between`
                  again. The strip is now always drawn — it used to appear only when there
                  was a link to go back from, and a bar that comes and goes under the note
                  is the header-height problem this arrangement was already avoiding, one
                  edge down.

                  Outside `.reader-body`, deliberately: that div is what `reader-locked`
                  makes unclickable while the capture window has the note claimed, and
                  leaving the note you are reading is exactly the thing that must keep
                  working while somebody else is typing into it. Insert carries its own
                  `disabled` for that case, as it always has. */}
              <PaneFooter
                className="reader-footer"
                status={
                  <>
                    {/* A failure takes this seat, for the reason the capture window's
                        footer carries at length: "Saved" and "could not save" cannot share
                        a line, and it is the reassuring one that gets believed. */}
                    {saveError !== null ? (
                      <span className="save-error" title={saveError.message}>
                        {app.t("library.saveFailed").replace("{code}", saveError.code)}
                        {saveError.recoveryPath !== null && (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="save-error-copy"
                              title={saveError.recoveryPath}
                              onClick={() => {
                                void window.emqnote.copyText(saveError.recoveryPath ?? "");
                              }}
                            >
                              {app.t("library.saveRecovered")}
                            </button>
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="reader-state">
                        {open.editable
                          ? app.t(dirty ? "library.saving" : "library.saved")
                          : app.t("library.openInCapture")}
                      </span>
                    )}
                    {backTo !== null && (
                      <button
                        type="button"
                        className="reader-back"
                        title={app.t("library.backTo").replace("{title}", backTo.title)}
                        onClick={goBack}
                      >
                        ← {backTo.title}
                      </button>
                    )}
                    {/* Where the file is, in the seat the read-only notice takes when
                        there is one. The path came down from the header — a note's
                        location is a fact about the file rather than the heading of the
                        pane — and it yields rather than sharing the line, because a 28px
                        bar can hold one long ellipsised string and not two. The notice is
                        the one that wins: it is the answer to "why can I not type here",
                        and the path is one hover on the title away regardless. */}
                    {open.editable && (
                      <span className="reader-path" title={open.path}>
                        {/* `<bdi>` because the span is `direction: rtl` — that is how the
                            ellipsis is moved to the *head* of the path so the file name
                            at the end survives (see `library.css`), and without an
                            isolate the run's trailing punctuation is reordered with it. */}
                        <bdi>{open.path}</bdi>
                      </span>
                    )}
                  </>
                }
                actions={
                  <>
                  {/* 🖼 🔗 ▦ 📎 used to be four always-on icon buttons here, and four
                      glyphs nobody can read at a glance is exactly the clutter the ⋯
                      menu below was made to end for the five actions before them. One
                      named menu instead, built from `insertMenuItems` so the toolbar and
                      the note panel's right-click menu cannot come to disagree. */}
                    <ChromeButton
                      label={app.t("library.insert")}
                      small
                      menu
                      disabled={!open.editable}
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        // `rect.top`, not `rect.bottom`: this bar is at the foot of the
                        // window now, so a menu opening downwards is clamped straight back
                        // over the button it came from. `ContextMenu` clamps to the
                        // viewport, and this hands it a point it can honour — the same
                        // line, for the same reason, that `Capture.tsx` has always used.
                        setInsertMenu({ x: rect.left, y: rect.top });
                      }}
                    />
                  {/* Rename/Move/Duplicate/Reveal/Delete used to be five always-on
                      buttons here, squeezing the title in the `nowrap` header next to
                      them — collapsed into one menu button, opened at its own rect the
                      same way a right-click opens `noteMenu` below. This is a button
                      opening a menu, not a right-click, so
                      `--click-button="Actions>Rename"` has to be able to reach it — see
                      the CLAUDE.md context-menu constraint's note on why that keeps
                      `--click-button` working here. The label was "⋯" until a glyph
                      beside a second glyph-labelled menu stopped saying anything. */}
                    <ChromeButton
                      label={app.t("library.actions")}
                      title={app.t("library.moreActions")}
                      small
                      menu
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setReaderMenu({ x: rect.left, y: rect.top });
                      }}
                    />
                  {/* Third, after Insert and Actions, because that is the order the
                      capture window's footer has always carried and this window's editor
                      is the same editor. The sheet was reachable only from the sidebar's
                      own Help row and from the shortcut, which is the wrong place to look
                      for it while writing — the row of controls under the note is where
                      the question comes up. Same `Help` component, told which window it
                      is in, so the shortcuts it lists are this window's. */}
                    <ChromeButton
                      label={app.t("help.button")}
                      title={app.t("help.title")}
                      small
                      onClick={() => setHelpOpen(true)}
                    />
                  </>
                }
              />

              {link !== null && (
                <LinkPrompt
                  initialHref={link.href}
                  onApply={(href) => {
                    editor.current?.applyLink(href);
                    setLink(null);
                  }}
                  onCancel={() => {
                    setLink(null);
                    editor.current?.focus();
                  }}
                  t={app.t}
                  onApplyAndClose={(href) => {
                    editor.current?.applyLink(href);
                    setLink(null);
                  }}
                />
              )}
            </>
          )}
        </section>
      </div>

      {moving !== null && moving.length > 0 && (
        <MoveDialog
          folders={folders}
          // The folder the notes are actually in, not the one selected on the left. With
          // a tag selected there is no current folder at all, and even with a folder
          // selected the open note may live somewhere else entirely — in which case the
          // old code excluded the wrong one and offered the note its own folder.
          //
          // Several notes out of two different folders exclude neither: the list is what
          // this dialog can move them *to*, and with the set split across folders every
          // one of them is a real destination for something in it (B94).
          current={sharedFolder(moving)}
          t={app.t}
          onCancel={() => setMoving(null)}
          onMove={(target) => {
            const paths = moving;
            setMoving(null);
            void moveNotesTo(paths, target);
          }}
        />
      )}

      {restoring !== null && (
        <MoveDialog
          folders={folders}
          // `folders` already leaves the trash and everything under it out, so there is
          // nothing here to exclude — the thing being restored is by definition in a
          // folder this list does not contain. `TRASH_FOLDER` is passed only because the
          // prop is required and this is the truthful answer to "where is it now".
          current={TRASH_FOLDER}
          preferred={INBOX}
          t={app.t}
          onCancel={() => setRestoring(null)}
          onMove={(target) => {
            const item = restoring;
            setRestoring(null);
            void restoreTo(item, target);
          }}
        />
      )}

      {noteMenu !== null && (
        <ContextMenu
          x={noteMenu.x}
          y={noteMenu.y}
          onClose={() => setNoteMenu(null)}
          items={
            // A note in the trash gets the two entries that mean anything there. Move,
            // Rename and Duplicate would all work on it — nothing in main refuses a
            // trashed path — which is exactly the problem: they are ways of tidying a
            // vault, offered on a row that is not in it any more. Read off the path, the
            // same way `FolderTree`'s own menu reads it, so no extra state travels with
            // the row to say so.
            // **A marked set gets a menu about the set** (B94): the two actions that can
            // mean several notes at once, and nothing else. Rename, Duplicate, Pin, Open
            // and Reveal are all about one note — they would have to either act on the
            // first row or silently act on one of several, and both are worse than not
            // being offered. The count is in the label, so the menu says what it is about
            // rather than leaving that to the highlight behind it.
            marked.length > 1 && marked.includes(noteMenu.note.path)
              ? [
                  {
                    label: `${app.t("library.move")} — ${marked.length} ${app.t("library.notes")}`,
                    onSelect: () => setMoving([...marked]),
                  },
                  {
                    label: `${app.t("library.delete")} — ${marked.length} ${app.t("library.notes")}`,
                    danger: true,
                    onSelect: () => {
                      const paths = [...marked];
                      // The same count the single-note question carries, summed over the
                      // set: `openTasksAt` is asked once per note, and the sentence names
                      // what is still to be done in all of them together.
                      void Promise.all(
                        paths.map((path) => window.emqnote.library.openTasksAt(path)),
                      ).then((counts) => {
                        setDialog({
                          kind: "delete",
                          title: noteMenu.note.title,
                          paths,
                          openTasks: counts.reduce((sum, count) => sum + count, 0),
                        });
                      });
                    },
                  },
                ]
              : isInTrash(folderOf(noteMenu.note.path))
              ? [
                  {
                    label: app.t("library.restore"),
                    onSelect: () => setRestoring({ kind: "note", path: noteMenu.note.path }),
                  },
                  {
                    label: app.t("library.deletePermanently"),
                    danger: true,
                    onSelect: () => {
                      const { path, title } = noteMenu.note;
                      void window.emqnote.library.openTasksAt(path).then((openTasks) => {
                        setDialog({ kind: "deletePermanently", path, label: title, openTasks });
                      });
                    },
                  },
                ]
              : [
                  {
                    label: app.t("library.open"),
                    onSelect: () => void openNote(noteMenu.note.path),
                  },
                  {
                    // Not offered on a trashed note, which is the branch above: a note in
                    // the trash is not in the list the pin puts things at the top of.
                    label: app.t("library.pin"),
                    checked: noteMenu.note.pinned,
                    onSelect: () => void setPinned(noteMenu.note, !noteMenu.note.pinned),
                  },
                  {
                    label: app.t("library.move"),
                    onSelect: () => setMoving([noteMenu.note.path]),
                  },
                  {
                    label: app.t("library.rename"),
                    onSelect: () => setEditingTitle(noteMenu.note.title),
                  },
                  { label: app.t("library.duplicate"), onSelect: () => void duplicate() },
                  {
                    label: app.t("library.reveal"),
                    onSelect: () => window.emqnote.library.revealNote(noteMenu.note.path),
                  },
                  {
                    label: app.t("library.delete"),
                    danger: true,
                    onSelect: () => {
                      const { path, title } = noteMenu.note;
                      void window.emqnote.library.openTasksAt(path).then((openTasks) => {
                        setDialog({ kind: "delete", title, paths: [path], openTasks });
                      });
                    },
                  },
                ]
          }
        />
      )}

      {fileMenu !== null && (
        <ContextMenu
          x={fileMenu.x}
          y={fileMenu.y}
          onClose={() => setFileMenu(null)}
          items={[
            {
              // The same spelling `insert-attachment.ts` writes, decided by the same
              // `isEmbeddableAttachment` — a picture or a PDF is `![[…]]` and draws in the
              // note, everything else is `[[…]]` and is a chip that opens. Copying and
              // inserting must not be able to disagree about what a link to one file
              // looks like, which is why the question is asked in one place.
              label: app.t("library.copyLink"),
              onSelect: () =>
                void window.emqnote.copyText(
                  isEmbeddableAttachment(fileMenu.file.name)
                    ? `![[${fileMenu.file.path}]]`
                    : `[[${fileMenu.file.path}]]`,
                ),
            },
            {
              label: app.t("library.reveal"),
              onSelect: () => window.emqnote.library.revealNote(fileMenu.file.path),
            },
            // Delete is offered in the unlinked-attachment pane and nowhere else. A
            // permanently visible, permanently disabled Delete on every picture in a
            // folder is noise, and B47's own reasoning is that a file row answering half
            // a note's menu reads worse than one that plainly is not a note — this is the
            // one pane where throwing the file away is the whole point of being there.
            ...(selection.kind === "unlinked"
              ? [
                  {
                    label: app.t("library.delete"),
                    danger: true,
                    onSelect: () => {
                      void window.emqnote.library
                        .trashAttachment(fileMenu.file.path)
                        .then(() => {
                          // The reader is showing the file that just went into the trash.
                          if (openFile === fileMenu.file.path) setOpenFile(null);
                          void loadNotes(selectionRef.current);
                        });
                    },
                  },
                ]
              : []),
          ]}
        />
      )}

      {readerMenu !== null && open !== null && (
        <ContextMenu
          x={readerMenu.x}
          y={readerMenu.y}
          onClose={() => setReaderMenu(null)}
          items={
            // The same two entries the note list's menu shows for a trashed note, and
            // this is where they become *reachable*: the note list's copy opens only on
            // right-click or `Mod-Shift-M`, and `--click-button` can drive neither, while
            // this menu hangs off a plain "Actions" button — so `"Actions>Restore"` is a
            // real route and CLAUDE.md's rule that nothing lives exclusively behind a
            // right-click menu keeps holding. Read off the open note's own path rather
            // than the selection, which may be standing somewhere else entirely.
            isInTrash(folderOf(open.path))
              ? [
                  {
                    label: app.t("library.restore"),
                    onSelect: () => setRestoring({ kind: "note", path: open.path }),
                  },
                  {
                    label: app.t("library.deletePermanently"),
                    danger: true,
                    onSelect: () => {
                      const { path, title } = open;
                      void window.emqnote.library.openTasksAt(path).then((openTasks) => {
                        setDialog({ kind: "deletePermanently", path, label: title, openTasks });
                      });
                    },
                  },
                ]
              : [
                  {
                    label: app.t("library.rename"),
                    onSelect: () => setEditingTitle(open.title),
                  },
                  { label: app.t("library.move"), onSelect: () => setMoving([open.path]) },
                  { label: app.t("library.duplicate"), onSelect: () => void duplicate() },
                  {
                    label: app.t("library.reveal"),
                    onSelect: () => window.emqnote.library.revealNote(open.path),
                  },
                  {
                    label: app.t("library.delete"),
                    danger: true,
                    onSelect: () => {
                      const { path, title } = open;
                      void window.emqnote.library.openTasksAt(path).then((openTasks) => {
                        setDialog({ kind: "delete", title, paths: [path], openTasks });
                      });
                    },
                  },
                ]
          }
        />
      )}

      {insertMenu !== null && (
        <ContextMenu
          x={insertMenu.x}
          y={insertMenu.y}
          onClose={() => setInsertMenu(null)}
          items={insertMenuItems(app.isMac, app.t, {
            // Never reached from this menu — `insertMenuItems` draws no command items —
            // but `EditorMenuActions` is one shape and the note panel's menu needs it.
            run: (command) => editor.current?.runCommand(command),
            insertImage: () => void pickAndInsertImage(),
            insertFile: () => void pickAndInsertFile(),
            insertNoteLink: () => openNotePicker(""),
            // At the caret, not at the button: the grid is about to put a table where
            // the text is, and opening it up in the toolbar would point at the wrong
            // place. The menu it was chosen from has closed by then.
            insertTable: () =>
              setTableGrid(editor.current?.caretPoint() ?? { x: 200, y: 200 }),
          })}
        />
      )}

      {editorMenu !== null && (
        <ContextMenu
          x={editorMenu.x}
          y={editorMenu.y}
          onClose={() => setEditorMenu(null)}
          items={buildEditorMenu(editorMenu.state, app.isMac, app.t, {
            run: (command) => editor.current?.runCommand(command),
            insertImage: () => void pickAndInsertImage(),
            insertFile: () => void pickAndInsertFile(),
            insertNoteLink: () => openNotePicker(""),
            // The grid opens where the menu was, not at the caret: that is where the
            // pointer already is, and the menu is about to close from under it.
            insertTable: () => setTableGrid({ x: editorMenu.x, y: editorMenu.y }),
          })}
        />
      )}

      {dialog !== null && (
        <Ask
          title={dialogTitle(dialog)}
          initial={
            dialog.kind === "renameFolder"
              ? dialog.initial
              : dialog.kind === "newFolder"
                ? ""
                : undefined
          }
          confirmLabel={
            dialog.kind === "delete" || dialog.kind === "deleteFolder"
              ? app.t("library.delete")
              : dialog.kind === "deletePermanently"
                ? app.t("library.deletePermanently")
                : dialog.kind === "clearTrash"
                  ? app.t("library.clearTrash")
                  : dialog.kind === "relink"
                    ? app.t("link.update")
                    : app.t("ask.ok")
          }
          // "Leave them" rather than "Cancel" for the link question, because that button
          // does not cancel anything — the move or the rename happens either way. See the
          // `relink` case in `Dialog`.
          cancelLabel={dialog.kind === "relink" ? app.t("link.leave") : app.t("ask.cancel")}
          danger={
            dialog.kind === "delete" ||
            dialog.kind === "clearTrash" ||
            dialog.kind === "deleteFolder" ||
            dialog.kind === "deletePermanently"
          }
          dismissOnly={dialog.kind === "problem"}
          onCancel={() => {
            const current = dialog;
            setDialog(null);
            if (current.kind === "relink") void runRelinkable(current.action, false);
          }}
          onConfirm={(value) => {
            const current = dialog;
            setDialog(null);
            // The path the question was asked about, not whatever is open when it is
            // answered. Both were the same note in practice — right-clicking a row selects
            // it, which opens it — but "the note this dialog names" and "the note in the
            // reader" are two different things to reach for, and only one of them is what
            // the sentence on screen promised. The count in that sentence is read off this
            // same path, so a mismatch would put a task count from one note in a question
            // about another.
            if (current.kind === "delete") void trashNotesAt(current.paths);
            if (current.kind === "deleteFolder") void deleteFolderAt(current.path);
            if (current.kind === "deletePermanently") void deletePermanently(current.path);
            if (current.kind === "clearTrash") void clearTrash();
            if (current.kind === "newFolder") {
              void window.emqnote.library.createFolder(current.parent, value);
            }
            if (current.kind === "renameFolder") void renameFolderAt(current.path, value);
            if (current.kind === "relink") void runRelinkable(current.action, true);
            if (current.kind === "duplicateTitle") {
              void askRelinkThen({ kind: "rename", path: current.path, title: current.title });
            }
          }}
        />
      )}

      {notePick !== null && (
        <NotePicker
          initialQuery={notePick.query}
          t={app.t}
          onCancel={() => setNotePick(null)}
          onPick={(candidate) => {
            setNotePick(null);
            editor.current?.insertNoteLink(candidate.target, candidate.title, notePick.prefix);
          }}
        />
      )}

      {tableGrid !== null && (
        <TableGrid
          x={tableGrid.x}
          y={tableGrid.y}
          t={app.t}
          onCancel={() => setTableGrid(null)}
          onPick={(rows, columns) => {
            setTableGrid(null);
            editor.current?.insertTable(rows, columns);
          }}
        />
      )}

      {linkPick !== null && (
        <LinkPicker
          target={linkPick.target}
          candidates={linkPick.candidates}
          t={app.t}
          onCancel={() => setLinkPick(null)}
          onOpen={(path) => {
            // The origin was captured when the event arrived, not now: by the time the
            // picker is answered the reader may be showing something else entirely.
            rememberOrigin(linkPick.origin, path);
            setLinkPick(null);
            void openNote(path);
          }}
        />
      )}

      {settingsOpen && (
        <Settings
          locale={app.locale}
          hotkey={app.hotkey}
          libraryHotkey={app.libraryHotkey}
          isMac={app.isMac}
          loadRemoteImages={app.loadRemoteImages}
          keepPinnedInView={app.keepPinnedInView}
          editorFontSize={app.editorFontSize}
          theme={app.theme}
          openAtLogin={app.openAtLogin}
          appVersion={app.appVersion}
          vaultPath={app.vaultPath}
          t={app.t}
          onChanged={() => void app.reload()}
          // Switching vault restarts the app, so anything still on the debounce has to
          // reach disk first — and into the vault it was typed in, not the new one.
          onBeforeSwitch={flushPendingSave}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {helpOpen && (
        <Help
          window="library"
          isMac={app.isMac}
          hotkey={app.hotkey}
          libraryHotkey={app.libraryHotkey}
          t={app.t}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </div>
  );
}
