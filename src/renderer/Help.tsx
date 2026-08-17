import { useEffect, useRef } from "react";
import {
  formatAccelerator,
  formatEntry,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type ShortcutEntry,
  type ShortcutGroup,
  type ShortcutWhere,
} from "../shared/shortcuts.js";
import { trapTab } from "./library/focus-trap.js";

interface Props {
  /** Which window is asking, so its own keys are listed and the other's are not. */
  window: Extract<ShortcutWhere, "capture" | "library">;
  isMac: boolean;
  /** The global accelerator, which is a setting rather than a constant. */
  hotkey: string;
  /** The library's global accelerator (B60), a setting for the same reason. */
  libraryHotkey: string;
  t: (key: string) => string;
  onClose: () => void;
}

/**
 * The shortcut sheet, in both windows.
 *
 * Beside `HeaderBlock.tsx` and `LinkPrompt.tsx` rather than in `library/`, following the
 * precedent those two set for a component both windows use — and its CSS goes in
 * `styles.css` beside `.link-prompt` for the same reason. It cannot reuse `.overlay` and
 * `.settings`, which live in `library.css`; the capture window does not load that file,
 * and it is the window whose bundle has to stay small.
 *
 * Everything here is read from `src/shared/shortcuts.ts`, which is also what builds the
 * keymap. A sheet that listed the keys separately would be wrong within a month — the
 * table in the design document it replaces already was.
 */
export function Help({
  window: which,
  isMac,
  hotkey,
  libraryHotkey,
  t,
  onClose,
}: Props): React.ReactElement {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  /**
   * Focus goes to the panel and comes back to whatever opened it, exactly as
   * `ContextMenu.tsx` does — but on unmount rather than in a `close()` of its own, because
   * this sheet has four ways out and one of them is not ours: `Mod-/` a second time is
   * caught by the window-level listener in `Capture.tsx`/`Library.tsx` and never reaches
   * `onClose`. Without this the focused node is simply removed, focus collapses to
   * `document.body`, and the next Tab starts at the top of the document — which in the
   * library is the folder tree's `+ New` button, whatever pane the sheet was opened from.
   */
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => opener.current?.focus();
  }, []);

  const shown = SHORTCUTS.filter(
    (entry) => entry.where !== "capture" || which === "capture",
  ).filter((entry) => entry.where !== "library" || which === "library");

  const rows = (group: ShortcutGroup): ShortcutEntry[] =>
    shown.filter((entry) => entry.group === group);

  return (
    <div className="help-backdrop" onMouseDown={onClose}>
      <div
        className="help"
        ref={panel}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          trapTab(event, panel.current);
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <div className="help-head">
          <h2>{t("help.title")}</h2>
          <button type="button" className="help-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="help-groups">
          {SHORTCUT_GROUPS.map((group) => {
            const entries = rows(group);
            if (entries.length === 0) return null;

            return (
              <section key={group} className="help-group">
                <h3>{t(`help.group.${group}`)}</h3>
                <dl>
                  {entries.map((entry) => (
                    <div key={entry.id} className="help-row">
                      <dt>{t(`shortcut.${entry.id}`)}</dt>
                      <dd>{formatEntry(entry, isMac, t("help.or"))}</dd>
                    </div>
                  ))}

                  {/* The two entries that are not constants: both global hotkeys are
                      settings, so they are rendered from what is configured rather than
                      written down twice. */}
                  {group === "window" && (
                    <>
                      <div className="help-row">
                        <dt>{t("shortcut.newNote")}</dt>
                        <dd>{formatAccelerator(hotkey, isMac)}</dd>
                      </div>
                      <div className="help-row">
                        <dt>{t("shortcut.openLibraryGlobal")}</dt>
                        <dd>{formatAccelerator(libraryHotkey, isMac)}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
