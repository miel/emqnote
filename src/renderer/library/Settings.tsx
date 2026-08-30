import { useEffect, useRef, useState } from "react";
import { LOCALES, type Locale } from "../../shared/i18n.js";
import type { Theme } from "../../shared/ipc.js";
import type { VaultLocation } from "../../shared/vault-types.js";
import { trapTab } from "./focus-trap.js";

interface Props {
  locale: Locale;
  hotkey: string;
  /** The library's own global accelerator (B60). */
  libraryHotkey: string;
  /** Whether a picture named by a web address is fetched and drawn (B50). */
  loadRemoteImages: boolean;
  /** Whether pinned rows stay against the top of the note list while it scrolls (B76). */
  keepPinnedInView: boolean;
  /** The size the note itself is drawn at, in pixels (B88). */
  editorFontSize: number;
  /** Which theme the app draws in (B90): the OS's answer, or light, or dark. */
  theme: Theme;
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
 * The five note sizes on offer (B88), and the string each is named by.
 *
 * Five steps rather than a spinner or a percentage: this is a question answered once per
 * machine, and a number typed into a box invites the two sizes either side of the one
 * that reads well.
 *
 * **The numbers are unchanged and the names moved down one.** 13 is the default now, with
 * the pane-consistency pass — it is the size the design was drawn at and the size the note
 * list beside it uses — and it used to be called "Smallest", which is a poor thing for a
 * default to be called. The five *values* stay exactly as they were on purpose: the chosen
 * size is a number in a settings file, and dropping 16 from the list would leave every
 * machine that had picked it looking at an empty dropdown.
 */
const FONT_SIZES: { px: number; key: string }[] = [
  { px: 13, key: "settings.textNormal" },
  { px: 14, key: "settings.textLarge" },
  { px: 16, key: "settings.textLarger" },
  { px: 18, key: "settings.textLargest" },
  { px: 20, key: "settings.textHuge" },
];

/**
 * The three answers to "which theme" (B90), and the string each is named by.
 *
 * "system" leads because it is the default and because it is the answer most people want
 * without being asked — and it is a real answer rather than the absence of one: it keeps
 * following the OS, so a machine that darkens at sunset darkens the app with it.
 */
const THEMES: { value: Theme; key: string }[] = [
  { value: "system", key: "settings.themeSystem" },
  { value: "light", key: "settings.themeLight" },
  { value: "dark", key: "settings.themeDark" },
];

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

interface HotkeyRowProps {
  label: string;
  /** The chord as it stands; the row tracks its own from there. */
  initial: string;
  /** Registers it with the OS; false when the chord was refused. */
  save: (accelerator: string) => Promise<boolean>;
  /** Whether *this* row is armed — the panel keeps that, since only one may be. */
  armed: boolean;
  onArm: () => void;
  onDisarm: () => void;
  t: (key: string) => string;
}

/**
 * One recorded global accelerator.
 *
 * A component rather than the markup written out twice (B60 gave the library its own
 * hotkey): the recording rules below are subtle enough that a copy would drift — the
 * button owns every key while armed, a refusal has to leave the old chord showing, and
 * whether a row is armed has to be visible to the panel, whose Tab trap and Escape stand
 * aside for it.
 */
function HotkeyRow({
  label,
  initial,
  save,
  armed,
  onArm,
  onDisarm,
  t,
}: HotkeyRowProps): React.ReactElement {
  const [current, setCurrent] = useState(initial);
  const [rejected, setRejected] = useState(false);

  return (
    <>
      <div className="settings-row">
        <span>{label}</span>
        <button
          type="button"
          className={armed ? "recording" : ""}
          onClick={() => {
            onArm();
            setRejected(false);
          }}
          onKeyDown={(event) => {
            if (!armed) return;
            event.preventDefault();

            const accelerator = toAccelerator(event);
            if (accelerator === null) return;

            void save(accelerator).then((accepted) => {
              onDisarm();
              setRejected(!accepted);
              if (accepted) setCurrent(accelerator);
            });
          }}
        >
          {armed ? t("settings.hotkeyHint") : current}
        </button>
      </div>

      {rejected && <p className="settings-warning">{t("settings.hotkeyTaken")}</p>}
    </>
  );
}

export function Settings({
  locale,
  hotkey,
  libraryHotkey,
  loadRemoteImages,
  keepPinnedInView,
  editorFontSize,
  theme,
  vaultPath,
  t,
  onChanged,
  onBeforeSwitch,
  onClose,
}: Props): React.ReactElement {
  /** Which row is recording, if any. One at a time: they all swallow every key. */
  const [recording, setRecording] = useState<"capture" | "library" | null>(null);
  const [remoteImages, setRemoteImages] = useState(loadRemoteImages);
  /** B76, held locally for the same reason `remoteImages` is — see its comment below. */
  const [keepPinned, setKeepPinned] = useState(keepPinnedInView);
  /** B88, held locally for that same reason. */
  const [fontSize, setFontSize] = useState(editorFontSize);
  /** B90, held locally for that same reason. */
  const [themeChoice, setThemeChoice] = useState(theme);
  const [vaults, setVaults] = useState<VaultLocation[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void window.emqnote.listVaults().then(setVaults);
  }, []);

