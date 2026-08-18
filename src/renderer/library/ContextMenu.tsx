import { useEffect, useRef, useState } from "react";
import { trapTab } from "./focus-trap.js";

export interface MenuItem {
  label: string;
  /** Absent ⇒ this entry renders as a separator instead of a row. */
  onSelect?: () => void;
  /** Formatted via `formatFirstKey()` from `src/shared/shortcuts.ts` — never hardcoded. */
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  /** For a mark toggle (bold/italic/…) that is currently active at the caret. */
  checked?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

function isSelectable(item: MenuItem): boolean {
  return item.onSelect !== undefined && item.disabled !== true;
}

/** Steps `from` to the next selectable item in `direction`, wrapping and skipping
 * separators/disabled entries. Returns `from` unchanged if nothing else qualifies. */
function step(items: MenuItem[], from: number, direction: 1 | -1): number {
  const count = items.length;
  if (count === 0) return from;
  let index = from;
  for (let guard = 0; guard < count; guard += 1) {
    index = (index + direction + count) % count;
    if (isSelectable(items[index]!)) return index;
  }
  return from;
}

/**
 * The app's own right-click menu.
 *
 * Native `Menu.popup` is deliberately not used here — see `Ask.tsx`'s own comment for
 * why this codebase keeps reaching for a component instead of an Electron-native
 * equivalent: nothing under `test/` can drive a native menu the way everything else here
 * is tested, it costs an IPC round trip per open, and `--click-button`
 * (`library-window.ts`) has no way to reach into one either.
 *
 * Follows `Ask.tsx`/`MoveDialog.tsx`'s own conventions: an `.overlay` that dismisses on
 * an outside `mousedown`, Escape to cancel, and focus restored to whatever opened it once
 * it closes. Positioned at the click/keyboard point and then clamped to the viewport once
 * mounted, since only then does it have a real size to measure against the window edge.
 */
export function ContextMenu({ x, y, items, onClose }: Props): React.ReactElement {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({ x, y });
  const [active, setActive] = useState(() => step(items, -1, 1));

  // Both effects run once, on mount: the menu never moves once it is open, so `x`/`y`
  // are read here as the initial point rather than tracked as reactive dependencies.
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();
  }, []);

  useEffect(() => {
    const node = panel.current;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    const clampedX = Math.min(x, window.innerWidth - rect.width - 4);
    const clampedY = Math.min(y, window.innerHeight - rect.height - 4);
    setPosition({ x: Math.max(4, clampedX), y: Math.max(4, clampedY) });
  }, []);

  const close = (): void => {
    opener.current?.focus();
    onClose();
  };

  const choose = (index: number): void => {
    const item = items[index];
    if (item === undefined || !isSelectable(item)) return;
    opener.current?.focus();
    item.onSelect?.();
    onClose();
  };

  return (
    <div className="overlay context-menu-overlay" onMouseDown={close}>
      <div
        className="context-menu"
        ref={panel}
        role="menu"
        tabIndex={-1}
        style={{ left: position.x, top: position.y }}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // An open menu owns the keyboard, which is the rule `Capture.tsx`'s own listener
          // already states for the overlays it knows about — this is that rule where it
          // can be enforced once, for every menu in both windows. Without it a window
          // shortcut fires behind the menu: Ctrl+N would make a note, Ctrl+Enter would
          // save and dismiss the capture window, each with a menu still on screen.
          //
          // Escape is the case that was actually reported. `close()` restores focus to
          // whatever opened this menu; when that was the note panel, a still-bubbling
          // Escape then reached `Library.tsx`'s window listener, which saw the editor
          // focused and read the key as "leave for the note list" — so one press both
          // closed the menu and threw focus out of the note.
          event.stopPropagation();
          trapTab(event, panel.current);
          if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => step(items, current, 1));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => step(items, current, -1));
            return;
          }
          if (event.key === "Home") {
            event.preventDefault();
            setActive(step(items, -1, 1));
            return;
          }
          if (event.key === "End") {
            event.preventDefault();
            setActive(step(items, items.length, -1));
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            choose(active);
          }
        }}
      >
        {items.map((item, index) =>
          item.onSelect === undefined ? (
            <div key={index} className="context-menu-separator" role="separator" />
          ) : (
            <button
              key={index}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled === true}
              aria-disabled={item.disabled === true}
              aria-checked={item.checked}
              className={
                `context-menu-item${index === active ? " context-menu-active" : ""}` +
                `${item.danger === true ? " danger" : ""}`
              }
              onMouseEnter={() => {
                if (isSelectable(item)) setActive(index);
              }}
              onClick={() => choose(index)}
            >
              <span className="context-menu-check">{item.checked === true ? "✓" : ""}</span>
              <span className="context-menu-label">{item.label}</span>
              {item.shortcut !== undefined && (
                <span className="context-menu-shortcut">{item.shortcut}</span>
              )}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
