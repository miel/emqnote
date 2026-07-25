import { useEffect, useRef, useState } from "react";

interface Props {
  /** The address already on this link, empty when creating a new one. */
  initialHref: string;
  onApply: (href: string) => void;
  onCancel: () => void;
  /** Ctrl+Enter: apply the link and then close the note, as it does everywhere else. */
  onApplyAndClose: (href: string) => void;
  t: (key: string) => string;
}

/**
 * A one-line prompt for Ctrl+K.
 *
 * Deliberately not a dialog: a modal window for adding a link is exactly the kind of
 * interruption this app exists to avoid. Type, press Enter, carry on. An empty value
 * removes the link again.
 */
export function LinkPrompt({
  initialHref,
  onApply,
  onCancel,
  onApplyAndClose,
  t,
}: Props): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [href, setHref] = useState(initialHref);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  return (
    <div className="link-prompt">
      <label htmlFor="link-href">{t(initialHref === "" ? "link.new" : "link.edit")}</label>
      <input
        id="link-href"
        ref={input}
        value={href}
        placeholder={t("link.placeholder")}
        onChange={(event) => setHref(event.target.value)}
        // Clicking anywhere else puts the prompt away. It used to sit there until a
        // key was pressed, which left the window looking stuck.
        onBlur={() => onCancel()}
        onKeyDown={(event) => {
          // Ctrl+Enter keeps its meaning everywhere, including here: apply the link,
          // then save and close the note.
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            onApplyAndClose(href.trim());
            return;
          }

          // Otherwise the prompt owns the keyboard; nothing here reaches the note.
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
