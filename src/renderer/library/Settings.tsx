import { useEffect, useRef, useState } from "react";
import { LOCALES, type Locale } from "../../shared/i18n.js";
import type { Theme } from "../../shared/ipc.js";
import { formatAccelerator } from "../../shared/shortcuts.js";
import type { VaultLocation } from "../../shared/vault-types.js";
import { trapTab } from "./focus-trap.js";
import { roveArrowKey } from "./roving.js";

interface Props {
  locale: Locale;
  hotkey: string;
  /** The library's own global accelerator (B60). */
  libraryHotkey: string;
  /** Which notation the two chords are printed in (B100). See `HotkeyRow`. */
  isMac: boolean;
  /** Whether a picture named by a web address is fetched and drawn (B50). */
  loadRemoteImages: boolean;
  /** Whether pinned rows stay against the top of the note list while it scrolls (B76). */
  keepPinnedInView: boolean;
  /** The size the note itself is drawn at, in pixels (B88). */
  editorFontSize: number;
  /** Which theme the app draws in (B90): the OS's answer, or light, or dark. */
  theme: Theme;
  /** Whether emqnote starts with the machine (B61) — the tray asks this too. */
  openAtLogin: boolean;
  /** What `app.getVersion()` says, for the About group. Read-only. */
  appVersion: string;
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
 * The six groups, in the order the rail lists them (B100).
 *
 * A fixed array rather than the keys of the registry below, because the registry is built
 * inside the component — it closes over every handler — and a group's position in the rail
 * is not something that should be able to move when a row is added to it.
 *
 * The order is: what the app is (General), what it looks like (Appearance), how you reach
 * it (Shortcuts), what it does with a note (Notes), where the notes are (Vault), and what
 * version of it this is (About). Roughly most-answered to least, with the two that restart
 * or leave the app at the end.
 */
const GROUP_IDS = ["general", "appearance", "shortcuts", "notes", "vault", "about"] as const;

type GroupId = (typeof GROUP_IDS)[number];

/**
 * One row of the panel, declared rather than only drawn.
 *
 * **This is the piece that makes the search honest**, and it is the same arrangement
 * `src/shared/shortcuts.ts` has with `Help.tsx`: the sheet's filter can only match what the
 * sheet knows it contains, so what it contains has to be data. A search written against the
 * JSX instead would be a second list of the panel's rows, and the two would disagree within
 * a month — the first row added without a matching entry in the filter would simply become
 * unfindable, silently, in the one control whose whole job is to find things.
 *
 * `noteKey` is matched as well as `labelKey`. Half of these rows are named for what they
 * do and explained for what they cost — "Load images from the web" never says the word
 * "internet" and its sentence underneath says little else — so matching only the label
 * would make the search worse than reading the list.
 */
interface RowSpec {
  id: string;
  /** What the row is called; matched by the search. */
  labelKey: string;
  /** The sentence under it, if it has one; matched by the search too. */
  noteKey?: string;
  render: () => React.ReactNode;
}

interface GroupSpec {
  id: GroupId;
  rows: RowSpec[];
}

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
  /** The chord as it stands, as Electron spells it; the row tracks its own from there. */
  initial: string;
  /** Which notation to print it in — see the component's own note on this. */
  isMac: boolean;
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
 *
 * **What is stored and what is printed are two different strings** (B100). `current` is
 * the accelerator Electron wants — `CommandOrControl+Shift+Y` — because that is what goes
 * to `globalShortcut`, and it stays that on the way back out to `save`. What the button
 * *shows* is `formatAccelerator`, which is `⌘⇧Y` on a Mac and `Ctrl+Shift+Y` everywhere
 * else. That function has existed and been tested since the help sheet needed it and was
 * called from nowhere in `src/`; this row printed the raw accelerator, so the shortcut
 * sheet and the panel that sets the shortcut disagreed about how to spell it.
 */
function HotkeyRow({
  label,
  initial,
  isMac,
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
          {armed ? t("settings.hotkeyHint") : formatAccelerator(current, isMac)}
        </button>
      </div>

      {rejected && <p className="settings-warning">{t("settings.hotkeyTaken")}</p>}
    </>
  );
}

/**
 * The settings panel: a rail of groups beside one scrolling pane (B100).
 *
 * It was a single column of ten controls, and the reason it is not any more is written in
 * `library.css` beside the `max-height` that had to be added to it: the panel grew one row
 * at a time until the Close button fell off the bottom of a short window. A column answers
 * "where do I change the theme" by making you read all of it, and every setting added makes
 * that worse. A rail answers it by name, and grows sideways into a list nobody has to scroll
 * past.
 */
export function Settings({
  locale,
  hotkey,
  libraryHotkey,
  isMac,
  loadRemoteImages,
  keepPinnedInView,
  editorFontSize,
  theme,
  openAtLogin,
  appVersion,
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
  /** B61, held locally for that same reason. */
  const [startAtLogin, setStartAtLogin] = useState(openAtLogin);
  const [vaults, setVaults] = useState<VaultLocation[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  /** Which group the rail is standing on. */
  const [group, setGroup] = useState<GroupId>("general");
  /** What the head band's field is filtered to; empty means the rail is in charge. */
  const [query, setQuery] = useState("");
  /**
   * Whether main has a check for updates in the air (B98).
   *
   * Starts `false` and learns from the broadcast rather than asking on mount: the only
   * way this panel can be looking at a check it did not start is the once-a-day startup
   * one, and that is over long before anyone has opened Settings. Nothing polls.
   */
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void window.emqnote.listVaults().then(setVaults);
  }, []);

  useEffect(() => window.emqnote.onUpdateCheckState(setCheckingUpdates), []);

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

  /**
   * Standing on a group, from the rail.
   *
   * It clears the query, because the two are answers to the same question and only one of
   * them can be showing: picking "Appearance" while a search is filtering the pane would
   * otherwise light up a rail entry beside a pane still listing something else. And it
   * drops a half-finished vault confirmation, which belongs to the group it was started in
   * — leaving it standing would put "emqnote restarts to switch vault" under a heading
   * about text sizes.
   */
  const stand = (next: GroupId): void => {
    setGroup(next);
    setQuery("");
    setConfirming(null);
  };

  /**
   * Every group and every row in it, rebuilt each render because each row closes over the
   * state it draws. See `RowSpec` for why this is data at all.
   */
  const groups: GroupSpec[] = [
    {
      id: "general",
      rows: [
        {
          id: "language",
          labelKey: "settings.language",
          render: () => (
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
          ),
        },
        {
          // B61. It has been a setting since B61 and a tray checkbox for just as long,
          // which is the one place in this app nobody looks — the same complaint that
          // moved the update check into this panel. The tray item stays: main's handler
          // rebuilds that menu and broadcasts, so the two cannot disagree.
          id: "startAtLogin",
          labelKey: "settings.startAtLogin",
          noteKey: "settings.startAtLoginWhy",
          render: () => (
            <label className="settings-row">
              <span>{t("settings.startAtLogin")}</span>
              <input
                type="checkbox"
                checked={startAtLogin}
                onChange={(event) => {
                  const next = event.target.checked;
                  setStartAtLogin(next);
                  void window.emqnote.setOpenAtLogin(next).then(() => onChanged());
                }}
              />
            </label>
          ),
        },
      ],
    },
    {
      id: "appearance",
      rows: [
        {
          // B90. Beside the text size because the two are the same kind of question — how
          // this machine draws, not what any note contains — and the answer to both is per
          // machine. Its own state, same as every other row here and for the same reason.
          //
          // Nothing here touches a stylesheet: main puts the choice on
          // `nativeTheme.themeSource` and every window's `prefers-color-scheme` follows,
          // which is what lets "system" go on meaning "keep asking the OS" rather than
          // "whatever the OS said when this was chosen".
          id: "theme",
          labelKey: "settings.theme",
          noteKey: "settings.themeWhy",
          render: () => (
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
          ),
        },
        {
          // B88. The note's own size, and nothing around it.
          id: "textSize",
          labelKey: "settings.textSize",
          noteKey: "settings.textSizeWhy",
          render: () => (
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
          ),
        },
      ],
    },
    {
      id: "shortcuts",
      rows: [
        {
          id: "hotkey",
          labelKey: "settings.hotkey",
          render: () => (
            <HotkeyRow
              label={t("settings.hotkey")}
              initial={hotkey}
              isMac={isMac}
              armed={recording === "capture"}
              onArm={() => setRecording("capture")}
              onDisarm={() => {
                setRecording(null);
                onChanged();
              }}
              save={(accelerator) => window.emqnote.setHotkey(accelerator)}
              t={t}
            />
          ),
        },
        {
          id: "libraryHotkey",
          labelKey: "settings.libraryHotkey",
          render: () => (
            <HotkeyRow
              label={t("settings.libraryHotkey")}
              initial={libraryHotkey}
              isMac={isMac}
              armed={recording === "library"}
              onArm={() => setRecording("library")}
              onDisarm={() => {
                setRecording(null);
                onChanged();
              }}
              save={(accelerator) => window.emqnote.setLibraryHotkey(accelerator)}
              t={t}
            />
          ),
        },
      ],
    },
    {
      id: "notes",
      rows: [
        {
          // B50. Held here as its own state rather than read back from the bootstrap on
          // every render: the round trip that refreshes that happens on `onChanged`, and a
          // checkbox that snapped back to its old value for a frame while it landed would
          // read as the switch not having taken.
          id: "remoteImages",
          labelKey: "settings.remoteImages",
          noteKey: "settings.remoteImagesWhy",
          render: () => (
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
          ),
        },
        {
          // B76. Its own state, same as the row above and for the same reason.
          id: "keepPinned",
          labelKey: "settings.keepPinned",
          noteKey: "settings.keepPinnedWhy",
          render: () => (
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
          ),
        },
      ],
    },
    {
      id: "vault",
      rows: [
        {
          // Where the notes live. The list is asked for fresh every time the panel opens,
          // so a vault that has just become reachable — or has just stopped being — is
          // described as it is now rather than as it was when it was first chosen.
          id: "vault",
          labelKey: "settings.vault",
          render: () => (
            <>
              <div className="settings-row settings-row-block">
                <span>{t("settings.vault")}</span>
                <button
                  type="button"
                  onClick={() => void window.emqnote.chooseVault().then(pick)}
                >
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
                          : t(
                              `settings.vault${entry.status === "local" ? "Local" : "Unavailable"}`,
                            )}
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
                        // The pending save goes first: a debounced write landing after
                        // the switch would put the old note's bytes into the new vault.
                        void onBeforeSwitch().then(() => window.emqnote.switchVault(target));
                      }}
                    >
                      {t("settings.vaultRestartConfirm")}
                    </button>
                  </div>
                </div>
              )}
            </>
          ),
        },
      ],
    },
    {
      id: "about",
      rows: [
        {
          // Read-only, and the one row here with no setting behind it. It was in the tray
          // menu and nowhere else, which is a poor place for the number you are asked for
          // first when something goes wrong.
          id: "version",
          labelKey: "settings.version",
          render: () => (
            <div className="settings-row">
              <span>{t("settings.version")}</span>
              <span className="settings-value">{appVersion}</span>
            </div>
          ),
        },
        {
          // The same check the tray menu runs (B22), where anyone would actually look for
          // it. Laid out like the vault row rather than like a value being shown: this is
          // a button that goes and does something, so the fixed 200px a `.settings-row
          // button` wears would be width spent on nothing.
          //
          // Nothing is drawn from the *result* and nothing is awaited. Every outcome is a
          // native dialog raised in main — up to date, an update to download, a network
          // that would not answer — which is the tray item's contract unchanged.
          //
          // What the button does draw is that a check is running (B98). It was reported as
          // confusion, and the shape of it is worth keeping in mind: the click resolves
          // immediately by design, so a slow GitHub left a button that had visibly done
          // nothing for several seconds and then raised a dialog out of nowhere. The state
          // is main's — `IPC.updateCheckState` — rather than something set here on click,
          // because the tray runs the same check and the panel would otherwise be
          // describing only half of them. A modal "checking…" was the other candidate and
          // was dropped: `dialog.showMessageBox` cannot be closed from code, and on Windows
          // it would stack in front of the outcome it was announcing.
          id: "updates",
          labelKey: "settings.updates",
          noteKey: "settings.updatesWhy",
          render: () => (
            <div className="settings-row settings-row-block">
              <span>{t("settings.updates")}</span>
              <button
                type="button"
                disabled={checkingUpdates}
                onClick={() => void window.emqnote.checkForUpdates()}
              >
                {t(checkingUpdates ? "settings.updatesChecking" : "settings.updatesCheck")}
              </button>
            </div>
          ),
        },
      ],
    },
  ];

  /**
   * What the pane is filtered to, matched against a row's name *and* its sentence.
   *
   * Both halves, for the reason `RowSpec` gives: half of these rows are named for what
   * they do and explained for what they cost, so "internet" and "restart" and "GitHub"
   * appear nowhere but in the sentences underneath.
   */
  const needle = query.trim().toLowerCase();
  const matching = (row: RowSpec): boolean => {
    if (needle === "") return true;
    const label = t(row.labelKey).toLowerCase();
    const note = row.noteKey === undefined ? "" : t(row.noteKey).toLowerCase();
    return label.includes(needle) || note.includes(needle);
  };

  /**
   * Which groups the pane draws.
   *
   * Searching shows every group that has something to show, each still under its own
   * heading — the group is what tells you *where* the row you were looking for lives, so a
   * flat list of results would answer the question and forget to teach the answer. With no
   * query it is the one group the rail is standing on.
   */
  const searching = needle !== "";
  const shown = searching
    ? groups
        .map((entry) => ({ ...entry, rows: entry.rows.filter(matching) }))
        .filter((entry) => entry.rows.length > 0)
    : groups.filter((entry) => entry.id === group);

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
          // combination — so the trap and the Escape below both stand aside for it.
          if (recording) return;
          trapTab(event, panel.current);
          if (event.key === "Escape") {
            event.preventDefault();
            // One press undoes one thing, the rule the note list's search box and the
            // shortcut sheet both follow: a query is cleared before the panel is closed,
            // so Escape out of a search you are reading does not also throw away the
            // panel you were reading it in.
            if (query !== "") {
              event.stopPropagation();
              setQuery("");
              search.current?.focus();
              return;
            }
            // Stopped as well as prevented. `preventDefault` does not end the bubble, so
            // this Escape went on to `Library.tsx`'s window listener — which by then saw
            // focus already restored by the unmount effect above, read that as "leave the
            // editor" and threw focus into the note list. One press, two things.
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="settings-head">
          <h2>{t("settings.title")}</h2>
          {/* The same arrangement the shortcut sheet's field has, and in the same place:
              between the heading and the ×, which is the one part of this panel that is
              not the thing being searched. Not autofocused — the panel's job on opening is
              to be read, and a caret waiting in a box is a screen asking a question. */}
          <input
            ref={search}
            type="text"
            className="settings-search"
            value={query}
            placeholder={t("settings.search")}
            aria-label={t("settings.search")}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="settings-close"
            aria-label={t("settings.close")}
            title={t("settings.close")}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="settings-body">
          {/* A real `tablist`: this is a set of names, one of which decides what the panel
              beside it shows, which is what the role means. Automatic activation — arrowing
              onto a group shows it — because every group here is already built and showing
              one costs nothing, and the alternative makes you press a key to confirm a
              choice you can already see the result of.

              While the search is filtering, no group is the selected one: the pane is
              showing rows from several at once, and claiming one of them was chosen would
              be a lie to anything reading the roles. Clicking a group clears the query,
              which is what puts the two back in step. */}
          <div className="settings-rail" role="tablist" aria-orientation="vertical" ref={rail}>
            {GROUP_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`settings-tab-${id}`}
                data-group={id}
                aria-selected={!searching && id === group}
                aria-controls="settings-pane"
                // The roving tab stop the three panes use: exactly one of these is in the
                // Tab order, so Tab moves out of the rail and into the pane rather than
                // walking six names first.
                tabIndex={id === group ? 0 : -1}
                className={`settings-category${!searching && id === group ? " settings-category-on" : ""}`}
                onClick={() => stand(id)}
                onKeyDown={(event) => {
                  const next = roveArrowKey(
                    event,
                    rail.current,
                    ".settings-category",
                    event.currentTarget,
                  );
                  if (next === null) return;
                  event.preventDefault();
                  // `stopPropagation` so the arrow does not go on to the panel's own
                  // handler and from there to the library behind it.
                  event.stopPropagation();
                  next.focus();
                  const chosen = next.dataset.group;
                  if (chosen !== undefined) stand(chosen as GroupId);
                }}
              >
                {t(`settings.group.${id}`)}
              </button>
            ))}
          </div>

          <div
            className="settings-pane"
            id="settings-pane"
            role={searching ? "region" : "tabpanel"}
            aria-label={searching ? t("settings.search") : undefined}
            aria-labelledby={searching ? undefined : `settings-tab-${group}`}
          >
            {shown.length === 0 && <p className="settings-empty">{t("settings.noMatch")}</p>}

            {shown.map((entry) => (
              <section key={entry.id} className="settings-group">
                <h3>{t(`settings.group.${entry.id}`)}</h3>
                {entry.rows.map((row) => (
                  <div key={row.id} className="settings-item">
                    {row.render()}
                    {row.noteKey !== undefined && (
                      <p className="settings-note">{t(row.noteKey)}</p>
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
