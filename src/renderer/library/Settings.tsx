import { useState } from "react";
import { LOCALES, type Locale } from "../../shared/i18n.js";

interface Props {
  locale: Locale;
  hotkey: string;
  t: (key: string) => string;
  onChanged: () => void;
  onClose: () => void;
}

const LOCALE_NAMES: Record<Locale, string> = {
  "en-US": "English",
  "nl-NL": "Nederlands",
};

/**
 * Turns a key event into the accelerator string Electron expects.
 *
 * Recording the combination rather than asking for it in text: nobody should have to
 * know that Electron calls it `CommandOrControl+Shift+Space`, and a typo there leaves
 * the app with no shortcut at all.
 */
function toAccelerator(event: React.KeyboardEvent): string | null {
  const key = event.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  // A shortcut with no modifier would swallow that key everywhere on the machine.
  if (parts.length === 0) return null;

  parts.push(key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

export function Settings({
  locale,
  hotkey,
  t,
  onChanged,
  onClose,
}: Props): React.ReactElement {
  const [recording, setRecording] = useState(false);
  const [current, setCurrent] = useState(hotkey);
  const [rejected, setRejected] = useState(false);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="settings" onMouseDown={(event) => event.stopPropagation()}>
        <h2>{t("settings.title")}</h2>

        <label className="settings-row">
          <span>{t("settings.language")}</span>
          <select
            value={locale}
            onChange={(event) => {
              void window.emqnote
                .setLocale(event.target.value as Locale)
                .then(() => onChanged());
            }}
          >
            {LOCALES.map((option) => (
              <option key={option} value={option}>
                {LOCALE_NAMES[option]}
              </option>
            ))}
          </select>
        </label>

        <div className="settings-row">
          <span>{t("settings.hotkey")}</span>
          <button
            type="button"
            className={recording ? "recording" : ""}
            onClick={() => {
              setRecording(true);
              setRejected(false);
            }}
            onKeyDown={(event) => {
              if (!recording) return;
              event.preventDefault();

              const accelerator = toAccelerator(event);
              if (accelerator === null) return;

              void window.emqnote.setHotkey(accelerator).then((accepted) => {
                setRecording(false);
                setRejected(!accepted);
                if (accepted) {
                  setCurrent(accelerator);
                  onChanged();
                }
              });
            }}
          >
            {recording ? t("settings.hotkeyHint") : current}
          </button>
        </div>

        {rejected && <p className="settings-warning">{t("settings.hotkeyTaken")}</p>}

        <div className="settings-buttons">
          <button type="button" className="primary" onClick={onClose}>
            {t("settings.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
