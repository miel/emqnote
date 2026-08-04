import { formatFirstKey } from "../shared/shortcuts.js";

interface Props {
  onClose: () => void;
  /** macOS draws its own traffic lights; we only fill the bar. */
  native: boolean;
  isMac: boolean;
  t: (key: string) => string;
}

/**
 * A title bar the app draws itself.
 *
 * The window is frameless so the header can sit tight against the top, but a frameless
 * window has no grab area and no window buttons — you could not move it with the mouse
 * and there was no visible way to close it. Closing is the same as Ctrl+Enter: it saves
 * and puts the note away.
 */
export function TitleBar({ onClose, native, isMac, t }: Props): React.ReactElement {
  const closeLabel = t("shortcut.close");
  return (
    <div className={`titlebar${native ? " titlebar-native" : ""}`}>
      <span className="titlebar-name">emqnote</span>

      {!native && (
      <div className="titlebar-buttons">
        <button
          type="button"
          className="titlebar-button"
          title="Minimise"
          aria-label="Minimise"
          onClick={() => window.emqnote.minimise()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>

        <button
          type="button"
          className="titlebar-button"
          title="Maximise"
          aria-label="Maximise"
          onClick={() => window.emqnote.toggleMaximise()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
          </svg>
        </button>

        <button
          type="button"
          className="titlebar-button titlebar-close"
          title={`${closeLabel} (${formatFirstKey("close", isMac)})`}
          aria-label={closeLabel}
          onClick={onClose}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
      )}
    </div>
  );
}
