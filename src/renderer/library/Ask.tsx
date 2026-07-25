import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  /** Omit for a plain confirmation; provide (even empty) for a text field. */
  initial?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
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
  onConfirm,
  onCancel,
}: Props): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial ?? "");

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const confirm = (): void => {
    if (initial !== undefined && value.trim() === "") return;
    onConfirm(value.trim());
  };

  return (
    <div className="overlay" onMouseDown={onCancel}>
      <div className="ask" onMouseDown={(event) => event.stopPropagation()}>
        <p className="ask-title">{title}</p>

        {initial !== undefined && (
          <input
            ref={input}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                confirm();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }
            }}
          />
        )}

        <div className="ask-buttons">
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
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
