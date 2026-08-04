import { useState } from "react";
import {
  selectionKey,
  TRASH_FOLDER,
  type Facets,
  type FolderNode,
  type Selection,
} from "../../shared/vault-types.js";
import { FilterSection } from "./FilterSection.js";
import { canDropNote, NOTE_DRAG_TYPE } from "./drag.js";

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
  /** Right-clicking a folder: the new folder goes inside that one. */
  onCreateFolder: (parent: string) => void;
  /** The toolbar button, which has no folder under the cursor to go by. */
  onNewFolder: () => void;
  /** Renames the last folder that was selected, the same one "+ New folder" fills in. */
  onRenameFolder: () => void;
  /** Deletes the last folder that was selected — same target as Rename. */
  onDeleteFolder: () => void;
  /** False for the vault root and the trash, neither of which can be renamed. */
  canRenameFolder: boolean;
  /** False for the vault root and the trash, neither of which can be deleted either. */
  canDeleteFolder: boolean;
  /** False for the trash, which is a destination for deleted notes, not a place to file. */
  canCreateFolder: boolean;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onOpenOrphanedAttachments: () => void;
  newFolderLabel: string;
  renameFolderLabel: string;
  deleteFolderLabel: string;
  helpLabel: string;
  settingsLabel: string;
  orphanedAttachmentsLabel: string;
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

function Branch({
  node,
  depth,
  selected,
  onSelect,
  onCreateFolder,
  dragging,
  onDropNote,
  glyph,
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
        onClick={() => onSelect({ kind: "folder", path: node.path })}
        onContextMenu={(event) => {
          event.preventDefault();
          onCreateFolder(node.path);
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
        <ul>
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
  canRenameFolder,
  canDeleteFolder,
  canCreateFolder,
  onOpenSettings,
  onOpenHelp,
  onOpenOrphanedAttachments,
  newFolderLabel,
  renameFolderLabel,
  deleteFolderLabel,
  helpLabel,
  settingsLabel,
  orphanedAttachmentsLabel,
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
        <button type="button" onClick={onRenameFolder} disabled={!canRenameFolder}>
          {renameFolderLabel}
        </button>
        {/* A folder never had a way out of the app's own trash discipline before this —
            only Explorer/Finder, outside the app entirely. */}
        <button
          type="button"
          className="danger"
          onClick={onDeleteFolder}
          disabled={!canDeleteFolder}
        >
          {deleteFolderLabel}
        </button>
      </div>

      <ul className="tree-branches">
        <Branch
          node={filed}
          depth={0}
          selected={selected}
          onSelect={onSelect}
          onCreateFolder={onCreateFolder}
          dragging={dragging}
          onDropNote={onDropNote}
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

        {trash !== null && (
          <ul>
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
            />
          </ul>
        )}

        {/* The gear moved out of the twisty slot and into the glyph slot, so all four
            rows down here — Tags, People, Trash, Settings — put their icon in one
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

        {/* §6.5's manual, explicit cleanup action — deliberately down here with Settings
            and Help rather than anywhere more prominent, since nothing about it is
            urgent the way a sync conflict is. */}
        <div
          className="branch tree-settings"
          style={{ paddingLeft: "8px" }}
          onClick={onOpenOrphanedAttachments}
        >
          <span className="twisty twisty-empty" />
          <span className="filter-glyph">⎚</span>
          <span className="branch-name">{orphanedAttachmentsLabel}</span>
        </div>
      </div>
    </nav>
  );
}
