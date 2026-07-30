import { existsSync } from "node:fs";
import { sep } from "node:path";
import type { VaultLocation } from "../shared/vault-types.js";

/**
 * What the remembered vault locations are, and what to call each of them.
 *
 * Electron-free and taking the candidate roots as a parameter, the same discipline
 * `vault-io.ts` follows — `remembered.ts` imports `app` and is therefore untested, and
 * this list decides where notes get written. That is not a place to find out later.
 *
 * The labels are derived on every read and never stored. A path that has stopped being a
 * OneDrive path — the folder was moved, the tenant was renamed, the account was
 * unlinked — has to be described correctly the next time it is shown, and a cached label
 * would confidently lie about exactly the case that matters.
 */

/** Renders a tenant readably: `OneDrive-Contoso` and `OneDrive - Contoso` both give "Contoso". */
export function tenantOf(oneDriveRoot: string): string {
  const base = oneDriveRoot.split(/[\\/]/).filter((part) => part !== "").pop() ?? oneDriveRoot;
  return base.replace(/^OneDrive\s*-\s*/, "").replace(/^OneDrive-/, "");
}

/**
 * Windows and macOS are both case-insensitive, and the app only ever ships on those —
 * always folded, rather than gated on `process.platform`, because that would also gate
 * it on whatever OS happens to be running the tests. CI's `check` job runs on
 * `ubuntu-latest`, so a Linux-only branch here would make the case-insensitivity tests
 * pass or fail depending on the runner rather than the code.
 */
function fold(path: string): string {
  return path.toLowerCase();
}

/**
 * Is `path` inside `root`?
 *
 * The separator guard is the whole point: a plain `startsWith` says that
 * `…/OneDrive-Contoso-old/emqnote` lives inside `…/OneDrive-Contoso`, and the vault
 * would be labelled with the wrong tenant — which is the one thing a label about *where
 * work content goes* may not get wrong.
 */
export function isInside(path: string, root: string): boolean {
  const target = fold(path);
  const parent = fold(root).replace(/[\\/]+$/, "");

  if (target === parent) return true;
  return target.startsWith(parent + sep) || target.startsWith(`${parent}/`);
}

/**
 * Classifies one path against the OneDrive roots found on this machine.
 *
 * Best-effort, and it gates nothing — the same discipline as `checkFilesOnDemand`, where
 * "unknown" is a valid answer. A vault that cannot be classified is still a vault, and
 * mislabelling one must never stop it being opened.
 */
export function classifyVault(path: string, oneDriveRoots: string[]): VaultLocation {
  if (!existsSync(path)) return { path, status: "unavailable", tenant: "" };

  const root = oneDriveRoots.find((candidate) => isInside(path, candidate));
  if (root === undefined) return { path, status: "local", tenant: "" };

  return { path, status: "synced", tenant: tenantOf(root) };
}

/**
 * The remembered list, classified, most recent first.
 *
 * Unavailable entries are kept rather than filtered out. Just after logging in — before
 * OneDrive has mounted `~/Library/CloudStorage` — is exactly when this list gets looked
 * at, and a vault that has silently vanished from it is far more alarming than one shown
 * greyed out with a reason.
 */
export function listVaults(
  remembered: string[],
  oneDriveRoots: string[],
  current: string | null,
): VaultLocation[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const path of [...(current === null ? [] : [current]), ...remembered]) {
    const key = fold(path);
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(path);
  }

  return ordered.map((path) => classifyVault(path, oneDriveRoots));
}
