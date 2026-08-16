import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const VAULT_FOLDER_NAME = "emqnote";

/**
 * The folders the app creates itself. Everything else in the vault — `10 Projects`,
 * `20 Areas`, `90 Archive` — is yours to arrange; the app never enforces a structure
 * it does not need.
 */
export const INBOX = "00 Inbox";
export const INCOMING = join(INBOX, "_incoming");
export const ATTACHMENTS = "_attachments";
export const TEMPLATES = "_templates";

/** Scaffolded once on a new vault; yours to rename or delete afterwards. */
export const SUGGESTED_FOLDERS = ["10 Projects", "20 Areas", "90 Archive"];

/**
 * Which business OneDrive folders are on this machine?
 *
 * On Windows the OneDrive client sets environment variables: `OneDriveCommercial` for
 * a work tenant, `OneDrive` for whichever is active.
 *
 * On macOS a work OneDrive lives under `~/Library/CloudStorage/OneDrive-<Tenant>` since
 * Big Sur; older setups still use `~/OneDrive - <Tenant>` in the home directory.
 *
 * This deliberately returns a list and makes no choice. Anyone working for two
 * employers or across two tenants has two business OneDrives, and then there is no
 * good guess: putting the vault on the wrong tenant means work content in the wrong
 * place. When in doubt, the app asks.
 */
export function findOneDriveCandidates(): string[] {
  const found: string[] = [];

  const add = (path: string): void => {
    if (!existsSync(path)) return;
    // Shared SharePoint libraries are not a personal OneDrive, and a personal OneDrive
    // is not a work environment. Neither is what we are looking for.
    if (/SharedLibraries/i.test(path)) return;
    if (/personal/i.test(path)) return;
    if (!found.includes(path)) found.push(path);
  };

  if (process.platform === "win32") {
    for (const variable of ["OneDriveCommercial", "OneDriveForBusiness", "OneDrive"]) {
      const value = process.env[variable];
      if (value !== undefined && value !== "") add(value);
    }
    return found;
  }

  const cloudStorage = join(homedir(), "Library", "CloudStorage");
  if (existsSync(cloudStorage)) {
    for (const entry of readdirSync(cloudStorage)) {
      if (entry.startsWith("OneDrive-")) add(join(cloudStorage, entry));
    }
  }

  // The old location in the home directory usually points at the same tenant as above.
  // Only include it when that tenant has not been found yet.
  const knownTenants = found.map((path) =>
    path.replace(/.*OneDrive-/, "").replace(/[^a-z0-9]/gi, "").toLowerCase(),
  );
  if (existsSync(homedir())) {
    for (const entry of readdirSync(homedir())) {
      if (!entry.startsWith("OneDrive - ")) continue;
      const tenant = entry.slice("OneDrive - ".length).replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (knownTenants.includes(tenant)) continue;
      add(join(homedir(), entry));
    }
  }

  return found;
}

/**
 * The vault path to *suggest* when there is exactly one business OneDrive; null otherwise.
 *
 * Despite the name it is no longer anybody's default. `settings.ts` used to seed
 * `vaultPath` with this, which meant the one-tenant machine — the common one — had its
 * vault chosen for it in silence and never saw the chooser at all. It composes
 * `askForVault`'s suggestion now, and the answer to it is a click.
 */
export function defaultVaultPath(): string | null {
  const candidates = findOneDriveCandidates();
  return candidates.length === 1 ? join(candidates[0]!, VAULT_FOLDER_NAME) : null;
}

/** Renders a tenant readably, for the chooser dialog. */
export function tenantLabel(oneDriveRoot: string): string {
  const base = oneDriveRoot.split(/[\\/]/).pop() ?? oneDriveRoot;
  return base.replace(/^OneDrive\s*-\s*/, "").replace(/^OneDrive-/, "");
}

/** Creates the folders the app itself needs. The rest belongs to the user. */
export function ensureVaultLayout(vault: string): void {
  for (const folder of [INBOX, INCOMING, ATTACHMENTS, TEMPLATES]) {
    mkdirSync(join(vault, folder), { recursive: true });
  }

  // On a brand new vault, lay out the structure the design documents describe. Without
  // it there is nowhere to move a note to and "Move" appears broken — which is exactly
  // how it was reported. Only on first run: folders deleted later stay deleted.
  const alreadyUsed = readdirSync(vault, { withFileTypes: true }).some(
    (entry) => entry.isDirectory() && !entry.name.startsWith("_") && entry.name !== INBOX,
  );

  if (!alreadyUsed) {
    for (const folder of SUGGESTED_FOLDERS) {
      mkdirSync(join(vault, folder), { recursive: true });
    }
  }
}

