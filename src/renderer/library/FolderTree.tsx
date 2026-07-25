import { useState } from "react";
import type { FolderNode } from "../../shared/vault-types.js";

interface Props {
  root: FolderNode;
  selected: string;
  onSelect: (path: string) => void;
  onCreateFolder: (parent: string) => void;
  onOpenSettings: () => void;
  newFolderLabel: string;
  settingsLabel: string;
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
  selected: string;
  onSelect: (path: string) => void;
  onCreateFolder: (parent: string) => void;
}): React.ReactElement {
  // Open by default near the root, closed deeper down: a project tree several levels
  // deep is unreadable if it all unfolds at once.
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className={`branch${selected === node.path ? " branch-on" : ""}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => onSelect(node.path)}
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
  onSelect,
  onCreateFolder,
  onOpenSettings,
  newFolderLabel,
  settingsLabel,
}: Props): React.ReactElement {
  return (
    <nav className="tree">
      {/* Right-clicking a folder works too, but a button is the discoverable way —
          "no option to create a new folder" was a fair complaint about a feature that
          existed only as a hidden gesture. */}
      <div className="tree-toolbar">
        <button type="button" onClick={() => onCreateFolder(selected)}>
          + {newFolderLabel}
        </button>
        <button type="button" title={settingsLabel} onClick={onOpenSettings}>
          ⚙
        </button>
      </div>

      <ul>
        <Branch
          node={root}
          depth={0}
          selected={selected}
          onSelect={onSelect}
          onCreateFolder={onCreateFolder}
        />
      </ul>
    </nav>
  );
}
