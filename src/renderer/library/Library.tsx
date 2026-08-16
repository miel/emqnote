import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorState } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../../markdown/schema.js";
import {
  canCreateFolderIn,
  canDeleteFolder as canDeleteFolderAt,
  canRenameFolder as canRenameFolderAt,
  folderErrorOf,
  folderOf,
  INBOX,
  isInTrash,
  selectionKey,
  TRASH_FOLDER,
  type ConflictPair,
  type Facets,
  type FolderNode,
  type LinkCandidateSummary,
  type FileSummary,
  type NoteSummary,
  type OpenedNote,
  type ScanProgress,
  type Selection,
  type SortKey,
  type VaultFileEvent,
} from "../../shared/vault-types.js";
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
import { ContextMenu } from "./ContextMenu.js";
import { DiskChangeBar } from "./DiskChangeBar.js";
import { FolderTree } from "./FolderTree.js";
import { LinkPicker } from "./LinkPicker.js";
import { NotePicker } from "./NotePicker.js";
import { MoveDialog } from "./MoveDialog.js";
import { NoteList } from "./NoteList.js";
import { FilePreview } from "./FilePreview.js";
import { OrphanedAttachments } from "./OrphanedAttachments.js";
import { clampPaneWidths, DEFAULT_PANE_WIDTHS, type PaneWidths } from "./panes.js";
import { Settings } from "./Settings.js";
import { Splitter } from "./Splitter.js";
import { TaskList } from "./TaskList.js";

const SAVE_DEBOUNCE_MS = 800;

const EMPTY_TREE: FolderNode = { path: "", name: "Vault", children: [], noteCount: 0 };
const EMPTY_FACETS: Facets = { tags: [], people: [], available: true };

function flatten(node: FolderNode): string[] {
  return [node.path, ...node.children.flatMap(flatten)];
}

function sortNotes(notes: NoteSummary[], key: SortKey): NoteSummary[] {
  const sorted = [...notes];
  if (key === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  } else {
    sorted.sort((a, b) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : 0));
  }
  return sorted;
}

/**
 * A move or a rename waiting on the one question it raises: the notes that link to this
 * one — should they follow it? (B35)
 *
 * Held as data rather than as a closure so the dialog stays the same shape as its
 * siblings, and so the action is still legible from the state alone.
 */
