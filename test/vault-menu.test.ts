import { describe, expect, it } from "vitest";
import { vaultMenuEntries, type VaultMenuEntry } from "../src/main/vault-menu.js";
import type { VaultLocation } from "../src/shared/vault-types.js";

/**
 * The tray's Vault submenu (14 August 2026).
 *
 * `tray.ts` itself imports Electron and cannot be loaded here, and `--click-button` cannot
 * reach a native menu at all — which is exactly why the decisions were pulled out into an
 * Electron-free module, the same move `vaults.ts` and `attachment-route.ts` already made.
 */

const vault = (path: string, status: VaultLocation["status"] = "synced", tenant = ""): VaultLocation => ({
  path,
  status,
  tenant,
});

const kinds = (entries: VaultMenuEntry[]): string[] => entries.map((entry) => entry.kind);

describe("vaultMenuEntries", () => {
  it("keeps the reveal item the single Vault row used to be, and adds a way out", () => {
    const entries = vaultMenuEntries("/vaults/work", [vault("/vaults/work")]);

    expect(kinds(entries)).toEqual(["reveal", "separator", "vault", "separator", "choose"]);
    expect(entries[0]).toMatchObject({ kind: "reveal", enabled: true });
  });

  it("ticks the vault already open and refuses to switch to it", () => {
    const entries = vaultMenuEntries("/vaults/work", [
      vault("/vaults/work"),
      vault("/vaults/personal"),
    ]);

    expect(entries).toContainEqual({
      kind: "vault",
      label: "/vaults/work",
      path: "/vaults/work",
      current: true,
      enabled: false,
    });
    expect(entries).toContainEqual({
      kind: "vault",
      label: "/vaults/personal",
      path: "/vaults/personal",
      current: false,
      enabled: true,
    });
  });

  it("lists an unavailable vault greyed out rather than leaving it out", () => {
    // Just after logging in, before OneDrive has mounted, is exactly when this menu gets
    // opened — a vault silently missing is more alarming than one that says why.
    const entries = vaultMenuEntries("/vaults/work", [
      vault("/vaults/work"),
      vault("/onedrive/acme/emqnote", "unavailable", "Acme"),
    ]);

    expect(entries).toContainEqual({
      kind: "vault",
      label: "/onedrive/acme/emqnote — Acme",
      path: "/onedrive/acme/emqnote",
      current: false,
      enabled: false,
    });
  });

  it("names the tenant after the path when there is one", () => {
    const [, , entry] = vaultMenuEntries("/x", [vault("/onedrive/acme/emqnote", "synced", "Acme")]);
    expect(entry).toMatchObject({ label: "/onedrive/acme/emqnote — Acme" });
  });

  it("still offers the picker when this machine knows of no vault at all", () => {
    const entries = vaultMenuEntries(null, []);

    expect(kinds(entries)).toEqual(["reveal", "separator", "choose"]);
    // Nothing to show in a file manager, so the row is there and dead rather than absent.
    expect(entries[0]).toMatchObject({ enabled: false });
  });
});
