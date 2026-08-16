import { useState } from "react";
import {
  canCreateFolderIn,
  canDeleteFolder as canDeleteFolderAt,
  canRenameFolder as canRenameFolderAt,
  isInTrash,
  selectionKey,
  TRASH_FOLDER,
  type Facets,
  type FolderNode,
  type Selection,
} from "../../shared/vault-types.js";
import { ContextMenu, type MenuItem } from "./ContextMenu.js";
import { FilterSection } from "./FilterSection.js";
import { canDropNote, NOTE_DRAG_TYPE } from "./drag.js";
import { isContextMenuKey, roveArrowKey } from "./roving.js";

interface Props {
  root: FolderNode;
  selected: Selection;
  facets: Facets;
  onSelect: (selection: Selection) => void;
  /** The note being dragged over the tree, or null. See `NoteList`'s `onDragNote`. */
  dragging: string | null;
  /** Drops a dragged note into a folder — the direct form of "Move to…". */
  onDropNote: (notePath: string, folder: string) => void;
  /** Fired when a filter list is unfolded, so the vault is only scanned on demand. */
  onExpandFilters: () => void;
  /** The context menu's "New folder": the new folder goes inside the given path. */
  onCreateFolder: (parent: string) => void;
  /** The toolbar button, which has no folder under the cursor to go by. */
  onNewFolder: () => void;
  /** Renames the given folder — the toolbar passes `lastFolder`, the context menu the row it was opened on. */
  onRenameFolder: (path: string) => void;
  /** Deletes the given folder — same split as `onRenameFolder`. */
  onDeleteFolder: (path: string) => void;
  /** Shows the folder in Explorer/Finder. `IPC.libraryRevealNote` assumes nothing about note-ness. */
  onRevealFolder: (path: string) => void;
  /**
   * Puts a folder inside `_trash` back somewhere real — the picker asks where, because
   * the trash records nothing about where a folder came from.
   */
  onRestoreFolder: (path: string) => void;
  /** Deletes a trashed folder for good. The one thing in this menu with no way back (B24). */
  onDeleteFolderPermanently: (path: string) => void;
  /** Files a new note into the given folder — the context menu's "New note". */
  onNewNoteIn: (folder: string) => void;
  /** The last folder that was selected — what the toolbar buttons act on. */
  lastFolder: string;
  /** False for the vault root and the trash, neither of which can be renamed. */
  canRenameFolder: boolean;
  /** False for the vault root and the trash, neither of which can be deleted either. */
  canDeleteFolder: boolean;
  /** False for the trash, which is a destination for deleted notes, not a place to file. */
  canCreateFolder: boolean;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  /** Selects the Tasks view — vault-wide by default, with a scope dropdown inside the view itself. */
  onOpenTasks: () => void;
  /** Whether the Tasks view is what is currently showing, for the same highlight the Trash branch gets. */
  tasksSelected: boolean;
  /** Selects the unlinked-attachment pane — §6.5's cleanup, back in the sidebar where it started. */
  onOpenUnlinked: () => void;
  /** Whether that pane is what is showing, highlighted exactly as Tasks and Trash are. */
  unlinkedSelected: boolean;
  /** Which platform's modifier spelling `isContextMenuKey` should compare the keydown against. */
  isMac: boolean;
  newFolderLabel: string;
  renameFolderLabel: string;
  deleteFolderLabel: string;
  revealLabel: string;
  restoreLabel: string;
  deletePermanentlyLabel: string;
  /**
   * The toolbar's short forms — "+ New", "Rename", "Delete" — reusing `library.new`,
   * `library.rename` and `library.delete` rather than `newFolderLabel` etc. The panel is
   * already the folder tree, so the long form the context menu needs (nothing else on
   * screen says "folder" there) would be redundant on a button beside it.
   */
  newLabel: string;
  renameLabel: string;
  deleteLabel: string;
  newNoteLabel: string;
  helpLabel: string;
  settingsLabel: string;
  tasksLabel: string;
  unlinkedLabel: string;
  trashLabel: string;
  tagsLabel: string;
  peopleLabel: string;
  emptyLabel: string;
  unavailableLabel: string;
  filterLabel: string;
}

