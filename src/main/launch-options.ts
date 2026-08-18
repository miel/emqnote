/**
 * How the app was started.
 *
 * Both a flag and an environment variable, and the flag matters more than it looks:
 * `set EMQNOTE_SELFTEST=50` only works in `cmd`, while PowerShell — the default shell
 * in Windows Terminal — needs `$env:` and silently does nothing otherwise. A flag
 * works from any shell, and from a shortcut.
 */

export interface LaunchOptions {
  /** Number of measurement rounds; 0 means a normal launch. */
  selfTestRounds: number;
  /** Vault to use instead of the configured one, so a test never touches real notes. */
  vaultOverride: string | null;
  /** Open the library window immediately, for looking at it while building it. */
  openLibrary: boolean;
  /**
   * Started by the login item rather than by a person (B61).
   *
   * The login item is registered with this flag on its command line (`applyLoginItem` in
   * `index.ts`), which is the only signal there is: nothing else about the process
   * distinguishes "Windows started me at sign-in" from "somebody double-clicked the
   * shortcut". macOS has a second one, `getLoginItemSettings().wasOpenedAtLogin`, and
   * both are read — the flag alone would go missing for anyone whose login item was
   * registered by an older version and never rewritten.
   */
  startedAtLogin: boolean;
  /** Write a PNG of the library window to this path and exit. */
  screenshot: string | null;
  /** Dump the system clipboard to `<prefix>.html`/`.txt`/`.png` and exit. */
  dumpClipboard: string | null;
  /** Diagnose why `<name>` (an `_attachments/` file) does or does not get a B30 thumbnail, then exit. */
  thumbnailProbe: string | null;
  /**
   * Report what stops `<path>` (something inside `_trash`) from being deleted, then exit.
   *
   * Reports rather than deletes: the question is which entry refuses and what the
   * filesystem calls it, and answering it by destroying the evidence would be a poor
   * trade on the one operation in this app with no way back (B24).
   */
  trashProbe: string | null;
  /**
   * Log every key this app's windows receive, to `<userData>/key-probe.log`.
   *
   * Unlike the three probes above this one does **not** exit and does **not** bypass the
   * single-instance lock: the question it answers is what the everyday resident instance
   * is handed, so it is a mode of the ordinary app rather than a separate run beside it.
   * Quit the resident app first. See `key-probe.ts` for why guessing ran out.
   */
  keyProbe: boolean;
}

function flagValue(argv: string[], name: string): string | null {
  const prefix = `--${name}=`;
  const match = argv.find((argument) => argument.startsWith(prefix));
  if (match !== undefined) return match.slice(prefix.length);

  // Also accept the spaced form: --selftest 50
  const index = argv.indexOf(`--${name}`);
  if (index !== -1 && argv[index + 1] !== undefined && !argv[index + 1]!.startsWith("-")) {
    return argv[index + 1]!;
  }

  return null;
}

export function readLaunchOptions(argv: string[] = process.argv): LaunchOptions {
  const rounds = flagValue(argv, "selftest") ?? process.env.EMQNOTE_SELFTEST ?? "0";
  const vault = flagValue(argv, "vault") ?? process.env.EMQNOTE_VAULT ?? "";

  const parsed = Number.parseInt(rounds, 10);

  return {
    selfTestRounds: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
    vaultOverride: vault === "" ? null : vault,
    openLibrary: argv.includes("--library"),
    startedAtLogin: argv.includes(LOGIN_FLAG),
    screenshot: flagValue(argv, "screenshot"),
    dumpClipboard: flagValue(argv, "dump-clipboard"),
    thumbnailProbe: flagValue(argv, "thumbnail-probe"),
    trashProbe: flagValue(argv, "trash-probe"),
    keyProbe: argv.includes("--key-probe"),
  };
}

/** Written onto the login item's command line and read back off it. One spelling. */
export const LOGIN_FLAG = "--login";

/**
 * Whether this launch should put the library on screen (B61).
 *
 * Reported from daily use: starting emqnote from its shortcut appeared to do nothing at
 * all. It did not — the tray icon arrived and the capture window was built hidden — but a
 * deliberate launch that shows no window is indistinguishable from a launch that failed.
 * A login start is the one case where silence is right: that one is meant to leave the
 * resident process running and nothing else, at a moment nobody asked for a window.
 *
 * Pure, and separate from the launch that carries it out, so both entry points can ask the
 * same question: the first instance asks it about its own argv, and `second-instance` asks
 * it about the argv the relaunch handed over — a shortcut clicked while the app is already
 * resident is the same gesture and deserves the same answer.
 *
 * The measurement and probe paths are excluded here rather than at the call sites: they
 * end in `app.exit()`, and a window appearing in front of a latency run is exactly the
 * kind of thing that would show up in the numbers.
 */
export function shouldOpenLibraryAtLaunch(
  options: LaunchOptions,
  wasOpenedAtLogin = false,
): boolean {
  if (options.selfTestRounds > 0) return false;
  if (options.dumpClipboard !== null) return false;
  if (options.thumbnailProbe !== null) return false;
  if (options.trashProbe !== null) return false;

  // `--library` is explicit and outranks everything, including the login flag: it exists
  // to be able to say "open it" whatever else is going on.
  if (options.openLibrary) return true;

  return !options.startedAtLogin && !wasOpenedAtLogin;
}
