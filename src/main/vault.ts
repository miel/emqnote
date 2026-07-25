import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const VAULT_FOLDER_NAME = "emqnote";
export const INBOX = "00 Inbox";
export const INCOMING = join(INBOX, "_incoming");
export const ATTACHMENTS = "_attachments";
export const TEMPLATES = "_templates";

/**
 * Welke zakelijke OneDrive-mappen staan er op deze machine?
 *
 * Op Windows zet de OneDrive-client omgevingsvariabelen: `OneDriveCommercial` voor een
 * zakelijke tenant, `OneDrive` voor wat er actief is.
 *
 * Op macOS staat een zakelijke OneDrive sinds Big Sur onder
 * `~/Library/CloudStorage/OneDrive-<Tenant>`; oudere opzetten gebruiken nog
 * `~/OneDrive - <Tenant>` in de thuismap.
 *
 * Er wordt bewust een lijst teruggegeven en geen enkele keuze. Wie bij twee werkgevers
 * of twee tenants hoort, heeft twee zakelijke OneDrives, en dan is er geen goede
 * gok: de vault op de verkeerde tenant zetten betekent werkinhoud op de verkeerde
 * plek. Bij twijfel vraagt de app het.
 */
export function findOneDriveCandidates(): string[] {
  const found: string[] = [];

  const add = (path: string): void => {
    if (!existsSync(path)) return;
    // Gedeelde SharePoint-bibliotheken zijn geen persoonlijke OneDrive, en een
    // persoonlijke OneDrive is geen werkomgeving. Allebei niet wat we zoeken.
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

  // De oude locatie in de thuismap wijst vaak naar dezelfde tenant als hierboven.
  // Alleen meenemen wanneer die tenant nog niet gevonden is.
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

/** Alleen een pad als er precies één zakelijke OneDrive is; anders moet er gekozen worden. */
export function defaultVaultPath(): string | null {
  const candidates = findOneDriveCandidates();
  return candidates.length === 1 ? join(candidates[0]!, VAULT_FOLDER_NAME) : null;
}

/** Toont een tenant leesbaar, voor de keuzedialoog. */
export function tenantLabel(oneDriveRoot: string): string {
  const base = oneDriveRoot.split(/[\\/]/).pop() ?? oneDriveRoot;
  return base.replace(/^OneDrive\s*-\s*/, "").replace(/^OneDrive-/, "");
}

/** Maakt de mappen die de app zelf nodig heeft. De rest is van de gebruiker. */
export function ensureVaultLayout(vault: string): void {
  for (const folder of [INBOX, INCOMING, ATTACHMENTS, TEMPLATES]) {
    mkdirSync(join(vault, folder), { recursive: true });
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
 * Staat de vault op "altijd behouden op dit apparaat"?
 *
 * OneDrive's Files On-Demand laat bestanden als lege plaatshouder op schijf staan. Een
 * indexer die zo'n bestand leest krijgt niets terug, of veroorzaakt een blokkerende
 * download van honderden bestanden. Dit is een controle vooraf, geen garantie: de
 * uitkomst `unknown` is een geldig antwoord en mag nooit iets tegenhouden.
 */
export async function checkFilesOnDemand(vault: string): Promise<OnDemandState> {
  if (!existsSync(vault)) return "unknown";

  if (process.platform === "darwin") {
    // Een niet-gehydrateerd bestand heeft wel een omvang maar geen blokken op schijf.
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
    // attrib toont U voor losgemaakt (mag worden opgeruimd) en P voor vastgezet.
    try {
      const { stdout } = await run("attrib", [join(vault, "*"), "/s"], {
        windowsHide: true,
        timeout: 5000,
      });
      const lines = stdout.split(/\r?\n/).filter((line) => line.trim() !== "");
      if (lines.length === 0) return "unknown";
      const flags = lines.map((line) => line.slice(0, 21));
      if (flags.some((line) => line.includes("U"))) return "ondemand";
      if (flags.some((line) => line.includes("P"))) return "ok";
      return "unknown";
    } catch {
      return "unknown";
    }
  }

  return "unknown";
}

export const FILES_ON_DEMAND_INSTRUCTION =
  process.platform === "win32"
    ? "Klik in Verkenner met rechts op de map emqnote en kies " +
      "'Altijd behouden op dit apparaat'. Anders staan er lege plaatshouders op " +
      "schijf en kan emqnote je notities niet lezen of doorzoeken."
    : "Klik in Finder met rechts op de map emqnote en kies " +
      "'Altijd op dit apparaat behouden'. Anders staan er lege plaatshouders op " +
      "schijf en kan emqnote je notities niet lezen of doorzoeken.";