/**
 * The trash can, drawn rather than typed.
 *
 * 🗑 has no text presentation on macOS — the variation selector does not talk it out of
 * the colour emoji font — so beside the flat `#`, `◍` and `⚙` it arrived as a pictorial
 * icon in its own size and weight, crowding the label. Drawn in `currentColor` it
 * inherits the muted grey and follows both colour schemes like everything else here.
 */
const trashGlyph = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M6.1 2.6h3.8M2.6 4.6h10.8M4.7 4.6l.55 8a1 1 0 0 0 1 .93h3.5a1 1 0 0 0 1-.93l.55-8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * A small ticked box, in the same drawn-not-typed spirit as `trashGlyph` — this is the
 * footer menu entry, not the checkbox on a task row itself, so it does not go through
 * `drawBox` in `checkbox.ts` (see `TaskList.tsx` for that one).
 */
const tasksGlyph = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect
      x="2.6"
      y="2.6"
      width="10.8"
      height="10.8"
      rx="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    />
    <path
      d="M5.2 8.1 7.2 10.2 10.9 5.9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * A paperclip, drawn for the same reason `trashGlyph` is: 📎 comes out of the colour emoji
 * font on macOS whatever the variation selector says, and this row sits in a column with
 * `#`, `◍` and two hairline SVGs.
 */
