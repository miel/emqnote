import { useState } from "react";
import type { FolderNode } from "../../shared/vault-types.js";

interface Props {
  root: FolderNode;
  selected: string;
  onSelect: (path: string) => void;
  onCreateFolder: (parent: string) => void;
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
}: Props): React.ReactElement {
  return (
    <nav className="tree">
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