  /**
   * The same focus handling `Help.tsx` and `ContextMenu.tsx` do, and for the same reason:
   * without it the panel never holds focus, so `trapTab` below traps nothing, Escape only
   * closes once something inside has been clicked, and Tab walks the library behind the
   * overlay instead.
   */
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => opener.current?.focus();
  }, []);

  /** A freshly picked folder goes straight to the confirmation, like any other. */
  const pick = (chosen: string | null): void => {
    if (chosen !== null) setConfirming(chosen);
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="settings"
        ref={panel}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // The hotkey-recording button owns every key while it is armed — including
          // Tab and Escape, which it needs to be able to record as part of a
          // combination — so the trap and the Escape-to-close below both stand aside
          // for it.
          if (recording) return;
          trapTab(event, panel.current);
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
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

        <HotkeyRow
          label={t("settings.hotkey")}
          initial={hotkey}
          armed={recording === "capture"}
          onArm={() => setRecording("capture")}
          onDisarm={() => {
            setRecording(null);
            onChanged();
          }}
          save={(accelerator) => window.emqnote.setHotkey(accelerator)}
          t={t}
        />

        <HotkeyRow
          label={t("settings.libraryHotkey")}
          initial={libraryHotkey}
          armed={recording === "library"}
          onArm={() => setRecording("library")}
          onDisarm={() => {
            setRecording(null);
            onChanged();
          }}
          save={(accelerator) => window.emqnote.setLibraryHotkey(accelerator)}
          t={t}
        />

        {/* B50. Held here as its own state rather than read back from the bootstrap on
            every render: the round trip that refreshes that happens on `onChanged`, and a
            checkbox that snapped back to its old value for a frame while it landed would
            read as the switch not having taken. */}
        <label className="settings-row">
          <span>{t("settings.remoteImages")}</span>
          <input
            type="checkbox"
            checked={remoteImages}
            onChange={(event) => {
              const next = event.target.checked;
              setRemoteImages(next);
              void window.emqnote.setLoadRemoteImages(next).then(() => onChanged());
            }}
          />
        </label>

        <p className="settings-note">{t("settings.remoteImagesWhy")}</p>

        {/* B76. Deliberately below the pictures row rather than up beside the shortcuts:
            those two rows are about the whole app, and this one is about one list in one
            window. Its own state, same as the row above and for the same reason. */}
        <label className="settings-row">
          <span>{t("settings.keepPinned")}</span>
          <input
            type="checkbox"
            checked={keepPinned}
            onChange={(event) => {
              const next = event.target.checked;
              setKeepPinned(next);
              void window.emqnote.setKeepPinnedInView(next).then(() => onChanged());
            }}
          />
        </label>

        <p className="settings-note">{t("settings.keepPinnedWhy")}</p>

        {/* B88. Below the two rows about one list, because this one is about the notes
            themselves — and above the vault, which is the row that restarts the app. */}
        <label className="settings-row">
          <span>{t("settings.textSize")}</span>
          <select
            value={fontSize}
            onChange={(event) => {
              const next = Number(event.target.value);
              setFontSize(next);
              void window.emqnote.setEditorFontSize(next).then(() => onChanged());
            }}
          >
            {FONT_SIZES.map((option) => (
              <option key={option.px} value={option.px}>
                {t(option.key)}
              </option>
            ))}
          </select>
        </label>

        <p className="settings-note">{t("settings.textSizeWhy")}</p>

        {/* B90. Beside the text size because the two are the same kind of question — how
            this machine draws, not what any note contains — and the answer to both is per
            machine. Its own state, same as every row above it and for the same reason.

            Nothing here touches a stylesheet: main puts the choice on
            `nativeTheme.themeSource` and every window's `prefers-color-scheme` follows,
            which is what lets "system" go on meaning "keep asking the OS" rather than
            "whatever the OS said when this was chosen". */}
        <label className="settings-row">
          <span>{t("settings.theme")}</span>
          <select
            value={themeChoice}
            onChange={(event) => {
              const next = event.target.value as Theme;
              setThemeChoice(next);
              void window.emqnote.setTheme(next).then(() => onChanged());
            }}
          >
            {THEMES.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.key)}
              </option>
            ))}
          </select>
        </label>

        <p className="settings-note">{t("settings.themeWhy")}</p>

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