const unlinkedGlyph = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M10.9 6.4v4.4a3 3 0 0 1-6 0V5.2a2 2 0 0 1 4 0v5.4a1 1 0 0 1-2 0V6.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function Branch({
  node,
  depth,
  selected,
  onSelect,
  onCreateFolder,
  dragging,
  onDropNote,
  glyph,
  trashed,
  trashRoot,
  activePath,
  onActivate,
  onOpenMenu,
  isMac,
}: {
  node: FolderNode;
  depth: number;
  selected: Selection;
  onSelect: (selection: Selection) => void;
  onCreateFolder: (parent: string) => void;
  /** The note currently under the pointer, or null. See `NoteList`'s `onDragNote`. */
  dragging: string | null;
  /**
   * Files the dragged note here — or, on the trash branch, deletes it: `Library.tsx`
   * routes a drop whose target is `TRASH_FOLDER` through the same `trashNote` the Delete
   * menu item calls, so the lock and the link behaviour cannot come out two ways.
   *
   * Optional because `canDropNote` and this prop have to agree about which rows are
   * destinations, and a branch that would refuse every drop should not be wired to try;
   * nothing leaves it off today.
   */
  onDropNote?: (notePath: string, folder: string) => void;
  /**
   * An icon in the slot Tags and People use, for the one branch that is a destination
   * rather than a folder.
   *
   * Optional, and deliberately not passed down to the children below: `Branch` is also
   * the entire folder tree, and a glyph on every folder is noise. It sits *beside*
   * `.branch-name` rather than inside it — `--click-button` matches rows on that
   * element's text, so a glyph within it would break "Trash".
   */
  glyph?: React.ReactNode;
  /**
   * True for a row that is *inside* `_trash` — a folder that has been deleted, which
   * used to render identically to a live one. Undefined everywhere else in the tree.
   *
   * Deliberately not set on the Trash row itself. Trash sits in the sidebar beside Tags,
   * People and Tasks: it is a place you go to, and dimming it made the one row you click
   * look like the rows you have thrown away — which is the reverse of what the dimming
   * is for.
   */
  trashed?: boolean;
  /**
   * True for the Trash branch itself. Sets `trashed` on everything below it — a folder
   * inside `_trash` is still inside `_trash`, however deep — without dimming this row.
   * Unlike `glyph`, which stops here, this one propagates.
   */
  trashRoot?: boolean;
  /** The path currently holding this pane's one roving `tabIndex={0}`. */
  activePath: string;
  /** Fired on focus (a Tab landing here, or an arrow key moving here) — keeps `activePath` honest. */
  onActivate: (path: string) => void;
  /** Opens the right-click menu for this row, at the given viewport point. */
  onOpenMenu: (path: string, x: number, y: number) => void;
  /** Which platform's modifier spelling `isContextMenuKey` should compare the keydown against. */
  isMac: boolean;
}): React.ReactElement {
  // Open by default near the root, closed deeper down: a project tree several levels
  // deep is unreadable if it all unfolds at once.
  //
  // The Trash is the exception at its own depth: it sits at the bottom of the sidebar and
  // is the one branch whose contents are things already thrown away, so unfolding it by
  // default spends the sidebar's remaining height on exactly the folders nobody is looking
  // for. Only the row itself starts closed — `trashRoot` stops here rather than
  // propagating, so a folder opened *inside* the trash still behaves like any other.
  const [open, setOpen] = useState(depth < 1 && trashRoot !== true);
  const [over, setOver] = useState(false);
  const hasChildren = node.children.length > 0;

  const accepts =
    onDropNote !== undefined && dragging !== null && canDropNote(dragging, node.path);

  return (
    <li>
      <div
        className={
          `branch${selectionKey(selected) === `folder:${node.path}` ? " branch-on" : ""}` +
          `${over && accepts ? " branch-drop" : ""}` +
          `${trashed === true ? " branch-trashed" : ""}`
        }
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        role="treeitem"
        aria-expanded={hasChildren ? open : undefined}
        aria-selected={selectionKey(selected) === `folder:${node.path}`}
        tabIndex={activePath === node.path ? 0 : -1}
        onFocus={() => onActivate(node.path)}
        onClick={() => onSelect({ kind: "folder", path: node.path })}
        // Folding from the whole row, not only from the 16px twisty. A leaf does nothing,
        // deliberately: the twisty is hidden there, so there is nothing on screen a
        // double-click could be aimed at, and toggling an invisible state would be a
        // gesture with no result. `NoteList.tsx` already opens a note this way, so the
        // gesture means "act on this row" in both panels. The two `onClick`s that fire
        // first only re-select a folder that the first of them just selected.
        onDoubleClick={() => {
          if (hasChildren) setOpen((value) => !value);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onOpenMenu(node.path, event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          const container = (event.currentTarget as HTMLElement).closest(".tree");
          const next = roveArrowKey(event, container, '[role="treeitem"]', event.currentTarget);
          if (next !== null) {
            event.preventDefault();
            next.focus();
            return;
          }

          if (event.key === "ArrowRight") {
            event.preventDefault();
            if (hasChildren && !open) setOpen(true);
            return;
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            if (hasChildren && open) setOpen(false);
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect({ kind: "folder", path: node.path });
            return;
          }
          if (isContextMenuKey(event, isMac)) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenMenu(node.path, rect.left, rect.bottom);
          }
        }}
        // `preventDefault` on dragover is what marks an element as a drop target at all;
        // without it the browser's default "no drop here" wins and the drop never fires.
        onDragOver={(event) => {
          if (!accepts) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (!over) setOver(true);
        }}
        // `dragleave` also fires on the way into a child element, so the highlight is
        // dropped on the element the pointer actually left, not on every crossing.
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setOver(false);
        }}
        // Asks `canDropNote` again with the path out of the drop itself, rather than
        // trusting the `accepts` above. That one depends on `dragging` having made it
        // through a re-render, which is true for any real drag — there are frames between
        // picking a row up and moving the pointer — but it makes the consequential half
        // of this depend on a render having happened, and the answer is right here.
        onDrop={(event) => {
          setOver(false);
          if (onDropNote === undefined) return;
          const notePath = event.dataTransfer.getData(NOTE_DRAG_TYPE);
          if (notePath === "" || !canDropNote(notePath, node.path)) return;
          event.preventDefault();
          onDropNote(notePath, node.path);
        }}
      >
        <button
          type="button"
          tabIndex={-1}
          className={`twisty${hasChildren ? "" : " twisty-empty"}`}
          aria-label={open ? "Collapse" : "Expand"}
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) setOpen(!open);
          }}
          // `dblclick` is its own event and bubbles even though the two `click`s that
          // preceded it were stopped here — without this, a double-click on the twisty
          // itself would toggle twice from the clicks and then a third time from the
          // row, ending in the state the user was trying to leave.
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {hasChildren ? (open ? "▾" : "▸") : ""}
        </button>

        {glyph !== undefined && <span className="filter-glyph">{glyph}</span>}
        <span className="branch-name">{node.name}</span>
        {node.noteCount > 0 && <span className="branch-count">{node.noteCount}</span>}
      </div>

      {open && hasChildren && (
        <ul role="group">
          {node.children.map((child) => (
            <Branch
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              onCreateFolder={onCreateFolder}
              dragging={dragging}
              onDropNote={onDropNote}
              trashed={trashed === true || trashRoot === true}
              activePath={activePath}
              onActivate={onActivate}
              onOpenMenu={onOpenMenu}
              isMac={isMac}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FolderTree({
  root,
  selected,
  facets,
  onSelect,
  dragging,
  onDropNote,
  onExpandFilters,
  onCreateFolder,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onRevealFolder,
  onRestoreFolder,
  onDeleteFolderPermanently,
  onNewNoteIn,
  lastFolder,
  canRenameFolder,
  canDeleteFolder,
  canCreateFolder,
  onOpenSettings,
  onOpenHelp,
  onOpenTasks,
  tasksSelected,
  onOpenUnlinked,
  unlinkedSelected,
  isMac,
  newFolderLabel,
  renameFolderLabel,
  deleteFolderLabel,
  revealLabel,
  restoreLabel,
  deletePermanentlyLabel,
  newLabel,
  renameLabel,
  deleteLabel,
  newNoteLabel,
  helpLabel,
  settingsLabel,
  tasksLabel,
  unlinkedLabel,
  trashLabel,
  tagsLabel,
  peopleLabel,
  emptyLabel,
  unavailableLabel,
  filterLabel,
}: Props): React.ReactElement {
  // The trash is a real folder in the vault, but it is not somewhere you file a note.
  // Leaving it among the children sorted it in between the folders you actually use;
  // lifted out it sits at the bottom at the vault's own level, under its UI name.
  const trash = root.children.find((child) => child.path === TRASH_FOLDER) ?? null;
  const filed: FolderNode = {
    ...root,
    children: root.children.filter((child) => child.path !== TRASH_FOLDER),
  };

  // The one row in this pane that currently holds `tabIndex={0}` — see `roving.ts`'s own
  // comment for why this reads the DOM for *movement* but still needs one piece of state
  // to remember *where* it is between renders. Starts on the root, which — unlike a
  // folder several levels down — is always on screen, so the invariant "this path is
  // currently a rendered row" holds without having to walk the tree to check it: it can
  // only ever change via a row's own `onFocus`, and a row that isn't rendered cannot fire
  // that in the first place.
  const [activePath, setActivePath] = useState("");

  // The right-click (or `Mod-Shift-M`/`ContextMenu`) menu for one row — folder tree rows
  // that used to instantly create a new folder inside whatever was right-clicked now open
  // this instead. `library.pickHint` and this component's own toolbar comment describe
  // the new gesture; see `05-besluitenlog.md`/`CLAUDE.md` for why every one of these
  // actions also has to stay reachable without it (the `--click-button` selftest harness
  // cannot open a menu).
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);

  const menuItems = (path: string): MenuItem[] => {
    // A folder *inside* the trash gets its own two entries. The four ordinary ones are
    // all disabled there — every one of them refuses a trashed path — so the menu that
    // opened on a deleted folder said nothing at all about the only two things anyone
    // ever wants to do with one.
    //
    // Trashed-ness is read off the path, so nothing has to be threaded down from
    // `Library`: it is the same question `canRenameFolder` and its two neighbours in
    // `vault-types.ts` already ask, and `isInTrash` is where the answer lives. The Trash
    // row itself is deliberately not one of these — it is a place, not a deleted folder,
    // and Clear trash in the note list is what empties it.
    if (path !== TRASH_FOLDER && isInTrash(path)) {
      return [
        { label: restoreLabel, onSelect: () => onRestoreFolder(path) },
        {
          label: deletePermanentlyLabel,
          danger: true,
          onSelect: () => onDeleteFolderPermanently(path),
        },
      ];
    }

    return [
      {
        label: newFolderLabel,
        disabled: !canCreateFolderIn(path),
        onSelect: () => onCreateFolder(path),
      },
      {
        label: renameFolderLabel,
        disabled: !canRenameFolderAt(path),
        onSelect: () => onRenameFolder(path),
      },
      {
        label: deleteFolderLabel,
        danger: true,
        disabled: !canDeleteFolderAt(path),
        onSelect: () => onDeleteFolder(path),
      },
      {
        label: newNoteLabel,
        disabled: !canCreateFolderIn(path),
        onSelect: () => onNewNoteIn(path),
      },
      // Never disabled, on any row: `IPC.libraryRevealNote` is `shell.showItemInFolder`
      // on a joined path and assumes nothing about what is at the end of it — the vault
      // root and the trash are both perfectly good things to open a file manager on, and
      // opening one is the one action here that changes nothing.
      { label: revealLabel, onSelect: () => onRevealFolder(path) },
    ];
  };

  return (
    <nav className="tree">
      {/* Right-clicking a folder works too, but a button is the discoverable way —
          "no option to create a new folder" was a fair complaint about a feature that
          existed only as a hidden gesture. */}
      <div className="tree-toolbar">
        {/* Standing on a deleted folder, the three ordinary buttons are all disabled —
            every one of them refuses a trashed path — so the toolbar said nothing where
            the two things anyone wants to do with one belong. They swap, exactly as
            `NoteList` swaps + New note for Clear trash in the same place for the same
            reason. It is also what keeps Restore reachable at all: its other route is a
            right-click menu, and `--click-button` cannot open one of those, which is the
            rule CLAUDE.md draws around every action in this app. */}
        {isInTrash(lastFolder) && lastFolder !== TRASH_FOLDER ? (
          <>
            <button type="button" onClick={() => onRestoreFolder(lastFolder)}>
              {restoreLabel}
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => onDeleteFolderPermanently(lastFolder)}
            >
              {deletePermanentlyLabel}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onNewFolder} disabled={!canCreateFolder}>
              + {newLabel}
            </button>
            {/* Beside it rather than hidden behind a gesture, for the reason above — and
                renaming had no gesture at all, hidden or otherwise. */}
            <button
              type="button"
              onClick={() => onRenameFolder(lastFolder)}
              disabled={!canRenameFolder}
            >
              {renameLabel}
            </button>
            {/* A folder never had a way out of the app's own trash discipline before this
                — only Explorer/Finder, outside the app entirely. */}
            <button
              type="button"
              className="danger"
              onClick={() => onDeleteFolder(lastFolder)}
              disabled={!canDeleteFolder}
            >
              {deleteLabel}
            </button>
          </>
        )}
      </div>

      <ul className="tree-branches" role="tree">
        <Branch
          node={filed}
          depth={0}
          selected={selected}
          onSelect={onSelect}
          onCreateFolder={onCreateFolder}
          dragging={dragging}
          onDropNote={onDropNote}
          activePath={activePath}
          onActivate={setActivePath}
          onOpenMenu={(path, x, y) => setMenu({ path, x, y })}
          isMac={isMac}
        />
      </ul>

      {/* Destinations, not filing structure, so they stay put while the tree scrolls. */}
      <div className="tree-footer">
        <FilterSection
          kind="tag"
          label={tagsLabel}
          glyph="#"
          facets={facets.tags}
          available={facets.available}
          selected={selected}
          onSelect={onSelect}
          onExpand={onExpandFilters}
          emptyLabel={emptyLabel}
          unavailableLabel={unavailableLabel}
          filterLabel={filterLabel}
        />

        <FilterSection
          kind="person"
          label={peopleLabel}
          glyph="◍"
          facets={facets.people}
          available={facets.available}
          selected={selected}
          onSelect={onSelect}
          onExpand={onExpandFilters}
          emptyLabel={emptyLabel}
          unavailableLabel={unavailableLabel}
          filterLabel={filterLabel}
        />

        {/* A fourth `Selection` kind, not a lens on the currently browsed folder — vault-
            wide by default, with its own scope dropdown inside the view. Highlighted the
            same way the Trash branch is, since unlike Settings/Help it is a real
            destination that can stay selected. */}
        <div
          className={`branch tree-settings${tasksSelected ? " branch-on" : ""}`}
          style={{ paddingLeft: "8px" }}
          onClick={onOpenTasks}
        >
          <span className="twisty twisty-empty" />
          <span className="filter-glyph">{tasksGlyph}</span>
          <span className="branch-name">{tasksLabel}</span>
        </div>

        {/* The gear moved out of the twisty slot and into the glyph slot, so all four
            rows down here — Tags, People, Tasks, Settings — put their icon in one
            column and their label in the next. It used to sit a slot to the left, and
            "Settings" started half a character before "Tags". */}
        <div
          className="branch tree-settings"
          style={{ paddingLeft: "8px" }}
          onClick={onOpenSettings}
        >
          <span className="twisty twisty-empty" />
          <span className="filter-glyph">⚙</span>
          <span className="branch-name">{settingsLabel}</span>
        </div>

        <div
          className="branch tree-settings"
          style={{ paddingLeft: "8px" }}
          onClick={onOpenHelp}
        >
          <span className="twisty twisty-empty" />
          <span className="filter-glyph">?</span>
          <span className="branch-name">{helpLabel}</span>
        </div>

        {/* §6.5's cleanup, back where it started and this time as a real destination
            rather than a modal: a `Selection` like Tasks, drawing B47's file list in the
            note pane and B47's preview in the reader. It sits between Help and Trash
            because that is where it was asked for, and because the two rows either side
            of it are the other two things down here that are not a filter. */}
        <div
          className={`branch tree-settings${unlinkedSelected ? " branch-on" : ""}`}
          style={{ paddingLeft: "8px" }}
          onClick={onOpenUnlinked}
        >
          <span className="twisty twisty-empty" />
          <span className="filter-glyph">{unlinkedGlyph}</span>
          <span className="branch-name">{unlinkedLabel}</span>
        </div>

        {trash !== null && (
          <ul role="tree">
            <Branch
              node={{ ...trash, name: trashLabel }}
              depth={0}
              selected={selected}
              onSelect={onSelect}
              glyph={trashGlyph}
              trashRoot
              // No new folders inside the trash: it is a destination for deleted notes,
              // not a place to organise.
              onCreateFolder={() => {}}
              // A drop *is* accepted here, and it is Delete — the same rename into
              // `_trash`, no confirmation, because trashing destroys nothing and Restore
              // is the named way back (see `drag.ts`). `canDropNote` still refuses a
              // folder *inside* the trash, so only this one row lights up.
              onDropNote={onDropNote}
              dragging={dragging}
              activePath={activePath}
              onActivate={setActivePath}
              onOpenMenu={(path, x, y) => setMenu({ path, x, y })}
              isMac={isMac}
            />
          </ul>
        )}
      </div>

      {menu !== null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.path)}
          onClose={() => setMenu(null)}
        />
      )}
    </nav>
  );
}
