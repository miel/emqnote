import { useEffect, useRef, useState } from "react";

interface Props {
  /** The address already on this link, empty when creating a new one. */
  initialHref: string;
  onApply: (href: string) => void;
  onCancel: () => void;
}

/**
 * A one-line prompt for Ctrl+K.
 *
 * Deliberately not a dialog: a modal window for adding a link is exactly the kind of
 * interruption this app exists to avoid. Type, press Enter, carry on. An empty value
 * removes the link again.
 */
export function LinkPrompt({ initialHref, onApply, onCancel }: Props): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [href, setHref] = useState(initialHref);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  return (
    <div className="link-prompt">
      <label htmlFor="link-href">{initialHref === "" ? "Link" : "Edit link"}</label>
      <input
        id="link-href"
        ref={input}
        value={href}
        placeholder="https://…  (empty removes the link)"
        onChange={(event) => setHref(event.target.value)}
        onKeyDown={(event) => {
          // The prompt owns the keyboard while it is open; nothing here should reach
          // the note underneath.
          event.stopPropagation();

          if (event.key === "Enter") {
            event.preventDefault();
            onApply(href.trim());
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
    </div>
  );
}
