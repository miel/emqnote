import { useEffect, useState } from "react";
import { LOCALES, type Locale } from "../../shared/i18n.js";
import type { VaultLocation } from "../../shared/vault-types.js";

interface Props {
  locale: Locale;
  hotkey: string;
  vaultPath: string | null;
  t: (key: string) => string;
  onChanged: () => void;
  /** Flushes anything unsaved before the app restarts into another vault. */
  onBeforeSwitch: () => Promise<void>;
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

/**
 * The tail of a path, which is the part that identifies it.
 *
 * Trimmed here rather than by CSS. `text-overflow: ellipsis` cuts the end — the folder
 * name, the only part worth reading — and the usual `direction: rtl` workaround for that
 * moves the leading separator to the far end, so an absolute path renders with a stray
 * trailing slash. The full path is on the title attribute.
 */
function shorten(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== "");
  if (parts.length <= 2) return path;
  return `…/${parts.slice(-2).join("/")}`;
}

export function Settings({
  locale,
  hotkey,
  vaultPath,
  t,
  onChanged,
  onBeforeSwitch,
  onClose,
}: Props): React.ReactElement {
  const [recording, setRecording] = useState(false);
  const [current, setCurrent] = useState(hotkey);
  const [rejected, setRejected] = useState(false);
  const [vaults, setVaults] = useState<VaultLocation[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    void window.emqnote.listVaults().then(setVaults);
  }, []);

  /** A freshly picked folder goes straight to the confirmation, like any other. */
  const pick = (chosen: string | null): void => {
    if (chosen !== null) setConfirming(chosen);
  };

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

        {/* Where the notes live. The list is asked for fresh every time it opens, so a
            vault that has just become reachable — or has just stopped being — is
            described as it is now rather than as it was when it was first chosen. */}
        <div className="settings-row settings-row-block">
          <span>{t("settings.vault")}</span>
          <button type="button" onClick={() => void window.emqnote.chooseVault().then(pick)}>
            {t("settings.vaultChoose")}
          </button>
        </div>

        <ul className="vault-list">
          {vaults.map((entry) => (
            <li key={entry.path}>
              <button
                type="button"
                className={`vault${entry.path === vaultPath ? " vault-on" : ""}`}
                disabled={entry.status === "unavailable"}
                onClick={() => setConfirming(entry.path)}
              >
                <span className="vault-path" title={entry.path}>
                  {shorten(entry.path)}
                </span>
                <span className="vault-status">
                  {entry.status === "synced"
                    ? `${t("settings.vaultSynced")} — ${entry.tenant}`
                    : t(`settings.vault${entry.status === "local" ? "Local" : "Unavailable"}`)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {confirming !== null && (
          <div className="settings-confirm">
            <p>{t("settings.vaultRestart")}</p>
            <div className="settings-buttons">
              <button type="button" onClick={() => setConfirming(null)}>
                {t("ask.cancel")}
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const target = confirming;
                  setConfirming(null);
                  // The pending save goes first: a debounced write landing after the
                  // switch would put the old note's bytes into the new vault.
                  void onBeforeSwitch().then(() => window.emqnote.switchVault(target));
                }}
              >
                {t("settings.vaultRestartConfirm")}
              </button>
            </div>
          </div>
        )}

        <div className="settings-buttons">
          <button type="button" className="primary" onClick={onClose}>
            {t("settings.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
