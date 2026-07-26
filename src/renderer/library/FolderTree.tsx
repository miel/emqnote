import { useState } from "react";
import {
  selectionKey,
  TRASH_FOLDER,
  type Facets,
  type FolderNode,
  type Selection,
} from "../../shared/vault-types.js";
import { FilterSection } from "./FilterSection.js";

interface Props {
  root: FolderNode;
  selected: Selection;
  facets: Facets;
  onSelect: (selection: Selection) => void;
  /** Fired when a filter list is unfolded, so the vault is only scanned on demand. */
  onExpandFilters: () => void;
  /** Right-clicking a folder: the new folder goes inside that one. */
  onCreateFolder: (parent: string) => void;
  /** The toolbar button, which has no folder under the cursor to go by. */
  onNewFolder: () => void;
  onOpenSettings: () => void;
  newFolderLabel: string;
  settingsLabel: string;
  trashLabel: string;
  tagsLabel: string;
  peopleLabel: string;
  emptyLabel: string;
  unavailableLabel: string;
  filterLabel: string;
}

function Branch({
  node,
  depth,
  selected,
  onSelect,
  onCreateFolder,
}: {
  node: FolderNode;
  depth: number;
  selected: Selection;
  onSelect: (selection: Selection) => void;
  onCreateFolder: (parent: string) => void;
}): React.ReactElement {
  // Open by default near the root, closed deeper down: a project tree several levels
  // deep is unreadable if it all unfolds at once.
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className={`branch${selectionKey(selected) === `folder:${node.path}` ? " branch-on" : ""}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => onSelect({ kind: "folder", path: node.path })}
        onContextMenu={(event) => {
          event.preventDefault();
          onCreateFolder(node.path);
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
  onExpandFilters,
  onCreateFolder,
  onNewFolder,
  onOpenSettings,
  newFolderLabel,
  settingsLabel,
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
        <button type="button" onClick={onNewFolder}>
          + {newFolderLabel}
        </button>
      </div>

      <ul className="tree-branches">
        <Branch
          node={filed}
          depth={0}
          selected={selected}
          onSelect={onSelect}
          onCreateFolder={onCreateFolder}
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
              // No new folders inside the trash: it is a destination for deleted notes,
              // not a place to organise.
              onCreateFolder={() => {}}
            />
          </ul>
        )}

        <div
          className="branch tree-settings"
          style={{ paddingLeft: "8px" }}
          onClick={onOpenSettings}
        >
          <span className="twisty">⚙</span>
          <span className="branch-name">{settingsLabel}</span>
        </div>
      </div>
    </nav>
  );
}
