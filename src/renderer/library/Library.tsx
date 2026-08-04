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
} from "../../shared/vault-types.js";
import { Editor, type EditorHandle } from "../editor/Editor.js";
import { HeaderBlock, type HeaderValues } from "../HeaderBlock.js";
import { Help } from "../Help.js";
import { LinkPrompt } from "../LinkPrompt.js";
import { matches, shortcut } from "../../shared/shortcuts.js";
import { useBootstrap } from "../useBootstrap.js";
import { Ask } from "./Ask.js";
import { ConflictBanner } from "./ConflictBanner.js";
import { FolderTree } from "./FolderTree.js";
import { MoveDialog } from "./MoveDialog.js";
import { NoteList } from "./NoteList.js";
import { OrphanedAttachments } from "./OrphanedAttachments.js";
import { Settings } from "./Settings.js";

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
  | { kind: "rename"; initial: string }
  | { kind: "newFolder"; parent: string }
  | { kind: "renameFolder"; path: string; initial: string }
  | { kind: "delete"; title: string }
  | { kind: "clearTrash"; count: number }
  | { kind: "problem"; message: string };

export function Library(): React.ReactElement {
  const app = useBootstrap();
  const editor = useRef<EditorHandle>(null);

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
  const [moving, setMoving] = useState(false);
  // The note being dragged over the tree. Held here rather than in either component,
  // because the row that knows which note it is and the branch that has to decide
  // whether it will take it are on opposite sides of the window.
  const [dragging, setDragging] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
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
    async (path: string) => {
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      if (dirty) await save();

      const loaded = await window.emqnote.library.openNote(path);
      if (loaded === null) return;

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

  const onDocChange = useCallback(() => {
    // Belt and braces alongside the `pointer-events: none` overlay: a note can go
    // read-only while the editor already has focus from before, and a keystroke that
    // slips through must not schedule a save that `save()` would refuse anyway.
    if (openRef.current === null || !openRef.current.editable) return;
    setDirty(true);
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
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
      saveTimer.current = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
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
  }, [docToken]);

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
    const path = await window.emqnote.library.renameNote(current.path, title);
    await openNote(path);
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
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
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
   * Files a note into a folder. Both ways of asking for that — the "Move to…" dialog and
   * dragging a row onto the tree — come through here, so the two cannot drift apart.
   *
   * Only the note that is actually open needs saving first; a dragged row is usually not
   * it, and flushing an unrelated pending save would write one note because another one
   * moved. The reopen at the end is likewise conditional: following the note into its new
   * folder is right when you moved the note you were reading, and wrong when you flicked
   * a different row out of the Inbox and are still reading what you had.
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

    // Following the note only makes sense when a folder is what you were looking at.
    // From a tag or person view it would drop the filter you chose.
    if (wasOpen && selectionRef.current.kind === "folder") {
      setSelection({ kind: "folder", path: target });
      selectionRef.current = { kind: "folder", path: target };
      setLastFolder(target);
    }

    await loadTree();
    if (wasOpen) await openNote(result.path);
    else await loadNotes(selectionRef.current);
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
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);

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

      <div className="library">
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
          canRenameFolder={lastFolder !== "" && !lastFolder.startsWith(TRASH_FOLDER)}
          canCreateFolder={!lastFolder.startsWith(TRASH_FOLDER)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenOrphanedAttachments={() => setOrphanedAttachmentsOpen(true)}
          newFolderLabel={app.t("library.newFolder")}
          renameFolderLabel={app.t("library.renameFolder")}
          helpLabel={app.t("help.title")}
          settingsLabel={app.t("settings.title")}
          orphanedAttachmentsLabel={app.t("orphans.title")}
          trashLabel={app.t("library.trash")}
          tagsLabel={app.t("library.tags")}
          peopleLabel={app.t("library.people")}
          emptyLabel={app.t("library.filterEmpty")}
          unavailableLabel={app.t("library.filterUnavailable")}
          filterLabel={app.t("library.filterSearch")}
        />
  
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
          onNewNote={() => window.emqnote.library.newNote()}
          onClearTrash={() => setDialog({ kind: "clearTrash", count: notes.length })}
          onDragNote={setDragging}
          locale={app.locale}
          t={app.t}
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
                  <h1>{open.title}</h1>
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
                    onClick={() => setDialog({ kind: "rename", initial: open.title })}
                  >
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
            dialog.kind === "rename"
              ? app.t("ask.renameTitle")
              : dialog.kind === "renameFolder"
                ? `${app.t("ask.renameFolderTitle")} "${dialog.path}"`
                : dialog.kind === "newFolder"
                  ? `${app.t("ask.newFolderIn")} "${dialog.parent === "" ? app.t("library.vaultRoot") : dialog.parent}"`
                  : dialog.kind === "problem"
                    ? dialog.message
                    : dialog.kind === "clearTrash"
                      ? `${dialog.count} ${app.t(dialog.count === 1 ? "library.note" : "library.notes")} — ${app.t("ask.confirmClearTrash")}`
                      : `"${dialog.title}" — ${app.t("ask.confirmDelete")}`
          }
          initial={
            dialog.kind === "rename" || dialog.kind === "renameFolder"
              ? dialog.initial
              : dialog.kind === "newFolder"
                ? ""
                : undefined
          }
          confirmLabel={
            dialog.kind === "delete"
              ? app.t("library.delete")
              : dialog.kind === "clearTrash"
                ? app.t("library.clearTrash")
                : app.t("ask.ok")
          }
          cancelLabel={app.t("ask.cancel")}
          danger={dialog.kind === "delete" || dialog.kind === "clearTrash"}
          dismissOnly={dialog.kind === "problem"}
          onCancel={() => setDialog(null)}
          onConfirm={(value) => {
            const current = dialog;
            setDialog(null);
            if (current.kind === "rename") void rename(value);
            if (current.kind === "delete") void trash();
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
            if (saveTimer.current !== null) clearTimeout(saveTimer.current);
            if (dirty) await save();
          }}
          onClose={() => setSettingsOpen(false)}
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