export type OnDemandState = "ok" | "ondemand" | "unknown";

function sampleFiles(directory: string, limit: number): string[] {
  const found: string[] = [];

  const walk = (current: string, depth: number): void => {
    if (found.length >= limit || depth > 3) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= limit) return;
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile()) found.push(path);
    }
  };

  walk(directory, 0);
  return found;
}

/**
 * Where an `attrib` line's path begins: a drive letter or a UNC prefix. Everything to
 * the left of it is the attribute field.
 */
const ATTRIB_PATH = /[A-Za-z]:\\|\\\\/;

/**
 * Only these can appear in the attribute field: archive, read-only, system, hidden,
 * not-content-indexed, offline, pinned, unpinned, no-scrub, integrity, and the two
 * `attrib` prints without documenting. Lowercase is deliberately absent — it is what
 * tells an attribute field apart from a sentence.
 */
const ATTRIB_FLAGS = /^[ARSHIOPUXVBL ]*$/;

/**
 * What `attrib <vault>\* /s` says about Files On-Demand: `U` is unpinned (may be
 * evicted), `P` is pinned.
 *
 * Split out from `checkFilesOnDemand` so it can be tested without a Windows machine or a
 * subprocess — the same reason `update-check.ts` keeps its parsing separate from the
 * `fetch` around it.
 *
 * The attribute field is found by looking for where the path starts, not by slicing a
 * fixed 21 characters off the front. That fixed slice is what made this function wrong:
 * `attrib` answers a directory with no files in it with `File not found - C:\Users\…`,
 * whose first 21 characters are `File not found - C:\U` — the `U` of `Users`, read as
 * an evicted placeholder. A brand new vault on Windows has folders and no notes yet, so
 * *first run* reported the whole vault un-hydrated: no tags, no people, no search, and a
 * banner explaining a problem that did not exist.
 *
 * Hence both halves of the rule. A line only counts if a path can be found in it at all
 * *and* what precedes that path is nothing but attribute letters, which no diagnostic
 * message ever is. That also holds on a localised Windows, where the message is not
 * English but is still a sentence.
 */
export function readAttribOutput(stdout: string): OnDemandState {
  const flags: string[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    if (line.trim() === "") continue;

    const path = line.search(ATTRIB_PATH);
    if (path === -1) continue;

    const field = line.slice(0, path);
    if (!ATTRIB_FLAGS.test(field)) continue;

    flags.push(field);
  }

  // No line was an attribute line: an empty folder, a message this does not recognise,
  // a drive that answered in a way nobody anticipated. All of them mean "no evidence",
  // which is `unknown` — and `unknown` never blocks a scan.
  if (flags.length === 0) return "unknown";

  if (flags.some((field) => field.includes("U"))) return "ondemand";
  if (flags.some((field) => field.includes("P"))) return "ok";
  return "unknown";
}

/**
 * Is the vault set to "always keep on this device"?
 *
 * OneDrive's Files On-Demand leaves files on disk as empty placeholders. An indexer
 * reading such a file gets nothing back, or triggers a blocking download of hundreds
 * of files. This is a check up front, not a guarantee: `unknown` is a valid outcome
 * and must never block anything.
 */
export async function checkFilesOnDemand(vault: string): Promise<OnDemandState> {
  if (!existsSync(vault)) return "unknown";

  if (process.platform === "darwin") {
    // A dataless file reports a size but occupies no blocks on disk.
    const files = sampleFiles(vault, 40);
    if (files.length === 0) return "unknown";
    for (const file of files) {
      try {
        const stats = statSync(file);
        if (stats.size > 0 && stats.blocks === 0) return "ondemand";
      } catch {
        return "unknown";
      }
    }
    return "ok";
  }

  if (process.platform === "win32") {
    try {
      const { stdout } = await run("attrib", [join(vault, "*"), "/s"], {
        windowsHide: true,
        timeout: 5000,
      });
      return readAttribOutput(stdout);
    } catch {
      return "unknown";
    }
  }

  return "unknown";
}

export const FILES_ON_DEMAND_INSTRUCTION =
  process.platform === "win32"
    ? "Right-click the emqnote folder in Explorer and choose " +
      "'Always keep on this device'. Otherwise the folder holds empty placeholders " +
      "and emqnote cannot read or search your notes."
    : "Right-click the emqnote folder in Finder and choose " +
      "'Always Keep on This Device'. Otherwise the folder holds empty placeholders " +
      "and emqnote cannot read or search your notes.";