type Relinkable =
  | { kind: "move"; path: string; folder: string }
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
  | { kind: "delete"; title: string }
  | { kind: "deleteFolder"; path: string; notes: number; folders: number }
  | { kind: "clearTrash"; count: number }
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
  | { kind: "deletePermanently"; path: string; label: string }
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
   * Guards `openNote` against two calls finishing out of order — two tasks in the same
   * note sit right next to each other in the Tasks list and are the easy way to click
   * one, then the other, before the first's IPC round trip has actually returned. Each
   * call claims the next number before awaiting anything; a call whose number no longer
   * matches when it wakes up knows a newer one has already landed, and defers to it
   * rather than clobbering its selection (or its task ordinal) with stale data.
   */
  const openNoteRequest = useRef(0);

  const [tree, setTree] = useState<FolderNode>(EMPTY_TREE);
  const [selection, setSelection] = useState<Selection>({ kind: "folder", path: "00 Inbox" });
  /**
   * The last folder that was selected, which is not always the current selection.
   *
   * "New folder" needs a parent, and a tag is not one. Remembering where you last were
   * in the tree keeps that button working from a filter view instead of guessing.
   */
  const [lastFolder, setLastFolder] = useState("00 Inbox");
  /**
   * A search overrides the current selection rather than combining with it — clicking
   * the tree while searching clears the box (see `FolderTree`'s `onSelect` below), so
   * the two never need to agree on what should be showing at once.
   */
  const [searchQuery, setSearchQuery] = useState("");
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  /** The non-note files in the folder being browsed, and which one the reader is showing (B47). */
  const [files, setFiles] = useState<FileSummary[]>([]);
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
  const sortLoaded = useRef(false);
  const [open, setOpen] = useState<OpenedNote | null>(null);
  const [dirty, setDirty] = useState(false);
  /**
   * A note changed or disappeared on disk while it was open here, for a reason this app
   * did not cause itself — see `own-writes.ts` for how the app's own debounced autosave
   * is told apart from that. Null the rest of the time, which is the normal state.
   */
  const [diskEvent, setDiskEvent] = useState<VaultFileEvent | null>(null);
  const [moving, setMoving] = useState(false);
  /**
   * The trashed note or folder waiting to be told where to go back to. A separate piece
   * of state from `moving` and not a fourth `Dialog`, because it opens `MoveDialog`
   * rather than `Ask` — the same split `moving` already is.
   */
  const [restoring, setRestoring] = useState<Restorable | null>(null);
  // The note being dragged over the tree. Held here rather than in either component,
  // because the row that knows which note it is and the branch that has to decide
  // whether it will take it are on opposite sides of the window.
  const [dragging, setDragging] = useState<string | null>(null);
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
  // Set by Escape just before it blurs the input on purpose, so the blur handler can
  // tell "cancelled" apart from "committed" — see the input's own `onBlur` below.
  const cancelingTitle = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [orphanedAttachmentsOpen, setOrphanedAttachmentsOpen] = useState(false);
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
  }, [app.bootstrapped, app.librarySort]);

  /** Changes the sort order and persists it — the note list's `onSort` prop. */
  const onSort = useCallback((next: SortKey) => {
    setSort(next);
    window.emqnote.setSort(next);
  }, []);

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

  const openRef = useRef<OpenedNote | null>(null);
  openRef.current = open;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTree = useCallback(async () => {
    setTree(await window.emqnote.library.tree());
  }, []);

  const loadConflicts = useCallback(async () => {
    setConflicts(await window.emqnote.library.conflicts());
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
    setNotes(
      searching
        ? await window.emqnote.library.search(query)
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
    void loadConflicts();
    const stop = window.emqnote.library.onRefresh(() => {
      void loadTree();
      void loadNotes(selectionRef.current);
      refreshFacets();
      void refreshEditable();
      void loadConflicts();
    });
    return stop;
  }, [loadTree, loadNotes, refreshFacets, refreshEditable, loadConflicts]);

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
        void loadConflicts();
      }
    });
  }, [refreshFacets, loadNotes, loadConflicts]);

  useEffect(() => {
    void loadNotes(selectionRef.current);
  }, [key, loadNotes]);

  // Mod-/ opens the sheet here too, tested against the same registry the editor is
  // built from. Escape is handled inside the sheet, where it cannot reach a note.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!matches(shortcut("help"), event, app.isMac)) return;
      event.preventDefault();
      setHelpOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [app.isMac]);

  /**
   * The macro keyboard cycle between the three panes: tree → notes → editor → tree.
   *
   * Tab already moves focus *within* a pane fine on its own — a dialog's own trap
   * handles a modal, and inside the editor `keymap.ts` binds Tab to list indent, always
   * returning `true`, so it never reaches here at all (nothing to special-case: the
   * event simply never bubbles up to `window`). That leaves Tab genuinely only able to
   * move tree → notes and notes → editor, never back out of the editor — which is why
   * `cyclePanes` (Ctrl-Tab/Ctrl-Shift-Tab, `shortcuts.ts`) exists as well: `keymap.ts`
   * has no binding for it, so it is the one key that can always complete the loop.
   *
   * Escape is the editor's own way out, for the same reason Tab cannot be: nothing in
   * `outlookKeymap` binds it (see `Editor.tsx`'s own comment on why), so a plain
   * `keydown` listener sees it here.
   */
  useEffect(() => {
    // Deliberately narrower than "anywhere inside the pane": a roving row is where a
    // jump into the pane lands (`focusPane` below), and the only place Tab should treat
    // as "leaving" it. The tree/notes panes hold ordinary controls too — the search box,
    // the sort buttons, a folder's twisty — and those already have a sensible Tab order
    // of their own that this must not steamroll.
    const paneOf = (element: Element | null): "tree" | "notes" | "editor" | null => {
      if (element === null) return null;
      if (element.closest('[role="treeitem"]') !== null) return "tree";
      if (element.closest('.note[role="option"]') !== null) return "notes";
      if (element.closest('.task-row[role="option"]') !== null) return "notes";
      if (element.closest(".editor-content") !== null) return "editor";
      return null;
    };

    const focusPane = (pane: "tree" | "notes" | "editor"): void => {
      const root = libraryRef.current;
      if (pane === "editor") {
        editor.current?.focus();
        return;
      }
      if (root === null) return;
      const selector =
        pane === "tree" ? '.tree [tabindex="0"]' : '.notes [tabindex="0"], .task-list [tabindex="0"]';
      root.querySelector<HTMLElement>(selector)?.focus();
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      const current = paneOf(document.activeElement);

      if (event.key === "Escape" && current === "editor") {
        event.preventDefault();
        focusPane("notes");
        return;
      }

      // Both bindings share `key === "Tab"` with the plain Tab case below (Ctrl-Tab and
      // Ctrl-Shift-Tab are still "Tab" plus modifiers), so `cycling` has to be checked
      // with `matches`, not by comparing `event.key` alone.
      const cycling = matches(shortcut("cyclePanes"), event, app.isMac);
      if (!cycling && event.key !== "Tab") return;
      // Ctrl-Tab/Ctrl-Shift-Tab is also the browser's own "next/previous tab" gesture;
      // claim it unconditionally so that never fires instead of the pane switch, even
      // when there is no pane to move to below.
      if (cycling) event.preventDefault();
      if (current === null) {
        // Focus sits on `document.body` (or some other control `paneOf` does not
        // recognise) after an ordinary click that lands nowhere in particular — the
        // usual state, not an edge case. A plain Tab has a sensible browser default
        // there and is left alone; Ctrl-Tab/Ctrl-Shift-Tab has no pane to "complete the
        // loop" from, so it enters the first one instead of doing nothing.
        if (cycling) focusPane(event.shiftKey ? "editor" : "tree");
        return;
      }
      // ProseMirror's own keymap consumes a *plain* Tab/Shift-Tab inside the editor (see
      // the comment above), so only `cycling` — never a bare Tab — ever reaches here from
      // that pane, which is what lets it complete the loop back to the tree.
      if (current === "editor" && event.key === "Tab" && !cycling) return;

      const forward = !event.shiftKey;
      const next: "tree" | "notes" | "editor" | null =
        current === "tree"
          ? forward
            ? "notes"
            : null
          : current === "notes"
            ? forward
              ? "editor"
              : "tree"
            : forward
              ? "tree"
              : "notes";

      if (next === null) return;
      event.preventDefault();
      focusPane(next);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [app.isMac]);

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

    setDirty(false);
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
      // passes through `null` at all.
      setDiskEvent(null);
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

      setDirty(false);
    },
    [dirty, save],
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

  const onDocChange = useCallback(() => {
    // Belt and braces alongside the `pointer-events: none` overlay: a note can go
    // read-only while the editor already has focus from before, and a keystroke that
    // slips through must not schedule a save that `save()` would refuse anyway.
    if (openRef.current === null || !openRef.current.editable) return;
    setDirty(true);
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void save();
    }, SAVE_DEBOUNCE_MS);
  }, [save]);

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

    if (pendingTaskOrdinal.current !== null) {
      editor.current?.focusTask(pendingTaskOrdinal.current);
      pendingTaskOrdinal.current = null;
    }
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
  const sorted = useMemo(() => sortNotes(notes, sort), [notes, sort]);

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
      case "clearTrash":
        return `${plural(open.count, "library.note", "library.notes")} — ${app.t("ask.confirmClearTrash")}`;
      case "deleteFolder": {
        const contents =
          open.notes === 0 && open.folders === 0
            ? ""
            : ` (${plural(open.notes, "library.note", "library.notes")}, ${plural(open.folders, "library.folder", "library.folders")})`;
        return `"${open.path}"${contents} — ${app.t("ask.confirmDeleteFolder")}`;
      }
      case "relink":
        return `${plural(open.count, "link.noteLinksHere", "link.notesLinkHere")} — ${app.t("link.updateThem")}`;
      case "duplicateTitle":
        return `${app.t("link.duplicateTitle")} "${open.folder === "" ? app.t("library.vaultRoot") : open.folder}" — ${app.t("link.renameAnyway")}`;
      case "delete":
        return `"${open.title}" — ${app.t("ask.confirmDelete")}`;
      case "deletePermanently":
        return `"${open.label}" — ${app.t("ask.confirmDeletePermanently")}`;
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
   */
  const runRelinkable = (action: Relinkable, rewriteLinks: boolean): void => {
    if (action.kind === "move") void performMove(action.path, action.folder, rewriteLinks);
    else void performRename(action.path, action.title, rewriteLinks);
  };

  /**
   * Asks about the links first, if there are any, and otherwise gets straight on with it.
   *
   * The question is asked *before* the move rather than after, because that is the only
   * moment the answer can still be acted on: a link target resolves against where the note
   * is now, so once the file has moved there is nothing left for main to find. See the
   * `relink` case in `Dialog` for what dismissing it means.
   */
  const askRelinkThen = async (action: Relinkable): Promise<void> => {
    const linking = await window.emqnote.library.linkingNotes(action.path);
    if (linking.length === 0) {
      runRelinkable(action, false);
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
   * Files a note into a folder. Both ways of asking for that — the "Move to…" dialog and
   * dragging a row onto the tree — come through here, so the two cannot drift apart.
   *
   * Only the note that is actually open needs saving first; a dragged row is usually not
   * it, and flushing an unrelated pending save would write one note because another one
   * moved. The reopen at the end is likewise conditional: following the note into its new
   * folder is right when you moved the note you were reading, and wrong when you flicked
   * a different row out of the Inbox and are still reading what you had.
   *
   * The *tree* never follows, and that is the point of filing: emptying an Inbox means
   * moving one note after another out of the same folder, and jumping to each destination
   * meant clicking back to the source between every one of them. The note stays open in
   * the reader under its new path, so the move is still visibly confirmed — it is simply
   * no longer in the list on the left, which is what moving it means.
   */
  const moveNoteTo = async (notePath: string, target: string): Promise<void> => {
    await askRelinkThen({ kind: "move", path: notePath, folder: target });
  };

  const performMove = async (
    notePath: string,
    target: string,
    rewriteLinks: boolean,
  ): Promise<void> => {
    const current = openRef.current;
    const wasOpen = current !== null && current.path === notePath;
    if (wasOpen && dirty) await save();

    const result = await window.emqnote.library.moveNote(notePath, target, rewriteLinks);
    if (result.locked === true) {
      setDialog({ kind: "problem", message: app.t("library.moveLocked") });
      return;
    }

    await loadTree();
    // The reader follows the file it is showing; the list reloads for wherever the tree
    // still points, which is where it pointed before the move.
    if (wasOpen) await openNote(result.path);
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
    await window.emqnote.library.trashNote(notePath);

    const current = openRef.current;
    if (current !== null && current.path === notePath) {
      setOpen(null);
      openRef.current = null;
    }

    await loadTree();
    void loadNotes(selectionRef.current);
  };

  const trash = async (): Promise<void> => {
    const current = openRef.current;
    if (current === null) return;
    await trashNoteAt(current.path);
  };

  /**
   * Puts a trashed note or folder back somewhere real.
   *
   * Deliberately the ordinary move on both halves — `IPC.libraryMoveNote` never had a
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
    const result = await window.emqnote.library.deleteFromTrash(path);
    if (result.locked === true) {
      setDialog({ kind: "problem", message: app.t("library.deletePermanentlyLocked") });
      return;
    }

    const current = openRef.current;
    if (current !== null && (current.path === path || current.path.startsWith(`${path}/`))) {
      setOpen(null);
      openRef.current = null;
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
    await window.emqnote.library.emptyTrash();
    setOpen(null);
    openRef.current = null;
    await loadTree();
    void loadNotes(selectionRef.current);
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
    setSelection({ kind: "tasks", scope: lastFolder, openOnly: true });
    if (searchQuery !== "") {
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
      setSearchQuery("");
    }
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
   * The note to walk back to, or null when the open note was not reached by a link.
   *
   * Derived rather than stored: the top entry names which note it leads *to*, and it only
   * applies while that note is the one on screen. Opening something else makes the button
   * disappear without anything having to clear the trail, and coming back to the note by
   * a link again makes it reappear.
   */
  const backTo =
    open === null ? null : (backStack.at(-1)?.to === open.path ? backStack.at(-1)!.from : null);

  const goBack = (): void => {
    const top = backStack.at(-1);
    if (top === undefined) return;
    setBackStack((stack) => stack.slice(0, -1));
    void openNote(top.from.path);
  };

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
          root={tree}
          selected={selection}
          facets={facets}
          dragging={dragging}
          onDropNote={(notePath, folder) => {
            setDragging(null);
            // A drop on the Trash row is Delete, not a move to a folder that happens to
            // be called `_trash`: it goes through the same `trashNoteAt` the menu item
            // calls, so the two cannot answer differently about the lock or about what
            // the reader does next. No confirmation, deliberately — trashing is a rename
            // (B24), and Restore is the named way back.
            if (folder === TRASH_FOLDER) void trashNoteAt(notePath);
            else void moveNoteTo(notePath, folder);
          }}
          onSelect={(target) => {
            setSelection(target);
            if (target.kind === "folder") setLastFolder(target.path);
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
            void window.emqnote.library.folderContents(path).then((contents) => {
              setDialog({ kind: "deleteFolder", path, notes: contents.notes, folders: contents.folders });
            });
          }}
          onRevealFolder={(path) => window.emqnote.library.revealNote(path)}
          onRestoreFolder={(path) => setRestoring({ kind: "folder", path })}
          onDeleteFolderPermanently={(path) =>
            setDialog({
              kind: "deletePermanently",
              path,
              // The folder's own name, not its `_trash/...` path: the question is about a
              // thing, and a path read back at someone is not a question.
              label: path.split("/").pop() ?? path,
            })
          }
          onNewNoteIn={(folder) => window.emqnote.library.newNote(folder)}
          lastFolder={lastFolder}
          canRenameFolder={canRenameFolderAt(lastFolder)}
          canDeleteFolder={canDeleteFolderAt(lastFolder)}
          canCreateFolder={canCreateFolderIn(lastFolder)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenTasks={openTasks}
          tasksSelected={selection.kind === "tasks"}
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
          newNoteLabel={app.t("library.newNote")}
          helpLabel={app.t("help.title")}
          settingsLabel={app.t("settings.title")}
          tasksLabel={app.t("library.tasks")}
          trashLabel={app.t("library.trash")}
          tagsLabel={app.t("library.tags")}
          peopleLabel={app.t("library.people")}
          emptyLabel={app.t("library.filterEmpty")}
          unavailableLabel={app.t("library.filterUnavailable")}
          filterLabel={app.t("library.filterSearch")}
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
            folders={folders}
            onScopeChange={(scope) => setSelection({ kind: "tasks", scope, openOnly: selection.openOnly })}
            onOpenOnlyChange={(openOnly) =>
              setSelection({ kind: "tasks", scope: selection.scope, openOnly })
            }
            onOpenNote={(path, ordinal) => void openNote(path, ordinal)}
            onToggle={toggleTask}
            t={app.t}
          />
        ) : (
          <NoteList
            notes={sorted}
            files={files}
            selected={open?.path ?? null}
            selectedFile={openFile}
            // A file and a note are one selection between them: the reader shows one
            // thing, so picking either has to put the other down.
            onSelectFile={(path) => {
              setOpenFile(path);
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
            sort={sort}
            onSort={onSort}
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
            onClearTrash={() => setDialog({ kind: "clearTrash", count: notes.length })}
            onDragNote={setDragging}
            onContextMenu={(note, x, y) => setNoteMenu({ note, x, y })}
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
            <div className="reader-empty">
              <p>{app.t("library.pick")}</p>
              <p className="reader-hint">{app.t("library.pickHint")}</p>
            </div>
          ) : (
            <>
              <header className="reader-header">
                <div className="reader-titles">
                  {editingTitle !== null ? (
                    <input
                      ref={titleInput}
                      className="reader-title-input"
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
                      onClick={() => {
                        if (open.editable) setEditingTitle(open.title);
                      }}
                    >
                      {open.title}
                    </h1>
                  )}
                  <span className="reader-path">{open.path}</span>
                </div>
                <div className="reader-actions">
                  <span className="reader-state">
                    {open.editable
                      ? app.t(dirty ? "library.saving" : "library.saved")
                      : app.t("library.openInCapture")}
                  </span>
                  {/* 🖼 🔗 ▦ 📎 used to be four always-on icon buttons here, and four
                      glyphs nobody can read at a glance is exactly the clutter the ⋯
                      menu below was made to end for the five actions before them. One
                      named menu instead, built from `insertMenuItems` so the toolbar and
                      the note panel's right-click menu cannot come to disagree. */}
                  <button
                    type="button"
                    disabled={!open.editable}
                    title={app.t("library.insert")}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setInsertMenu({ x: rect.left, y: rect.bottom });
                    }}
                  >
                    {app.t("library.insert")}
                  </button>
                  {/* Rename/Move/Duplicate/Reveal/Delete used to be five always-on
                      buttons here, squeezing the title in the `nowrap` header next to
                      them — collapsed into one menu button, opened at its own rect the
                      same way a right-click opens `noteMenu` below. This is a button
                      opening a menu, not a right-click, so
                      `--click-button="Actions>Rename"` has to be able to reach it — see
                      the CLAUDE.md context-menu constraint's note on why that keeps
                      `--click-button` working here. The label was "⋯" until a glyph
                      beside a second glyph-labelled menu stopped saying anything. */}
                  <button
                    type="button"
                    title={app.t("library.moreActions")}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setReaderMenu({ x: rect.left, y: rect.bottom });
                    }}
                  >
                    {app.t("library.actions")}
                  </button>
                </div>
              </header>
  
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
                    variant="reader"
                    values={header}
                    onChange={onHeaderChange}
                    onLeave={() => editor.current?.focus()}
                    locale={app.locale}
                    t={app.t}
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

              {/* Only for a note a `[[…]]` link led to, and only while that note is the
                  one on screen — see `backTo`. Below the note rather than above the
                  title: the header is one `nowrap` row already competing between the
                  title and the two menus, and a second line in it made the whole strip
                  grow and shrink as links were followed. A strip of its own at the foot
                  of the pane costs the note nothing when there is no way back to offer,
                  since it is not rendered at all then.

                  Outside `.reader-body`, deliberately: that div is what `reader-locked`
                  makes unclickable while the capture window has the note claimed, and
                  leaving the note you are reading is exactly the thing that must keep
                  working while somebody else is typing into it. */}
              {backTo !== null && (
                <div className="reader-footer">
                  <button
                    type="button"
                    className="reader-back"
                    title={app.t("library.backTo").replace("{title}", backTo.title)}
                    onClick={goBack}
                  >
                    ← {backTo.title}
                  </button>
                </div>
              )}

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

      {moving && open !== null && (
        <MoveDialog
          folders={folders}
          // The folder the note is actually in, not the one selected on the left. With
          // a tag selected there is no current folder at all, and even with a folder
          // selected the open note may live somewhere else entirely — in which case the
          // old code excluded the wrong one and offered the note its own folder.
          current={folderOf(open.path)}
          t={app.t}
          onCancel={() => setMoving(false)}
          onMove={(target) => {
            setMoving(false);
            void moveNoteTo(open.path, target);
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
            isInTrash(folderOf(noteMenu.note.path))
              ? [
                  {
                    label: app.t("library.restore"),
                    onSelect: () => setRestoring({ kind: "note", path: noteMenu.note.path }),
                  },
                  {
                    label: app.t("library.deletePermanently"),
                    danger: true,
                    onSelect: () =>
                      setDialog({
                        kind: "deletePermanently",
                        path: noteMenu.note.path,
                        label: noteMenu.note.title,
                      }),
                  },
                ]
              : [
                  {
                    label: app.t("library.open"),
                    onSelect: () => void openNote(noteMenu.note.path),
                  },
                  { label: app.t("library.move"), onSelect: () => setMoving(true) },
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
                    onSelect: () => setDialog({ kind: "delete", title: noteMenu.note.title }),
                  },
                ]
          }
        />
      )}

      {readerMenu !== null && open !== null && (
        <ContextMenu
          x={readerMenu.x}
          y={readerMenu.y}
          onClose={() => setReaderMenu(null)}
          items={[
            {
              label: app.t("library.rename"),
              onSelect: () => setEditingTitle(open.title),
            },
            { label: app.t("library.move"), onSelect: () => setMoving(true) },
            { label: app.t("library.duplicate"), onSelect: () => void duplicate() },
            {
              label: app.t("library.reveal"),
              onSelect: () => window.emqnote.library.revealNote(open.path),
            },
            {
              label: app.t("library.delete"),
              danger: true,
              onSelect: () => setDialog({ kind: "delete", title: open.title }),
            },
          ]}
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
            if (current.kind === "relink") runRelinkable(current.action, false);
          }}
          onConfirm={(value) => {
            const current = dialog;
            setDialog(null);
            if (current.kind === "delete") void trash();
            if (current.kind === "deleteFolder") void deleteFolderAt(current.path);
            if (current.kind === "deletePermanently") void deletePermanently(current.path);
            if (current.kind === "clearTrash") void clearTrash();
            if (current.kind === "newFolder") {
              void window.emqnote.library.createFolder(current.parent, value);
            }
            if (current.kind === "renameFolder") void renameFolderAt(current.path, value);
            if (current.kind === "relink") runRelinkable(current.action, true);
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
          loadRemoteImages={app.loadRemoteImages}
          vaultPath={app.vaultPath}
          t={app.t}
          onChanged={() => void app.reload()}
          // Switching vault restarts the app, so anything still on the debounce has to
          // reach disk first — and into the vault it was typed in, not the new one.
          onBeforeSwitch={flushPendingSave}
          onClose={() => setSettingsOpen(false)}
          // Settings closes first, then Orphaned Attachments opens — sequenced rather
          // than both flags flipped at once, so the two modals are never stacked on top
          // of each other even for the one render in between.
          onOpenOrphanedAttachments={() => {
            setSettingsOpen(false);
            setOrphanedAttachmentsOpen(true);
          }}
        />
      )}

      {helpOpen && (
        <Help
          window="library"
          isMac={app.isMac}
          hotkey={app.hotkey}
          t={app.t}
          onClose={() => setHelpOpen(false)}
        />
      )}

      {orphanedAttachmentsOpen && (
        <OrphanedAttachments t={app.t} onClose={() => setOrphanedAttachmentsOpen(false)} />
      )}
    </div>
  );
}
