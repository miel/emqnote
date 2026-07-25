import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../../markdown/schema.js";
import type {
  FolderNode,
  NoteSummary,
  OpenedNote,
  SortKey,
} from "../../shared/vault-types.js";
import { Editor, type EditorHandle } from "../editor/Editor.js";
import { LinkPrompt } from "../LinkPrompt.js";
import { useBootstrap } from "../useBootstrap.js";
import { Ask } from "./Ask.js";
import { FolderTree } from "./FolderTree.js";
import { MoveDialog } from "./MoveDialog.js";
import { NoteList } from "./NoteList.js";
import { Settings } from "./Settings.js";

const SAVE_DEBOUNCE_MS = 800;

const EMPTY_TREE: FolderNode = { path: "", name: "Vault", children: [], noteCount: 0 };

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
  | { kind: "delete"; title: string };

export function Library(): React.ReactElement {
  const app = useBootstrap();
  const editor = useRef<EditorHandle>(null);

  const [tree, setTree] = useState<FolderNode>(EMPTY_TREE);
  const [folder, setFolder] = useState("00 Inbox");
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [sort, setSort] = useState<SortKey>("modified");
  const [open, setOpen] = useState<OpenedNote | null>(null);
  const [dirty, setDirty] = useState(false);
  const [moving, setMoving] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [link, setLink] = useState<{ href: string } | null>(null);

  const openRef = useRef<OpenedNote | null>(null);
  openRef.current = open;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTree = useCallback(async () => {
    setTree(await window.emqnote.library.tree());
  }, []);

  const loadNotes = useCallback(async (path: string) => {
    setNotes(await window.emqnote.library.notes(path));
  }, []);

  useEffect(() => {
    void loadTree();
    const stop = window.emqnote.library.onRefresh(() => {
      void loadTree();
      void loadNotes(folder);
    });
    return stop;
  }, [loadTree, loadNotes, folder]);

  useEffect(() => {
    void loadNotes(folder);
  }, [folder, loadNotes]);

  /**
   * Writes the note being edited.
   *
   * The main process compares against what is on disk and writes nothing when they
   * match, so calling this more often than strictly needed is cheap and safe — which
   * is what makes it reasonable to flush before switching notes.
   */
  const save = useCallback(async () => {
    const current = openRef.current;
    const doc = editor.current?.getDoc();
    if (current === null || doc === null || doc === undefined) return;

    const result = await window.emqnote.library.saveNote({
      path: current.path,
      title: current.title,
      kind: current.kind,
      created: current.created,
      location: current.location,
      attendees: current.attendees,
      doc: doc.toJSON(),
    });

    setDirty(false);
    if (result.written) void loadNotes(folder);
  }, [folder, loadNotes]);

  const openNote = useCallback(
    async (path: string) => {
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      if (dirty) await save();

      const loaded = await window.emqnote.library.openNote(path);
      if (loaded === null) return;

      setOpen(loaded);
      openRef.current = loaded;
      setDirty(false);
    },
    [dirty, save],
  );

  const onDocChange = useCallback(() => {
    if (openRef.current === null) return;
    setDirty(true);
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
  }, [save]);

  /**
   * Loads the document into the editor once React has mounted it.
   *
   * Not straight after `setOpen`: the editor is rendered conditionally, so on the
   * first note the ref is still null at that point and the note came up blank.
   */
  useEffect(() => {
    if (open === null) return;
    editor.current?.setDoc(schema.nodeFromJSON(open.doc) as PMNode);
  }, [open]);

  const folders = useMemo(() => flatten(tree), [tree]);
  const sorted = useMemo(() => sortNotes(notes, sort), [notes, sort]);

  const rename = async (title: string): Promise<void> => {
    const current = openRef.current;
    if (current === null) return;

    await save();
    const path = await window.emqnote.library.renameNote(current.path, title);
    await openNote(path);
  };

  const trash = async (): Promise<void> => {
    const current = openRef.current;
    if (current === null) return;

    await window.emqnote.library.trashNote(current.path);
    setOpen(null);
    openRef.current = null;
    void loadNotes(folder);
  };

  return (
    <div className="library">
      <FolderTree
        root={tree}
        selected={folder}
        onSelect={setFolder}
        onCreateFolder={(parent) => setDialog({ kind: "newFolder", parent })}
        onOpenSettings={() => setSettingsOpen(true)}
        newFolderLabel={app.t("library.newFolder")}
        settingsLabel={app.t("settings.title")}
      />

      <NoteList
        notes={sorted}
        selected={open?.path ?? null}
        sort={sort}
        onSort={setSort}
        onSelect={(path) => void openNote(path)}
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
                  {app.t(dirty ? "library.saving" : "library.saved")}
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

            <Editor
              ref={editor}
              onChange={onDocChange}
              onLinkRequested={() => setLink(editor.current?.beginLinkEdit() ?? null)}
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

      {moving && open !== null && (
        <MoveDialog
          folders={folders}
          current={folder}
          t={app.t}
          onCancel={() => setMoving(false)}
          onMove={(target) => {
            setMoving(false);
            void (async () => {
              await save();
              const path = await window.emqnote.library.moveNote(open.path, target);
              setFolder(target);
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
              : dialog.kind === "newFolder"
                ? `${app.t("ask.newFolderIn")} "${dialog.parent === "" ? app.t("library.vaultRoot") : dialog.parent}"`
                : `"${dialog.title}" — ${app.t("ask.confirmDelete")}`
          }
          initial={dialog.kind === "delete" ? undefined : dialog.kind === "rename" ? dialog.initial : ""}
          confirmLabel={dialog.kind === "delete" ? app.t("library.delete") : app.t("ask.ok")}
          cancelLabel={app.t("ask.cancel")}
          danger={dialog.kind === "delete"}
          onCancel={() => setDialog(null)}
          onConfirm={(value) => {
            const current = dialog;
            setDialog(null);
            if (current.kind === "rename") void rename(value);
            if (current.kind === "delete") void trash();
            if (current.kind === "newFolder") {
              void window.emqnote.library.createFolder(current.parent, value);
            }
          }}
        />
      )}

      {settingsOpen && (
        <Settings
          locale={app.locale}
          hotkey={app.hotkey}
          t={app.t}
          onChanged={() => void app.reload()}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
