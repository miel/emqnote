interface Props {
  onClose: () => void;
}

/**
 * A title bar the app draws itself.
 *
 * The window is frameless so the header can sit tight against the top, but a frameless
 * window has no grab area and no window buttons — you could not move it with the mouse
 * and there was no visible way to close it. Closing is the same as Ctrl+Enter: it saves
 * and puts the note away.
 */
export function TitleBar({ onClose }: Props): React.ReactElement {
  return (
    <div className="titlebar">
      <span className="titlebar-name">emqnote</span>

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
          title="Save and close (Ctrl+Enter)"
          aria-label="Save and close"
          onClick={onClose}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
