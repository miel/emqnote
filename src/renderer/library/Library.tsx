import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../../markdown/schema.js";
import {
  folderErrorOf,
  folderOf,
  selectionKey,
  TRASH_FOLDER,
  type ConflictPair,
  type Facets,
  type FolderNode,
  type NoteSummary,
  type OpenedNote,
  type ScanProgress,
  type Selection,
  type SortKey,
  type VaultFileEvent,
} from "../../shared/vault-types.js";
import { Editor, type EditorHandle } from "../editor/Editor.js";
import { HeaderBlock, type HeaderValues } from "../HeaderBlock.js";
import { Help } from "../Help.js";
import { LinkPrompt } from "../LinkPrompt.js";
import { matches, shortcut } from "../../shared/shortcuts.js";
import { useBootstrap } from "../useBootstrap.js";
import { Ask } from "./Ask.js";
import { ConflictBanner } from "./ConflictBanner.js";
import { DiskChangeBar } from "./DiskChangeBar.js";
import { FolderTree } from "./FolderTree.js";
import { MoveDialog } from "./MoveDialog.js";
import { NoteList } from "./NoteList.js";
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

/** Which small dialog is open, if any. Only ever one at a time. */
type Dialog =
  | { kind: "newFolder"; parent: string }
  | { kind: "renameFolder"; path: string; initial: string }
  | { kind: "delete"; title: string }
  | { kind: "deleteFolder"; path: string; notes: number; folders: number }
  | { kind: "clearTrash"; count: number }
  | { kind: "problem"; message: string };

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
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS);
  const [sort, setSort] = useState<SortKey>("modified");
  const [open, setOpen] = useState<OpenedNote | null>(null);
  const [dirty, setDirty] = useState(false);
  /**
   * A note changed or disappeared on disk while it was open here, for a reason this app
   * did not cause itself — see `own-writes.ts` for how the app's own debounced autosave
   * is told apart from that. Null the rest of the time, which is the normal state.
   */
  const [diskEvent, setDiskEvent] = useState<VaultFileEvent | null>(null);
  const [moving, setMoving] = useState(false);
  // The note being dragged over the tree. Held here rather than in either component,
  // because the row that knows which note it is and the branch that has to decide
  // whether it will take it are on opposite sides of the window.
  const [dragging, setDragging] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
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
    setNotes(
      query.trim() === ""
        ? await window.emqnote.library.notes(target)
        : await window.emqnote.library.search(query),
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

  // F1 and Ctrl+/ open the sheet here too, tested against the same registry the editor
  // is built from. Escape is handled inside the sheet, where it cannot reach a note.
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

  // Whatever the bar was showing no longer applies once the reader is empty — cleared
  // here rather than only inside `openNote`, since `open` can also become `null` from
  // `trash()`, `clearTrash()` and `deleteFolderAt()`, none of which call `openNote`.
  useEffect(() => {
    if (open === null) setDiskEvent(null);
  }, [open]);

  /**
   * The picker path, for the reader's own toolbar button and its keyboard shortcut.
   *
   * Nothing guards `open === null` or `!open.editable` here beyond the button being
   * disabled for those states: `editor.current?.insertAttachment` dispatches a
   * transaction that reaches `onDocChange` like any other edit, and that is where the
   * `editable` refusal already lives — the same belt-and-braces reasoning `onDocChange`
   * itself documents for a keystroke that slips through while the overlay is up.
   */
  const pickAndInsertAttachment = useCallback(async () => {
    const name = await window.emqnote.pickAttachment();
    if (name !== null) editor.current?.insertAttachment(name);
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

  const rename = async (title: string): Promise<void> => {
    const current = openRef.current;
    if (current === null) return;

    await save();
    const result = await window.emqnote.library.renameNote(current.path, title);
    if (result.locked === true) {
      setDialog({ kind: "problem", message: app.t("library.renameLocked") });
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

    if (next !== path) {
      const rebase = (candidate: string): string =>
        candidate === path || candidate.startsWith(`${path}/`)
          ? next + candidate.slice(path.length)
          : candidate;

      // The open note keeps its caret and its undo history: only the path moved, and
      // the document reload is keyed on `docToken`, which nothing here touches.
      const current = openRef.current;
      if (current !== null) {
        const moved = { ...current, path: rebase(current.path) };
        setOpen(moved);
        openRef.current = moved;
      }

      if (selectionRef.current.kind === "folder") {
        const target: Selection = {
          kind: "folder",
          path: rebase(selectionRef.current.path),
        };
        setSelection(target);
        selectionRef.current = target;
      }

      setLastFolder(rebase(lastFolder));
    }

    await loadTree();
    await loadNotes(selectionRef.current);
    refreshFacets();
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
    const current = openRef.current;
    const wasOpen = current !== null && current.path === notePath;
    if (wasOpen && dirty) await save();

    const result = await window.emqnote.library.moveNote(notePath, target);
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

  const trash = async (): Promise<void> => {
    const current = openRef.current;
    if (current === null) return;

    await window.emqnote.library.trashNote(current.path);
    setOpen(null);
    openRef.current = null;
    void loadNotes(selectionRef.current);
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
   * Selects the Tasks view — vault-wide, open items only, the same defaults every other
   * footer entry resets to when it is clicked fresh. Clears a pending search the same way
   * the tree's own `onSelect` does below, so a half-typed query does not sit there
   * disagreeing with what is now showing.
   */
  const openTasks = (): void => {
    setSelection({ kind: "tasks", scope: "", openOnly: true });
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
            void moveNoteTo(notePath, folder);
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
          onRenameFolder={() =>
            setDialog({
              kind: "renameFolder",
              path: lastFolder,
              initial: lastFolder.split("/").pop() ?? "",
            })
          }
          onDeleteFolder={() => {
            const path = lastFolder;
            void window.emqnote.library.folderContents(path).then((contents) => {
              setDialog({ kind: "deleteFolder", path, notes: contents.notes, folders: contents.folders });
            });
          }}
          canRenameFolder={lastFolder !== "" && !lastFolder.startsWith(TRASH_FOLDER)}
          canDeleteFolder={lastFolder !== "" && !lastFolder.startsWith(TRASH_FOLDER)}
          canCreateFolder={!lastFolder.startsWith(TRASH_FOLDER)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenTasks={openTasks}
          tasksSelected={selection.kind === "tasks"}
          newFolderLabel={app.t("library.newFolder")}
          renameFolderLabel={app.t("library.renameFolder")}
          deleteFolderLabel={app.t("library.deleteFolder")}
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
            selected={open?.path ?? null}
            showing={selection}
            searching={searchQuery.trim() !== ""}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            sort={sort}
            onSort={setSort}
            onSelect={(path) => void openNote(path)}
            onOpenInCapture={(path) => void openInCapture(path)}
            // Filed where you are standing, which includes the vault root — before this
            // every capture went to the Inbox and the root was browsable but unwritable.
            // `lastFolder` rather than the selection, for the same reason "+ New folder"
            // uses it: a tag or the Tasks view is not a place to put a note.
            onNewNote={() => window.emqnote.library.newNote(lastFolder)}
            onClearTrash={() => setDialog({ kind: "clearTrash", count: notes.length })}
            onDragNote={setDragging}
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
          {open === null ? (
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
                  <button
                    type="button"
                    disabled={!open.editable}
                    title={app.t("shortcut.attachment")}
                    onClick={() => void pickAndInsertAttachment()}
                  >
                    📎
                  </button>
                  <button type="button" onClick={() => setEditingTitle(open.title)}>
                    {app.t("library.rename")}
                  </button>
                  <button type="button" onClick={() => setMoving(true)}>
                    {app.t("library.move")}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.emqnote.library.revealNote(open.path)}
                  >
                    {app.t("library.reveal")}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => setDialog({ kind: "delete", title: open.title })}
                  >
                    {app.t("library.delete")}
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
                  onAttachmentRequested={() => void pickAndInsertAttachment()}
                />
              </div>
  
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

      {dialog !== null && (
        <Ask
          title={
            dialog.kind === "renameFolder"
              ? `${app.t("ask.renameFolderTitle")} "${dialog.path}"`
              : dialog.kind === "newFolder"
                ? `${app.t("ask.newFolderIn")} "${dialog.parent === "" ? app.t("library.vaultRoot") : dialog.parent}"`
                : dialog.kind === "problem"
                  ? dialog.message
                  : dialog.kind === "clearTrash"
                    ? `${dialog.count} ${app.t(dialog.count === 1 ? "library.note" : "library.notes")} — ${app.t("ask.confirmClearTrash")}`
                    : dialog.kind === "deleteFolder"
                      ? `"${dialog.path}"${
                          dialog.notes === 0 && dialog.folders === 0
                            ? ""
                            : ` (${dialog.notes} ${app.t(dialog.notes === 1 ? "library.note" : "library.notes")}, ${dialog.folders} ${app.t(dialog.folders === 1 ? "library.folder" : "library.folders")})`
                        } — ${app.t("ask.confirmDeleteFolder")}`
                      : `"${dialog.title}" — ${app.t("ask.confirmDelete")}`
          }
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
              : dialog.kind === "clearTrash"
                ? app.t("library.clearTrash")
                : app.t("ask.ok")
          }
          cancelLabel={app.t("ask.cancel")}
          danger={
            dialog.kind === "delete" ||
            dialog.kind === "clearTrash" ||
            dialog.kind === "deleteFolder"
          }
          dismissOnly={dialog.kind === "problem"}
          onCancel={() => setDialog(null)}
          onConfirm={(value) => {
            const current = dialog;
            setDialog(null);
            if (current.kind === "delete") void trash();
            if (current.kind === "deleteFolder") void deleteFolderAt(current.path);
            if (current.kind === "clearTrash") void clearTrash();
            if (current.kind === "newFolder") {
              void window.emqnote.library.createFolder(current.parent, value);
            }
            if (current.kind === "renameFolder") void renameFolderAt(current.path, value);
          }}
        />
      )}

      {settingsOpen && (
        <Settings
          locale={app.locale}
          hotkey={app.hotkey}
          vaultPath={app.vaultPath}
          t={app.t}
          onChanged={() => void app.reload()}
          // Switching vault restarts the app, so anything still on the debounce has to
          // reach disk first — and into the vault it was typed in, not the new one.
          onBeforeSwitch={async () => {
            if (saveTimer.current !== null) {
              clearTimeout(saveTimer.current);
              saveTimer.current = null;
            }
            if (dirty) await save();
          }}
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
