import { useEffect, useRef, useState } from "react";

interface Props {
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
export function LinkPrompt({ onApply, onCancel }: Props): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [href, setHref] = useState("");

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  return (
    <div className="link-prompt">
      <label htmlFor="link-href">Link</label>
      <input
        id="link-href"
        ref={input}
        value={href}
        placeholder="https://…  (empty removes the link)"
        onChange={(event) => setHref(event.target.value)}
        onKeyDown={(event) => {
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
