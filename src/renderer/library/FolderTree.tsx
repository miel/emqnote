import { useState } from "react";
import {
  canCreateFolderIn,
  canDeleteFolder as canDeleteFolderAt,
  canRenameFolder as canRenameFolderAt,
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
  /** Which platform's modifier spelling `isContextMenuKey` should compare the keydown against. */
  isMac: boolean;
  newFolderLabel: string;
  renameFolderLabel: string;
  deleteFolderLabel: string;
  newNoteLabel: string;
  helpLabel: string;
  settingsLabel: string;
  tasksLabel: string;
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

function Branch({
  node,
  depth,
  selected,
  onSelect,
  onCreateFolder,
  dragging,
  onDropNote,
  glyph,
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
   * Files the dragged note here. Absent on the trash branch, which is what makes the
   * trash refuse a drop rather than merely look like it does — `canDropNote` says no as
   * well, but the branch that cannot accept one should not be wired to try.
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
  const [open, setOpen] = useState(depth < 1);
  const [over, setOver] = useState(false);
  const hasChildren = node.children.length > 0;

  const accepts =
    onDropNote !== undefined && dragging !== null && canDropNote(dragging, node.path);

  return (
    <li>
      <div
        className={
          `branch${selectionKey(selected) === `folder:${node.path}` ? " branch-on" : ""}` +
          `${over && accepts ? " branch-drop" : ""}`
        }
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        role="treeitem"
        aria-expanded={hasChildren ? open : undefined}
        aria-selected={selectionKey(selected) === `folder:${node.path}`}
        tabIndex={activePath === node.path ? 0 : -1}
        onFocus={() => onActivate(node.path)}
        onClick={() => onSelect({ kind: "folder", path: node.path })}
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
  onNewNoteIn,
  lastFolder,
  canRenameFolder,
  canDeleteFolder,
  canCreateFolder,
  onOpenSettings,
  onOpenHelp,
  onOpenTasks,
  tasksSelected,
  isMac,
  newFolderLabel,
  renameFolderLabel,
  deleteFolderLabel,
  newNoteLabel,
  helpLabel,
  settingsLabel,
  tasksLabel,
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

  const menuItems = (path: string): MenuItem[] => [
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
  ];

  return (
    <nav className="tree">
      {/* Right-clicking a folder works too, but a button is the discoverable way —
          "no option to create a new folder" was a fair complaint about a feature that
          existed only as a hidden gesture. */}
      <div className="tree-toolbar">
        <button type="button" onClick={onNewFolder} disabled={!canCreateFolder}>
          + {newFolderLabel}
        </button>
        {/* Beside it rather than hidden behind a gesture, for the reason above — and
            renaming had no gesture at all, hidden or otherwise. */}
        <button
          type="button"
          onClick={() => onRenameFolder(lastFolder)}
          disabled={!canRenameFolder}
        >
          {renameFolderLabel}
        </button>
        {/* A folder never had a way out of the app's own trash discipline before this —
            only Explorer/Finder, outside the app entirely. */}
        <button
          type="button"
          className="danger"
          onClick={() => onDeleteFolder(lastFolder)}
          disabled={!canDeleteFolder}
        >
          {deleteFolderLabel}
        </button>
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

        {trash !== null && (
          <ul role="tree">
            <Branch
              node={{ ...trash, name: trashLabel }}
              depth={0}
              selected={selected}
              onSelect={onSelect}
              glyph={trashGlyph}
              // No new folders inside the trash: it is a destination for deleted notes,
              // not a place to organise.
              onCreateFolder={() => {}}
              // And no drops either: Delete is what puts a note in here, and it asks
              // first. `onDropNote` left off entirely rather than passed as a no-op, so
              // the branch never even offers to accept one.
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
