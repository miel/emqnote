import { useEffect, useRef, useState } from "react";
import { trapTab } from "./focus-trap.js";

interface Props {
  title: string;
  /** Omit for a plain confirmation; provide (even empty) for a text field. */
  initial?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  /** For telling rather than asking: one button, and nothing to cancel out of. */
  dismissOnly?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * The app's own prompt and confirm.
 *
 * Electron does not implement `window.prompt` — it throws — so Rename and New folder
 * silently did nothing at all. `window.confirm` exists but blocks the whole renderer
 * and looks like a browser. Both are replaced by this.
 */
export function Ask({
  title,
  initial,
  confirmLabel,
  cancelLabel,
  danger = false,
  dismissOnly = false,
  onConfirm,
  onCancel,
}: Props): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(initial ?? "");

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const confirm = (): void => {
    if (initial !== undefined && value.trim() === "") return;
    onConfirm(value.trim());
  };

  // Tab is trapped from every focusable element in the dialog, not only the input: with
  // no text field (`dismissOnly`, or a plain confirm) the buttons are all there is, and
  // Shift+Tab from the first one still has to loop rather than escape to the page behind.
  const onKeyDown = (event: React.KeyboardEvent): void => {
    trapTab(event, panel.current);
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="overlay" onMouseDown={onCancel}>
      <div
        className="ask"
        ref={panel}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <p className="ask-title">{title}</p>

        {initial !== undefined && (
          <input
            ref={input}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                confirm();
              }
              // Escape and Tab are left to bubble to the wrapping `onKeyDown` above,
              // which already handles both.
            }}
          />
        )}

        <div className="ask-buttons">
          {!dismissOnly && (
            <button type="button" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={danger ? "danger" : "primary"}
            autoFocus={initial === undefined}
            onClick={confirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
