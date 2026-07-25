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
  /** Write a PNG of the library window to this path and exit. */
  screenshot: string | null;
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
    screenshot: flagValue(argv, "screenshot"),
  };
}
