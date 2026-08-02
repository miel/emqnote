import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../../markdown/schema.js";
import {
  folderErrorOf,
  selectionKey,
  TRASH_FOLDER,
  type Facets,
  type FolderNode,
  type NoteSummary,
  type OpenedNote,
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
import { FolderTree } from "./FolderTree.js";
import { MoveDialog } from "./MoveDialog.js";
import { NoteList } from "./NoteList.js";
import { Settings } from "./Settings.js";

const SAVE_DEBOUNCE_MS = 800;

const EMPTY_TREE: FolderNode = { path: "", name: "Vault", children: [], noteCount: 0 };
const EMPTY_FACETS: Facets = { tags: [], people: [], available: true };

function flatten(node: FolderNode): string[] {
  return [node.path, ...node.children.flatMap(flatten)];
}

/** The folder a note sits in; "" for the vault root. */
function folderOf(notePath: string): string {
  const cut = notePath.lastIndexOf("/");
  return cut === -1 ? "" : notePath.slice(0, cut);
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
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [link, setLink] = useState<{ href: string } | null>(null);

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
    const stop = window.emqnote.library.onRefresh(() => {
      void loadTree();
      void loadNotes(selectionRef.current);
      refreshFacets();
      void refreshEditable();
    });
    return stop;
  }, [loadTree, loadNotes, refreshFacets, refreshEditable]);

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

  const trash = async (): Promise<void> => {
    const current = openRef.current;
    if (current === null) return;

    await window.emqnote.library.trashNote(current.path);
    setOpen(null);
    openRef.current = null;
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
    <div className="library">
      <FolderTree
        root={tree}
        selected={selection}
        facets={facets}
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
        newFolderLabel={app.t("library.newFolder")}
        renameFolderLabel={app.t("library.renameFolder")}
        helpLabel={app.t("help.title")}
        settingsLabel={app.t("settings.title")}
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
            void (async () => {
              await save();
              const path = await window.emqnote.library.moveNote(open.path, target);
              // Following the note to its new folder only makes sense when a folder is
              // what you were looking at. From a tag view it would drop the filter.
              if (selectionRef.current.kind === "folder") {
                setSelection({ kind: "folder", path: target });
                setLastFolder(target);
              }
              await openNote(path);
            })();
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
                    : `"${dialog.title}" — ${app.t("ask.confirmDelete")}`
          }
          initial={
            dialog.kind === "rename" || dialog.kind === "renameFolder"
              ? dialog.initial
              : dialog.kind === "newFolder"
                ? ""
                : undefined
          }
          confirmLabel={dialog.kind === "delete" ? app.t("library.delete") : app.t("ask.ok")}
          cancelLabel={app.t("ask.cancel")}
          danger={dialog.kind === "delete"}
          dismissOnly={dialog.kind === "problem"}
          onCancel={() => setDialog(null)}
          onConfirm={(value) => {
            const current = dialog;
            setDialog(null);
            if (current.kind === "rename") void rename(value);
            if (current.kind === "delete") void trash();
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
    </div>
  );
}
