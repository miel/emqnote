import type { VaultLocation } from "../shared/vault-types.js";

/**
 * What the tray's Vault submenu contains (14 August 2026).
 *
 * Electron-free, for the reason `vaults.ts`, `attachment-route.ts` and `update-check.ts`
 * are: a `Menu` template cannot be built under `vitest`, and nothing under `test/` can
 * drive a native menu at all — so the decisions live here, where they can be checked, and
 * `tray.ts` does nothing but hang a click on each one. The order, the labels, which row is
 * ticked and which is refused are all decisions; turning them into `MenuItemConstructorOptions`
 * is not.
 *
 * The tray had no way to reach another vault before this. The only route was the library
 * window's Settings, which is two windows away from a menu bar icon that is, on macOS,
 * most of the app's surface.
 */

export type VaultMenuEntry =
  /** Opens the current vault in Finder/Explorer — what the single Vault item used to do. */
  | { kind: "reveal"; label: string; enabled: boolean }
  | { kind: "separator" }
  /** A vault to switch to. `current` is the one already open, ticked and not clickable. */
  | { kind: "vault"; label: string; path: string; current: boolean; enabled: boolean }
  /** The folder picker, with `askForVault`'s tenant question in front of it. */
  | { kind: "choose"; label: string };

/**
 * A vault reads as its path, with the tenant after it where there is one — the same two
 * facts the settings panel shows in two lines, on one line because a menu row is one line.
 */
function vaultLabel(entry: VaultLocation): string {
  return entry.tenant === "" ? entry.path : `${entry.path} — ${entry.tenant}`;
}

export function vaultMenuEntries(vault: string | null, known: VaultLocation[]): VaultMenuEntry[] {
  const entries: VaultMenuEntry[] = [
    { kind: "reveal", label: "Show in file manager", enabled: vault !== null },
  ];

  if (known.length > 0) {
    entries.push({ kind: "separator" });
    for (const location of known) {
      const current = location.path === vault;
      entries.push({
        kind: "vault",
        label: vaultLabel(location),
        path: location.path,
        current,
        // Listed and refused rather than hidden, which is the whole point of `VaultStatus`
        // having three values instead of two: just after logging in — before OneDrive has
        // mounted its folders — is exactly when this menu gets opened, and a vault silently
        // missing from it is far more alarming than one greyed out.
        enabled: location.status !== "unavailable" && !current,
      });
    }
  }

  entries.push({ kind: "separator" }, { kind: "choose", label: "Choose another folder…" });

  return entries;
}
