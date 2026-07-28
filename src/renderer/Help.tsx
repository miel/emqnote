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

interface Props {
  /** Which window is asking, so its own keys are listed and the other's are not. */
  window: Extract<ShortcutWhere, "capture" | "library">;
  isMac: boolean;
  /** The global accelerator, which is a setting rather than a constant. */
  hotkey: string;
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
export function Help({ window: which, isMac, hotkey, t, onClose }: Props): React.ReactElement {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
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

                  {/* The one entry that is not a constant: the global hotkey is a
                      setting, so it is rendered from what is configured rather than
                      written down twice. */}
                  {group === "window" && (
                    <div className="help-row">
                      <dt>{t("shortcut.newNote")}</dt>
                      <dd>{formatAccelerator(hotkey, isMac)}</dd>
                    </div>
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
